import Konva from 'konva'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import '../../../styles/greenhouse-map-test.css'
import { createContourPaths, getAdaptiveContourInterval, isTemperatureMetric, MIN_CONTOUR_SENSOR_COUNT } from '../heatmap/contourLines'
import { createMeasurementGrid, gridResolution } from '../heatmap/createMeasurementGrid'
import { scaleGradient, semanticColorAt } from '../heatmap/heatmapColorScale'
import { getMetricMeasurementValue, getStableScale, getValidMeasurementPoints } from '../heatmap/heatmapMetrics'
import type { HeatmapGrid } from '../heatmap/heatmapTypes'
import { renderHeatmapCanvas } from '../heatmap/renderHeatmapCanvas'
import { isWallMountedType, snapRectangleBounds, snapRectanglePosition } from '../geometry'
import { METRICS, OBJECT_LIBRARY, type GreenhouseMap, type GreenhouseObject, type MapMode, type ObjectType } from '../model'

type Props = {
  map: GreenhouseMap
  mode: MapMode
  readOnly?: boolean
  legendHost?: HTMLElement | null
  soilProfileHost?: HTMLElement | null
  compactLegend?: boolean
  soilEcDepthCm?: number
  target?: [number, number]
  dailyView?: boolean
  language?: 'en' | 'lt'
  actions?: Array<{ id: string; sectionId: string; sectionName: string; title: string; reason: string; priority: string }>
  selectedIds: string[]
  snap: boolean
  onSelect: (ids: string[]) => void
  onMove: (positions: Array<{ id: string; xM: number; yM: number }>, record?: boolean) => void
  onUpdate: (id: string, patch: Partial<GreenhouseObject>, record?: boolean) => void
  onAdd: (type: ObjectType, xM?: number, yM?: number) => void
  onRenderReady?: () => void
  referenceTime?: string
}

const objectColors: Record<string, { fill: string; stroke: string }> = {
  sections: { fill: '#4e927d', stroke: '#2f6f5e' },
  structure: { fill: '#d9d5c8', stroke: '#74786f' }, cultivation: { fill: '#9db89f', stroke: '#4f7359' },
  irrigation: { fill: '#8cb7bd', stroke: '#376d75' }, climate: { fill: '#c7a778', stroke: '#765a36' },
  lighting: { fill: '#e1cc75', stroke: '#8a7532' }, labels: { fill: '#ece8dd', stroke: '#6f716c' },
}
const statusColors: Record<string, string> = { online: '#2f8760', warning: '#bd842b', offline: '#6d7470', unassigned: '#60758a', 'low-battery': '#b85b46', stale: '#936d3c' }

const formatContourLabel = (level: number, metric: GreenhouseMap['heatmapSettings']['metric']) => {
  const definition = METRICS[metric]
  return `${Number(level.toFixed(definition.decimals))} ${definition.unit}`
}

const MIN_HEATMAP_SENSOR_COUNT = 3
type SoilEcProfileReading = {
  depthCm: number
  value: number | null
  confidence: number
  sensorCount: number
  samples: Array<number | null>
  confidenceSamples: number[]
  sensorCountSamples: number[]
  nearestDistanceSamples: number[]
  nearestSensorNames: Array<string | null>
}
type SoilEcProfile = {
  xM: number
  yM: number
  colorRange: [number, number]
  contourInterval: number
  readings: SoilEcProfileReading[]
}

function SoilEcCrossSection({ profile, map, language, leftInsetPx, rightInsetPx, onClose }: {
  profile: SoilEcProfile
  map: GreenhouseMap
  language: 'en' | 'lt'
  leftInsetPx: number
  rightInsetPx: number
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hoveredSectionCell, setHoveredSectionCell] = useState<{ column: number; row: number; left: number; top: number } | null>(null)
  const lithuanian = language === 'lt'
  const shallowestDepth = profile.readings[0]?.depthCm ?? 0
  const deepestDepth = profile.readings.at(-1)?.depthCm ?? shallowestDepth
  const sectionGrid = useMemo<HeatmapGrid>(() => {
    const width = profile.readings[0]?.samples.length ?? 0
    const height = 180
    const size = width * height
    const values = new Float32Array(size)
    values.fill(Number.NaN)
    const confidence = new Float32Array(size)
    const dataMask = new Uint8Array(size)
    const usedSensorCounts = new Uint8Array(size)
    const nearestDistancesM = new Float32Array(size)
    nearestDistancesM.fill(Number.POSITIVE_INFINITY)
    let dataCellCount = 0
    for (let y = 0; y < height; y += 1) {
      const depthCm = shallowestDepth + (deepestDepth - shallowestDepth) * y / Math.max(1, height - 1)
      let upperIndex = profile.readings.findIndex((reading) => reading.depthCm >= depthCm)
      if (upperIndex < 0) upperIndex = profile.readings.length - 1
      const lowerIndex = Math.max(0, upperIndex - 1)
      const lower = profile.readings[lowerIndex]
      const upper = profile.readings[upperIndex]
      const depthAmount = upper.depthCm === lower.depthCm ? 0 : (depthCm - lower.depthCm) / (upper.depthCm - lower.depthCm)
      for (let x = 0; x < width; x += 1) {
        const lowerValue = lower.samples[x]
        const upperValue = upper.samples[x]
        if (lowerValue == null || upperValue == null) continue
        const index = y * width + x
        values[index] = lowerValue + (upperValue - lowerValue) * depthAmount
        confidence[index] = lower.confidenceSamples[x] + (upper.confidenceSamples[x] - lower.confidenceSamples[x]) * depthAmount
        usedSensorCounts[index] = Math.round(lower.sensorCountSamples[x] + (upper.sensorCountSamples[x] - lower.sensorCountSamples[x]) * depthAmount)
        const lowerDistance = lower.nearestDistanceSamples[x]
        const upperDistance = upper.nearestDistanceSamples[x]
        nearestDistancesM[index] = Number.isFinite(lowerDistance) && Number.isFinite(upperDistance)
          ? lowerDistance + (upperDistance - lowerDistance) * depthAmount
          : Number.isFinite(lowerDistance) ? lowerDistance : upperDistance
        dataMask[index] = 1
        dataCellCount += 1
      }
    }
    return {
      width,
      height,
      requestedCellSizeM: map.heatmapSettings.cellSizeM,
      cellWidthM: width ? map.dimensions.widthM / width : 1,
      cellHeightM: height ? Math.max(1, deepestDepth - shallowestDepth) / height : 1,
      values,
      confidence,
      dataMask,
      usedSensorCounts,
      nearestSensorIndices: new Int16Array(size),
      nearestDistancesM,
      points: [],
      min: profile.colorRange[0],
      max: profile.colorRange[1],
      sensorCount: Math.max(0, ...profile.readings.map((reading) => reading.sensorCount)),
      dataCellCount,
    }
  }, [deepestDepth, map.dimensions.widthM, map.heatmapSettings.cellSizeM, profile.colorRange, profile.readings, shallowestDepth])
  const sectionContours = useMemo(() => createContourPaths(sectionGrid, profile.contourInterval), [profile.contourInterval, sectionGrid])
  const sectionContourLabels = useMemo(() => {
    const longestByLevel = new Map<number, (typeof sectionContours)[number]>()
    sectionContours.forEach((path) => {
      const current = longestByLevel.get(path.level)
      if (!current || path.points.length > current.points.length) longestByLevel.set(path.level, path)
    })
    return [...longestByLevel.values()].map((path) => {
      const pointCount = Math.floor(path.points.length / 2)
      const pointIndex = Math.max(0, Math.floor(pointCount * .55)) * 2
      return { level: path.level, x: path.points[pointIndex], y: path.points[pointIndex + 1] }
    })
  }, [sectionContours])
  const hoveredSectionData = useMemo(() => {
    if (!hoveredSectionCell) return null
    const { column, row } = hoveredSectionCell
    if (column < 0 || row < 0 || column >= sectionGrid.width || row >= sectionGrid.height) return null
    const index = row * sectionGrid.width + column
    const depthCm = shallowestDepth + (deepestDepth - shallowestDepth) * row / Math.max(1, sectionGrid.height - 1)
    const nearestDepthReading = profile.readings.reduce((nearest, reading) =>
      Math.abs(reading.depthCm - depthCm) < Math.abs(nearest.depthCm - depthCm) ? reading : nearest,
    )
    const value = sectionGrid.dataMask[index] ? sectionGrid.values[index] : null
    const confidence = sectionGrid.confidence[index]
    const lowerDepth = [...profile.readings].reverse().find((reading) => reading.depthCm <= depthCm)?.depthCm
    const upperDepth = profile.readings.find((reading) => reading.depthCm >= depthCm)?.depthCm
    return {
      ...hoveredSectionCell,
      value,
      xM: (column + .5) * sectionGrid.cellWidthM,
      depthCm,
      sensorCount: sectionGrid.usedSensorCounts[index],
      nearestSensorName: nearestDepthReading.nearestSensorNames[column],
      nearestDistanceM: sectionGrid.nearestDistancesM[index],
      confidence,
      confidenceLabel: confidence >= .7
        ? lithuanian ? 'Aukštas' : 'High'
        : confidence >= .4
          ? lithuanian ? 'Vidutinis' : 'Medium'
          : lithuanian ? 'Žemas' : 'Low',
      interpolatedDepths: lowerDepth !== undefined && upperDepth !== undefined && lowerDepth !== upperDepth
        ? `${lowerDepth}–${upperDepth} cm`
        : null,
    }
  }, [deepestDepth, hoveredSectionCell, lithuanian, profile.readings, sectionGrid, shallowestDepth])

  useEffect(() => {
    const canvas = canvasRef.current
    const sampleCount = sectionGrid.width
    if (!canvas || !sampleCount || profile.readings.length < 2) return
    const pixelHeight = sectionGrid.height
    canvas.width = sampleCount
    canvas.height = pixelHeight
    const context = canvas.getContext('2d')
    if (!context) return
    const image = context.createImageData(sampleCount, pixelHeight)
    for (let index = 0; index < sectionGrid.values.length; index += 1) {
        const offset = index * 4
        if (!sectionGrid.dataMask[index]) {
          image.data[offset] = 232
          image.data[offset + 1] = 237
          image.data[offset + 2] = 234
          image.data[offset + 3] = 255
          continue
        }
        const value = sectionGrid.values[index]
        const [red, green, blue] = semanticColorAt(value, METRICS['soil-ec'], profile.colorRange)
        const confidence = sectionGrid.confidence[index]
        const gray = Math.round(red * .2126 + green * .7152 + blue * .0722)
        const saturation = .68 + confidence * .32
        const renderedRed = gray + (red - gray) * saturation
        const renderedGreen = gray + (green - gray) * saturation
        const renderedBlue = gray + (blue - gray) * saturation
        image.data[offset] = Math.round(247 + (renderedRed - 247) * map.heatmapSettings.opacity)
        image.data[offset + 1] = Math.round(247 + (renderedGreen - 247) * map.heatmapSettings.opacity)
        image.data[offset + 2] = Math.round(242 + (renderedBlue - 242) * map.heatmapSettings.opacity)
        image.data[offset + 3] = 255
    }
    context.putImageData(image, 0, 0)
  }, [map.heatmapSettings.opacity, profile.colorRange, profile.readings.length, sectionGrid])

  return <section className="gh-soil-section" style={{ marginLeft: leftInsetPx, marginRight: rightInsetPx }}>
    <header>
      <div>
        <small>{lithuanian ? 'VERTIKALUS PJŪVIS A–A′' : 'VERTICAL SECTION A–A′'}</small>
        <strong>{lithuanian ? 'Soil EC pasiskirstymas pagal gylį' : 'Soil EC distribution by depth'}</strong>
        <span>Y {profile.yM.toFixed(2)} m · {shallowestDepth}–{deepestDepth} cm</span>
      </div>
      <button type="button" onClick={onClose} aria-label={lithuanian ? 'Uždaryti pjūvį' : 'Close section'}><i className="fa-solid fa-xmark" /></button>
    </header>
    <div className="gh-soil-section-plot">
      <div className="gh-soil-section-depth-labels" aria-hidden="true">
        {profile.readings.map((reading) => <span key={reading.depthCm} style={{ top: `${(reading.depthCm - shallowestDepth) / Math.max(1, deepestDepth - shallowestDepth) * 100}%` }}>{reading.depthCm} cm</span>)}
      </div>
      <div
        className="gh-soil-section-raster"
        onMouseMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()
          const localX = Math.max(0, Math.min(bounds.width - 1, event.clientX - bounds.left))
          const localY = Math.max(0, Math.min(bounds.height - 1, event.clientY - bounds.top))
          setHoveredSectionCell({
            column: Math.min(sectionGrid.width - 1, Math.floor(localX / bounds.width * sectionGrid.width)),
            row: Math.min(sectionGrid.height - 1, Math.floor(localY / bounds.height * sectionGrid.height)),
            left: Math.max(8, Math.min(bounds.width - 244, localX + 14)),
            top: Math.max(8, Math.min(bounds.height - 164, localY + 14)),
          })
        }}
        onMouseLeave={() => setHoveredSectionCell(null)}
      >
        <canvas ref={canvasRef} />
        <svg className="gh-soil-section-contours" viewBox={`0 0 ${Math.max(1, sectionGrid.width - 1)} ${Math.max(1, sectionGrid.height - 1)}`} preserveAspectRatio="none" aria-hidden="true">
          {sectionContours.map((path, index) => <polyline key={`${path.level}-${index}`} points={Array.from({ length: path.points.length / 2 }, (_, pointIndex) => `${path.points[pointIndex * 2]},${path.points[pointIndex * 2 + 1]}`).join(' ')} />)}
        </svg>
        {sectionContourLabels.map((label) => <span className="gh-soil-section-contour-label" key={label.level} style={{ left: `${label.x / Math.max(1, sectionGrid.width - 1) * 100}%`, top: `${label.y / Math.max(1, sectionGrid.height - 1) * 100}%` }}>{Number(label.level.toFixed(METRICS['soil-ec'].decimals))} {METRICS['soil-ec'].unit}</span>)}
        {profile.readings.map((reading) => <span className="gh-soil-section-depth-guide" key={reading.depthCm} style={{ top: `${(reading.depthCm - shallowestDepth) / Math.max(1, deepestDepth - shallowestDepth) * 100}%` }} />)}
        <div className="gh-soil-section-cursor" style={{ left: `${profile.xM / Math.max(map.dimensions.widthM, .001) * 100}%` }}>
          <span>X {profile.xM.toFixed(2)} m</span>
        </div>
        {hoveredSectionData ? <div className="gh-cell-tooltip gh-soil-section-tooltip" style={{ left: hoveredSectionData.left, top: hoveredSectionData.top }} role="tooltip">
          <strong>{hoveredSectionData.value == null ? lithuanian ? 'Nėra duomenų' : 'No data' : `${hoveredSectionData.value.toFixed(METRICS['soil-ec'].decimals)} ${METRICS['soil-ec'].unit}`}</strong>
          <span>X {hoveredSectionData.xM.toFixed(2)} m · {hoveredSectionData.depthCm.toFixed(1)} cm</span>
          <dl>
            <div><dt>{lithuanian ? 'Naudota sensorių' : 'Sensors used'}</dt><dd>{hoveredSectionData.sensorCount}</dd></div>
            <div><dt>{lithuanian ? 'Artimiausias sensorius' : 'Nearest sensor'}</dt><dd>{hoveredSectionData.nearestSensorName ?? '—'}</dd></div>
            <div><dt>{lithuanian ? 'Atstumas' : 'Distance'}</dt><dd>{Number.isFinite(hoveredSectionData.nearestDistanceM) ? `${hoveredSectionData.nearestDistanceM.toFixed(2)} m` : '—'}</dd></div>
            <div><dt>{lithuanian ? 'Patikimumas' : 'Confidence'}</dt><dd>{hoveredSectionData.confidenceLabel} · {Math.round(hoveredSectionData.confidence * 100)}%</dd></div>
            {hoveredSectionData.interpolatedDepths ? <div><dt>{lithuanian ? 'Gylio interpoliacija' : 'Depth interpolation'}</dt><dd>{hoveredSectionData.interpolatedDepths}</dd></div> : null}
          </dl>
        </div> : null}
      </div>
    </div>
    <div className="gh-soil-section-distance"><b>A · 0 m</b><span>{(map.dimensions.widthM / 2).toFixed(1)} m</span><b>{map.dimensions.widthM.toFixed(1)} m · A′</b></div>
    <footer>
      <span><i className="fa-solid fa-layer-group" /> {lithuanian ? 'Spalvos interpoliuotos horizontaliai ir tarp išmatuotų gylių' : 'Colours interpolated horizontally and between measured depths'}</span>
      <span><i className="fa-solid fa-ban" /> {lithuanian ? 'Už gylio ribų neekstrapoliuojama' : 'No extrapolation outside measured depths'}</span>
    </footer>
  </section>
}

function ObjectShape({ object, map, selected, editable, environmentView, layerOpacity, viewScale, snap, onSelect, onMove, onUpdate }: {
  object: GreenhouseObject; map: GreenhouseMap; selected: boolean; editable: boolean; environmentView: boolean; layerOpacity: number; viewScale: number; snap: boolean
  onSelect: (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void
  onMove: (position: { id: string; xM: number; yM: number }, record?: boolean) => void
  onUpdate: Props['onUpdate']
}) {
  const definition = OBJECT_LIBRARY.find((item) => item.type === object.type)
  const isSensor = object.type === 'sensor-node'
  const isSection = object.type === 'section-zone'
  const wallMounted = isWallMountedType(object.type)
  const sensor = object.metadata.sensor
  const colors = objectColors[object.layerId] ?? objectColors.structure
  const topY = map.dimensions.lengthM - object.yM - object.lengthM
  const sensorSize = Math.max(object.widthM, object.lengthM)
  const labelFontSize = Math.max(sensorSize * .3, 11 / viewScale)
  const objectLabel = object.name || definition?.label || object.type
  const objectWidthPx = object.widthM * viewScale
  const objectHeightPx = object.lengthM * viewScale
  const mapLabelFontPx = Math.max(10, Math.min(14, objectHeightPx * .22))
  const wall = object.metadata.wallMount?.wall
  const wallLabelWidthPx = Math.max(68, Math.min(132, objectLabel.length * 6.4))
  const wallLabelPosition = wall === 'west'
    ? { x: object.widthM + 8 / viewScale, y: object.lengthM / 2 - 9 / viewScale }
    : wall === 'east'
      ? { x: -(wallLabelWidthPx + 8) / viewScale, y: object.lengthM / 2 - 9 / viewScale }
      : wall === 'north'
        ? { x: object.widthM / 2 - wallLabelWidthPx / viewScale / 2, y: object.lengthM + 7 / viewScale }
        : { x: object.widthM / 2 - wallLabelWidthPx / viewScale / 2, y: -25 / viewScale }
  const mapObjectLabel = wallMounted
    ? <Text {...wallLabelPosition} width={wallLabelWidthPx / viewScale} height={18 / viewScale} text={objectLabel} align="center" verticalAlign="middle" fontFamily="IBM Plex Sans" fontSize={10 / viewScale} fontStyle="bold" fill="#203b33" stroke="rgba(247,249,246,.92)" strokeWidth={2.4 / viewScale} fillAfterStrokeEnabled ellipsis wrap="none" />
    : <Text x={8 / viewScale} y={0} width={Math.max(4, objectWidthPx - 16) / viewScale} height={object.lengthM} text={objectLabel} align="center" verticalAlign="middle" fontFamily="IBM Plex Sans" fontSize={mapLabelFontPx / viewScale} fontStyle="bold" fill="#203b33" stroke="rgba(247,249,246,.78)" strokeWidth={2.2 / viewScale} fillAfterStrokeEnabled opacity={environmentView ? .78 : .94} ellipsis wrap="none" />
  return <Group
    id={`gh-object-${object.id}`} name="map-object" x={object.xM} y={topY} rotation={object.rotationDeg}
    draggable={editable && !object.locked}
    opacity={layerOpacity}
    onClick={onSelect} onTap={onSelect}
    onDragMove={(event) => {
      if (!snap || wallMounted) return
      const rawPosition = {
        xM: event.target.x(),
        yM: map.dimensions.lengthM - event.target.y() - object.lengthM,
      }
      const toleranceM = Math.min(map.gridSizeM * 0.35, 8 / viewScale)
      const position = snapRectanglePosition(rawPosition, object, map.gridSizeM, true, toleranceM)
      event.target.position({
        x: position.xM,
        y: map.dimensions.lengthM - position.yM - object.lengthM,
      })
    }}
    onDragEnd={(event) => onMove({ id: object.id, xM: event.target.x(), yM: map.dimensions.lengthM - event.target.y() - object.lengthM }, true)}
    onTransformEnd={(event) => {
      const node = event.target
      const widthM = Math.max(.05, object.widthM * node.scaleX())
      const lengthM = Math.max(.05, object.lengthM * node.scaleY())
      const rotationDeg = node.rotation()
      const rawBounds = {
        xM: node.x(),
        yM: map.dimensions.lengthM - node.y() - lengthM,
        widthM,
        lengthM,
      }
      const axisAligned = Math.abs(((rotationDeg % 90) + 90) % 90) < 0.001
      const bounds = snapRectangleBounds(rawBounds, map.gridSizeM, snap && axisAligned, Math.min(map.gridSizeM * 0.35, 8 / viewScale))
      node.scaleX(1); node.scaleY(1)
      onUpdate(object.id, { ...bounds, rotationDeg })
    }}
  >
    {isSection ? <>
      <Rect width={object.widthM} height={object.lengthM} fill={environmentView ? 'rgba(0,0,0,.2)' : object.metadata.color ?? colors.fill} opacity={environmentView ? 1 : selected ? .2 : .11} stroke={selected ? '#d89222' : environmentView ? 'rgba(0,0,0,.48)' : object.metadata.color ?? colors.stroke} strokeWidth={selected ? 2 / viewScale : environmentView ? 1 / viewScale : 1.2 / viewScale} dash={environmentView ? [6 / viewScale, 4 / viewScale] : [8 / viewScale, 5 / viewScale]} cornerRadius={4 / viewScale} />
      {mapObjectLabel}
    </> : isSensor ? <>
      <Circle x={object.widthM / 2} y={object.lengthM / 2} radius={sensorSize * .5} fill="#173e35" stroke={selected ? '#f0bd4f' : '#fff'} strokeWidth={selected ? Math.max(sensorSize * .12, 2 / viewScale) : Math.max(sensorSize * .07, 1.2 / viewScale)} shadowColor="#10251f" shadowBlur={Math.max(sensorSize * .2, 3 / viewScale)} shadowOpacity={.35} />
      <Circle x={object.widthM / 2} y={object.lengthM / 2} radius={sensorSize * .2} fill={statusColors[sensor?.status ?? 'unassigned']} />
      <Circle x={object.widthM * .8} y={object.lengthM * .18} radius={sensorSize * .14} fill={statusColors[sensor?.status ?? 'unassigned']} stroke="#fff" strokeWidth={Math.max(sensorSize * .035, .8 / viewScale)} />
      <Text x={object.widthM + 6 / viewScale} y={-1 / viewScale} width={Math.max(2.8, 150 / viewScale)} text={object.name} fontFamily="IBM Plex Sans" fontSize={labelFontSize} fontStyle="bold" fill="#183a31" />
    </> : <>
      <Rect width={object.widthM} height={object.lengthM} fill={environmentView ? 'rgba(0,0,0,.2)' : object.metadata.color ?? colors.fill} stroke={selected ? '#d89a2b' : environmentView ? 'rgba(0,0,0,.48)' : colors.stroke} strokeWidth={selected ? .08 : environmentView ? 1 / viewScale : .035} dash={environmentView ? [6 / viewScale, 4 / viewScale] : object.type === 'walkway' || object.type === 'technical-zone' ? [.16, .1] : undefined} cornerRadius={Math.min(.12, object.lengthM * .15)} />
      {object.type === 'fan' ? <Text width={object.widthM} height={object.lengthM} text="✣" align="center" verticalAlign="middle" fontSize={object.lengthM * .65} fill={colors.stroke} opacity={environmentView ? .68 : 1} /> : null}
      {object.type === 'text-label'
        ? <Text x={.08} y={.08} width={Math.max(.2, object.widthM - .16)} height={Math.max(.2, object.lengthM - .16)} text={object.name} fontFamily="IBM Plex Sans" fontSize={Math.min(.24, object.lengthM * .28)} fill="#1e2c27" opacity={environmentView ? .76 : 1} ellipsis wrap="none" />
        : mapObjectLabel}
    </>}
  </Group>
}

export default function GreenhouseCanvas({ map, mode, readOnly = false, legendHost, soilProfileHost, compactLegend = false, soilEcDepthCm, target, dailyView = false, language = 'en', actions = [], selectedIds, snap, onSelect, onMove, onUpdate, onAdd, onRenderReady, referenceTime }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const [size, setSize] = useState({ width: 900, height: 650 })
  const [view, setView] = useState({ scale: 40, x: 70, y: 70 })
  const [panning, setPanning] = useState(false)
  const [showContours, setShowContours] = useState(true)
  const [mouse, setMouse] = useState<{ xM: number; yM: number } | null>(null)
  const [hoveredSensorId, setHoveredSensorId] = useState<string | null>(null)
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>(null)
  const [soilEcProfile, setSoilEcProfile] = useState<SoilEcProfile | null>(null)
  const [heatmap, setHeatmap] = useState<{ canvas: HTMLCanvasElement; grid: HeatmapGrid; min: number; max: number; observedMin: number; observedMax: number; count: number; contourInterval: number; calculatedAt: Date; soilEcDepthCm?: number } | null>(null)
  const [renderedAt] = useState(Date.now)
  const tr = useCallback((english: string, lithuanian: string) => language === 'lt' ? lithuanian : english, [language])
  const metricLabel = (key: GreenhouseMap['heatmapSettings']['metric']) =>
    language === 'lt' ? METRICS[key].labelLt : METRICS[key].label

  const fit = useCallback(() => {
    const paddingX = readOnly ? 16 : 85
    const paddingY = readOnly ? 16 : 90
    const scale = Math.max(2, Math.min((size.width - paddingX * 2) / map.dimensions.widthM, (size.height - paddingY * 2) / map.dimensions.lengthM))
    setView({ scale, x: (size.width - map.dimensions.widthM * scale) / 2, y: (size.height - map.dimensions.lengthM * scale) / 2 })
  }, [map.dimensions.lengthM, map.dimensions.widthM, readOnly, size])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: Math.max(500, entry.contentRect.width), height: Math.max(420, entry.contentRect.height) }))
    observer.observe(host)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const frame = window.requestAnimationFrame(fit)
    return () => window.cancelAnimationFrame(frame)
  }, [fit])

  useEffect(() => {
    const transformer = transformerRef.current
    const stage = stageRef.current
    if (!transformer || !stage) return
    const nodes = mode === 'layout' ? selectedIds.map((id) => stage.findOne(`#gh-object-${id}`)).filter((node): node is Konva.Node => Boolean(node)) : []
    transformer.nodes(nodes)
    transformer.getLayer()?.batchDraw()
  }, [selectedIds, mode, map.objects])

  const points = useMemo(() => getValidMeasurementPoints(map, map.heatmapSettings.metric, undefined, soilEcDepthCm), [map, soilEcDepthCm])
  const soilEcDepths = useMemo(() => [...new Set(map.objects.flatMap((object) =>
    object.metadata.sensor?.measurements?.soilEcByDepth?.map((reading) => reading.depthCm) ?? [],
  ))].filter(Number.isFinite).sort((a, b) => a - b), [map.objects])
  const soilEcAllValues = useMemo(() => map.objects.flatMap((object) =>
    object.metadata.sensor?.measurements?.soilEcByDepth?.flatMap((reading) =>
      Number.isFinite(reading.value) ? [reading.value] : [],
    ) ?? [],
  ), [map.objects])
  const insufficientHeatmapSources = mode === 'environment'
    && map.heatmapSettings.enabled
    && points.length < MIN_HEATMAP_SENSOR_COUNT
  useEffect(() => {
    let firstPaintFrame = 0
    let settledPaintFrame = 0
    const signalRendered = () => {
      firstPaintFrame = window.requestAnimationFrame(() => {
        settledPaintFrame = window.requestAnimationFrame(() => onRenderReady?.())
      })
    }
    if (mode !== 'environment' || !map.heatmapSettings.enabled || points.length < MIN_HEATMAP_SENSOR_COUNT) {
      const clearTimer = window.setTimeout(() => {
        setHeatmap(null)
        signalRendered()
      }, 0)
      return () => {
        window.clearTimeout(clearTimer)
        window.cancelAnimationFrame(firstPaintFrame)
        window.cancelAnimationFrame(settledPaintFrame)
      }
    }
    const timer = window.setTimeout(() => {
      try {
        const metric = map.heatmapSettings.metric
        const scaleValues = metric === 'soil-ec' && soilEcAllValues.length ? soilEcAllValues : points.map((point) => point.value)
        const scale = getStableScale(scaleValues, metric, map.heatmapSettings.scaleMode === 'manual' ? { min: map.heatmapSettings.manualMin, max: map.heatmapSettings.manualMax } : undefined)
        const referenceTimeMs = referenceTime ? new Date(referenceTime).getTime() : Date.now()
        const grid = createMeasurementGrid(
          points,
          map,
          metric,
          scale,
          Number.isFinite(referenceTimeMs) ? referenceTimeMs : Date.now(),
        )
        if (!grid) setHeatmap(null)
        else {
          const observedValues = scaleValues
          const observedRange: [number, number] = [Math.min(...observedValues), Math.max(...observedValues)]
          setHeatmap({
            canvas: renderHeatmapCanvas(
              grid,
              metric,
              map.heatmapSettings.opacity,
              map.heatmapSettings.showConfidence,
              observedRange,
            ),
            grid,
            min: grid.min,
            max: grid.max,
            observedMin: observedRange[0],
            observedMax: observedRange[1],
            count: grid.sensorCount,
            contourInterval: getAdaptiveContourInterval(metric, points.map((point) => point.value), grid.sensorCount),
            calculatedAt: Number.isFinite(referenceTimeMs) ? new Date(referenceTimeMs) : new Date(),
            soilEcDepthCm: metric === 'soil-ec' ? soilEcDepthCm : undefined,
          })
        }
      } finally {
        signalRendered()
      }
    }, 180)
    return () => {
      window.clearTimeout(timer)
      window.cancelAnimationFrame(firstPaintFrame)
      window.cancelAnimationFrame(settledPaintFrame)
    }
  }, [map, mode, onRenderReady, points, referenceTime, soilEcAllValues, soilEcDepthCm])

  const pointerWorld = useCallback(() => {
    const stage = stageRef.current
    const pointer = stage?.getPointerPosition()
    if (!pointer) return null
    return { xM: (pointer.x - view.x) / view.scale, yM: map.dimensions.lengthM - (pointer.y - view.y) / view.scale }
  }, [map.dimensions.lengthM, view])

  const selectSoilEcProfile = useCallback(() => {
    const position = pointerWorld()
    if (!position || map.heatmapSettings.metric !== 'soil-ec' || mode !== 'environment') return
    if (position.xM < 0 || position.yM < 0 || position.xM >= map.dimensions.widthM || position.yM >= map.dimensions.lengthM) return
    const referenceTimeMs = referenceTime ? new Date(referenceTime).getTime() : Date.now()
    const nowMs = Number.isFinite(referenceTimeMs) ? referenceTimeMs : Date.now()
    const fallbackSampleCount = gridResolution(map.dimensions.widthM, map.dimensions.lengthM, map.heatmapSettings.cellSizeM).width
    const commonScale = getStableScale(soilEcAllValues, 'soil-ec')
    const readings = soilEcDepths.map((depthCm): SoilEcProfileReading => {
      const depthPoints = getValidMeasurementPoints(map, 'soil-ec', undefined, depthCm)
      if (depthPoints.length < MIN_HEATMAP_SENSOR_COUNT) return {
        depthCm,
        value: null,
        confidence: 0,
        sensorCount: depthPoints.length,
        samples: Array.from({ length: fallbackSampleCount }, () => null),
        confidenceSamples: Array.from({ length: fallbackSampleCount }, () => 0),
        sensorCountSamples: Array.from({ length: fallbackSampleCount }, () => 0),
        nearestDistanceSamples: Array.from({ length: fallbackSampleCount }, () => Number.POSITIVE_INFINITY),
        nearestSensorNames: Array.from({ length: fallbackSampleCount }, () => null),
      }
      const grid = heatmap?.soilEcDepthCm === depthCm
        ? heatmap.grid
        : createMeasurementGrid(depthPoints, map, 'soil-ec', commonScale, nowMs)
      const column = Math.floor(position.xM / grid.cellWidthM)
      const row = Math.floor((map.dimensions.lengthM - position.yM) / grid.cellHeightM)
      if (column < 0 || row < 0 || column >= grid.width || row >= grid.height) return {
        depthCm,
        value: null,
        confidence: 0,
        sensorCount: 0,
        samples: Array.from({ length: grid.width }, () => null),
        confidenceSamples: Array.from({ length: grid.width }, () => 0),
        sensorCountSamples: Array.from({ length: grid.width }, () => 0),
        nearestDistanceSamples: Array.from({ length: grid.width }, () => Number.POSITIVE_INFINITY),
        nearestSensorNames: Array.from({ length: grid.width }, () => null),
      }
      const index = row * grid.width + column
      return {
        depthCm,
        value: grid.dataMask[index] ? grid.values[index] : null,
        confidence: grid.confidence[index],
        sensorCount: grid.usedSensorCounts[index],
        samples: Array.from({ length: grid.width }, (_, sampleColumn) => {
          const sampleIndex = row * grid.width + sampleColumn
          return grid.dataMask[sampleIndex] ? grid.values[sampleIndex] : null
        }),
        confidenceSamples: Array.from({ length: grid.width }, (_, sampleColumn) => grid.confidence[row * grid.width + sampleColumn]),
        sensorCountSamples: Array.from({ length: grid.width }, (_, sampleColumn) => grid.usedSensorCounts[row * grid.width + sampleColumn]),
        nearestDistanceSamples: Array.from({ length: grid.width }, (_, sampleColumn) => grid.nearestDistancesM[row * grid.width + sampleColumn]),
        nearestSensorNames: Array.from({ length: grid.width }, (_, sampleColumn) => {
          const nearestIndex = grid.nearestSensorIndices[row * grid.width + sampleColumn]
          return nearestIndex >= 0 ? grid.points[nearestIndex]?.name ?? null : null
        }),
      }
    })
    const colorRange: [number, number] = soilEcAllValues.length
      ? [Math.min(...soilEcAllValues), Math.max(...soilEcAllValues)]
      : [commonScale.min, commonScale.max]
    const profileGrid = heatmap?.grid
    const profileRow = profileGrid ? Math.floor((map.dimensions.lengthM - position.yM) / profileGrid.cellHeightM) : -1
    const profileYM = profileGrid && profileRow >= 0 && profileRow < profileGrid.height
      ? map.dimensions.lengthM - (profileRow + .5) * profileGrid.cellHeightM
      : position.yM
    setSelectedSensorId(null)
    setSoilEcProfile({
      xM: position.xM,
      yM: profileYM,
      colorRange,
      contourInterval: heatmap?.contourInterval ?? getAdaptiveContourInterval('soil-ec', soilEcAllValues, points.length),
      readings,
    })
  }, [heatmap, map, mode, pointerWorld, points.length, referenceTime, soilEcAllValues, soilEcDepths])

  const gridLines = useMemo(() => {
    const step = map.gridSizeM
    const lines: Array<{ points: number[]; major: boolean }> = []
    for (let x = 0; x <= map.dimensions.widthM + .0001; x += step) lines.push({ points: [x, 0, x, map.dimensions.lengthM], major: Math.abs(x - Math.round(x)) < .001 })
    for (let y = 0; y <= map.dimensions.lengthM + .0001; y += step) lines.push({ points: [0, y, map.dimensions.widthM, y], major: Math.abs(y - Math.round(y)) < .001 })
    return lines.slice(0, 1000)
  }, [map.dimensions, map.gridSizeM])

  const visibleLayers = useMemo(() => new Map(map.layers.map((layer) => [layer.id, layer])), [map.layers])
  const orderedObjects = useMemo(() => map.layers.flatMap((layer) => map.objects.filter((object) => object.layerId === layer.id)), [map.layers, map.objects])
  const wallMountedSelection = useMemo(() => map.objects.some((object) => selectedIds.includes(object.id) && isWallMountedType(object.type)), [map.objects, selectedIds])
  const showReadOnlySensorLocations = readOnly && mode === 'environment'
  const readOnlySensorPoints = useMemo(() => {
    if (!showReadOnlySensorLocations) return []
    return map.objects.flatMap((object) => {
      const sensor = object.metadata.sensor
      const value = getMetricMeasurementValue(sensor?.measurements, map.heatmapSettings.metric, soilEcDepthCm)
      if (object.type !== 'sensor-node' || !sensor) return []
      if (typeof value !== 'number' || !Number.isFinite(value)) return []
      return [{
        id: object.id,
        name: sensor.displayName || object.name,
        value,
        xM: object.xM + object.widthM / 2,
        yM: object.yM + object.lengthM / 2,
        measuredAt: sensor.measurements?.measuredAt || sensor.lastSeenAt,
        status: sensor.status,
        batteryPercent: sensor.batteryPercent,
        rssi: sensor.rssi,
        snr: sensor.snr,
        soilEcByDepth: sensor.measurements?.soilEcByDepth ?? [],
      }]
    })
  }, [map.heatmapSettings.metric, map.objects, showReadOnlySensorLocations, soilEcDepthCm])
  const activeSensor = readOnlySensorPoints.find((sensor) => sensor.id === (selectedSensorId ?? hoveredSensorId)) ?? null
  const activeSensorMeasuredAtMs = activeSensor?.measuredAt ? new Date(activeSensor.measuredAt).getTime() : Number.NaN
  const requestedReferenceMs = referenceTime ? new Date(referenceTime).getTime() : Number.NaN
  const freshnessReferenceMs = Number.isFinite(requestedReferenceMs)
    ? requestedReferenceMs
    : heatmap?.calculatedAt.getTime() ?? renderedAt
  const activeSensorFreshnessMinutes = Number.isFinite(activeSensorMeasuredAtMs)
    ? Math.max(0, Math.round((freshnessReferenceMs - activeSensorMeasuredAtMs) / 60_000))
    : null
  const sensorTooltip = activeSensor ? {
    left: Math.max(8, Math.min(size.width - 252, view.x + activeSensor.xM * view.scale + 12)),
    top: Math.max(8, Math.min(size.height - 188, view.y + (map.dimensions.lengthM - activeSensor.yM) * view.scale - 76)),
  } : null
  const hoveredCell = useMemo(() => {
    if (!mouse || !heatmap || mode !== 'environment' || activeSensor) return null
    if (mouse.xM < 0 || mouse.yM < 0 || mouse.xM >= map.dimensions.widthM || mouse.yM >= map.dimensions.lengthM) return null
    const column = Math.floor(mouse.xM / heatmap.grid.cellWidthM)
    const row = Math.floor((map.dimensions.lengthM - mouse.yM) / heatmap.grid.cellHeightM)
    if (column < 0 || row < 0 || column >= heatmap.grid.width || row >= heatmap.grid.height) return null
    const index = row * heatmap.grid.width + column
    const nearestIndex = heatmap.grid.nearestSensorIndices[index]
    const confidence = heatmap.grid.confidence[index]
    return {
      value: heatmap.grid.dataMask[index] ? heatmap.grid.values[index] : null,
      xM: (column + .5) * heatmap.grid.cellWidthM,
      yM: map.dimensions.lengthM - (row + .5) * heatmap.grid.cellHeightM,
      sensorCount: heatmap.grid.usedSensorCounts[index],
      nearest: nearestIndex >= 0 ? heatmap.grid.points[nearestIndex] : undefined,
      nearestDistanceM: heatmap.grid.nearestDistancesM[index],
      confidence,
      confidenceLabel: confidence >= .7 ? tr('High', 'Aukštas') : confidence >= .4 ? tr('Medium', 'Vidutinis') : tr('Low', 'Žemas'),
      left: Math.max(8, Math.min(size.width - 244, view.x + mouse.xM * view.scale + 14)),
      top: Math.max(8, Math.min(size.height - 176, view.y + (map.dimensions.lengthM - mouse.yM) * view.scale + 14)),
    }
  }, [activeSensor, heatmap, map.dimensions.lengthM, map.dimensions.widthM, mode, mouse, size.height, size.width, tr, view])
  const contourPaths = useMemo(() => {
    if (!showContours || !heatmap || heatmap.count < MIN_CONTOUR_SENSOR_COUNT) return []
    return createContourPaths(heatmap.grid, heatmap.contourInterval).map((path) => ({
      ...path,
      points: path.points.map((coordinate, index) => index % 2 === 0
        ? coordinate / (heatmap.grid.width - 1) * map.dimensions.widthM
        : coordinate / (heatmap.grid.height - 1) * map.dimensions.lengthM),
    }))
  }, [heatmap, map.dimensions.lengthM, map.dimensions.widthM, showContours])
  const contourLabels = useMemo(() => {
    const pathsByLevel = new Map<number, Array<(typeof contourPaths)[number]>>()
    contourPaths.forEach((path) => {
      const levelPaths = pathsByLevel.get(path.level) ?? []
      levelPaths.push(path)
      pathsByLevel.set(path.level, levelPaths)
    })

    type Bounds = { left: number; right: number; top: number; bottom: number }
    const intersects = (a: Bounds, b: Bounds) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    const objectPaddingX = 6 / view.scale
    const objectPaddingY = 5 / view.scale
    const blockedBounds = orderedObjects.flatMap((object) => {
      if (!object.visible || !visibleLayers.get(object.layerId)?.visible) return []
      const topY = map.dimensions.lengthM - object.yM - object.lengthM
      const sensorLabelWidth = object.type === 'sensor-node' ? Math.max(2.8, 150 / view.scale) : 0
      const localLeft = 0
      const localTop = object.type === 'sensor-node' ? -1 / view.scale : 0
      const localRight = object.widthM + sensorLabelWidth
      const localBottom = Math.max(object.lengthM, object.type === 'sensor-node' ? 12 / view.scale : object.lengthM)
      const angle = object.rotationDeg * Math.PI / 180
      const cosine = Math.cos(angle)
      const sine = Math.sin(angle)
      const corners = [
        [localLeft, localTop],
        [localRight, localTop],
        [localLeft, localBottom],
        [localRight, localBottom],
      ].map(([x, y]) => ({
        x: object.xM + x * cosine - y * sine,
        y: topY + x * sine + y * cosine,
      }))
      return [{
        left: Math.min(...corners.map((corner) => corner.x)) - objectPaddingX,
        right: Math.max(...corners.map((corner) => corner.x)) + objectPaddingX,
        top: Math.min(...corners.map((corner) => corner.y)) - objectPaddingY,
        bottom: Math.max(...corners.map((corner) => corner.y)) + objectPaddingY,
      }]
    })

    const placedBounds: Bounds[] = []
    const labels: Array<{ level: number; x: number; y: number; label: string }> = []
    const candidateFractions = [.16, .3, .44, .58, .72, .86]
    const sortedLevels = [...pathsByLevel.entries()].sort(([a], [b]) => a - b)
    const labelStride = Math.max(1, Math.ceil(sortedLevels.length / 7))
    for (const [levelIndex, [level, paths]] of sortedLevels.entries()) {
      if (levelIndex % labelStride !== 0) continue
      const label = formatContourLabel(level, map.heatmapSettings.metric)
      const width = Math.max(38, label.length * 6.2) / view.scale
      const height = 12 / view.scale
      let best: { x: number; y: number; bounds: Bounds; score: number } | null = null
      for (const path of paths) {
        const pointCount = Math.floor(path.points.length / 2)
        for (const fraction of candidateFractions) {
          const pointIndex = Math.min(pointCount - 1, Math.max(0, Math.round((pointCount - 1) * fraction))) * 2
          const x = path.points[pointIndex]
          const y = path.points[pointIndex + 1]
          const bounds = { left: x - width / 2, right: x + width / 2, top: y - height / 2, bottom: y + height / 2 }
          if (bounds.left < 0 || bounds.right > map.dimensions.widthM || bounds.top < 0 || bounds.bottom > map.dimensions.lengthM) continue
          if (blockedBounds.some((blocked) => intersects(bounds, blocked)) || placedBounds.some((placed) => intersects(bounds, placed))) continue
          const score = path.points.length * (.5 + path.confidence) - Math.abs(.5 - fraction) * path.points.length * .08
          if (!best || score > best.score) best = { x, y, bounds, score }
        }
      }
      if (best) {
        labels.push({ level, x: best.x, y: best.y, label })
        placedBounds.push(best.bounds)
      }
    }
    return labels
  }, [contourPaths, map.dimensions.lengthM, map.dimensions.widthM, map.heatmapSettings.metric, orderedObjects, view.scale, visibleLayers])
  const average = points.length ? points.reduce((sum, point) => sum + point.value, 0) / points.length : null
  const targetState = average === null || !target ? 'unknown' : average < target[0] ? 'low' : average > target[1] ? 'high' : 'optimal'
  const sensorIssues = map.objects.filter((object) => object.metadata.sensor && object.metadata.sensor.status !== 'online')
  const editable = mode === 'layout' && !readOnly
  const fixedTemperatureContours = isTemperatureMetric(map.heatmapSettings.metric)
  const heatmapLegend = mode === 'environment' ? <div className={`gh-heatmap-legend ${compactLegend ? 'gh-heatmap-legend-compact' : ''}`}>
    {!compactLegend ? <div className="gh-legend-heading"><small>{readOnly ? tr('CLIMATE RANGE', 'KLIMATO DIAPAZONAS') : tr('ESTIMATED ENVIRONMENT MAP', 'APSKAIČIUOTAS APLINKOS ŽEMĖLAPIS')}</small><strong>{metricLabel(map.heatmapSettings.metric)}</strong></div> : null}
    {heatmap ? <>
      <div className="gh-legend-scale">
        <button className={`gh-contour-toggle ${showContours ? 'active' : ''}`} type="button" disabled={heatmap.count < MIN_CONTOUR_SENSOR_COUNT} onClick={() => setShowContours((current) => !current)} title={fixedTemperatureContours ? tr('Temperature contours use a fixed 1 °C interval.', 'Temperatūros izolinijos visada braižomos 1 °C žingsniu.') : tr('Contour spacing adapts to the measured range and data coverage.', 'Izolinijų žingsnis prisitaiko prie matuojamo diapazono ir duomenų padengimo.')}><i className="fa-solid fa-lines-leaning" />{readOnly ? showContours ? tr('Contours on', 'Izolinijos įjungtos') : tr('Contours off', 'Izolinijos išjungtos') : tr('Contours', 'Izolinijos')} · {heatmap.contourInterval} {METRICS[map.heatmapSettings.metric].unit}</button>
        <div className="gh-color-scale" style={{ background: scaleGradient(heatmap.min, heatmap.max, METRICS[map.heatmapSettings.metric], [heatmap.observedMin, heatmap.observedMax]) }} />
        <div className="gh-legend-range"><span>{heatmap.min} {METRICS[map.heatmapSettings.metric].unit}</span><span>{heatmap.max} {METRICS[map.heatmapSettings.metric].unit}</span></div>
      </div>
      <div className="gh-legend-meta">
        {target ? <div className={`gh-target-state ${targetState}`}><b>{targetState === 'optimal' ? tr('Inside target', 'Tiksliniame diapazone') : targetState === 'low' ? tr('Below target', 'Žemiau tikslo') : targetState === 'high' ? tr('Above target', 'Virš tikslo') : tr('Target configured', 'Tikslas nustatytas')}</b><span>{target[0]}–{target[1]} {METRICS[map.heatmapSettings.metric].unit}</span></div> : null}
        <p><b>{heatmap.count} {compactLegend ? language === 'lt' ? heatmap.count === 1 ? 'sensorius' : 'sensoriai' : `sensor${heatmap.count === 1 ? '' : 's'}` : tr('sensor sources', 'sensorių šaltiniai')}</b>{!compactLegend ? <><span>{Math.round(heatmap.grid.dataCellCount / Math.max(1, heatmap.grid.width * heatmap.grid.height) * 100)}% {tr('raster coverage', 'rasterio padengimas')} · {heatmap.grid.cellWidthM.toFixed(2)} m</span><span>{tr('Rendered', 'Atvaizduota')} {heatmap.calculatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></> : null}</p>
        {map.heatmapSettings.metric === 'soil-ec' && soilEcDepthCm !== undefined ? <em><i className="fa-solid fa-layer-group" /> {soilEcDepthCm} cm {tr('depth', 'gylis')}</em> : null}
        {map.heatmapSettings.metric === 'soil-ec' && soilEcDepths.length > 1 ? <em><i className="fa-solid fa-crosshairs" /> {tr('Click the map for a vertical profile.', 'Paspauskite žemėlapį vertikaliam profiliui.')}</em> : null}
        {!heatmap.grid.dataCellCount ? <em>{tr('No cells meet the distance, freshness and minimum-sensor rules.', 'Nė viena celė neatitinka atstumo, šviežumo ir minimalaus sensorių skaičiaus taisyklių.')}</em> : null}
        {!fixedTemperatureContours && heatmap.count >= MIN_CONTOUR_SENSOR_COUNT && heatmap.count < 4 ? <em>{tr(`Contour spacing widened for limited coverage from ${heatmap.count} nodes.`, `Izolinijų žingsnis praplatintas dėl riboto ${heatmap.count} mazgų padengimo.`)}</em> : heatmap.count < MIN_CONTOUR_SENSOR_COUNT ? <em>{tr('Contour lines need at least two valid nodes.', 'Izolinijoms reikia bent dviejų tinkamų mazgų.')}</em> : null}
        <em><i className="fa-solid fa-circle-info" /> {tr('Estimated between sensor locations.', 'Įvertinta tarp sensorių vietų.')}</em>
      </div>
    </> : <div className="gh-legend-meta"><p>{insufficientHeatmapSources
      ? tr(`Heatmap needs at least ${MIN_HEATMAP_SENSOR_COUNT} sensor sources. ${points.length} available.`, `Heatmap reikia bent ${MIN_HEATMAP_SENSOR_COUNT} sensorių šaltinių. Dabar yra ${points.length}.`)
      : tr('No valid online sensor data for this metric in this Area.', 'Šiam šios erdvės rodikliui nėra tinkamų aktyvių sensorių duomenų.')}</p></div>}
  </div> : null

  return <main className="gh-canvas-shell" ref={hostRef}
    onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-neurocrop-object')) event.preventDefault() }}
    onDrop={(event) => {
      event.preventDefault()
      const type = event.dataTransfer.getData('application/x-neurocrop-object') as ObjectType
      const rect = hostRef.current?.getBoundingClientRect()
      if (!type || !rect) return
      onAdd(type, (event.clientX - rect.left - view.x) / view.scale, map.dimensions.lengthM - (event.clientY - rect.top - view.y) / view.scale)
    }}
  >
    <Stage
      ref={stageRef} width={size.width} height={size.height}
      onMouseMove={() => setMouse(pointerWorld())}
      onMouseLeave={() => setMouse(null)}
      onMouseDown={(event) => {
        if (event.target === event.target.getStage()) {
          if (!event.evt.shiftKey) onSelect([])
          setSelectedSensorId(null)
          if (panning) event.target.getStage()?.startDrag()
        }
      }}
      onDragEnd={(event) => { if (!readOnly && event.target === event.target.getStage()) setView((current) => ({ ...current, x: event.target.x(), y: event.target.y() })) }}
      draggable={!readOnly && panning} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}
      onWheel={readOnly ? undefined : (event) => {
        event.evt.preventDefault()
        const stage = stageRef.current
        const pointer = stage?.getPointerPosition()
        if (!stage || !pointer) return
        const oldScale = view.scale
        const nextScale = Math.max(8, Math.min(140, event.evt.deltaY > 0 ? oldScale / 1.08 : oldScale * 1.08))
        const world = { x: (pointer.x - view.x) / oldScale, y: (pointer.y - view.y) / oldScale }
        setView({ scale: nextScale, x: pointer.x - world.x * nextScale, y: pointer.y - world.y * nextScale })
      }}
    >
      <Layer listening={false} imageSmoothingEnabled>
        <Rect x={0} y={0} width={map.dimensions.widthM} height={map.dimensions.lengthM} fill="#f7f7f2" shadowColor="#152c25" shadowBlur={.35} shadowOpacity={.18} />
        {gridLines.map((line, index) => <Line key={index} points={line.points} stroke={line.major ? '#b5bcb4' : '#d9ddd7'} strokeWidth={(line.major ? 1.2 : .65) / view.scale} />)}
        {mode === 'environment' && heatmap && visibleLayers.get('environment')?.visible
          ? <KonvaImage image={heatmap.canvas} width={map.dimensions.widthM} height={map.dimensions.lengthM} perfectDrawEnabled={false} />
          : null}
        {mode === 'environment' && heatmap && showContours && heatmap.count >= MIN_CONTOUR_SENSOR_COUNT && visibleLayers.get('environment')?.visible ? <Group clipX={0} clipY={0} clipWidth={map.dimensions.widthM} clipHeight={map.dimensions.lengthM}>
          {contourPaths.map((path, index) => <Group key={`${path.level}-${index}`}>
            <Line points={path.points} stroke="#244f43" strokeWidth={1.3 / view.scale} opacity={path.confidence < .35 ? .28 : .52} lineCap="round" lineJoin="round" tension={.08} dash={path.confidence < .35 ? [6 / view.scale, 5 / view.scale] : undefined} perfectDrawEnabled={false} />
          </Group>)}
        </Group> : null}
        {mode === 'signal' && visibleLayers.get('signal')?.visible ? map.objects.filter((object) => object.metadata.sensor).map((object) => {
          const quality = Math.max(.15, Math.min(1, ((object.metadata.sensor?.rssi ?? -120) + 120) / 55))
          return <Circle key={object.id} x={object.xM + object.widthM / 2} y={map.dimensions.lengthM - object.yM - object.lengthM / 2} radius={2.5 + quality * 2.2} fill={quality > .65 ? '#3b8364' : quality > .38 ? '#b58a3d' : '#a45849'} opacity={.08 + quality * .12} />
        }) : null}
        {mode === 'coverage' && visibleLayers.get('coverage')?.visible ? map.objects.filter((object) => object.metadata.sensor).map((object) => <Circle key={object.id} x={object.xM + object.widthM / 2} y={map.dimensions.lengthM - object.yM - object.lengthM / 2} radius={object.metadata.sensor?.coverageRadiusM ?? 3} fill="#4d8d78" stroke="#2f715d" strokeWidth={.04} dash={[.16, .12]} opacity={(visibleLayers.get('coverage')?.opacity ?? 1) * .18} />) : null}
      </Layer>
      <Layer>
        {orderedObjects.map((object) => {
          const layer = visibleLayers.get(object.layerId)
          if (!object.visible || !layer?.visible) return null
          return <ObjectShape key={object.id} object={object} map={map} selected={selectedIds.includes(object.id)} editable={editable && !layer.locked} environmentView={mode === 'environment'} layerOpacity={layer.opacity} viewScale={view.scale} snap={snap}
            onSelect={(event) => {
              event.cancelBubble = true
              const shift = event.evt.shiftKey
              onSelect(shift ? selectedIds.includes(object.id) ? selectedIds.filter((id) => id !== object.id) : [...selectedIds, object.id] : [object.id])
            }}
            onMove={(position, record) => onMove([position], record)}
            onUpdate={onUpdate}
          />
        })}
        <Transformer ref={transformerRef} rotateEnabled={editable && !wallMountedSelection} resizeEnabled={editable} flipEnabled={false} borderStroke="#d89222" anchorStroke="#d89222" anchorFill="#fff" anchorSize={9} borderStrokeWidth={1.5} rotateAnchorOffset={24} />
      </Layer>
      {mode === 'environment' && showContours && contourLabels.length ? <Layer listening={false}>
        {contourLabels.map(({ level, x, y, label }) => {
          const widthPx = Math.max(38, label.length * 6.2)
          return <Text key={level} x={x - widthPx / view.scale / 2} y={y - 6 / view.scale} width={widthPx / view.scale} height={12 / view.scale} text={label} align="center" verticalAlign="middle" fontFamily="IBM Plex Mono" fontStyle="bold" fontSize={10 / view.scale} fill="#111" />
        })}
      </Layer> : null}
      {mode === 'environment' && map.heatmapSettings.metric === 'soil-ec' && soilEcDepths.length > 1 ? <Layer>
        <Rect
          width={map.dimensions.widthM}
          height={map.dimensions.lengthM}
          fill="rgba(0,0,0,0.001)"
          onMouseEnter={(event) => {
            const stage = event.target.getStage()
            if (stage) stage.container().style.cursor = 'crosshair'
          }}
          onMouseLeave={(event) => {
            const stage = event.target.getStage()
            if (stage) stage.container().style.cursor = 'default'
          }}
          onClick={(event) => {
            event.cancelBubble = true
            selectSoilEcProfile()
          }}
          onTap={(event) => {
            event.cancelBubble = true
            selectSoilEcProfile()
          }}
        />
        {soilEcProfile ? <Group x={soilEcProfile.xM} y={map.dimensions.lengthM - soilEcProfile.yM} listening={false}>
          <Line
            points={[-soilEcProfile.xM, 0, map.dimensions.widthM - soilEcProfile.xM, 0]}
            stroke="rgba(255,255,255,.92)"
            strokeWidth={4 / view.scale}
          />
          <Line
            points={[-soilEcProfile.xM, 0, map.dimensions.widthM - soilEcProfile.xM, 0]}
            stroke="#163f35"
            strokeWidth={1.5 / view.scale}
            dash={[8 / view.scale, 5 / view.scale]}
          />
          <Text
            x={-soilEcProfile.xM + 5 / view.scale}
            y={-22 / view.scale}
            text="A"
            fontFamily="IBM Plex Mono"
            fontStyle="bold"
            fontSize={12 / view.scale}
            fill="#163f35"
            stroke="rgba(255,255,255,.95)"
            strokeWidth={3 / view.scale}
            fillAfterStrokeEnabled
          />
          <Text
            x={map.dimensions.widthM - soilEcProfile.xM - 15 / view.scale}
            y={-22 / view.scale}
            text="A′"
            fontFamily="IBM Plex Mono"
            fontStyle="bold"
            fontSize={12 / view.scale}
            fill="#163f35"
            stroke="rgba(255,255,255,.95)"
            strokeWidth={3 / view.scale}
            fillAfterStrokeEnabled
          />
          <Circle radius={9 / view.scale} fill="rgba(255,255,255,.85)" stroke="#163f35" strokeWidth={2 / view.scale} />
          <Circle radius={2.6 / view.scale} fill="#163f35" />
          <Line points={[-13 / view.scale, 0, 13 / view.scale, 0]} stroke="#163f35" strokeWidth={1 / view.scale} />
          <Line points={[0, -13 / view.scale, 0, 13 / view.scale]} stroke="#163f35" strokeWidth={1 / view.scale} />
        </Group> : null}
      </Layer> : null}
      {showReadOnlySensorLocations && readOnlySensorPoints.length ? <Layer>
        {readOnlySensorPoints.map((sensor) => <Group
          key={sensor.id}
          x={sensor.xM}
          y={map.dimensions.lengthM - sensor.yM}
          onMouseEnter={(event) => {
            const stage = event.target.getStage()
            if (stage) stage.container().style.cursor = 'pointer'
            setHoveredSensorId(sensor.id)
          }}
          onMouseLeave={(event) => {
            const stage = event.target.getStage()
            if (stage) stage.container().style.cursor = 'default'
            setHoveredSensorId((current) => current === sensor.id ? null : current)
          }}
          onClick={(event) => {
            event.cancelBubble = true
            setSoilEcProfile(null)
            setSelectedSensorId((current) => current === sensor.id ? null : sensor.id)
          }}
          onTap={(event) => {
            event.cancelBubble = true
            setSoilEcProfile(null)
            setSelectedSensorId((current) => current === sensor.id ? null : sensor.id)
          }}
        >
          <Circle radius={10 / view.scale} fill="rgba(0,0,0,0.001)" />
          <Circle radius={hoveredSensorId === sensor.id || selectedSensorId === sensor.id ? 4.5 / view.scale : 3 / view.scale} fill="#111" stroke={statusColors[sensor.status] ?? '#fff'} strokeWidth={hoveredSensorId === sensor.id || selectedSensorId === sensor.id ? 1.5 / view.scale : 1 / view.scale} />
        </Group>)}
      </Layer> : null}
      <Layer listening={false}>
        <Rect width={map.dimensions.widthM} height={map.dimensions.lengthM} stroke="#30483f" strokeWidth={Math.max(map.wallThicknessM, 2 / view.scale)} />
        {!readOnly ? <Text x={0} y={map.dimensions.lengthM + 12 / view.scale} text={`0                                        X  ${map.dimensions.widthM} m →`} width={map.dimensions.widthM} align="center" fontSize={11 / view.scale} fontFamily="IBM Plex Mono" fill="#466158" /> : null}
        {!readOnly ? <Text x={-34 / view.scale} y={map.dimensions.lengthM / 2} text={`Y\n${map.dimensions.lengthM} m\n↑`} align="center" fontSize={10 / view.scale} fontFamily="IBM Plex Mono" fill="#466158" /> : null}
      </Layer>
    </Stage>
    {soilEcProfile && soilProfileHost && mode === 'environment' && map.heatmapSettings.metric === 'soil-ec'
      ? createPortal(<SoilEcCrossSection
          profile={soilEcProfile}
          map={map}
          language={language}
          leftInsetPx={Math.max(0, view.x)}
          rightInsetPx={Math.max(0, size.width - view.x - map.dimensions.widthM * view.scale)}
          onClose={() => setSoilEcProfile(null)}
        />, soilProfileHost)
      : null}
    {activeSensor && sensorTooltip ? <div
      className="gh-sensor-tooltip"
      style={{ left: sensorTooltip.left, top: sensorTooltip.top }}
      role="tooltip"
    >
      <strong>{activeSensor.name}</strong>
      <span>{metricLabel(map.heatmapSettings.metric)}{map.heatmapSettings.metric === 'soil-ec' && soilEcDepthCm !== undefined ? ` · ${soilEcDepthCm} cm` : ''}</span>
      <b>{activeSensor.value == null ? tr('No measurement', 'Nėra matavimo') : `${Number(activeSensor.value.toFixed(METRICS[map.heatmapSettings.metric].decimals))} ${METRICS[map.heatmapSettings.metric].unit}`}</b>
      <dl>
        <div><dt>{tr('Measured', 'Išmatuota')}</dt><dd>{activeSensor.measuredAt ? new Date(activeSensor.measuredAt).toLocaleString(language) : '—'}</dd></div>
        <div><dt>{tr('Freshness', 'Šviežumas')}</dt><dd>{activeSensorFreshnessMinutes == null ? '—' : `${activeSensorFreshnessMinutes} min`} · {activeSensor.status}</dd></div>
        <div><dt>{tr('Battery', 'Baterija')}</dt><dd>{activeSensor.batteryPercent == null ? '—' : `${activeSensor.batteryPercent}%`}</dd></div>
        <div><dt>RSSI / SNR</dt><dd>{activeSensor.rssi == null ? '—' : `${activeSensor.rssi} dBm`} / {activeSensor.snr == null ? '—' : `${activeSensor.snr} dB`}</dd></div>
        {map.heatmapSettings.metric === 'soil-ec' ? activeSensor.soilEcByDepth.map((reading) => <div key={reading.depthCm}><dt>{reading.depthCm} cm{soilEcDepthCm === reading.depthCm ? ` · ${tr('selected', 'pasirinkta')}` : ''}</dt><dd>{reading.value.toFixed(METRICS['soil-ec'].decimals)} {METRICS['soil-ec'].unit}</dd></div>) : null}
      </dl>
    </div> : null}
    {hoveredCell ? <div className="gh-cell-tooltip" style={{ left: hoveredCell.left, top: hoveredCell.top }} role="tooltip">
      <strong>{hoveredCell.value == null ? tr('No data', 'Nėra duomenų') : `${Number(hoveredCell.value.toFixed(METRICS[map.heatmapSettings.metric].decimals))} ${METRICS[map.heatmapSettings.metric].unit}`}</strong>
      <span>X {hoveredCell.xM.toFixed(2)} m · Y {hoveredCell.yM.toFixed(2)} m</span>
      <dl>
        <div><dt>{tr('Sensors used', 'Naudota sensorių')}</dt><dd>{hoveredCell.sensorCount}</dd></div>
        <div><dt>{tr('Nearest sensor', 'Artimiausias sensorius')}</dt><dd>{hoveredCell.nearest?.name ?? '—'}</dd></div>
        <div><dt>{tr('Distance', 'Atstumas')}</dt><dd>{Number.isFinite(hoveredCell.nearestDistanceM) ? `${hoveredCell.nearestDistanceM.toFixed(2)} m` : '—'}</dd></div>
        <div><dt>{tr('Confidence', 'Patikimumas')}</dt><dd>{hoveredCell.confidenceLabel} · {Math.round(hoveredCell.confidence * 100)}%</dd></div>
      </dl>
    </div> : null}
    {!readOnly ? <div className="gh-view-controls">
      <button className={panning ? 'active' : ''} onClick={() => setPanning(!panning)} title={tr('Pan tool', 'Stūmimo įrankis')} aria-label={tr('Pan tool', 'Stūmimo įrankis')}><i className="fa-solid fa-hand" /></button><span />
      <button onClick={() => setView((current) => ({ ...current, scale: Math.max(8, current.scale / 1.15) }))} title={tr('Zoom out', 'Mažinti')} aria-label={tr('Zoom out', 'Mažinti')}><i className="fa-solid fa-minus" /></button>
      <button onClick={() => setView((current) => ({ ...current, scale: Math.min(140, current.scale * 1.15) }))} title={tr('Zoom in', 'Didinti')} aria-label={tr('Zoom in', 'Didinti')}><i className="fa-solid fa-plus" /></button>
      <button onClick={fit} title={tr('Fit to screen', 'Sutalpinti ekrane')} aria-label={tr('Fit to screen', 'Sutalpinti ekrane')}><i className="fa-solid fa-expand" /></button>
    </div> : null}
    {heatmapLegend ? legendHost ? createPortal(heatmapLegend, legendHost) : heatmapLegend : null}
    {mode === 'coverage' ? <div className="gh-mode-note"><i className="fa-solid fa-circle-info" /> {tr('Approximate planned sensor coverage, not a physical propagation model.', 'Apytikslė planuojama sensorių aprėptis, o ne fizinis signalo sklidimo modelis.')}</div> : null}
    {mode === 'signal' ? <div className="gh-mode-note"><i className="fa-solid fa-tower-broadcast" /> {tr('Latest LoRa quality based on RSSI, SNR and node status. It is not a propagation map.', 'Naujausia LoRa ryšio kokybė pagal RSSI, SNR ir mazgo būseną. Tai nėra signalo sklidimo žemėlapis.')}</div> : null}
    {insufficientHeatmapSources ? <div className="gh-insufficient-heatmap" role="status">
      <i className="fa-solid fa-chart-area" />
      <strong>{tr('Not enough measurements', 'Nepakanka matavimų')}</strong>
      <span>{tr(`At least ${MIN_HEATMAP_SENSOR_COUNT} valid sensor measurements are required to build this map. ${points.length} available.`, `Šiam žemėlapiui sudaryti reikia bent ${MIN_HEATMAP_SENSOR_COUNT} tinkamų sensorių matavimų. Dabar yra ${points.length}.`)}</span>
    </div> : null}
    {dailyView ? <aside className="gh-daily-summary">
      <small>{tr('TODAY', 'ŠIANDIEN')}</small><h2>{actions.length || sensorIssues.length || (targetState !== 'optimal' && targetState !== 'unknown') ? tr('Items need attention', 'Reikia dėmesio') : tr('Area is stable', 'Erdvė stabili')}</h2>
      {actions.slice(0, 3).map((action) => <p data-tone={action.priority === 'now' ? 'critical' : 'warning'} key={action.id}><i className="fa-solid fa-list-check" /><span><b>{action.title}</b>{action.sectionName} · {action.reason}</span></p>)}
      {targetState !== 'optimal' && targetState !== 'unknown' ? <p data-tone="warning"><i className="fa-solid fa-temperature-half" /><span><b>{metricLabel(map.heatmapSettings.metric)}</b>{targetState === 'low' ? tr('Below crop target', 'Žemiau augalo tikslo') : tr('Above crop target', 'Virš augalo tikslo')}</span></p> : null}
      {sensorIssues.slice(0, Math.max(0, 3 - actions.length)).map((object) => <p data-tone={object.metadata.sensor?.status === 'offline' ? 'critical' : 'warning'} key={object.id}><i className="fa-solid fa-microchip" /><span><b>{object.name}</b>{object.metadata.sensor?.status}</span></p>)}
      {!actions.length && !sensorIssues.length && targetState === 'optimal' ? <p data-tone="good"><i className="fa-solid fa-circle-check" /><span><b>{tr('No priority actions', 'Nėra prioritetinių veiksmų')}</b>{tr('Current readings are inside target.', 'Dabartiniai rodmenys tiksliniame diapazone.')}</span></p> : null}
    </aside> : null}
    {!readOnly ? <footer className="gh-statusbar"><span><i className="fa-solid fa-crosshairs" /> {mouse && mouse.xM >= 0 && mouse.yM >= 0 && mouse.xM <= map.dimensions.widthM && mouse.yM <= map.dimensions.lengthM ? `X ${mouse.xM.toFixed(2)} m · Y ${mouse.yM.toFixed(2)} m` : tr('Outside plan', 'Už plano ribų')}</span><span>{tr('Grid', 'Tinklelis')} {map.gridSizeM} m</span><span>{tr('Zoom', 'Mastelis')} {Math.round(view.scale / 40 * 100)}%</span><span>{selectedIds.length ? `${selectedIds.length} ${tr('selected', 'pasirinkta')}` : snap ? tr('Snap enabled', 'Lygiavimas įjungtas') : tr('Free placement', 'Laisvas išdėstymas')}</span></footer> : null}
  </main>
}
