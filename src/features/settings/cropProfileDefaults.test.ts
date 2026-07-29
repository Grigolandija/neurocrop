import { describe, expect, it } from 'vitest'
import { starterCropProfileMetrics, withStarterMetrics } from './cropProfileDefaults'

describe('crop profile starter metrics', () => {
  it('repairs an empty profile with a complete editable target set', () => {
    const repaired = withStarterMetrics({}) as typeof starterCropProfileMetrics
    expect(Object.keys(repaired)).toEqual(expect.arrayContaining([
      'airTemp', 'humidity', 'co2', 'vpd', 'soilTemp', 'soilMoisture', 'ec', 'soilEc', 'ph', 'lux',
    ]))
    expect(repaired.airTemp.optimal).toEqual([22, 26])
    expect(repaired.lux.lightingSchedule?.enabled).toBe(false)
  })

  it('preserves metrics explicitly configured by the grower', () => {
    const configured = { airTemp: { optimal: [18, 21] } }
    expect(withStarterMetrics(configured)).toBe(configured)
  })
})
