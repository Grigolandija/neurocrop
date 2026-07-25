import type { MapMode, MetricKey } from '../model'

type Props = {
  mode: MapMode
  metric: MetricKey
  snap: boolean
  canUndo: boolean
  canRedo: boolean
  selectedCount: number
  editing: boolean
  onMode: (mode: MapMode) => void
  onMetric: (metric: MetricKey) => void
  onSnap: (value: boolean) => void
  onUndo: () => void
  onRedo: () => void
  onDuplicate: () => void
  onDelete: () => void
}

export default function GreenhouseMapToolbar(props: Props) {
  return <header className="gh-toolbar">
    <div className="gh-brand"><span><i className="fa-solid fa-leaf" /></span><div><strong>NeuroCrop</strong><small>Area intelligence · Beta</small></div></div>
    <nav className="gh-modes" aria-label="Map mode">
      {([
        ['layout', 'fa-pen-ruler', 'Plan', 'Arrange Sections, nodes and greenhouse equipment.'],
        ['coverage', 'fa-bullseye', 'Sensor reach', 'Review planned sensing radius around each node.'],
        ['environment', 'fa-temperature-half', 'Climate map', 'View measured and interpolated growing conditions.'],
        ['signal', 'fa-tower-broadcast', 'LoRa signal', 'Review the latest node-to-gateway radio quality.'],
      ] as const).map(([id, icon, label, title]) => <button key={id} title={title} className={props.mode === id ? 'active' : ''} onClick={() => props.onMode(id)}><i className={`fa-solid ${icon}`} />{label}</button>)}
    </nav>
    {props.mode === 'environment' ? <select aria-label="Environment metric" value={props.metric} onChange={(event) => props.onMetric(event.target.value as MetricKey)}>
      <option value="air-temperature">Air temperature</option><option value="relative-humidity">Relative humidity</option>
      <option value="co2">CO₂</option><option value="vpd">VPD</option><option value="root-temperature">Root temperature</option>
    </select> : null}
    <div className="gh-toolbar-actions">
      <button disabled={!props.editing} className={props.snap ? 'active' : ''} onClick={() => props.onSnap(!props.snap)} title="Snap objects to the plan grid"><i className="fa-solid fa-magnet" /> Snap</button>
      <span />
      <button disabled={!props.canUndo} onClick={props.onUndo} title="Undo"><i className="fa-solid fa-rotate-left" /></button>
      <button disabled={!props.canRedo} onClick={props.onRedo} title="Redo"><i className="fa-solid fa-rotate-right" /></button>
      <button disabled={!props.selectedCount} onClick={props.onDuplicate} title="Duplicate"><i className="fa-regular fa-copy" /></button>
      <button className="danger" disabled={!props.selectedCount} onClick={props.onDelete} title="Delete"><i className="fa-regular fa-trash-can" /></button>
    </div>
  </header>
}
