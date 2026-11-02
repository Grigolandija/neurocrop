import { measurePerformance, recordServerTiming } from '../performanceDiagnostics'
import { getDashboardState, notifyUnauthorized, setApiConnected, subscribeDashboardState } from '../../state/dashboardStore'

export type ApiRequestOptions = RequestInit & { timeoutMs?: number }
export type ApiRequest = <T = unknown>(path: string, options?: ApiRequestOptions) => Promise<T>
type AuthTokenProvider = (options?: { skipCache?: boolean }) => Promise<string | null>

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(message: string, status: number, code = '') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const GET_CACHE_TTL_MS = 60_000
const MAX_GET_CACHE_ENTRIES = 200
const getCache = new Map<string, { expiresAt: number; value: unknown }>()
const getRequestsInFlight = new Map<string, Promise<unknown>>()
let cacheGeneration = 0
let apiConnectionLost = !getDashboardState().connected
let sessionCheckInFlight: Promise<boolean> | null = null
let authTokenProvider: AuthTokenProvider | null = null
let authTokenInFlight: Promise<string | null> | null = null
let authTokenRefreshInFlight: Promise<string | null> | null = null
let cachedAuthToken: { value: string | null; expiresAt: number } | null = null
let authTokenGeneration = 0
subscribeDashboardState(() => {
  apiConnectionLost = !getDashboardState().connected
})

function apiBaseUrl() {
  const configured = String(window.NEUROCROP_CONFIG?.apiBaseUrl || '').replace(/\/$/, '')
  if (!configured) throw new Error('API base URL is not configured.')
  return configured
}

function storeCachedGet(key: string, value: unknown) {
  const now = Date.now()
  for (const [cachedKey, cached] of getCache) {
    if (cached.expiresAt <= now) getCache.delete(cachedKey)
  }
  if (getCache.has(key)) getCache.delete(key)
  while (getCache.size >= MAX_GET_CACHE_ENTRIES) {
    const oldestKey = getCache.keys().next().value
    if (typeof oldestKey !== 'string') break
    getCache.delete(oldestKey)
  }
  getCache.set(key, { expiresAt: now + GET_CACHE_TTL_MS, value })
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

function responseError(payload: unknown, response: Response) {
  const code = payload && typeof payload === 'object'
    ? String((payload as { error?: { code?: unknown } }).error?.code || '')
    : ''
  return new ApiError(responseErrorMessage(payload, `API request failed with ${response.status}.`), response.status, code)
}

function isPublicAuthenticationRequest(path: string) {
  return path === '/auth/login'
    || path === '/auth/register'
    || path === '/auth/accept-invite'
    || path === '/auth/forgot-password'
    || path === '/auth/reset-password'
    || path === '/auth/me'
    || path.startsWith('/auth/invitations/')
}

async function fetchWithConnectionStatus(input: RequestInfo | URL, init: RequestInit) {
  try {
    const response = await fetch(input, init)
    // Any HTTP response proves that the API transport is reachable, including 4xx/5xx.
    setApiConnected(true)
    return response
  } catch (error) {
    // Cancelling an obsolete UI request does not mean the API went offline.
    if (!init.signal?.aborted) setApiConnected(false)
    throw error
  }
}

function requestSignal(signal: AbortSignal | null | undefined, timeoutMs: number) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
}

async function requestHeaders(options: RequestInit, accept = 'application/json') {
  const headers = new Headers(options.headers)
  if (!headers.has('Accept')) headers.set('Accept', accept)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const now = Date.now()
  if (!cachedAuthToken || cachedAuthToken.expiresAt <= now) {
    if (!authTokenInFlight && !authTokenRefreshInFlight) {
      const generation = authTokenGeneration
      const provider = authTokenProvider
      authTokenInFlight = Promise.resolve()
        .then(() => provider?.() ?? null)
        .then((value) => {
          if (authTokenGeneration === generation && !authTokenRefreshInFlight) {
            cachedAuthToken = { value, expiresAt: Date.now() + 1_000 }
          }
          return value
        })
        .finally(() => {
          if (authTokenGeneration === generation) authTokenInFlight = null
        })
    }
  }
  const reusableAuthToken = cachedAuthToken
  const token = reusableAuthToken && reusableAuthToken.expiresAt > now
    ? reusableAuthToken.value
    : await (authTokenRefreshInFlight || authTokenInFlight)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return headers
}

async function refreshRejectedToken(rejectedToken: string) {
  if (cachedAuthToken?.value && cachedAuthToken.value !== rejectedToken && cachedAuthToken.expiresAt > Date.now()) {
    return cachedAuthToken.value
  }
  if (!authTokenRefreshInFlight) {
    const generation = authTokenGeneration
    const provider = authTokenProvider
    cachedAuthToken = null
    authTokenRefreshInFlight = Promise.resolve()
      .then(() => provider?.({ skipCache: true }) ?? null)
      .then((value) => {
        if (generation !== authTokenGeneration) return null
        cachedAuthToken = { value, expiresAt: Date.now() + 1_000 }
        return value
      })
      .catch(() => {
        throw new ApiError('Sign-in could not be refreshed. Check your connection and try again.', 503, 'AUTH_REFRESH_FAILED')
      })
      .finally(() => {
        if (generation === authTokenGeneration) authTokenRefreshInFlight = null
      })
  }
  return await authTokenRefreshInFlight
}

async function fetchWithSessionRecovery(input: RequestInfo | URL, options: RequestInit, accept?: string) {
  const generation = authTokenGeneration
  const headers = await requestHeaders(options, accept)
  if (generation !== authTokenGeneration) throw new ApiError('The signed-in account changed. Please try again.', 409, 'AUTH_CHANGED')
  const response = await fetchWithConnectionStatus(input, { ...options, headers })
  const rejectedToken = headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (response.status !== 401 || !authTokenProvider || !rejectedToken || options.signal?.aborted) return response
  const detail = await readResponseBody(response.clone()).catch(() => null)
  // Only authentication middleware rejections are replayable, including writes:
  // the protected endpoint has not run. Never retry arbitrary 401s or 403s.
  if (responseError(detail, response).code !== 'INVALID_CLERK_SESSION') return response
  const token = await refreshRejectedToken(rejectedToken)
  if (!token || generation !== authTokenGeneration || options.signal?.aborted) return response
  headers.set('Authorization', `Bearer ${token}`)
  return await fetchWithConnectionStatus(input, { ...options, headers })
}

async function sessionHasEnded() {
  if (!sessionCheckInFlight) {
    sessionCheckInFlight = fetchWithSessionRecovery(`${apiBaseUrl()}/auth/me`, {
      credentials: 'include',
      signal: requestSignal(null, 15_000),
    })
      .then((response) => response.status === 401)
      .catch(() => false)
      .finally(() => {
        sessionCheckInFlight = null
      })
  }
  return await sessionCheckInFlight
}

export const request: ApiRequest = async <T>(path: string, { timeoutMs = 15_000, ...options }: ApiRequestOptions = {}) => {
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
    const response = await fetchWithSessionRecovery(cacheKey, {
      ...options,
      credentials: 'include',
      signal: requestSignal(options.signal, timeoutMs),
    })
    recordServerTiming(`${method} ${path}`, response.headers.get('Server-Timing'))

    if (!response.ok) {
      const detail = await readResponseBody(response).catch(() => null)
      const error = responseError(detail, response)
      // An unauthenticated /auth/me response is the normal signed-out state, not
      // an expired-session event that should alarm the user.
      if (response.status === 401 && !isPublicAuthenticationRequest(path)) {
        if (error.code === 'INVALID_CLERK_SESSION' || await sessionHasEnded()) {
          notifyUnauthorized()
          invalidateRequestCache()
          throw new ApiError('Your session has ended. Please sign in again.', 401, 'SESSION_EXPIRED')
        }
      }
      throw error
    }

    return await readResponseBody(response) as T
  }

  if (!cacheable) return await measurePerformance('api', `${method} ${path}`, execute)

  const requestGeneration = cacheGeneration
  const pending = measurePerformance('api', `${method} ${path}`, execute)
    .then((value) => {
      if (requestGeneration === cacheGeneration) {
        storeCachedGet(cacheKey, value)
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

export function setAuthTokenProvider(provider: AuthTokenProvider | null) {
  authTokenGeneration += 1
  authTokenProvider = provider
  authTokenInFlight = null
  authTokenRefreshInFlight = null
  cachedAuthToken = null
  sessionCheckInFlight = null
  invalidateRequestCache()
}

export async function downloadFile(path: string, fallbackFilename: string) {
  const response = await fetchWithSessionRecovery(`${apiBaseUrl()}${path}`, {
    credentials: 'include',
    signal: requestSignal(null, 60_000),
  }, 'text/csv')

  if (!response.ok) {
    const detail = await readResponseBody(response).catch(() => null)
    const error = responseError(detail, response)
    if (response.status === 401 && (error.code === 'INVALID_CLERK_SESSION' || await sessionHasEnded())) {
      notifyUnauthorized()
      invalidateRequestCache()
      throw new ApiError('Your session has ended. Please sign in again.', 401, 'SESSION_EXPIRED')
    }
    throw error
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
