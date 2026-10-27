import { planToScene, type Vec3 } from '../living-greenhouse/sceneMath'
import { siteDimensions, type SitePlan } from '../living-greenhouse/siteDemoModel'
import { fitSceneCamera } from '../living-greenhouse/sceneFraming'

/** Frame the actual farm envelope, with its long side across the available viewport. */
export function farmOverviewCamera(plan: SitePlan, viewport: { width: number; height: number }, vertices?: Float32Array) {
  const dimensions = siteDimensions(plan)
  const points: Vec3[] = []
  if (vertices?.length) for (let i = 0; i < vertices.length; i += 6) points.push([vertices[i], vertices[i + 1], vertices[i + 2]])
  else for (const zone of plan.zones) for (const p of zone.polygon) points.push(planToScene(p.xM, p.yM, 0, dimensions), planToScene(p.xM, p.yM, zone.height, dimensions))
  return fitSceneCamera(points, viewport, { x: 24, y: 24 }, true)
}
