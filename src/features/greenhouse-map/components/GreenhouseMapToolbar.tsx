import type { MapMode, MetricKey } from '../model'

type Props = {
  mode: MapMode
  metric: MetricKey
  snap: boolean
  canUndo: boolean
  canRedo: boolean
  selectedCount: number
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
    <div className="gh-brand"><span><i className="fa-solid fa-leaf" /></span><div><strong>NeuroCrop</strong><small>Greenhouse map · experimental</small></div></div>
    <nav className="gh-modes" aria-label="Map mode">
      {([
        ['layout', 'fa-pen-ruler', 'Layout'], ['coverage', 'fa-bullseye', 'Coverage'],
        ['environment', 'fa-temperature-half', 'Environment'], ['signal', 'fa-tower-broadcast', 'Signal'],
      ] as const).map(([id, icon, label]) => <button key={id} className={props.mode === id ? 'active' : ''} onClick={() => props.onMode(id)}><i className={`fa-solid ${icon}`} />{label}</button>)}
    </nav>
    {props.mode === 'environment' ? <select aria-label="Environment metric" value={props.metric} onChange={(event) => props.onMetric(event.target.value as MetricKey)}>
      <option value="air-temperature">Air temperature</option><option value="relative-humidity">Relative humidity</option>
      <option value="co2">CO₂</option><option value="vpd">VPD</option><option value="root-temperature">Root temperature</option>
    </select> : null}
    <div className="gh-toolbar-actions">
      <button className={props.snap ? 'active' : ''} onClick={() => props.onSnap(!props.snap)} title="Snap to grid"><i className="fa-solid fa-magnet" /> Snap</button>
      <span />
      <button disabled={!props.canUndo} onClick={props.onUndo} title="Undo"><i className="fa-solid fa-rotate-left" /></button>
      <button disabled={!props.canRedo} onClick={props.onRedo} title="Redo"><i className="fa-solid fa-rotate-right" /></button>
      <button disabled={!props.selectedCount} onClick={props.onDuplicate} title="Duplicate"><i className="fa-regular fa-copy" /></button>
      <button className="danger" disabled={!props.selectedCount} onClick={props.onDelete} title="Delete"><i className="fa-regular fa-trash-can" /></button>
    </div>
  </header>
}
