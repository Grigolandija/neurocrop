import { outlinePoints } from '../../../backend/area-map-outline.js'
import type { GreenhouseMap } from '../greenhouse-map/model'
import type { VolumeField } from './sceneGeometry'
import { planToScene, type Vec3 } from './sceneMath'
import type { SensorReading } from './spatialEvidence'
import type { ClimateContour } from './climateContours'

export type SliceMode = 'vertical' | 'horizontal'
export type SliceSelection = { scope: string; mode: SliceMode; position: number; normal: Vec3 }
export type SlicePlane = [number, number, number, number]
const dot = (a: Vec3, b: Vec3) => a.reduce((sum, value, i) => sum + value * b[i], 0)

/** The initial vertical plane passes through the current minimum and maximum observations. */
export function initialSliceNormal(readings: SensorReading[], dimensions: GreenhouseMap['dimensions']): Vec3 {
  const sources = readings.filter(r => r.value !== null && r.heightM !== null && r.heightM <= (dimensions.heightM || Infinity)).sort((a, b) => a.value! - b.value! || a.object.id.localeCompare(b.object.id))
  if (sources.length > 1) {
    const a = sources[0].object, b = sources.at(-1)!.object
    const dx = b.xM + b.widthM / 2 - a.xM - a.widthM / 2, dz = -(b.yM + b.lengthM / 2 - a.yM - a.lengthM / 2)
    const length = Math.hypot(dx, dz)
    if (length > .01) return [-dz / length, 0, dx / length]
  }
  return dimensions.widthM >= dimensions.lengthM ? [0, 0, 1] : [1, 0, 0]
}

export function climateSlice(map: GreenhouseMap, readings: SensorReading[], field: VolumeField, scale: { min: number; max: number }, selection?: SliceSelection | null) {
  const mode = selection?.mode || 'vertical'
  const normal: Vec3 = mode === 'horizontal' ? [0, 1, 0] : selection?.normal || initialSliceNormal(readings, map.dimensions)
  const polygon = outlinePoints(map).map(p => planToScene(p.xM, p.yM, 0, map.dimensions))
  const projected = polygon.map(p => dot(normal, p))
  const min = mode === 'horizontal' ? 0 : Math.min(...projected), max = mode === 'horizontal' ? field.bounds[2] : Math.max(...projected)
  const sources = readings.filter(r => r.value !== null && r.heightM !== null && r.heightM <= field.bounds[2]).sort((a, b) => a.value! - b.value! || a.object.id.localeCompare(b.object.id))
  const offsets = (mode === 'horizontal' ? sources : sources.length ? [sources[0], sources.at(-1)!] : []).map(r => dot(normal, planToScene(r.object.xM + r.object.widthM / 2, r.object.yM + r.object.lengthM / 2, r.heightM!, map.dimensions)))
  const initial = offsets.length ? offsets.reduce((a, b) => a + b, 0) / offsets.length : (min + max) / 2
  const position = Math.max(min + (max - min) * .001, Math.min(max - (max - min) * .001, selection?.position ?? initial))
  const plane: SlicePlane = [...normal, position]
  const raw = (scale.max - scale.min) / 4, magnitude = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)))
  const step = ([1, 2, 2.5, 5, 10].find(n => n >= raw / magnitude) || 10) * magnitude
  const levels: ClimateContour[] = []
  for (let value = Math.ceil((scale.min + step * .05) / step) * step; value < scale.max - step * .05 && levels.length < 6; value += step) levels.push({ value: Number(value.toPrecision(9)), normalized: (value - scale.min) / (scale.max - scale.min), anchors: [] })
  // Find contour crossings on the same atlas used by the GPU; captions remain on this plane.
  const tangent: Vec3 = mode === 'horizontal' ? [1, 0, 0] : [-normal[2], 0, normal[0]]
  const distances = polygon.map(p => dot(tangent, p)), low = Math.min(...distances), high = Math.max(...distances)
  const rows = 40, columns = 64
  const positionAt = (u: number, v: number): Vec3 => mode === 'horizontal'
    ? [(u - .5) * field.bounds[0], position, (.5 - v) * field.bounds[1]]
    : [normal[0] * position + tangent[0] * (low + (high - low) * u), v * field.bounds[2], normal[2] * position + tangent[2] * (low + (high - low) * u)]
  for (let row = 1; row < rows; row++) for (let col = 1; col < columns; col++) {
    const b = positionAt(col / columns, row / rows), bv = sampleSliceField(field, b)
    if (!bv) continue
    for (const a of [positionAt((col - 1) / columns, row / rows), positionAt(col / columns, (row - 1) / rows)]) {
      const av = sampleSliceField(field, a)
      if (!av || Math.min(av.support, bv.support) < .12) continue
      for (const contour of levels) {
        if ((av.value - contour.normalized) * (bv.value - contour.normalized) > 0 || Math.abs(av.value - bv.value) < 1e-6) continue
        const t = (contour.normalized - av.value) / (bv.value - av.value)
        const point = a.map((n, i) => n + (b[i] - n) * t) as Vec3
        if (contour.anchors.length < 12 && contour.anchors.every(p => Math.hypot(...p.map((n, i) => n - point[i])) > Math.min(...field.bounds) * .18)) contour.anchors.push(point)
      }
    }
  }
  return { mode, normal, min, max, position, plane, contours: levels, captions: levels.filter(level => level.anchors.length).slice(0, 3) }
}

/** Trilinear masked atlas sampling, including reduced support outside measured heights. */
export function sampleSliceField(field: VolumeField, point: Vec3) {
  const [w, d, h] = field.bounds
  if (Math.abs(point[0]) > w / 2 || Math.abs(point[2]) > d / 2 || point[1] < 0 || point[1] > h * (1 - (field.roofSlope || 0) * Math.abs(point[2]) / (d / 2))) return null
  const coords = [point[0] / w + .5, .5 - point[2] / d, point[1] / h]
  const sizes = [field.width, field.height, field.layers]
  const cells = coords.map((value, i) => Math.max(0, Math.min(sizes[i] - 1, value * sizes[i] - .5)))
  const lower = cells.map(Math.floor), mix = cells.map((v, i) => v - lower[i])
  let alpha = 0, value = 0, support = 0
  for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) for (let x = 0; x < 2; x++) {
    const weight = (x ? mix[0] : 1 - mix[0]) * (z ? mix[1] : 1 - mix[1]) * (y ? mix[2] : 1 - mix[2])
    const i = ((Math.min(sizes[2] - 1, lower[2] + y) * field.height + Math.min(sizes[1] - 1, lower[1] + z)) * field.width + Math.min(sizes[0] - 1, lower[0] + x)) * 4
    alpha += field.pixels[i + 3] / 255 * weight; value += field.pixels[i] / 255 * weight; support += field.pixels[i + 1] / 255 * weight
  }
  return alpha > .9 ? { value: value / alpha, support: support / alpha } : null
}
