import { insideOutline, objectFootprint, objectInsideOutline, outlinePoints, validOutlineMount } from '../../../backend/area-map-outline.js'
import { isWallMountedType } from '../greenhouse-map/geometry'
import type { GreenhouseMap, GreenhouseObject } from '../greenhouse-map/model'
import type { SitePoint } from '../living-greenhouse/siteDemoModel'
import { equipmentUnlocked } from './farmEquipmentEditing'

export type WallClearance = { wallIndex: number; from: SitePoint; to: SitePoint; distanceM: number; away: SitePoint }
const eps = 1e-7
const subtract = (a: SitePoint, b: SitePoint) => ({ xM: a.xM - b.xM, yM: a.yM - b.yM })
const dot = (a: SitePoint, b: SitePoint) => a.xM * b.xM + a.yM * b.yM
const cross = (a: SitePoint, b: SitePoint) => a.xM * b.yM - a.yM * b.xM
const middle = (a: SitePoint, b: SitePoint) => ({ xM: (a.xM + b.xM) / 2, yM: (a.yM + b.yM) / 2 })
const distance = (a: SitePoint, b: SitePoint) => Math.hypot(a.xM - b.xM, a.yM - b.yM)
function projection(p: SitePoint, a: SitePoint, b: SitePoint): SitePoint {
  const direction = subtract(b, a), length2 = dot(direction, direction)
  const t = length2 < eps * eps ? 0 : Math.max(0, Math.min(1, dot(subtract(p, a), direction) / length2))
  return { xM: a.xM + t * direction.xM, yM: a.yM + t * direction.yM }
}

/** Check every section between boundary crossings, rather than sampling across recesses. */
function segmentInside(a: SitePoint, b: SitePoint, polygon: SitePoint[]) {
  const direction = subtract(b, a), cuts = [0, 1]
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], edge = subtract(q, p), denominator = cross(direction, edge)
    if (Math.abs(denominator) < eps) continue
    const offset = subtract(p, a), t = cross(offset, edge) / denominator, u = cross(offset, direction) / denominator
    if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t)
  }
  cuts.sort((x, y) => x - y)
  return cuts.slice(1).every((end, i) => {
    const t = (end + cuts[i]) / 2
    return insideOutline({ xM: a.xM + t * direction.xM, yM: a.yM + t * direction.yM }, polygon)
  })
}

/** Shortest edge-to-segment distances in the Area's local frame, never its bounding box. */
export function equipmentWallClearances(object: GreenhouseObject, map: GreenhouseMap): WallClearance[] {
  if (object.type === 'sensor-node' || map.farmPlanGeometry?.kind === 'zone' || !objectInsideOutline(object, map)) return []
  const polygon = outlinePoints(map), footprint = objectFootprint(object), center = middle(footprint[0], footprint[2])
  const sign = Math.sign(polygon.reduce((sum, p, i) => sum + cross(p, polygon[(i + 1) % polygon.length]), 0)) || 1
  return polygon.flatMap((a, wallIndex) => {
    const b = polygon[(wallIndex + 1) % polygon.length], length = distance(a, b)
    if (length < eps) return []
    const candidates: { from: SitePoint; to: SitePoint; distanceM: number }[] = []
    const add = (from: SitePoint, to: SitePoint) => candidates.push({ from, to, distanceM: distance(from, to) })
    for (let i = 0; i < footprint.length; i++) {
      const p = footprint[i], q = footprint[(i + 1) % footprint.length]
      for (const point of [p, middle(p, q)]) add(point, projection(point, a, b))
      for (const point of [a, b, projection(center, a, b)]) add(projection(point, p, q), point)
    }
    candidates.sort((x, y) => Math.abs(x.distanceM - y.distanceM) > eps ? x.distanceM - y.distanceM : distance(x.from, center) - distance(y.from, center))
    const closest = candidates[0]
    // A wall behind an L/U-shaped recess is not a usable straight clearance.
    if (!segmentInside(closest.from, closest.to, polygon)) return []
    const away = closest.distanceM > eps ? {
      xM: (closest.from.xM - closest.to.xM) / closest.distanceM,
      yM: (closest.from.yM - closest.to.yM) / closest.distanceM,
    } : { xM: -sign * (b.yM - a.yM) / length, yM: sign * (b.xM - a.xM) / length }
    return [{ ...closest, wallIndex, away }]
  }).sort((a, b) => a.distanceM - b.distanceM || a.wallIndex - b.wallIndex)
}

export function wallClearanceEditable(object: GreenhouseObject, map: GreenhouseMap, clearance: WallClearance) {
  if (!equipmentUnlocked(object, map)) return false
  if (!isWallMountedType(object.type)) return true
  const angle = object.rotationDeg * Math.PI / 180
  return Math.abs(clearance.away.xM * Math.cos(angle) + clearance.away.yM * Math.sin(angle)) > eps
}

/** Exact typed distances bypass grid/magnets and preserve size, rotation and mounting. */
export function setEquipmentWallClearance(object: GreenhouseObject, map: GreenhouseMap, wallIndex: number, targetM: number): GreenhouseObject | null {
  if (!Number.isFinite(targetM) || targetM < 0 || targetM > 10000) return null
  const clearance = equipmentWallClearances(object, map).find(value => value.wallIndex === wallIndex)
  if (!clearance || !wallClearanceEditable(object, map, clearance)) return null
  const change = targetM - clearance.distanceM
  let delta = { xM: change * clearance.away.xM, yM: change * clearance.away.yM }, metadata = object.metadata
  if (isWallMountedType(object.type)) {
    const angle = object.rotationDeg * Math.PI / 180, axis = { xM: Math.cos(angle), yM: Math.sin(angle) }
    const offset = change / dot(clearance.away, axis)
    delta = { xM: offset * axis.xM, yM: offset * axis.yM }
    metadata = { ...metadata, wallMount: { ...metadata.wallMount, offsetM: (metadata.wallMount?.offsetM || 0) + offset } }
  }
  const next = { ...object, xM: object.xM + delta.xM, yM: object.yM + delta.yM, metadata }
  if (!objectInsideOutline(next, map) || (isWallMountedType(next.type) && !validOutlineMount(next, map))) return null
  const polygon = outlinePoints(map), before = objectFootprint(object), after = objectFootprint(next)
  if (!before.every((point, i) => segmentInside(point, after[i], polygon))) return null
  const actual = equipmentWallClearances(next, map).find(value => value.wallIndex === wallIndex)
  return actual && Math.abs(actual.distanceM - targetM) < 1e-6 ? next : null
}
