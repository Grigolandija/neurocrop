import { describe, expect, it } from 'vitest'
import { getMetricDefinition } from '../../domain/metricRegistry'
import {
  createMetricsFromLibraryTemplate,
  cropProfileLibrary,
  cropProfileLibraryCrops,
  cropProfileLibraryVersion,
} from './cropProfileLibrary'

describe('default crop profile library', () => {
  it('contains the complete validated v1 library', () => {
    expect(cropProfileLibraryVersion).toBe('1.0.0')
    expect(cropProfileLibraryCrops).toHaveLength(6)
    expect(cropProfileLibrary).toHaveLength(27)
    expect(cropProfileLibrary.reduce((count, profile) => count + profile.parameters.length, 0)).toBe(324)
    expect(new Set(cropProfileLibrary.map((profile) => profile.profile_id)).size).toBe(27)
  })

  it('maps library min, target and max without losing the target', () => {
    const template = cropProfileLibrary.find((profile) => profile.profile_id === 'lettuce.germination')!
    const metrics = createMetricsFromLibraryTemplate(template)
    expect(metrics.airTemp.optimal).toEqual([19, 22])
    expect(metrics.airTemp.target).toBe(20)
    expect(metrics.airTemp.warning[0]).toBeLessThanOrEqual(19)
    expect(metrics.airTemp.warning[1]).toBeGreaterThanOrEqual(22)
  })

  it('does not activate parameters marked as not applicable', () => {
    const template = cropProfileLibrary.find((profile) => profile.profile_id === 'lettuce.head_growth')!
    const metrics = createMetricsFromLibraryTemplate(template)
    expect(metrics.soilMoisture).toBeUndefined()
    expect(metrics.soilEc).toBeUndefined()
    expect(metrics.airTemp).toBeDefined()
  })

  it('creates valid physical bands and targets for every library template', () => {
    for (const template of cropProfileLibrary) {
      const metrics = createMetricsFromLibraryTemplate(template)
      expect(Object.keys(metrics).length, template.profile_id).toBeGreaterThan(0)

      for (const [metricId, metric] of Object.entries(metrics)) {
        const definition = getMetricDefinition(metricId)
        expect(definition, `${template.profile_id}.${metricId}`).toBeDefined()
        expect(metric.optimal[0]).toBeLessThan(metric.optimal[1])
        expect(metric.warning[0]).toBeLessThan(metric.warning[1])
        expect(metric.critical[0]).toBeLessThan(metric.critical[1])
        expect(metric.target).toBeGreaterThanOrEqual(metric.optimal[0])
        expect(metric.target).toBeLessThanOrEqual(metric.optimal[1])
        expect(metric.optimal[0]).toBeGreaterThanOrEqual(definition!.physicalRange[0])
        expect(metric.optimal[1]).toBeLessThanOrEqual(definition!.physicalRange[1])
        expect(metric.warning[0]).toBeGreaterThanOrEqual(definition!.physicalRange[0])
        expect(metric.warning[1]).toBeLessThanOrEqual(definition!.physicalRange[1])
        expect(metric.critical[0]).toBeGreaterThanOrEqual(definition!.physicalRange[0])
        expect(metric.critical[1]).toBeLessThanOrEqual(definition!.physicalRange[1])
      }
    }
  })
})
