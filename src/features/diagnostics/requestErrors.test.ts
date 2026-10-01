import { afterEach, expect, test, vi } from 'vitest'
import { diagnosticErrorMessage } from './requestErrors'
import { neurocropApi } from '../../services/api/neurocropApi'
import { setApiConnected } from '../../state/dashboardStore'
import { request } from '../../services/api/client'

vi.mock('../../services/performanceDiagnostics', () => ({
  measurePerformance: (_kind: string, _path: string, run: () => unknown) => run(),
  recordServerTiming: vi.fn(),
}))
vi.mock('../../state/dashboardStore', () => ({
  getDashboardState: () => ({ connected: true }), subscribeDashboardState: vi.fn(),
  notifyUnauthorized: vi.fn(), setApiConnected: vi.fn(),
}))

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function transport() {
  vi.stubGlobal('window', { NEUROCROP_CONFIG: { apiBaseUrl: 'http://test' } })
  const budgets: number[] = []
  const timers: AbortController[] = []
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(ms => {
    budgets.push(ms)
    const controller = new AbortController(); timers.push(controller)
    return controller.signal
  })
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
    expect(init).not.toHaveProperty('timeoutMs')
    init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    pending.push(() => resolve(new Response('{}', { headers: { 'content-type': 'application/json' } })))
  })))
  const pending: (() => void)[] = []
  return { budgets, timers, pending }
}

test('30-day analysis and report saving have a dedicated budget; ordinary calls retain 15s', async () => {
  const t = transport()
  const analysis = neurocropApi.getAreaDiagnostics('a', { days: 30 })
  await vi.waitFor(() => expect(t.pending).toHaveLength(1))
  expect(t.budgets).toEqual([90_000])
  t.pending[0](); await analysis
  const save = neurocropApi.createDiagnosticReport({ areaId: 'a', days: 30 })
  await vi.waitFor(() => expect(t.pending).toHaveLength(2))
  t.pending[1](); await save
  const ordinary = request('/ordinary', { cache: 'no-store' })
  await vi.waitFor(() => expect(t.pending).toHaveLength(3))
  t.pending[2](); await ordinary
  expect(t.budgets).toEqual([90_000, 90_000, 15_000])
})

test('obsolete analysis can be cancelled without waiting for the timeout', async () => {
  const t = transport(), controller = new AbortController()
  const analysis = neurocropApi.getAreaDiagnostics('a', { days: 30 }, controller.signal)
  const rejected = expect(analysis).rejects.toMatchObject({ name: 'AbortError' })
  await vi.waitFor(() => expect(t.pending).toHaveLength(1))
  controller.abort(); await rejected
})

test('an analysis deadline rejects cleanly without falsely marking the API offline', async () => {
  const t = transport()
  vi.mocked(setApiConnected).mockClear()
  const analysis = neurocropApi.getAreaDiagnostics('a', { days: 30 })
  const rejected = expect(analysis).rejects.toMatchObject({ name: 'TimeoutError' })
  await vi.waitFor(() => expect(t.pending).toHaveLength(1))
  t.timers[0].abort(new DOMException('signal timed out', 'TimeoutError'))
  await rejected
  expect(setApiConnected).not.toHaveBeenCalledWith(false)
})

test('deadline errors are translated while other server errors remain meaningful', () => {
  expect(diagnosticErrorMessage(new DOMException('signal timed out', 'TimeoutError'))).toBe('diagnostic-timeout')
  expect(diagnosticErrorMessage(new Error('504 Gateway Time-out'))).toBe('diagnostic-timeout')
  expect(diagnosticErrorMessage(new Error('Area not found'))).toBe('Area not found')
})
