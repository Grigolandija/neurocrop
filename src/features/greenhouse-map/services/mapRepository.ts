import { createDemoMap } from '../demo'
import { GREENHOUSE_WALL_THICKNESS_M, METRICS, normalizeHeatmapSettings, type GreenhouseMap, type GreenhouseObject, type MapLayer } from '../model'

const STORAGE_KEY = 'neurocrop:greenhouse-map-test:v1'

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const wallMountedTypes = new Set(['door', 'window', 'ventilation-opening'])
const perimeterWalls = new Set(['south', 'north', 'west', 'east'])

export function validateMap(value: unknown): { ok: true; map: GreenhouseMap } | { ok: false; error: string } {
  if (!value || typeof value !== 'object') return { ok: false, error: 'JSON root must be an object.' }
  const map = value as Partial<GreenhouseMap>
  if (map.schemaVersion !== 1) return { ok: false, error: 'Unsupported or missing schemaVersion.' }
  if (typeof map.name !== 'string' || !map.name.trim()) return { ok: false, error: 'Greenhouse name is required.' }
  if (!map.dimensions || !finite(map.dimensions.widthM) || !finite(map.dimensions.lengthM) || map.dimensions.widthM <= 0 || map.dimensions.lengthM <= 0) {
    return { ok: false, error: 'Greenhouse width and length must be positive finite numbers.' }
  }
  if (map.shape?.type !== 'rectangle') return { ok: false, error: 'Only rectangular greenhouse maps are supported.' }
  if (map.dimensions.widthM > 10000 || map.dimensions.lengthM > 10000) return { ok: false, error: 'Greenhouse dimensions exceed the supported limit.' }
  if (!finite(map.gridSizeM) || map.gridSizeM <= 0) return { ok: false, error: 'Grid size must be positive.' }
  if (!Array.isArray(map.layers) || !Array.isArray(map.objects)) return { ok: false, error: 'Layers and objects must be arrays.' }
  const layerIds = new Set((map.layers as MapLayer[]).map((layer) => layer.id))
  for (const [index, object] of (map.objects as GreenhouseObject[]).entries()) {
    if (!object || typeof object !== 'object' || typeof object.id !== 'string' || typeof object.type !== 'string') return { ok: false, error: `Object ${index + 1} is invalid.` }
    if (![object.xM, object.yM, object.widthM, object.lengthM, object.rotationDeg].every(finite)) return { ok: false, error: `Object ${object.id} contains an invalid number.` }
    if (object.widthM <= 0 || object.lengthM <= 0 || object.xM < 0 || object.yM < 0) return { ok: false, error: `Object ${object.id} has negative coordinates or invalid dimensions.` }
    if (object.xM + object.widthM > map.dimensions.widthM + 1e-6 || object.yM + object.lengthM > map.dimensions.lengthM + 1e-6) return { ok: false, error: `Object ${object.id} is outside the greenhouse.` }
    if (!layerIds.has(object.layerId)) return { ok: false, error: `Object ${object.id} references an unknown layer.` }
    const wallMount = object.metadata?.wallMount
    if (wallMount !== undefined) {
      if (!wallMountedTypes.has(object.type) || !perimeterWalls.has(wallMount.wall) || !finite(wallMount.offsetM) || wallMount.offsetM < 0) return { ok: false, error: `Object ${object.id} has an invalid wall mount.` }
      const touchesWall = wallMount.wall === 'south' ? Math.abs(object.yM) <= 1e-6
        : wallMount.wall === 'north' ? Math.abs(object.yM + object.lengthM - map.dimensions.lengthM) <= 1e-6
          : wallMount.wall === 'west' ? Math.abs(object.xM) <= 1e-6
            : Math.abs(object.xM + object.widthM - map.dimensions.widthM) <= 1e-6
      if (!touchesWall) return { ok: false, error: `Object ${object.id} is detached from its perimeter wall.` }
    }
  }
  const heatmap = normalizeHeatmapSettings(map.heatmapSettings)
  map.heatmapSettings = heatmap
  map.wallThicknessM = GREENHOUSE_WALL_THICKNESS_M
  if (
    !heatmap ||
    typeof heatmap.enabled !== 'boolean' ||
    heatmap.interpolationMethod !== 'idw' ||
    !Object.hasOwn(METRICS, heatmap.metric) ||
    !['auto', 'manual'].includes(heatmap.scaleMode) ||
    typeof heatmap.showConfidence !== 'boolean' ||
    !finite(heatmap.idwPower) ||
    heatmap.idwPower <= 0 ||
    heatmap.idwPower > 20 ||
    !finite(heatmap.cellSizeM) ||
    heatmap.cellSizeM < 0.1 ||
    heatmap.cellSizeM > 5 ||
    !Number.isInteger(heatmap.nearestSensorCount) ||
    heatmap.nearestSensorCount < 3 ||
    heatmap.nearestSensorCount > 5 ||
    !Number.isInteger(heatmap.minimumSensorCount) ||
    heatmap.minimumSensorCount < 1 ||
    heatmap.minimumSensorCount > heatmap.nearestSensorCount ||
    !finite(heatmap.maxInfluenceDistanceM) ||
    heatmap.maxInfluenceDistanceM <= 0 ||
    heatmap.maxInfluenceDistanceM > 10000 ||
    !finite(heatmap.maxReadingAgeMinutes) ||
    heatmap.maxReadingAgeMinutes <= 0 ||
    heatmap.maxReadingAgeMinutes > 10080 ||
    !finite(heatmap.opacity) ||
    heatmap.opacity < 0 ||
    heatmap.opacity > 1
  ) return { ok: false, error: 'Heatmap settings are invalid.' }
  if (
    heatmap.scaleMode === 'manual' &&
    (!finite(heatmap.manualMin) || !finite(heatmap.manualMax) || heatmap.manualMin >= heatmap.manualMax)
  ) return { ok: false, error: 'Manual heatmap bounds are invalid.' }
  return { ok: true, map: map as GreenhouseMap }
}

export const mapRepository = {
  load(): GreenhouseMap {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDemoMap()
    try {
      const result = validateMap(JSON.parse(raw))
      return result.ok ? result.map : createDemoMap()
    } catch {
      return createDemoMap()
    }
  },
  save(map: GreenhouseMap) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...map,
      wallThicknessM: GREENHOUSE_WALL_THICKNESS_M,
      updatedAt: new Date().toISOString(),
    }))
  },
  reset() {
    localStorage.removeItem(STORAGE_KEY)
    return createDemoMap()
  },
}
