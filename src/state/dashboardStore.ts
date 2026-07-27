import { useSyncExternalStore } from 'react'

type DashboardContext = {
  areaId: string
  sectionId: string
}

type DashboardState = {
  connected: boolean
  unauthorizedVersion: number
  context: DashboardContext
  trendIntent: Record<string, unknown> | null
  structureVersion: number
}

const contextStorageKey = 'neurocrop-active-context-v1'
const listeners = new Set<() => void>()

function readContext(): DashboardContext {
  try {
    const value = JSON.parse(localStorage.getItem(contextStorageKey) || '{}') as {
      siteId?: unknown
      areaId?: unknown
      zoneId?: unknown
      sectionId?: unknown
    }
    return {
      areaId: String(value.areaId || value.siteId || ''),
      sectionId: String(value.sectionId || value.zoneId || ''),
    }
  } catch {
    return { areaId: '', sectionId: '' }
  }
}

let state: DashboardState = {
  connected: true,
  unauthorizedVersion: 0,
  context: readContext(),
  trendIntent: null,
  structureVersion: 0,
}

function publish(next: DashboardState) {
  state = next
  listeners.forEach((listener) => listener())
}

export function getDashboardState() {
  return state
}

export function subscribeDashboardState(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDashboardState() {
  return useSyncExternalStore(subscribeDashboardState, getDashboardState, getDashboardState)
}

export function setApiConnected(connected: boolean) {
  if (state.connected === connected) return
  publish({ ...state, connected })
}

export function notifyUnauthorized() {
  publish({ ...state, unauthorizedVersion: state.unauthorizedVersion + 1 })
}

export function setDashboardContext(context: Partial<DashboardContext>) {
  const next = { ...state.context, ...context }
  if (next.areaId === state.context.areaId && next.sectionId === state.context.sectionId) return
  try {
    localStorage.setItem(contextStorageKey, JSON.stringify({
      siteId: next.areaId,
      areaId: next.areaId,
      zoneId: next.sectionId,
      sectionId: next.sectionId,
    }))
  } catch {
    // Context remains usable for the active browser session.
  }
  publish({ ...state, context: next })
}

export function openTrend(intent: Record<string, unknown>) {
  publish({ ...state, trendIntent: intent })
}

export function consumeTrendIntent() {
  const intent = state.trendIntent
  if (intent) publish({ ...state, trendIntent: null })
  return intent
}

export function notifyWorkspaceStructureChanged() {
  publish({ ...state, structureVersion: state.structureVersion + 1 })
}
