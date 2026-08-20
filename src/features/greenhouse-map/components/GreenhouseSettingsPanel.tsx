import { GREENHOUSE_WALL_THICKNESS_M, type GreenhouseMap } from '../model'
import NumericInput from './NumericInput'

type Props = { map: GreenhouseMap; language?: 'en' | 'lt'; onChange: (next: GreenhouseMap) => void }

export default function GreenhouseSettingsPanel({ map, language = 'en', onChange }: Props) {
  const tr = (english: string, lithuanian: string) => language === 'lt' ? lithuanian : english
  const normalizedMap = { ...map, wallThicknessM: GREENHOUSE_WALL_THICKNESS_M }
  const updateDimensions = (field: 'widthM' | 'lengthM', value: number) => onChange({ ...normalizedMap, dimensions: { ...map.dimensions, [field]: value } })
  return <section className="gh-panel-section">
    <header><div><small>{tr('PLAN GEOMETRY', 'PLANO GEOMETRIJA')}</small><h2>{tr('Plan dimensions', 'Plano matmenys')}</h2></div><i className="fa-solid fa-compass-drafting" /></header>
    <div className="gh-field-row">
      <label className="gh-field"><span>{tr('Width', 'Plotis')} <em>m</em></span><NumericInput min="0.1" max="10000" step="0.1" value={map.dimensions.widthM} onCommit={(value) => updateDimensions('widthM', value ?? map.dimensions.widthM)} /></label>
      <label className="gh-field"><span>{tr('Length', 'Ilgis')} <em>m</em></span><NumericInput min="0.1" max="10000" step="0.1" value={map.dimensions.lengthM} onCommit={(value) => updateDimensions('lengthM', value ?? map.dimensions.lengthM)} /></label>
    </div>
    <label className="gh-field wide"><span>{tr('Grid step', 'Tinklelio žingsnis')}</span><select value={String(map.gridSizeM)} onChange={(event) => onChange({ ...normalizedMap, gridSizeM: Number(event.target.value) })}><option value="0.1">0.1 m</option><option value="0.25">0.25 m</option><option value="0.5">0.5 m</option><option value="1">1 m</option></select></label>
  </section>
}
