import type { LivingSceneCamera } from './gpuScene'
import type { Vec3 } from './sceneMath'

type Viewport = { width: number; height: number }
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, n, i) => sum + n * b[i], 0)

/** Fit physical geometry with screen-space clearance for controls, independent of storage bounds. */
export function fitSceneCamera(points: Vec3[], viewport: Viewport, padding = { x: 36, y: 44 }): LivingSceneCamera | null {
  if (!points.length || viewport.width <= 0 || viewport.height <= 0) return null
  const low = [0, 1, 2].map(i => Math.min(...points.map(p => p[i])))
  const high = [0, 1, 2].map(i => Math.max(...points.map(p => p[i])))
  const target = low.map((n, i) => (n + high[i]) / 2) as Vec3
  const aspect = viewport.width / viewport.height
  const azimuth = high[2] - low[2] > high[0] - low[0] ? 1.16 : .36, elevation = .62
  const right: Vec3 = [Math.cos(azimuth), 0, -Math.sin(azimuth)]
  const up: Vec3 = [-Math.sin(azimuth) * Math.sin(elevation), Math.cos(elevation), -Math.cos(azimuth) * Math.sin(elevation)]
  const eye: Vec3 = [Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)]
  const fov = Math.tan(.65 / 2)
  const horizontalSpace = 1 - 2 * Math.min(padding.x / viewport.width, .24)
  const verticalSpace = 1 - 2 * Math.min(padding.y / viewport.height, .24)
  let distance = .2
  for (const point of points) {
    const relative = point.map((n, i) => n - target[i]) as Vec3
    const towardEye = dot(relative, eye)
    distance = Math.max(distance, towardEye + Math.abs(dot(relative, right)) / (fov * aspect * horizontalSpace), towardEye + Math.abs(dot(relative, up)) / (fov * verticalSpace), towardEye + .2)
  }
  return { azimuth, elevation, zoom: 1, target, extent: distance * 1.015 / (aspect < 1 ? 2.45 : 1.8) }
}
