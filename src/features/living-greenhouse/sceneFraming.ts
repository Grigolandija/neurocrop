import type { LivingSceneCamera } from './gpuScene'
import type { Vec3 } from './sceneMath'

type Viewport = { width: number; height: number }
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, n, i) => sum + n * b[i], 0)

/** Fit physical geometry with screen-space clearance for controls, independent of storage bounds. */
export function fitSceneCamera(points: Vec3[], viewport: Viewport, padding = { x: 36, y: 44 }, centerProjection = false): LivingSceneCamera | null {
  if (!points.length || viewport.width <= 0 || viewport.height <= 0) return null
  const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity]
  for (const point of points) for (let i = 0; i < 3; i++) { low[i] = Math.min(low[i], point[i]); high[i] = Math.max(high[i], point[i]) }
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
  if (centerProjection) {
    const horizontal = fov * aspect * horizontalSpace, vertical = fov * verticalSpace
    const coordinates = points.map(point => {
      const relative = point.map((n, i) => n - target[i]) as Vec3
      return [dot(relative, right), dot(relative, up), dot(relative, eye)] as Vec3
    })
    let left = -Infinity, rightEdge = Infinity, bottom = -Infinity, top = Infinity, nearest = .2
    for (const [x, y, z] of coordinates) {
      left = Math.max(left, x + horizontal * z); rightEdge = Math.min(rightEdge, x - horizontal * z)
      bottom = Math.max(bottom, y + vertical * z); top = Math.min(top, y - vertical * z)
      nearest = Math.max(nearest, z + .2)
    }
    distance = Math.max(nearest, (left - rightEdge) / (2 * horizontal), (bottom - top) / (2 * vertical)) * 1.015
    // Perspective makes the projected envelope asymmetric around the world-space centre.
    // Solve its screen-space midpoint while retaining the same camera orientation.
    const screenCentre = (axis: 0 | 1) => {
      let low = Infinity, high = -Infinity
      for (const point of coordinates) { low = Math.min(low, point[axis]); high = Math.max(high, point[axis]) }
      for (let iteration = 0; iteration < 24; iteration++) {
        const middle = (low + high) / 2
        let minimum = Infinity, maximum = -Infinity
        for (const point of coordinates) { const projected = (point[axis] - middle) / (distance - point[2]); minimum = Math.min(minimum, projected); maximum = Math.max(maximum, projected) }
        if (minimum + maximum > 0) low = middle; else high = middle
      }
      return (low + high) / 2
    }
    const x = screenCentre(0), y = screenCentre(1)
    for (let i = 0; i < 3; i++) target[i] += right[i] * x + up[i] * y
  } else distance *= 1.015
  return { azimuth, elevation, zoom: 1, target, extent: distance / (aspect < 1 ? 2.45 : 1.8) }
}
