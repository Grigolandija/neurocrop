import { METRICS, type MapMode, type MetricKey } from '../model'

type Props = {
  mode: MapMode
  metric: MetricKey
  snap: boolean
  canUndo: boolean
  canRedo: boolean
  selectedCount: number
  duplicableSelectedCount: number
  canPaste: boolean
  editing: boolean
  language: 'en' | 'lt'
  onMode: (mode: MapMode) => void
  onMetric: (metric: MetricKey) => void
  onSnap: (value: boolean) => void
  onUndo: () => void
  onRedo: () => void
  onCopy: () => void
  onPaste: () => void
  onDelete: () => void
}

export default function GreenhouseMapToolbar(props: Props) {
  const tr = (english: string, lithuanian: string) => props.language === 'lt' ? lithuanian : english
  return <header className="gh-toolbar">
    <div className="gh-brand"><span><i className="fa-solid fa-leaf" /></span><div><strong>NeuroCrop</strong><small>{tr('Area intelligence · Beta', 'Erdvės analizė · beta')}</small></div></div>
    <nav className="gh-modes" aria-label={tr('Map mode', 'Žemėlapio režimas')}>
      {([
        ['layout', 'fa-pen-ruler', tr('Plan', 'Planas'), tr('Arrange Sections, nodes and greenhouse equipment.', 'Išdėstykite sekcijas, mazgus ir šiltnamio įrangą.')],
        ['coverage', 'fa-bullseye', tr('Sensor reach', 'Jutiklių aprėptis'), tr('Review planned sensing radius around each node.', 'Peržiūrėkite planuojamą kiekvieno mazgo stebėjimo spindulį.')],
        ['environment', 'fa-temperature-half', tr('Climate map', 'Klimato žemėlapis'), tr('View measured and interpolated growing conditions.', 'Peržiūrėkite išmatuotas ir interpoliuotas auginimo sąlygas.')],
        ['signal', 'fa-tower-broadcast', tr('LoRa signal', 'LoRa signalas'), tr('Review the latest node-to-gateway radio quality.', 'Peržiūrėkite naujausią mazgo ryšio su šliuzu kokybę.')],
      ] as const).map(([id, icon, label, title]) => <button key={id} title={title} className={props.mode === id ? 'active' : ''} onClick={() => props.onMode(id)}><i className={`fa-solid ${icon}`} />{label}</button>)}
    </nav>
    {props.mode === 'environment' ? <select aria-label={tr('Environment metric', 'Aplinkos rodiklis')} value={props.metric} onChange={(event) => props.onMetric(event.target.value as MetricKey)}>
      {(Object.keys(METRICS) as MetricKey[]).map((metric) => <option value={metric} key={metric}>{props.language === 'lt' ? METRICS[metric].labelLt : METRICS[metric].label}</option>)}
    </select> : null}
    <div className="gh-toolbar-actions">
      <button disabled={!props.editing} className={props.snap ? 'active' : ''} onClick={() => props.onSnap(!props.snap)} title={tr('Snap objects to the plan grid', 'Lygiuoti objektus pagal plano tinklelį')}><i className="fa-solid fa-magnet" /> {tr('Snap', 'Lygiavimas')}</button>
      <span />
      <button disabled={!props.canUndo} onClick={props.onUndo} title={tr('Undo', 'Atšaukti')}><i className="fa-solid fa-rotate-left" /></button>
      <button disabled={!props.canRedo} onClick={props.onRedo} title={tr('Redo', 'Pakartoti')}><i className="fa-solid fa-rotate-right" /></button>
      <button disabled={!props.duplicableSelectedCount} onClick={props.onCopy} title={tr('Copy selected objects (Ctrl/Cmd + C)', 'Kopijuoti pasirinktus objektus (Ctrl/Cmd + C)')}><i className="fa-regular fa-copy" /> {tr('Copy', 'Kopijuoti')}</button>
      <button disabled={!props.canPaste} onClick={props.onPaste} title={tr('Paste copied objects (Ctrl/Cmd + V)', 'Įdėti nukopijuotus objektus (Ctrl/Cmd + V)')}><i className="fa-regular fa-clipboard" /> {tr('Paste', 'Įdėti')}</button>
      <button className="danger" disabled={!props.selectedCount} onClick={props.onDelete} title={tr('Delete', 'Ištrinti')}><i className="fa-regular fa-trash-can" /></button>
    </div>
  </header>
}
