import { neurocropApi } from '../../services/api/neurocropApi'
import type { AreaMapContext, AreaMapProfile, AreaMapSection } from '../greenhouse-map/services/areaMapRepository'

/** Shared profile/section requests, at most four Area requests in flight. No history fan-out. */
export async function loadFarmMonitoring(ids: string[], cancelled: () => boolean = () => false) {
  const [sectionsResult, profilesResult] = await Promise.allSettled([
    neurocropApi.getSections() as Promise<{ sections: Array<{ id: string; name: string; area_id: string; crop_profile?: string; is_area_default?: boolean; inherit_area_profile?: boolean; nodes?: number }> }>,
    neurocropApi.getCropProfiles() as Promise<{ profiles: AreaMapProfile[] }>,
  ])
  const sections: AreaMapSection[] = sectionsResult.status === 'fulfilled' ? (sectionsResult.value.sections || []).map(item => ({
    id: item.id, name: item.name, areaId: item.area_id, cropProfile: item.crop_profile,
    isAreaDefault: item.is_area_default, inheritAreaProfile: item.inherit_area_profile, nodes: Number(item.nodes) || 0,
  })) : []
  const profiles = profilesResult.status === 'fulfilled' ? (profilesResult.value.profiles || []).map(profile => ({ ...profile, metrics: profile.metrics && typeof profile.metrics === 'object' ? profile.metrics : {} })) : []
  const contexts: Record<string, AreaMapContext> = {}, failed: string[] = [], queue = [...ids]
  const worker = async () => {
    while (queue.length && !cancelled()) {
      const id = queue.shift()!
      try {
        const payload = await neurocropApi.getGreenhouseMap(id) as AreaMapContext
        if (payload.area?.id !== id) throw new Error('Area mismatch')
        contexts[id] = { ...payload, nodes: Array.isArray(payload.nodes) ? payload.nodes : [], sections: sections.filter(item => item.areaId === id), profiles }
      } catch { failed.push(id) }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker))
  return { contexts, failed, targetsUnavailable: sectionsResult.status === 'rejected' || profilesResult.status === 'rejected' }
}
