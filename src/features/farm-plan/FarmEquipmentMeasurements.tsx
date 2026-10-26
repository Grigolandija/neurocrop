import { useEffect, useRef, useState } from 'react'
import { objectFootprint, outlinePoints } from '../../../backend/area-map-outline.js'
import type { GreenhouseMap, GreenhouseObject } from '../greenhouse-map/model'
import type { SitePoint } from '../living-greenhouse/siteDemoModel'
import type { DrawingView } from './farmAreaGeometry'
import { equipmentWallClearances, wallClearanceEditable } from './farmEquipmentClearances'

type Props = { object: GreenhouseObject; map: GreenhouseMap; origin: SitePoint; unit: number; view: DrawingView; lt: boolean; onDistance: (wallIndex: number, distanceM: number) => boolean }
type Measure = { key: string; from: SitePoint; to: SitePoint; anchor: SitePoint; label: string; description: string; wallIndex?: number; distanceM: number; editable: boolean }

export default function FarmEquipmentMeasurements({ object, map, origin, unit, view, lt, onDistance }: Props) {
  const [editing, setEditing] = useState<{ wallIndex: number; text: string; error: string } | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const input = useRef<HTMLInputElement>(null), opener = useRef<SVGGElement | null>(null)
  const editingIndex = editing?.wallIndex
  useEffect(() => { if (editingIndex !== undefined) { input.current?.focus(); input.current?.select() } }, [editingIndex])
  if (object.type === 'sensor-node') return null
  const format = (value: number) => value.toLocaleString(lt ? 'lt-LT' : 'en-GB', { maximumFractionDigits: 3 })
  const footprint = objectFootprint(object), angle = object.rotationDeg * Math.PI / 180
  const translate = (point: SitePoint, dx: number, dy: number) => ({ xM: point.xM + dx, yM: point.yM + dy })
  const dimensions = [
    { key: 'width', a: footprint[0], b: footprint[1], dx: Math.sin(angle), dy: -Math.cos(angle), value: object.widthM, name: lt ? 'Plotis' : 'Width' },
    { key: 'length', a: footprint[1], b: footprint[2], dx: Math.cos(angle), dy: Math.sin(angle), value: object.lengthM, name: lt ? 'Ilgis' : 'Length' },
  ]
  const measures: Measure[] = dimensions.map(dimension => {
    const from = translate(dimension.a, dimension.dx * unit * 20, dimension.dy * unit * 20)
    const to = translate(dimension.b, dimension.dx * unit * 20, dimension.dy * unit * 20)
    return { key: dimension.key, from, to, anchor: { xM: (from.xM + to.xM) / 2, yM: (from.yM + to.yM) / 2 }, label: `${format(dimension.value)} m`, description: dimension.name, distanceM: dimension.value, editable: false }
  })
  const clearances = equipmentWallClearances(object, map).slice(0, 4)
  for (const clearance of clearances) measures.push({
    key: `wall-${clearance.wallIndex}`, from: clearance.from, to: clearance.to,
    anchor: { xM: (clearance.from.xM + clearance.to.xM) / 2, yM: (clearance.from.yM + clearance.to.yM) / 2 },
    label: `${lt ? 'S' : 'W'}${clearance.wallIndex + 1} · ${format(clearance.distanceM)} m`,
    description: `${lt ? 'Atstumas iki sienos' : 'Distance to wall'} ${clearance.wallIndex + 1}`,
    wallIndex: clearance.wallIndex, distanceM: clearance.distanceM, editable: wallClearanceEditable(object, map, clearance),
  })
  // Labels keep a fixed screen size, stay in the viewport and avoid each other.
  const occupied: SitePoint[] = []
  const anchors = new Map(measures.map(measure => {
    const point = { xM: measure.anchor.xM + origin.xM, yM: measure.anchor.yM + origin.yM }
    const clamp = (p: SitePoint) => ({ xM: Math.max(view.x + 54 * unit, Math.min(view.x + view.width - 54 * unit, p.xM)), yM: Math.max(view.y + 16 * unit, Math.min(view.y + view.height - 16 * unit, p.yM)) })
    let anchor = clamp(point)
    for (const shift of [0, 28, -28, 56, -56, 84, -84]) {
      const candidate = clamp({ ...point, yM: point.yM + shift * unit })
      if (occupied.every(other => Math.abs(other.xM - candidate.xM) > 108 * unit || Math.abs(other.yM - candidate.yM) > 26 * unit)) { anchor = candidate; break }
    }
    occupied.push(anchor)
    return [measure.key, anchor] as const
  }))
  const close = () => { setEditing(null); requestAnimationFrame(() => opener.current?.focus({ preventScroll: true })) }
  const active = editing ? measures.find(measure => measure.wallIndex === editingIndex) : undefined
  const editAnchor = active ? anchors.get(active.key)! : null
  const polygon = outlinePoints(map), highlighted = editingIndex ?? hovered
  const editPosition = editAnchor ? { xM: Math.max(view.x + 8 * unit, Math.min(view.x + view.width - 200 * unit, editAnchor.xM - 96 * unit)), yM: Math.max(view.y + 150 * unit, Math.min(view.y + view.height - 8 * unit, editAnchor.yM - 18 * unit)) } : null

  return <g className="nfa-equipment-measures" onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
    <g className="nfa-measure-lines" aria-hidden="true">
      {dimensions.map(dimension => <g key={dimension.key}>{[dimension.a, dimension.b].map((point, i) => <line key={i} x1={point.xM + origin.xM} y1={-point.yM - origin.yM} x2={point.xM + origin.xM + dimension.dx * unit * 25} y2={-point.yM - origin.yM - dimension.dy * unit * 25} />)}</g>)}
      {measures.map(measure => <g key={measure.key} data-wall={measure.wallIndex !== undefined}>
        <line x1={measure.from.xM + origin.xM} y1={-measure.from.yM - origin.yM} x2={measure.to.xM + origin.xM} y2={-measure.to.yM - origin.yM} />
        <line className="nfa-measure-leader" x1={measure.anchor.xM + origin.xM} y1={-measure.anchor.yM - origin.yM} x2={anchors.get(measure.key)!.xM} y2={-anchors.get(measure.key)!.yM} />
        {[measure.from, measure.to].map((point, i) => <circle key={i} cx={point.xM + origin.xM} cy={-point.yM - origin.yM} r={2 * unit} />)}
      </g>)}
      {highlighted != null && polygon[highlighted] && <line className="nfa-measured-wall" x1={polygon[highlighted].xM + origin.xM} y1={-polygon[highlighted].yM - origin.yM} x2={polygon[(highlighted + 1) % polygon.length].xM + origin.xM} y2={-polygon[(highlighted + 1) % polygon.length].yM - origin.yM} />}
    </g>
    {measures.map(measure => {
      const anchor = anchors.get(measure.key)!, width = measure.wallIndex === undefined ? 72 : 104
      const begin = (element: SVGGElement) => { if (!measure.editable || measure.wallIndex === undefined) return; opener.current = element; setEditing({ wallIndex: measure.wallIndex, text: String(Math.round(measure.distanceM * 1000) / 1000), error: '' }) }
      return <g key={measure.key} className="nfa-measure-value" data-wall={measure.wallIndex !== undefined} data-editable={measure.editable} transform={`translate(${anchor.xM} ${-anchor.yM}) scale(${unit})`} role={measure.editable ? 'button' : undefined} tabIndex={measure.editable ? 0 : undefined} aria-label={`${measure.description}: ${measure.label}${measure.editable ? (lt ? '. Keisti atstumą' : '. Edit distance') : ''}`} aria-expanded={measure.editable ? editingIndex === measure.wallIndex : undefined} onMouseEnter={() => setHovered(measure.wallIndex ?? null)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(measure.wallIndex ?? null)} onBlur={() => setHovered(null)} onClick={event => begin(event.currentTarget)} onKeyDown={event => { if (measure.editable && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); begin(event.currentTarget) } }}>
        <title>{measure.description}{measure.editable ? (lt ? ' · Paspauskite keisti' : ' · Click to edit') : ''}</title>
        <rect x={-width / 2} y={-12} width={width} height={24} rx={4} />
        <text x={0} y={0} style={{ fontSize: '11px' }}>{measure.label}</text>
      </g>
    })}
    {editing && editPosition && <foreignObject x={0} y={0} width={192} height={148} transform={`translate(${editPosition.xM} ${-editPosition.yM}) scale(${unit})`}>
      <form className="nfa-clearance-editor" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }} onSubmit={event => {
        event.preventDefault()
        const text = editing.text.trim().replace(',', '.'), value = Number(text)
        if (!text || !Number.isFinite(value) || value < 0 || !onDistance(editing.wallIndex, value)) { setEditing({ ...editing, error: lt ? 'Toks atstumas netelpa arba pažeidžia tvirtinimą.' : 'This distance does not fit or breaks the wall mounting.' }); return }
        close()
      }}>
        <label>{lt ? 'Atstumas iki sienos' : 'Distance to wall'} {editing.wallIndex + 1} · m<input ref={input} type="text" inputMode="decimal" autoComplete="off" value={editing.text} onChange={event => setEditing({ ...editing, text: event.target.value, error: '' })} /></label>
        <div><button type="submit">{lt ? 'Taikyti' : 'Apply'}</button><button type="button" onClick={close}>{lt ? 'Atšaukti' : 'Cancel'}</button></div>
        {editing.error && <p role="alert">{editing.error}</p>}
      </form>
    </foreignObject>}
  </g>
}
