import { planToScene } from '../living-greenhouse/sceneMath'
import { siteDimensions, type SitePlan } from '../living-greenhouse/siteDemoModel'
import { fitSceneCamera } from '../living-greenhouse/sceneFraming'

/** Frame the actual farm envelope, with its long side across the available viewport. */
export function farmOverviewCamera(plan: SitePlan, viewport: { width: number; height: number }) {
  const dimensions = siteDimensions(plan)
  const points = plan.zones.flatMap(zone => zone.polygon.flatMap(p => [planToScene(p.xM, p.yM, 0, dimensions), planToScene(p.xM, p.yM, zone.height, dimensions)]))
  return fitSceneCamera(points, viewport)
}
