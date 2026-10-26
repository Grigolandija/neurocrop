import { beforeEach, describe, expect, it, vi } from 'vitest'
import { neurocropApi } from '../../services/api/neurocropApi'
import { loadFarmMonitoring } from './farmMonitoringRepository'

vi.mock('../../services/api/neurocropApi', () => ({ neurocropApi: { getSections: vi.fn(), getCropProfiles: vi.fn(), getGreenhouseMap: vi.fn(), getGreenhouseMapHistory: vi.fn() } }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(neurocropApi.getSections).mockResolvedValue({ sections: [{ id: 's', name: 'Section', area_id: '0', crop_profile: 'crop', is_area_default: true }] })
  vi.mocked(neurocropApi.getCropProfiles).mockResolvedValue({ profiles: [{ id: 'crop', name: 'Crop', metrics: { airTemp: { optimal: [18, 24] } } }] })
})
describe('farm monitoring request scope', () => {
  it('shares profile and section requests, limits concurrency, and never loads all Area histories', async () => {
    let active = 0, maximum = 0
    vi.mocked(neurocropApi.getGreenhouseMap).mockImplementation(async id => {
      active++; maximum = Math.max(maximum, active)
      await Promise.resolve(); active--
      return { area: { id }, nodes: [] }
    })
    const result = await loadFarmMonitoring(Array.from({ length: 9 }, (_, i) => String(i)))
    expect(Object.keys(result.contexts)).toHaveLength(9)
    expect(maximum).toBeLessThanOrEqual(4)
    expect(neurocropApi.getSections).toHaveBeenCalledTimes(1)
    expect(neurocropApi.getCropProfiles).toHaveBeenCalledTimes(1)
    expect(neurocropApi.getGreenhouseMapHistory).not.toHaveBeenCalled()
    expect(result.contexts['0'].sections[0].cropProfile).toBe('crop')
    expect(result.contexts['1'].sections).toEqual([])
  })
  it('isolates Area failures and keeps measurements available when target loading fails', async () => {
    vi.mocked(neurocropApi.getCropProfiles).mockRejectedValue(new Error('Unavailable'))
    vi.mocked(neurocropApi.getGreenhouseMap).mockImplementation(async id => { if (id === 'bad') throw new Error('Unavailable'); return { area: { id }, nodes: [] } })
    const result = await loadFarmMonitoring(['ok', 'bad'])
    expect(result.failed).toEqual(['bad'])
    expect(result.contexts.ok.nodes).toEqual([])
    expect(result.targetsUnavailable).toBe(true)
  })
  it('stops queueing Area requests after cancellation and rejects mismatched Area payloads', async () => {
    await loadFarmMonitoring(['a', 'b'], () => true)
    expect(neurocropApi.getGreenhouseMap).not.toHaveBeenCalled()
    vi.mocked(neurocropApi.getGreenhouseMap).mockResolvedValue({ area: { id: 'wrong' } })
    expect((await loadFarmMonitoring(['a'])).failed).toEqual(['a'])
  })
})
