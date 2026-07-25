import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { OBJECT_LIBRARY, type GreenhouseMap, type GreenhouseObject, type ObjectType } from './model'
import { clampObjectPosition, snapValue } from './geometry'
import { mapRepository } from './services/mapRepository'

type History = { past: GreenhouseMap[]; present: GreenhouseMap; future: GreenhouseMap[] }
const clone = (map: GreenhouseMap): GreenhouseMap => structuredClone(map)

function createObject(type: ObjectType, map: GreenhouseMap, xM?: number, yM?: number): GreenhouseObject {
  const definition = OBJECT_LIBRARY.find((entry) => entry.type === type) ?? OBJECT_LIBRARY[0]
  const [widthM, lengthM] = definition.size
  const position = clampObjectPosition(xM ?? map.dimensions.widthM / 2 - widthM / 2, yM ?? map.dimensions.lengthM / 2 - lengthM / 2, widthM, lengthM, map.dimensions.widthM, map.dimensions.lengthM)
  const id = `${type}-${crypto.randomUUID().slice(0, 8)}`
  return {
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
}

export function useMapEditor() {
  const [history, setHistory] = useState<History>(() => ({ past: [], present: mapRepository.load(), future: [] }))
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [snap, setSnap] = useState(true)
  const saveTimer = useRef<number | undefined>(undefined)
  const map = history.present

  const commit = useCallback((producer: (current: GreenhouseMap) => GreenhouseMap, record = true) => {
    setHistory((current) => {
      const next = { ...producer(clone(current.present)), updatedAt: new Date().toISOString() }
      if (JSON.stringify(next) === JSON.stringify(current.present)) return current
      return record
        ? { past: [...current.past.slice(-49), current.present], present: next, future: [] }
        : { ...current, present: next }
    })
  }, [])

  useEffect(() => {
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => mapRepository.save(map), 450)
    return () => window.clearTimeout(saveTimer.current)
  }, [map])

  const updateObject = useCallback((id: string, patch: Partial<GreenhouseObject>, record = true) => {
    commit((current) => ({ ...current, objects: current.objects.map((object) => object.id === id ? { ...object, ...patch } : object) }), record)
  }, [commit])

  const addObject = useCallback((type: ObjectType, xM?: number, yM?: number) => {
    const object = createObject(type, map, xM, yM)
    commit((current) => ({ ...current, objects: [...current.objects, object] }))
    setSelectedIds([object.id])
  }, [commit, map])

  const deleteSelected = useCallback(() => {
    if (!selectedIds.length) return
    commit((current) => ({ ...current, objects: current.objects.filter((object) => !selectedIds.includes(object.id) || object.locked) }))
    setSelectedIds([])
  }, [commit, selectedIds])

  const duplicateSelected = useCallback(() => {
    const copies = map.objects.filter((object) => selectedIds.includes(object.id)).map((object) => {
      const id = `${object.type}-${crypto.randomUUID().slice(0, 8)}`
      const position = clampObjectPosition(object.xM + map.gridSizeM * 2, object.yM + map.gridSizeM * 2, object.widthM, object.lengthM, map.dimensions.widthM, map.dimensions.lengthM)
      return { ...clone({ ...map, objects: [object] }).objects[0], ...position, id, name: `${object.name} copy` }
    })
    if (!copies.length) return
    commit((current) => ({ ...current, objects: [...current.objects, ...copies] }))
    setSelectedIds(copies.map((object) => object.id))
  }, [commit, map, selectedIds])

  const moveObjects = useCallback((positions: Array<{ id: string; xM: number; yM: number }>, record = true) => {
    commit((current) => ({
      ...current,
      objects: current.objects.map((object) => {
        const position = positions.find((item) => item.id === object.id)
        if (!position || object.locked) return object
        return { ...object, ...clampObjectPosition(snapValue(position.xM, current.gridSizeM, snap), snapValue(position.yM, current.gridSizeM, snap), object.widthM, object.lengthM, current.dimensions.widthM, current.dimensions.lengthM) }
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
    const next = mapRepository.reset()
    setHistory({ past: [], present: next, future: [] })
    setSelectedIds([])
  }, [])
  const hydrate = useCallback((next: GreenhouseMap) => {
    setHistory({ past: [], present: next, future: [] })
    setSelectedIds([])
  }, [])
  const replace = useCallback((next: GreenhouseMap) => {
    setHistory((current) => ({ past: [...current.past.slice(-49), current.present], present: next, future: [] }))
    setSelectedIds([])
  }, [])
  const save = useCallback(() => mapRepository.save(map), [map])

  const selected = useMemo(() => map.objects.filter((object) => selectedIds.includes(object.id)), [map.objects, selectedIds])
  return {
    map, selected, selectedIds, setSelectedIds, snap, setSnap, commit, updateObject, addObject, deleteSelected,
    duplicateSelected, moveObjects, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    reset, replace, hydrate, save,
  }
}
