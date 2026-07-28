import type { AreaMapHistory } from './areaMapRepository'

export function historyFrameEndIso(observedAt: string, stepMinutes: number): string | undefined {
  const frameStart = new Date(observedAt).getTime()
  const stepMs = stepMinutes * 60_000
  if (!Number.isFinite(frameStart) || !Number.isFinite(stepMs) || stepMs <= 0) return undefined
  return new Date(frameStart + stepMs).toISOString()
}

export function latestCompletedHistoryFrameIndex(history: AreaMapHistory): number {
  if (!history.frames.length) return 0

  const rangeEnd = new Date(history.to).getTime()
  const stepMs = history.stepMinutes * 60_000
  if (!Number.isFinite(rangeEnd) || !Number.isFinite(stepMs) || stepMs <= 0) {
    return history.frames.length - 1
  }

  for (let index = history.frames.length - 1; index >= 0; index -= 1) {
    const frameStart = new Date(history.frames[index].observedAt).getTime()
    if (
      Number.isFinite(frameStart)
      && frameStart + stepMs <= rangeEnd
      && history.frames[index].nodes.length > 0
    ) {
      return index
    }
  }

  return history.frames.length - 1
}
