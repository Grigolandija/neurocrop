import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { ApiError, downloadFile, request, setAuthTokenProvider } from './client'
import { neurocropApi } from './neurocropApi'
import { getDashboardState } from '../../state/dashboardStore'

const fetchMock = vi.fn<typeof fetch>()
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})
const expired = () => json({ error: { code: 'INVALID_CLERK_SESSION', message: 'The Clerk session is invalid or expired' } }, 401)

beforeEach(() => {
  vi.stubGlobal('window', { NEUROCROP_CONFIG: { apiBaseUrl: 'https://api.example.test' }, location: { search: '' } })
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
  setAuthTokenProvider(null)
})
afterEach(() => {
  setAuthTokenProvider(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

test('an expired bootstrap token is refreshed once before retrying the current account', async () => {
  const provider = vi.fn(async (options?: { skipCache?: boolean }) => options?.skipCache ? 'fresh' : 'expired')
  setAuthTokenProvider(provider)
  fetchMock.mockImplementation(async (_input, init) => new Headers(init?.headers).get('Authorization') === 'Bearer fresh'
    ? json({ user: { email: 'grower@example.test' } }) : expired())
  const unauthorized = getDashboardState().unauthorizedVersion
  await expect(neurocropApi.getCurrentUser()).resolves.toEqual({ user: { email: 'grower@example.test' } })
  expect(provider.mock.calls).toEqual([[], [{ skipCache: true }]])
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(getDashboardState().unauthorizedVersion).toBe(unauthorized)
})

test('concurrent rejected API requests share a single token refresh', async () => {
  const provider = vi.fn(async (options?: { skipCache?: boolean }) => options?.skipCache ? 'fresh' : 'expired')
  setAuthTokenProvider(provider)
  fetchMock.mockImplementation(async (_input, init) => new Headers(init?.headers).get('Authorization') === 'Bearer fresh'
    ? json({ ok: true }) : expired())
  await expect(Promise.all([request('/areas'), request('/nodes'), request('/dashboard')])).resolves.toEqual([
    { ok: true }, { ok: true }, { ok: true },
  ])
  expect(provider.mock.calls.filter(([options]) => options?.skipCache)).toHaveLength(1)
  expect(fetchMock).toHaveBeenCalledTimes(6)
})

test('a persistently invalid bootstrap session stops after one retry and preserves the error code', async () => {
  const provider = vi.fn(async () => 'still-invalid')
  setAuthTokenProvider(provider)
  fetchMock.mockImplementation(async () => expired())
  await expect(neurocropApi.getCurrentUser()).rejects.toMatchObject({ status: 401, code: 'INVALID_CLERK_SESSION' })
  expect(provider).toHaveBeenCalledTimes(2)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('a genuinely expired session during work notifies the workspace after the bounded retry', async () => {
  setAuthTokenProvider(async () => 'invalid')
  fetchMock.mockImplementation(async () => expired())
  const unauthorized = getDashboardState().unauthorizedVersion
  await expect(request('/areas')).rejects.toMatchObject({ status: 401, code: 'SESSION_EXPIRED' })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(getDashboardState().unauthorizedVersion).toBe(unauthorized + 1)
})

test('workspace approval and permissions are not retried or confused with an expired session', async () => {
  const provider = vi.fn(async () => 'valid')
  setAuthTokenProvider(provider)
  fetchMock.mockResolvedValue(json({ error: { code: 'ORGANIZATION_PENDING', message: 'Awaiting approval' } }, 403))
  await expect(neurocropApi.getCurrentUser()).rejects.toMatchObject({ status: 403, code: 'ORGANIZATION_PENDING' })
  expect(provider).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('a failed refresh connection remains retryable without signing the grower out', async () => {
  const provider = vi.fn(async (options?: { skipCache?: boolean }) => {
    if (options?.skipCache) throw new TypeError('Failed to fetch')
    return 'expired'
  })
  setAuthTokenProvider(provider)
  fetchMock.mockImplementation(async () => expired())
  const unauthorized = getDashboardState().unauthorizedVersion
  await expect(neurocropApi.getCurrentUser()).rejects.toMatchObject({ status: 503, code: 'AUTH_REFRESH_FAILED' })
  expect(getDashboardState().unauthorizedVersion).toBe(unauthorized)
  // The refresh promise is cleared so the user's next attempt can succeed.
  provider.mockImplementation(async () => 'fresh')
  fetchMock.mockResolvedValue(json({ user: { email: 'grower@example.test' } }))
  await expect(neurocropApi.getCurrentUser()).resolves.toHaveProperty('user.email', 'grower@example.test')
})

test('auth middleware can reject a write before execution and the replay preserves its body', async () => {
  setAuthTokenProvider(async (options) => options?.skipCache ? 'fresh' : 'expired')
  fetchMock.mockResolvedValueOnce(expired()).mockResolvedValueOnce(json({ saved: true }))
  const body = JSON.stringify({ name: 'New Area' })
  await expect(request('/areas', { method: 'POST', body })).resolves.toEqual({ saved: true })
  expect(fetchMock.mock.calls.map(([, init]) => ({ method: init?.method, body: init?.body }))).toEqual([
    { method: 'POST', body }, { method: 'POST', body },
  ])
})

test('an unrelated unauthorized write is never replayed', async () => {
  const provider = vi.fn(async () => 'valid')
  setAuthTokenProvider(provider)
  fetchMock.mockImplementation(async (url) => String(url).endsWith('/auth/me')
    ? json({ user: { email: 'grower@example.test' } })
    : json({ error: { code: 'ACTION_NOT_ALLOWED', message: 'Not allowed' } }, 401))
  await expect(request('/actions/today/a/feedback', { method: 'POST', body: '{}' })).rejects.toMatchObject({ code: 'ACTION_NOT_ALLOWED' })
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/feedback'))).toHaveLength(1)
  expect(provider).toHaveBeenCalledTimes(1)
})

test('account responses are not reused from the normal GET cache', async () => {
  fetchMock.mockResolvedValueOnce(json({ user: { email: 'first@example.test' } }))
    .mockResolvedValueOnce(json({ user: { email: 'second@example.test' } }))
  await expect(neurocropApi.getCurrentUser()).resolves.toHaveProperty('user.email', 'first@example.test')
  await expect(neurocropApi.getCurrentUser()).resolves.toHaveProperty('user.email', 'second@example.test')
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('switching the Clerk session clears cached API data and bearer tokens', async () => {
  setAuthTokenProvider(async () => 'first-session')
  fetchMock.mockImplementation(async (_url, init) => json({ token: new Headers(init?.headers).get('Authorization') }))
  await expect(request('/areas')).resolves.toEqual({ token: 'Bearer first-session' })
  setAuthTokenProvider(async () => 'second-session')
  await expect(request('/areas')).resolves.toEqual({ token: 'Bearer second-session' })
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('download permission failures retain their code and never trigger sign-out', async () => {
  const unauthorized = getDashboardState().unauthorizedVersion
  fetchMock.mockResolvedValue(json({ error: { code: 'FORBIDDEN', message: 'Export not allowed' } }, 403))
  await expect(downloadFile('/exports/measurements.csv', 'readings.csv')).rejects.toBeInstanceOf(ApiError)
  expect(getDashboardState().unauthorizedVersion).toBe(unauthorized)
})

test('an expired download session stops after one retry', async () => {
  setAuthTokenProvider(async () => 'invalid')
  fetchMock.mockImplementation(async () => expired())
  await expect(downloadFile('/exports/measurements.csv', 'readings.csv')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test('switching accounts while a token is loading prevents the old request from being sent', async () => {
  let finishToken!: (value: string) => void
  setAuthTokenProvider(() => new Promise((resolve) => { finishToken = resolve }))
  const pending = request('/areas')
  const rejected = expect(pending).rejects.toMatchObject({ code: 'AUTH_CHANGED' })
  await vi.waitFor(() => expect(finishToken).toBeTypeOf('function'))
  setAuthTokenProvider(async () => 'new-account')
  finishToken('old-account')
  await rejected
  expect(fetchMock).not.toHaveBeenCalled()
})

test('an aborted request does not trigger a token refresh or replay', async () => {
  const provider = vi.fn(async () => 'expired')
  setAuthTokenProvider(provider)
  const controller = new AbortController()
  fetchMock.mockImplementation(async () => {
    controller.abort()
    return expired()
  })
  await expect(request('/auth/me', { signal: controller.signal })).rejects.toMatchObject({ code: 'INVALID_CLERK_SESSION' })
  expect(provider).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
