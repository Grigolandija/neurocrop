import { METRICS, OBJECT_LIBRARY, type GreenhouseMap, type GreenhouseObject, type NodeStatus, type SensorNodeMetadata } from '../model'
import { isWallMountedType } from '../geometry'
import NumericInput from './NumericInput'
import { ltObjectLabels } from './ObjectLibraryPanel'

type Props = {
  map: GreenhouseMap
  selected: GreenhouseObject[]
  onUpdate: (id: string, patch: Partial<GreenhouseObject>) => void
  onAlign: (edge: 'left' | 'center' | 'right' | 'bottom' | 'middle' | 'top') => void
  onCopy: () => void
  onPaste: () => void
  canPaste: boolean
  language?: 'en' | 'lt'
}
export default function ObjectPropertiesPanel({ map, selected, onUpdate, onAlign, onCopy, onPaste, canPaste, language = 'en' }: Props) {
  const tr = (english: string, lithuanian: string) => language === 'lt' ? lithuanian : english
  if (!selected.length) return <aside className="gh-right-panel"><div className="gh-empty-selection"><span><i className="fa-solid fa-arrow-pointer" /></span><h2>{tr('No object selected', 'Objektas nepasirinktas')}</h2><p>{tr('Select an object on the plan to inspect exact coordinates, dimensions and operational data.', 'Pasirinkite objektą plane, kad matytumėte koordinates, matmenis ir veikimo duomenis.')}</p><small>{tr('Shift-click to select multiple objects.', 'Shift + paspaudimas pasirenka kelis objektus.')}</small></div></aside>
  const edgeLabels = { left: tr('left', 'kairė'), center: tr('center', 'centras'), right: tr('right', 'dešinė'), bottom: tr('bottom', 'apačia'), middle: tr('middle', 'vidurys'), top: tr('top', 'viršus') }
  if (selected.length > 1) return <aside className="gh-right-panel"><section className="gh-properties"><header><small>{tr('MULTI-SELECTION', 'KELI PASIRINKIMAI')}</small><h2>{selected.length} {tr('objects selected', 'objektai pasirinkti')}</h2></header><p className="gh-muted">{tr('Align selected objects to their shared bounds.', 'Lygiuokite pasirinktus objektus pagal bendras jų ribas.')}</p><div className="gh-align-grid">
    {(['left', 'center', 'right', 'bottom', 'middle', 'top'] as const).map((edge) => <button key={edge} onClick={() => onAlign(edge)}><i className={`fa-solid fa-align-${edge === 'middle' ? 'center' : edge}`} />{edgeLabels[edge]}</button>)}
  </div>{selected.some((object) => object.type !== 'section-zone' && object.type !== 'sensor-node') ? <button className="gh-inspector-action" type="button" onClick={onCopy}><i className="fa-regular fa-copy" />{tr('Copy selected objects', 'Kopijuoti pasirinktus objektus')} · Ctrl/Cmd + C</button> : null}{canPaste ? <button className="gh-inspector-action" type="button" onClick={onPaste}><i className="fa-regular fa-clipboard" />{tr('Paste copied objects', 'Įdėti nukopijuotus objektus')} · Ctrl/Cmd + V</button> : null}</section></aside>
  const object = selected[0]
  const wallMounted = isWallMountedType(object.type)
  const sensor = object.metadata.sensor
  const patchMetadata = (metadata: Partial<GreenhouseObject['metadata']>) => onUpdate(object.id, { metadata: { ...object.metadata, ...metadata } })
  const patchSensor = (update: Partial<SensorNodeMetadata>) => patchMetadata({ sensor: { ...sensor!, ...update } })
  const measurements = sensor?.measurements
  const otherSensors = map.objects.filter((candidate) => candidate.id !== object.id && candidate.metadata.sensor)
  const nearestNodeDistance = sensor && otherSensors.length ? Math.min(...otherSensors.map((candidate) => Math.hypot(candidate.xM - object.xM, candidate.yM - object.yM))) : null
  const suggestedSpacing = Math.max(1.5, Math.sqrt(map.dimensions.widthM * map.dimensions.lengthM / Math.max(1, map.objects.filter((candidate) => candidate.metadata.sensor).length)) * .55)

  return <aside className="gh-right-panel">
    <section className="gh-properties">
      <header><div><small>{tr('OBJECT INSPECTOR', 'OBJEKTO INFORMACIJA')}</small><h2>{object.name}</h2></div><span className="gh-type-badge"><i className={`fa-solid ${OBJECT_LIBRARY.find((item) => item.type === object.type)?.icon}`} /></span></header>
      <label className="gh-field wide"><span>{tr('Name', 'Pavadinimas')}</span><input value={object.name} onChange={(event) => onUpdate(object.id, { name: event.target.value })} /></label>
      <label className="gh-field wide"><span>{tr('Type', 'Tipas')}</span><select value={object.type} onChange={(event) => onUpdate(object.id, { type: event.target.value as GreenhouseObject['type'] })}>{OBJECT_LIBRARY.map((item) => <option value={item.type} key={item.type}>{language === 'lt' ? ltObjectLabels[item.type] || item.label : item.label}</option>)}</select></label>
      <div className="gh-coordinate-box"><span>{tr('POSITION · ORIGIN LOWER LEFT', 'PADĖTIS · PRADŽIA APAČIOJE KAIRĖJE')}</span><div className="gh-field-row">
        <label className="gh-field"><span>X <em>m</em></span><NumericInput step={map.gridSizeM} value={Number(object.xM.toFixed(3))} onCommit={(value) => onUpdate(object.id, { xM: value ?? object.xM })} /></label>
        <label className="gh-field"><span>Y <em>m</em></span><NumericInput step={map.gridSizeM} value={Number(object.yM.toFixed(3))} onCommit={(value) => onUpdate(object.id, { yM: value ?? object.yM })} /></label>
      </div></div>
      {sensor ? <label className="gh-field wide"><span>{tr('Automatic marker size', 'Automatinis žymeklio dydis')} <em>m</em></span><input value={Number(object.widthM.toFixed(3))} readOnly /><small>{tr('Calculated from greenhouse scale.', 'Apskaičiuota pagal šiltnamio mastelį.')}</small></label> : <div className="gh-field-row">
        <label className="gh-field"><span>{tr('Width', 'Plotis')} <em>m</em></span><NumericInput min=".05" step=".05" value={Number(object.widthM.toFixed(3))} onCommit={(value) => onUpdate(object.id, { widthM: value ?? object.widthM })} /></label>
        <label className="gh-field"><span>{tr('Length', 'Ilgis')} <em>m</em></span><NumericInput min=".05" step=".05" value={Number(object.lengthM.toFixed(3))} onCommit={(value) => onUpdate(object.id, { lengthM: value ?? object.lengthM })} /></label>
      </div>}
      <div className="gh-field-row">
        {wallMounted ? <label className="gh-field"><span>{tr('Mounted wall', 'Tvirtinimo siena')}</span><input value={object.metadata.wallMount?.wall ?? tr('Automatic', 'Automatinė')} readOnly /></label> : <label className="gh-field"><span>{tr('Rotation', 'Pasukimas')} <em>°</em></span><NumericInput value={Number(object.rotationDeg.toFixed(1))} onCommit={(value) => onUpdate(object.id, { rotationDeg: value ?? object.rotationDeg })} /></label>}
        <label className="gh-field"><span>{tr('Layer', 'Sluoksnis')}</span><select value={object.layerId} onChange={(event) => onUpdate(object.id, { layerId: event.target.value })}>{map.layers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      </div>
      {wallMounted ? <p className="gh-muted"><i className="fa-solid fa-magnet" /> {tr('This object stays attached to the nearest perimeter wall. Drag it toward another wall to remount it.', 'Šis objektas lieka pritvirtintas prie artimiausios perimetro sienos. Nutempkite prie kitos sienos, kad pakeistumėte tvirtinimą.')}</p> : null}
      <div className="gh-toggle-row">
        <label><input type="checkbox" checked={object.visible} onChange={(event) => onUpdate(object.id, { visible: event.target.checked })} /><span>{tr('Visible', 'Rodomas')}</span></label>
        <label><input type="checkbox" checked={object.locked} onChange={(event) => onUpdate(object.id, { locked: event.target.checked })} /><span>{tr('Locked', 'Užrakintas')}</span></label>
      </div>
      {object.type !== 'section-zone' && object.type !== 'sensor-node' ? <button className="gh-inspector-action" type="button" onClick={onCopy}><i className="fa-regular fa-copy" />{tr('Copy object', 'Kopijuoti objektą')} · Ctrl/Cmd + C</button> : null}
      {canPaste ? <button className="gh-inspector-action" type="button" onClick={onPaste}><i className="fa-regular fa-clipboard" />{tr('Paste copied object', 'Įdėti nukopijuotą objektą')} · Ctrl/Cmd + V</button> : null}
      <label className="gh-field wide"><span>{tr('Status', 'Būsena')}</span><input value={object.metadata.status ?? ''} placeholder={tr('Optional status', 'Nebūtina būsena')} onChange={(event) => patchMetadata({ status: event.target.value })} /></label>
      <label className="gh-field wide"><span>{tr('Notes', 'Pastabos')}</span><textarea value={object.metadata.notes ?? ''} placeholder={tr('Installation or planning notes…', 'Montavimo arba planavimo pastabos…')} onChange={(event) => patchMetadata({ notes: event.target.value })} /></label>
    </section>
    {sensor ? <section className="gh-properties gh-sensor-properties">
      <header><div><small>NEUROSENSE DATA</small><h2>{tr('Node configuration', 'Mazgo konfigūracija')}</h2></div><span className={`gh-status-dot ${sensor.status}`} /></header>
      <div className="gh-node-summary"><div><span>{tr('Air', 'Oras')}</span><strong>{measurements?.airTemperatureC ?? '—'}°C</strong></div><div><span>RH</span><strong>{measurements?.relativeHumidityPercent ?? '—'}%</strong></div><div><span>CO₂</span><strong>{measurements?.co2Ppm ?? '—'}<small> ppm</small></strong></div><div><span>VPD</span><strong>{measurements?.vpdKpa ?? '—'}<small> kPa</small></strong></div></div>
      <label className="gh-field wide"><span>{tr('Node ID', 'Mazgo ID')}</span><input value={sensor.nodeId ?? ''} onChange={(event) => patchSensor({ nodeId: event.target.value })} /></label>
      <label className="gh-field wide"><span>DevEUI</span><input value={sensor.devEui ?? ''} onChange={(event) => patchSensor({ devEui: event.target.value })} /></label>
      <label className="gh-field wide"><span>{tr('Display name', 'Rodomas pavadinimas')}</span><input value={sensor.displayName ?? ''} onChange={(event) => patchSensor({ displayName: event.target.value })} /></label>
      <div className="gh-field-row"><label className="gh-field"><span>{tr('Area', 'Erdvė')}</span><input value={sensor.areaId ?? ''} onChange={(event) => patchSensor({ areaId: event.target.value })} /></label><label className="gh-field"><span>{tr('Height', 'Aukštis')} <em>m</em></span><NumericInput allowEmpty min="0" value={sensor.installationHeightM} onCommit={(value) => patchSensor({ installationHeightM: value })} /></label></div>
      <div className="gh-field-row"><label className="gh-field"><span>{tr('Model', 'Modelis')}</span><input value={sensor.model ?? ''} onChange={(event) => patchSensor({ model: event.target.value })} /></label><label className="gh-field"><span>{tr('Status', 'Būsena')}</span><select value={sensor.status} onChange={(event) => patchSensor({ status: event.target.value as NodeStatus })}><option value="online">{tr('online', 'prisijungęs')}</option><option value="warning">{tr('warning', 'įspėjimas')}</option><option value="offline">{tr('offline', 'neprisijungęs')}</option><option value="unassigned">{tr('unassigned', 'nepriskirtas')}</option><option value="low-battery">{tr('low battery', 'silpna baterija')}</option><option value="stale">{tr('stale data', 'pasenę duomenys')}</option></select></label></div>
      <div className="gh-field-row"><label className="gh-field"><span>{tr('Battery', 'Baterija')} <em>%</em></span><NumericInput allowEmpty min="0" max="100" value={sensor.batteryPercent} onCommit={(value) => patchSensor({ batteryPercent: value })} /></label><label className="gh-field"><span>{tr('Coverage', 'Aprėptis')} <em>m</em></span><NumericInput min=".1" step=".1" value={sensor.coverageRadiusM ?? 3} onCommit={(value) => patchSensor({ coverageRadiusM: value ?? sensor.coverageRadiusM ?? 3 })} /></label></div>
      <div className="gh-radio-row"><span><small>RSSI</small><strong>{sensor.rssi ?? '—'} dBm</strong></span><span><small>SNR</small><strong>{sensor.snr ?? '—'} dB</strong></span><span><small>{tr('Last uplink', 'Paskutinis ryšys')}</small><strong>{sensor.lastSeenAt ? new Date(sensor.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</strong></span></div>
      <label className="gh-field wide"><span>{tr('Active sensors', 'Aktyvūs sensoriai')}</span><input value={sensor.sensors.join(', ')} onChange={(event) => patchSensor({ sensors: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></label>
      <div className="gh-measurement-list">{(Object.keys(METRICS) as Array<keyof typeof METRICS>).map((key) => <span key={key}><small>{language === 'lt' ? ({ 'air-temperature': 'Oro temperatūra', 'relative-humidity': 'Santykinė drėgmė', co2: 'CO₂', vpd: 'VPD', 'root-temperature': 'Šaknų zonos temperatūra' } as Record<string, string>)[key] : METRICS[key].label}</small><strong>{String(measurements?.[METRICS[key].field] ?? '—')} {METRICS[key].unit}</strong></span>)}</div>
      <div className="gh-installation-check">
        <h3><i className="fa-solid fa-screwdriver-wrench" />{tr('Installation check', 'Montavimo patikra')}</h3>
        <p data-tone={sensor.sectionId ? 'good' : 'warning'}>{sensor.sectionId ? tr(`Assigned to ${sensor.sectionName || 'a Section'}`, `Priskirtas sekcijai „${sensor.sectionName || 'be pavadinimo'}“`) : tr('Not assigned to a Section', 'Nepriskirtas sekcijai')}</p>
        <p data-tone={nearestNodeDistance === null || nearestNodeDistance >= suggestedSpacing * .55 ? 'good' : 'warning'}>{nearestNodeDistance === null ? tr('First node in this Area', 'Pirmasis mazgas šioje erdvėje') : tr(`Nearest node ${nearestNodeDistance.toFixed(1)} m · suggested spacing about ${suggestedSpacing.toFixed(1)} m`, `Artimiausias mazgas už ${nearestNodeDistance.toFixed(1)} m · siūlomas tarpas apie ${suggestedSpacing.toFixed(1)} m`)}</p>
        <p>{tr('Recommended starting height: 1.2–1.8 m above crop level; confirm against the installed sensor type and crop canopy.', 'Rekomenduojamas pradinis aukštis: 1,2–1,8 m virš augalų; patikslinkite pagal jutiklio tipą ir augalų lają.')}</p>
        <button className={sensor.installationConfirmedAt ? 'confirmed' : ''} type="button" onClick={() => patchSensor({ installationConfirmedAt: sensor.installationConfirmedAt ? undefined : new Date().toISOString() })}><i className={`fa-solid ${sensor.installationConfirmedAt ? 'fa-circle-check' : 'fa-location-dot'}`} />{sensor.installationConfirmedAt ? `${tr('Installed', 'Sumontuota')} · ${new Date(sensor.installationConfirmedAt).toLocaleDateString()}` : tr('Confirm physical installation', 'Patvirtinti fizinį montavimą')}</button>
      </div>
    </section> : null}
    <footer className="gh-wall-distances"><span><small>{tr('Left wall', 'Kairė siena')}</small><strong>{object.xM.toFixed(2)} m</strong></span><span><small>{tr('Right wall', 'Dešinė siena')}</small><strong>{Math.max(0, map.dimensions.widthM - object.xM - object.widthM).toFixed(2)} m</strong></span><span><small>{tr('Bottom wall', 'Apatinė siena')}</small><strong>{object.yM.toFixed(2)} m</strong></span><span><small>{tr('Top wall', 'Viršutinė siena')}</small><strong>{Math.max(0, map.dimensions.lengthM - object.yM - object.lengthM).toFixed(2)} m</strong></span></footer>
  </aside>
}
