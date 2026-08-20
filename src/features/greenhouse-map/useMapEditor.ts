import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OBJECT_LIBRARY, type GreenhouseMap, type GreenhouseObject, type ObjectType } from './model'
import { clampObjectPosition, isWallMountedType, sensorMarkerSizeM, snapRectanglePosition, snapSectionToWalls, snapWallMountedObject } from './geometry'
import { mapRepository } from './services/mapRepository'
import { createDemoMap } from './demo'

type History = { past: GreenhouseMap[]; present: GreenhouseMap; future: GreenhouseMap[] }
const clone = (map: GreenhouseMap): GreenhouseMap => structuredClone(map)
const canDuplicateObject = (object: GreenhouseObject) => object.type !== 'section-zone' && object.type !== 'sensor-node'

function duplicateName(object: GreenhouseObject, objects: GreenhouseObject[]) {
  const base = object.name.replace(/ copy(?: \d+)?$/i, '')
  const names = new Set(objects.map((candidate) => candidate.name.toLocaleLowerCase()))
  let name = `${base} copy`
  let number = 2
  while (names.has(name.toLocaleLowerCase())) {
    name = `${base} copy ${number}`
    number += 1
  }
  return name
}

function duplicatePosition(object: GreenhouseObject, map: GreenhouseMap) {
  const offset = Math.max(map.gridSizeM * 3, Math.min(.5, Math.min(object.widthM, object.lengthM) * .2))
  const candidates = [
    [object.xM + offset, object.yM + offset],
    [object.xM - offset, object.yM - offset],
    [object.xM + offset, object.yM - offset],
    [object.xM - offset, object.yM + offset],
  ]
  return candidates
    .map(([xM, yM]) => clampObjectPosition(xM, yM, object.widthM, object.lengthM, map.dimensions.widthM, map.dimensions.lengthM))
    .find((position) => Math.abs(position.xM - object.xM) > .001 || Math.abs(position.yM - object.yM) > .001)
    ?? { xM: object.xM, yM: object.yM }
}

function createObject(type: ObjectType, map: GreenhouseMap, xM?: number, yM?: number): GreenhouseObject {
  const definition = OBJECT_LIBRARY.find((entry) => entry.type === type) ?? OBJECT_LIBRARY[0]
  const [widthM, lengthM] = definition.size
  const position = clampObjectPosition(xM ?? map.dimensions.widthM / 2 - widthM / 2, yM ?? map.dimensions.lengthM / 2 - lengthM / 2, widthM, lengthM, map.dimensions.widthM, map.dimensions.lengthM)
  const id = `${type}-${crypto.randomUUID().slice(0, 8)}`
  const object: GreenhouseObject = {
    id, type, name: `${definition.label} ${map.objects.filter((object) => object.type === type).length + 1}`,
    ...position, widthM, lengthM, rotationDeg: 0, layerId: definition.layerId, locked: false, visible: true,
    metadata: type === 'sensor-node' ? {
      sensor: {
        nodeId: `DRAFT-${id.slice(-4).toUpperCase()}`, displayName: 'Unassigned NeuroSense', sensors: ['Air temperature', 'Relative humidity'],
        status: 'unassigned', batteryPercent: 100, coverageRadiusM: 3, model: 'NeuroSense S4',
        measurements: { airTemperatureC: 24, relativeHumidityPercent: 68, co2Ppm: 800, vpdKpa: 1, rootTemperatureC: 22, pressureHpa: 1013, measuredAt: new Date().toISOString() },
      },
    } : {},
  }
  return isWallMountedType(type) ? snapWallMountedObject(object, map.dimensions) : object
}

export function normalizeMapGeometry(map: GreenhouseMap): GreenhouseMap {
  const markerSize = sensorMarkerSizeM(map.dimensions)
  return {
    ...map,
    objects: map.objects.map((source) => {
      const object = { ...source, visible: true }
      if (object.type === 'sensor-node') {
        const position = clampObjectPosition(object.xM, object.yM, markerSize, markerSize, map.dimensions.widthM, map.dimensions.lengthM)
        return { ...object, ...position, widthM: markerSize, lengthM: markerSize }
      }
      if (isWallMountedType(object.type)) return snapWallMountedObject(object, map.dimensions, object.metadata.wallMount?.wall)
      const widthM = Math.min(map.dimensions.widthM, Math.max(.05, object.widthM))
      const lengthM = Math.min(map.dimensions.lengthM, Math.max(.05, object.lengthM))
      const clamped = clampObjectPosition(object.xM, object.yM, widthM, lengthM, map.dimensions.widthM, map.dimensions.lengthM)
      const resized = { ...object, ...clamped, widthM, lengthM }
      return object.type === 'section-zone'
        ? snapSectionToWalls(resized, map.dimensions, map.gridSizeM)
        : resized
    }),
  }
}

type MapEditorOptions = {
  persistLocal?: boolean
  protectSensorNodes?: boolean
}

export function useMapEditor({ persistLocal = true, protectSensorNodes = false }: MapEditorOptions = {}) {
  const [history, setHistory] = useState<History>(() => ({ past: [], present: normalizeMapGeometry(persistLocal ? mapRepository.load() : createDemoMap()), future: [] }))
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [copiedObjects, setCopiedObjects] = useState<GreenhouseObject[]>([])
  const [snap, setSnap] = useState(true)
  const saveTimer = useRef<number | undefined>(undefined)
  const map = history.present

  const commit = useCallback((producer: (current: GreenhouseMap) => GreenhouseMap, record = true) => {
    setHistory((current) => {
      const produced = producer(clone(current.present))
      const normalized = normalizeMapGeometry(produced)
      const next = {
        ...normalized,
        updatedAt: new Date().toISOString(),
      }
      if (JSON.stringify(next) === JSON.stringify(current.present)) return current
      return record
        ? { past: [...current.past.slice(-49), current.present], present: next, future: [] }
        : { ...current, present: next }
    })
  }, [])

  useEffect(() => {
    if (!persistLocal) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => mapRepository.save(map), 450)
    return () => window.clearTimeout(saveTimer.current)
  }, [map, persistLocal])

  const updateObject = useCallback((id: string, patch: Partial<GreenhouseObject>, record = true) => {
    commit((current) => ({ ...current, objects: current.objects.map((object) => {
      if (object.id !== id) return object
      const layerLocked = current.layers.find((layer) => layer.id === object.layerId)?.locked === true
      if (layerLocked) return object
      if (object.locked && patch.locked !== false) return object
      const updated = { ...object, ...patch }
      if (!isWallMountedType(updated.type)) return updated
      const positionChanged = patch.xM !== undefined || patch.yM !== undefined || patch.type !== undefined
      return snapWallMountedObject(updated, current.dimensions, positionChanged ? undefined : object.metadata.wallMount?.wall)
    }) }), record)
  }, [commit])

  const addObject = useCallback((type: ObjectType, xM?: number, yM?: number) => {
    if (protectSensorNodes && type === 'sensor-node') return
    const definition = OBJECT_LIBRARY.find((entry) => entry.type === type)
    if (definition && map.layers.find((layer) => layer.id === definition.layerId)?.locked) return
    const object = createObject(type, map, xM, yM)
    commit((current) => ({ ...current, objects: [...current.objects, object] }))
    setSelectedIds([object.id])
  }, [commit, map, protectSensorNodes])

  const deleteSelected = useCallback(() => {
    if (!selectedIds.length) return
    commit((current) => ({ ...current, objects: current.objects.filter((object) => {
      const selected = selectedIds.includes(object.id)
      const layerLocked = current.layers.find((layer) => layer.id === object.layerId)?.locked === true
      const protectedObject = object.locked || layerLocked || object.type === 'section-zone' || (protectSensorNodes && object.type === 'sensor-node')
      return !selected || protectedObject
    }) }))
    setSelectedIds([])
  }, [commit, protectSensorNodes, selectedIds])

  const copySelected = useCallback(() => {
    const copied = map.objects.filter((object) => selectedIds.includes(object.id) && canDuplicateObject(object))
    if (!copied.length) return
    setCopiedObjects(structuredClone(copied))
  }, [map.objects, selectedIds])

  const pasteCopied = useCallback(() => {
    const copies: GreenhouseObject[] = []
    copiedObjects.forEach((object) => {
      if (map.layers.find((layer) => layer.id === object.layerId)?.locked) return
      const id = `${object.type}-${crypto.randomUUID().slice(0, 8)}`
      const position = duplicatePosition(object, map)
      copies.push({
        ...clone({ ...map, objects: [object] }).objects[0],
        ...position,
        id,
        name: duplicateName(object, [...map.objects, ...copies]),
        locked: false,
      })
    })
    if (!copies.length) return
    commit((current) => ({ ...current, objects: [...current.objects, ...copies] }))
    setSelectedIds(copies.map((object) => object.id))
    setCopiedObjects(structuredClone(copies))
  }, [commit, copiedObjects, map])

  const moveObjects = useCallback((positions: Array<{ id: string; xM: number; yM: number }>, record = true) => {
    commit((current) => ({
      ...current,
      objects: current.objects.map((object) => {
        const position = positions.find((item) => item.id === object.id)
        const layerLocked = current.layers.find((layer) => layer.id === object.layerId)?.locked === true
        if (!position || object.locked || layerLocked) return object
        const snappedPosition = snapRectanglePosition(position, object, current.gridSizeM, snap)
        const snapped = { ...object, ...snappedPosition }
        if (isWallMountedType(object.type)) return snapWallMountedObject(snapped, current.dimensions)
        const clamped = clampObjectPosition(snapped.xM, snapped.yM, object.widthM, object.lengthM, current.dimensions.widthM, current.dimensions.lengthM)
        return object.type === 'section-zone'
          ? snapSectionToWalls({ ...object, ...clamped }, current.dimensions, current.gridSizeM)
          : { ...object, ...clamped }
      }),
    }), record)
  }, [commit, snap])

  const undo = useCallback(() => setHistory((current) => current.past.length ? {
    past: current.past.slice(0, -1), present: current.past[current.past.length - 1], future: [current.present, ...current.future],
  } : current), [])
  const redo = useCallback(() => setHistory((current) => current.future.length ? {
    past: [...current.past, current.present], present: current.future[0], future: current.future.slice(1),
  } : current), [])

  const reset = useCallback(() => {
    const next = persistLocal ? mapRepository.reset() : createDemoMap()
    setHistory({ past: [], present: next, future: [] })
    setSelectedIds([])
  }, [persistLocal])
  const hydrate = useCallback((next: GreenhouseMap) => {
    setHistory({ past: [], present: normalizeMapGeometry(next), future: [] })
    setSelectedIds([])
  }, [])
  const replace = useCallback((next: GreenhouseMap) => {
    setHistory((current) => ({ past: [...current.past.slice(-49), current.present], present: normalizeMapGeometry(next), future: [] }))
    setSelectedIds([])
  }, [])
  const save = useCallback(() => {
    if (persistLocal) mapRepository.save(map)
  }, [map, persistLocal])

  const selected = useMemo(() => map.objects.filter((object) => selectedIds.includes(object.id)), [map.objects, selectedIds])
  const duplicableSelectedCount = useMemo(() => selected.filter(canDuplicateObject).length, [selected])
  return {
    map, selected, selectedIds, setSelectedIds, snap, setSnap, commit, updateObject, addObject, deleteSelected,
    copySelected, pasteCopied, duplicableSelectedCount, canPaste: copiedObjects.length > 0, moveObjects, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    reset, replace, hydrate, save,
  }
}
