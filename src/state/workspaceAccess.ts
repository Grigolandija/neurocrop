import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { neurocropApi } from '../services/api/neurocropApi'

export type WorkspaceStage = 'needs-area' | 'needs-section' | 'ready'
type WorkspaceAccessStatus = 'loading' | 'ready'

type WorkspaceAccessValue = {
  status: WorkspaceAccessStatus
  stage: WorkspaceStage
  refresh: () => Promise<void>
}

const WorkspaceAccessContext = createContext<WorkspaceAccessValue>({
  status: 'loading',
  stage: 'ready',
  refresh: async () => undefined,
})

function records(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  const value = payload as Record<string, unknown>
  for (const key of keys) if (Array.isArray(value[key])) return value[key] as unknown[]
  return []
}

export function deriveWorkspaceStage(areaPayload: unknown, sectionPayload: unknown): WorkspaceStage {
  if (records(areaPayload, ['areas', 'sites', 'items']).length === 0) return 'needs-area'
  if (records(sectionPayload, ['sections', 'zones', 'items']).length === 0) return 'needs-section'
  return 'ready'
}

function normalizedRoute(pathname: string) {
  const route = String(pathname || '/').split(/[?#]/, 1)[0] || '/'
  return route.startsWith('/nodes/') ? '/nodes' : route
}

export function canAccessWorkspaceRoute(stage: WorkspaceStage, pathname: string) {
  if (stage === 'ready') return true
  const route = normalizedRoute(pathname)
  if (route === '/settings' || route === '/areas') return true
  return stage === 'needs-section' && route === '/sections'
}

export function workspaceStageRedirect(stage: WorkspaceStage) {
  return stage === 'needs-area' ? '/areas' : stage === 'needs-section' ? '/sections' : '/'
}

export function workspaceLockReason(stage: WorkspaceStage) {
  return stage === 'needs-area' ? 'Create an Area first' : stage === 'needs-section' ? 'Create a Section first' : ''
}

export function WorkspaceAccessProvider({ bypass = false, children }: { bypass?: boolean; children: ReactNode }) {
  const [status, setStatus] = useState<WorkspaceAccessStatus>(bypass ? 'ready' : 'loading')
  const [stage, setStage] = useState<WorkspaceStage>('ready')

  const refresh = useCallback(async () => {
    if (bypass) {
      setStage('ready')
      setStatus('ready')
      return
    }
    try {
      const [areas, sections] = await Promise.all([neurocropApi.getAreas(), neurocropApi.getSections()])
      setStage(deriveWorkspaceStage(areas, sections))
    } catch {
      // This is a progressive UX guard, not an authorization boundary. If the
      // structure check is unavailable, keep the existing application usable.
      setStage('ready')
    } finally {
      setStatus('ready')
    }
  }, [bypass])

  useEffect(() => {
    queueMicrotask(() => void refresh())
  }, [refresh])

  const value = useMemo(() => ({ status, stage, refresh }), [refresh, stage, status])
  return createElement(WorkspaceAccessContext.Provider, { value }, children)
}

export function useWorkspaceAccess() {
  return useContext(WorkspaceAccessContext)
}
