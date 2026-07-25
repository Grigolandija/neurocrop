import type { GreenhouseMap } from '../model'

type Props = { map: GreenhouseMap; language?: 'en' | 'lt'; onChange: (next: GreenhouseMap) => void }
const number = (value: string, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback

export default function GreenhouseSettingsPanel({ map, language = 'en', onChange }: Props) {
  const tr = (english: string, lithuanian: string) => language === 'lt' ? lithuanian : english
  const updateDimensions = (field: 'widthM' | 'lengthM' | 'heightM', value: number) => onChange({ ...map, dimensions: { ...map.dimensions, [field]: Math.max(field === 'heightM' ? 0 : 0.1, value) } })
  return <section className="gh-panel-section">
    <header><div><small>{tr('PLAN GEOMETRY', 'PLANO GEOMETRIJA')}</small><h2>{tr('Greenhouse settings', 'Šiltnamio nustatymai')}</h2></div><i className="fa-solid fa-compass-drafting" /></header>
    <label className="gh-field wide"><span>{tr('Name', 'Pavadinimas')}</span><input value={map.name} onChange={(event) => onChange({ ...map, name: event.target.value })} /></label>
    <div className="gh-field-row">
      <label className="gh-field"><span>{tr('Width', 'Plotis')} <em>m</em></span><input type="number" min="0.1" step="0.1" value={map.dimensions.widthM} onChange={(event) => updateDimensions('widthM', number(event.target.value, map.dimensions.widthM))} /></label>
      <label className="gh-field"><span>{tr('Length', 'Ilgis')} <em>m</em></span><input type="number" min="0.1" step="0.1" value={map.dimensions.lengthM} onChange={(event) => updateDimensions('lengthM', number(event.target.value, map.dimensions.lengthM))} /></label>
    </div>
    <div className="gh-field-row">
      <label className="gh-field"><span>{tr('Height', 'Aukštis')} <em>m</em></span><input type="number" min="0" step="0.1" value={map.dimensions.heightM ?? ''} onChange={(event) => updateDimensions('heightM', number(event.target.value, 0))} /></label>
      <label className="gh-field"><span>{tr('Orientation', 'Orientacija')} <em>°</em></span><input type="number" value={map.orientationDeg} onChange={(event) => onChange({ ...map, orientationDeg: number(event.target.value, 0) })} /></label>
    </div>
    <div className="gh-field-row">
      <label className="gh-field"><span>{tr('Grid step', 'Tinklelio žingsnis')}</span><select value={String(map.gridSizeM)} onChange={(event) => onChange({ ...map, gridSizeM: Number(event.target.value) })}><option value="0.1">0.1 m</option><option value="0.25">0.25 m</option><option value="0.5">0.5 m</option><option value="1">1 m</option></select></label>
      <label className="gh-field"><span>{tr('Wall', 'Siena')} <em>m</em></span><input type="number" min="0.01" step="0.01" value={map.wallThicknessM} onChange={(event) => onChange({ ...map, wallThicknessM: Math.max(.01, number(event.target.value, .15)) })} /></label>
    </div>
  </section>
}
