import { pointInPolygon } from '../greenhouse-map/heatmap/rasterInterpolation'
import { inverseMatrix, type Vec3 } from './sceneMath'

export type SitePoint = { xM: number; yM: number }
export type SiteMetric = 'temperature' | 'humidity' | 'co2'
export type SiteSensor = SitePoint & { id: string; height: number; temperature: number; humidity: number; co2: number }
export type SiteZone = { id: string; name: string; buildingId: string; roomId?: string; areaId?: string; kind: 'greenhouse' | 'room'; height: number; polygon: SitePoint[]; label: SitePoint; sensors: SiteSensor[] }
export type SiteBuilding = { id: string; name: string; polygon: SitePoint[]; height: number; greenhouse: boolean }
export type SiteRoom = { id: string; name: string; buildingId: string; polygon: SitePoint[]; height: number }
export type SitePlan = { version: 1; dimensions?:{widthM:number;lengthM:number}; buildings: SiteBuilding[]; rooms: SiteRoom[]; zones: SiteZone[] }
export const SITE_SIZE = { widthM: 50, lengthM: 34, heightM: 5 }
export const siteDimensions=(plan:Pick<SitePlan,'dimensions'>)=>plan.dimensions || SITE_SIZE
export const siteMetrics = {
  temperature: { label: 'Oro temperatūra', unit: '°C', min: 14, max: 30, decimals: 1 },
  humidity: { label: 'Santykinė drėgmė', unit: '%', min: 40, max: 90, decimals: 0 },
  co2: { label: 'CO₂', unit: 'ppm', min: 400, max: 1200, decimals: 0 },
} as const
export const rectangle = (x: number, y: number, width: number, depth: number): SitePoint[] => [
  { xM: x, yM: y }, { xM: x + width, yM: y }, { xM: x + width, yM: y + depth }, { xM: x, yM: y + depth },
]
const sensor = (id: number, xM: number, yM: number, height: number, temperature: number, humidity: number, co2: number): SiteSensor => ({ id: `DEMO-${String(id).padStart(3, '0')}`, xM, yM, height, temperature, humidity, co2 })

// Physical structures and monitoring polygons are deliberately separate.
export const siteBuildings: SiteBuilding[] = [
  { id: 'greenhouse-a', name: 'Šiltnamis 1', polygon: rectangle(4, 5, 20, 9), height: 5, greenhouse: true },
  { id: 'greenhouse-b', name: 'Šiltnamis 2', polygon: rectangle(4, 19, 20, 9), height: 4.6, greenhouse: true },
  { id: 'building', name: 'Pastatas', polygon: rectangle(31, 6, 14, 22), height: 3.4, greenhouse: false },
]

export const siteZones: SiteZone[] = [
  { id: 'greenhouse-a', name: 'Šiltnamis 1', buildingId: 'greenhouse-a', kind: 'greenhouse', height: 5, polygon: rectangle(4, 5, 20, 9), label: { xM: 14, yM: 9.5 }, sensors: [
    sensor(1, 6, 7, .8, 19.1, 79, 610), sensor(2, 21, 7, 1.5, 24.8, 54, 890), sensor(3, 7, 12, 2.6, 21.2, 71, 740), sensor(4, 21, 12, 1, 27.1, 48, 1100), sensor(5, 14, 9.5, 1.6, 23.4, 63, 810),
  ] },
  { id: 'greenhouse-b', name: 'Šiltnamis 2', buildingId: 'greenhouse-b', kind: 'greenhouse', height: 4.6, polygon: rectangle(4, 19, 20, 9), label: { xM: 14, yM: 23.5 }, sensors: [
    sensor(6, 6, 21, 1, 18.2, 83, 580), sensor(7, 21, 21, 2.4, 22.8, 64, 870), sensor(8, 7, 26, 1.5, 20.1, 76, 700), sensor(9, 21, 26, .7, 24.2, 57, 960),
  ] },
  { id: 'room-l', name: 'L formos kambarys', buildingId: 'building', kind: 'room', height: 3.4, polygon: [
    { xM: 31, yM: 6 }, { xM: 45, yM: 6 }, { xM: 45, yM: 14 }, { xM: 38, yM: 14 }, { xM: 38, yM: 28 }, { xM: 31, yM: 28 },
  ], label: { xM: 34.5, yM: 17 }, sensors: [
    sensor(10, 33, 9, 1.3, 18.4, 58, 530), sensor(11, 42, 10, 2.2, 21.5, 69, 760), sensor(12, 34, 18, .8, 20, 61, 620), sensor(13, 34, 25, 2.6, 23, 78, 950),
  ] },
  { id: 'room-2', name: 'Kambarys 2', buildingId: 'building', kind: 'room', height: 3.4, polygon: rectangle(38, 14, 7, 7), label: { xM: 41.5, yM: 17.5 }, sensors: [
    sensor(14, 39, 16, 1, 22, 64, 660), sensor(15, 43, 16, 2, 24, 79, 920), sensor(16, 41, 19, 1.5, 25.8, 85, 1080),
  ] },
  { id: 'room-3', name: 'Kambarys 3', buildingId: 'building', kind: 'room', height: 3.4, polygon: rectangle(38, 21, 7, 7), label: { xM: 41.5, yM: 24.5 }, sensors: [
    sensor(17, 39, 23, 1, 15.1, 45, 430), sensor(18, 43, 23, 2, 17.2, 57, 600), sensor(19, 41, 26, 1.5, 19.3, 67, 740),
  ] },
]

export const siteRooms: SiteRoom[] = siteZones.filter(zone=>zone.kind==='room').map(zone=>({ id: zone.id, name: zone.name, buildingId: zone.buildingId, height: zone.height, polygon: structuredClone(zone.polygon) }))
export function createSitePlan(): SitePlan {
  return structuredClone({ version: 1, buildings: siteBuildings, rooms: siteRooms, zones: siteZones.map(zone=>({ ...zone, roomId: zone.kind==='room' ? zone.id : undefined })) })
}
export function zoneBounds(zone: { polygon: SitePoint[] }) {
  const x = zone.polygon.map(p => p.xM), y = zone.polygon.map(p => p.yM)
  return { minX: Math.min(...x), maxX: Math.max(...x), minY: Math.min(...y), maxY: Math.max(...y) }
}
export function zoneArea(zone: { polygon: SitePoint[] }) {
  return Math.abs(zone.polygon.reduce((sum, p, i) => { const q = zone.polygon[(i + 1) % zone.polygon.length]; return sum + p.xM * q.yM - q.xM * p.yM }, 0)) / 2
}
const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx

/** Check every boundary intersection, including a concave room's missing corner. */
export function segmentInsideZone(a: SitePoint, b: SitePoint, polygon: SitePoint[]) {
  const dx = b.xM - a.xM, dy = b.yM - a.yM, cuts = [0, 1]
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length]
    const ex = q.xM - p.xM, ey = q.yM - p.yM, denominator = cross(dx, dy, ex, ey)
    if (Math.abs(denominator) < 1e-9) continue
    const t = cross(p.xM - a.xM, p.yM - a.yM, ex, ey) / denominator
    const u = cross(p.xM - a.xM, p.yM - a.yM, dx, dy) / denominator
    if (t > 0 && t < 1 && u >= 0 && u <= 1) cuts.push(t)
  }
  cuts.sort((x, y) => x - y)
  return cuts.slice(1).every((t, i) => {
    const middle = (cuts[i] + t) / 2
    return pointInPolygon({ xM: a.xM + dx * middle, yM: a.yM + dy * middle }, polygon)
  })
}
export function zoneSources(zone: SiteZone, point: SitePoint, rooms = siteRooms, buildings = siteBuildings) {
  if (!pointInPolygon(point, zone.polygon)) return []
  const physicalRooms=rooms.filter(room=>room.buildingId===zone.buildingId)
  const room=physicalRooms.find(room=>pointInPolygon(point,room.polygon))
  const shell=room?.polygon || buildings.find(building=>building.id===zone.buildingId)?.polygon || zone.polygon
  return zone.sensors.filter(s => {
    const sourceRoom=physicalRooms.find(candidate=>pointInPolygon(s,candidate.polygon))
    return room?.id===sourceRoom?.id && pointInPolygon(s,zone.polygon) && segmentInsideZone(point,s,shell)
  })
}
export function interpolateSite(sources: SiteSensor[], x: number, y: number, height: number, metric: SiteMetric) {
  let weights = 0, sum = 0
  for (const s of sources) {
    const distanceSquared = (s.xM - x) ** 2 + (s.yM - y) ** 2 + (s.height - height) ** 2
    if (distanceSquared < 1e-10) return s[metric]
    const weight = 1 / Math.max(.01, distanceSquared)
    weights += weight; sum += s[metric] * weight
  }
  return weights ? sum / weights : null
}

/** Intersect a screen ray with the plan, independent of orbit and zoom. */
export function pickSitePoint(x: number, y: number, width: number, height: number, matrix: Float32Array,dimensions:{widthM:number;lengthM:number}=SITE_SIZE): SitePoint | null {
  const inverse = inverseMatrix(matrix)
  const world = (depth: number): Vec3 => {
    const v = [x / width * 2 - 1, 1 - y / height * 2, depth, 1]
    const p = [0, 1, 2, 3].map(row => v.reduce((sum, n, column) => sum + n * inverse[column * 4 + row], 0))
    return [p[0] / p[3], p[1] / p[3], p[2] / p[3]]
  }
  const a = world(0), b = world(1), t = (.04 - a[1]) / (b[1] - a[1])
  if (!Number.isFinite(t) || t < 0 || t > 1) return null
  return { xM: a[0] + (b[0] - a[0]) * t + dimensions.widthM / 2, yM: dimensions.lengthM / 2 - (a[2] + (b[2] - a[2]) * t) }
}
