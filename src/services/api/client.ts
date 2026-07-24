export type ApiRequest = <T = unknown>(path: string, options?: RequestInit) => Promise<T>

const GET_CACHE_TTL_MS = 60_000
const getCache = new Map<string, { expiresAt: number; value: unknown }>()
const getRequestsInFlight = new Map<string, Promise<unknown>>()
let cacheGeneration = 0
let apiConnectionLost = false

window.addEventListener('neurocrop:api-connection', (event) => {
  apiConnectionLost = (event as CustomEvent<{ connected?: boolean }>).detail?.connected === false
})

function apiBaseUrl() {
  const configured = String(window.NEUROCROP_CONFIG?.apiBaseUrl || '').replace(/\/$/, '')
  if (!configured) throw new Error('API base URL is not configured.')
  return configured
}

async function readResponseBody(response: Response) {
  const text = await response.text()
  if (!text) return null
  if ((response.headers.get('content-type') || '').includes('application/json')) {
    try {
      return JSON.parse(text) as unknown
    } catch {
      throw new Error('The API returned malformed JSON.')
    }
  }
  return text
}

function responseErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === 'object') {
    const value = payload as { error?: { message?: unknown }; message?: unknown }
    return String(value.error?.message || value.message || fallback)
  }
  return String(payload || fallback).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function notifyUnauthorized() {
  window.dispatchEvent(new CustomEvent('neurocrop:unauthorized'))
}

function notifyApiConnection(connected: boolean) {
  window.dispatchEvent(new CustomEvent('neurocrop:api-connection', {
    detail: { connected },
  }))
}

function isPublicAuthenticationRequest(path: string) {
  return path === '/auth/login'
    || path === '/auth/register'
    || path === '/auth/accept-invite'
    || path === '/auth/me'
    || path.startsWith('/auth/invitations/')
}

async function fetchWithConnectionStatus(input: RequestInfo | URL, init: RequestInit) {
  try {
    const response = await fetch(input, init)
    // Any HTTP response proves that the API transport is reachable, including 4xx/5xx.
    notifyApiConnection(true)
    return response
  } catch (error) {
    // Cancelling an obsolete UI request does not mean the API went offline.
    if (!(error instanceof DOMException && error.name === 'AbortError')) notifyApiConnection(false)
    throw error
  }
}

function requestSignal(signal: AbortSignal | null | undefined, timeoutMs: number) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
}

export const request: ApiRequest = async <T>(path: string, options: RequestInit = {}) => {
  const method = String(options.method || 'GET').toUpperCase()
  const cacheable = method === 'GET' && !options.signal && options.cache !== 'no-store' && options.cache !== 'reload'
  const cacheKey = `${apiBaseUrl()}${path}`

  if (cacheable) {
    const cached = getCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now() && !apiConnectionLost) return cached.value as T
    if (cached) getCache.delete(cacheKey)
    const pending = getRequestsInFlight.get(cacheKey)
    if (pending) return await pending as T
  } else if (method !== 'GET') {
    invalidateRequestCache()
  }

  const execute = async () => {
    const response = await fetchWithConnectionStatus(cacheKey, {
      ...options,
      credentials: 'include',
      signal: requestSignal(options.signal, 15_000),
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    })

    if (!response.ok) {
      // An unauthenticated /auth/me response is the normal signed-out state, not
      // an expired-session event that should alarm the user.
      if (response.status === 401 && !isPublicAuthenticationRequest(path)) {
        notifyUnauthorized()
        throw new Error('Your session has ended. Please sign in again.')
      }
      const detail = await readResponseBody(response).catch(() => null)
      throw new Error(responseErrorMessage(detail, `API request failed with ${response.status}.`))
    }

    return await readResponseBody(response) as T
  }

  if (!cacheable) return await execute()

  const requestGeneration = cacheGeneration
  const pending = execute()
    .then((value) => {
      if (requestGeneration === cacheGeneration) {
        getCache.set(cacheKey, { expiresAt: Date.now() + GET_CACHE_TTL_MS, value })
      }
      return value
    })
    .finally(() => {
      if (getRequestsInFlight.get(cacheKey) === pending) getRequestsInFlight.delete(cacheKey)
    })
  getRequestsInFlight.set(cacheKey, pending)
  return await pending
}

export function invalidateRequestCache() {
  cacheGeneration += 1
  getCache.clear()
  getRequestsInFlight.clear()
}

export async function downloadFile(path: string, fallbackFilename: string) {
  const response = await fetchWithConnectionStatus(`${apiBaseUrl()}${path}`, {
    credentials: 'include',
    signal: requestSignal(null, 60_000),
    headers: { Accept: 'text/csv' },
  })

  if (!response.ok) {
    if (response.status === 401) {
      notifyUnauthorized()
      throw new Error('Your session has ended. Please sign in again.')
    }
    const detail = await readResponseBody(response).catch(() => null)
    throw new Error(responseErrorMessage(detail, `Export failed with ${response.status}.`))
  }

  const disposition = response.headers.get('content-disposition') || ''
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || fallbackFilename
  const url = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function queryString(params: Record<string, unknown> = {}) {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  })
  const serialized = query.toString()
  return serialized ? `?${serialized}` : ''
}

export function isApiConnected() {
  return Boolean(String(window.NEUROCROP_CONFIG?.apiBaseUrl || '').trim())
}
