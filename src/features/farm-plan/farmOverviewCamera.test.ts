import { describe, expect, it } from 'vitest'
import { emptyFarmPlan, farmPlanScene } from './farmPlanData'
import { rectangle, siteDimensions } from '../living-greenhouse/siteDemoModel'
import { cameraMatrix, planToScene, project, type Vec3 } from '../living-greenhouse/sceneMath'
import { farmOverviewCamera } from './farmOverviewCamera'

describe('initial whole-farm framing', () => {
  const document = { ...emptyFarmPlan(), areas: [
    { id: 'a', name: 'Long room', kind: 'room' as const, height: 4, polygon: rectangle(2, 3, 8, 28) },
    { id: 'b', name: 'Side room', kind: 'room' as const, height: 6, polygon: rectangle(10, 15, 7, 12) },
  ] }
  it.each([{ width: 1600, height: 560 }, { width: 360, height: 420 }, { width: 800, height: 600 }])('keeps the entire farm visible and fills the available viewport: %j', viewport => {
    const plan = farmPlanScene(document), dimensions = siteDimensions(plan)
    const camera = farmOverviewCamera(plan, viewport)!
    const aspect = viewport.width / viewport.height
    const distance = camera.extent! * (aspect < 1 ? 2.45 : 1.8) * camera.zoom
    const target = camera.target!
    const eye: Vec3 = [target[0] + Math.sin(camera.azimuth) * Math.cos(camera.elevation) * distance, target[1] + Math.sin(camera.elevation) * distance, target[2] + Math.cos(camera.azimuth) * Math.cos(camera.elevation) * distance]
    const matrix = cameraMatrix(eye, target, aspect)
    const projected = plan.zones.flatMap(zone => zone.polygon.flatMap(p => [0, zone.height].map(height => project(planToScene(p.xM, p.yM, height, dimensions), matrix, viewport.width, viewport.height))))
    for (const point of projected) {
      expect(point.visible).toBe(true)
      expect(point.x).toBeGreaterThan(0)
      expect(point.x).toBeLessThan(viewport.width)
      expect(point.y).toBeGreaterThan(0)
      expect(point.y).toBeLessThan(viewport.height)
    }
    const width = Math.max(...projected.map(p => p.x)) - Math.min(...projected.map(p => p.x))
    const height = Math.max(...projected.map(p => p.y)) - Math.min(...projected.map(p => p.y))
    expect(Math.max(width / viewport.width, height / viewport.height)).toBeGreaterThan(.65)
  })
  it('does not zoom out to include unused farm storage bounds', () => {
    const viewport = { width: 1600, height: 560 }
    const first = farmOverviewCamera(farmPlanScene(document), viewport)!
    const expanded = farmOverviewCamera(farmPlanScene({ ...document, dimensions: { widthM: 500, lengthM: 500 } }), viewport)!
    expect(expanded.extent).toBeCloseTo(first.extent!)
    expect(expanded.azimuth).toBe(first.azimuth)
  })
  it('waits for a plan and a measured viewport', () => {
    expect(farmOverviewCamera(farmPlanScene(emptyFarmPlan()), { width: 800, height: 600 })).toBeNull()
    expect(farmOverviewCamera(farmPlanScene(document), { width: 0, height: 0 })).toBeNull()
  })
})
