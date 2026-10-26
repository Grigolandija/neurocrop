import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { neurocropApi } from '../services/api/neurocropApi'

export type WorkspaceStage = 'needs-plan' | 'needs-area' | 'ready'
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

export function deriveWorkspaceStage(areaPayload: unknown, _sectionPayload: unknown, farmPayload?: unknown): WorkspaceStage {
  if(farmPayload && typeof farmPayload==='object' && 'plan' in farmPayload && 'revision' in farmPayload){
    const farm=farmPayload as {revision?:number;plan?:{version?:number;areas?:Array<{id:string}>;zones?:Array<{areaId?:string}>}}
    if(!farm.revision)return 'needs-plan'
    const ids=new Set(farm.plan?.version===2 ? farm.plan.areas?.map(a=>a.id) : farm.plan?.zones?.flatMap(z=>z.areaId ? [z.areaId] : []))
    if(!ids.size)return 'needs-area'
    return 'ready'
  }
  if (records(areaPayload, ['areas', 'sites', 'items']).length === 0) return 'needs-area'
  return 'ready'
}

function normalizedRoute(pathname: string) {
  const route = String(pathname || '/').split(/[?#]/, 1)[0] || '/'
  return route.startsWith('/nodes/') ? '/nodes' : route
}

export function canAccessWorkspaceRoute(stage: WorkspaceStage, pathname: string) {
  if (stage === 'ready') return true
  const route = normalizedRoute(pathname)
  if (route === '/settings' || route === '/areas' || route === '/farm-plan') return true
  return false
}

export function workspaceStageRedirect(stage: WorkspaceStage) {
  return stage === 'ready' ? '/' : '/farm-plan'
}

export function workspaceLockReason(stage: WorkspaceStage) {
  return stage === 'needs-plan' ? 'Create a farm plan first' : stage === 'needs-area' ? 'Create an Area first' : ''
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
      const [areas,farm] = await Promise.all([neurocropApi.getAreas(),neurocropApi.getFarmPlan()])
      setStage(deriveWorkspaceStage(areas,undefined,farm))
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
