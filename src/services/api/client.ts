export type ApiRequest = <T = unknown>(path: string, options?: RequestInit) => Promise<T>

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

export const request: ApiRequest = async <T>(path: string, options: RequestInit = {}) => {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    credentials: 'include',
    signal: options.signal || AbortSignal.timeout(15_000),
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    ...options,
  })

  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') {
      notifyUnauthorized()
      throw new Error('Your session has ended. Please sign in again.')
    }
    const detail = await readResponseBody(response).catch(() => null)
    throw new Error(responseErrorMessage(detail, `API request failed with ${response.status}.`))
  }

  return await readResponseBody(response) as T
}

export async function downloadFile(path: string, fallbackFilename: string) {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    credentials: 'include',
    signal: AbortSignal.timeout(60_000),
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
