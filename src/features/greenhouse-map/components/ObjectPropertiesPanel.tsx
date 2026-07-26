import { METRICS, OBJECT_LIBRARY, type GreenhouseMap, type GreenhouseObject, type NodeStatus, type SensorNodeMetadata } from '../model'
import { isWallMountedType } from '../geometry'
import NumericInput from './NumericInput'

type Props = {
  map: GreenhouseMap
  selected: GreenhouseObject[]
  onUpdate: (id: string, patch: Partial<GreenhouseObject>) => void
  onAlign: (edge: 'left' | 'center' | 'right' | 'bottom' | 'middle' | 'top') => void
  language?: 'en' | 'lt'
}
export default function ObjectPropertiesPanel({ map, selected, onUpdate, onAlign, language = 'en' }: Props) {
  const tr = (english: string, lithuanian: string) => language === 'lt' ? lithuanian : english
  if (!selected.length) return <aside className="gh-right-panel"><div className="gh-empty-selection"><span><i className="fa-solid fa-arrow-pointer" /></span><h2>{tr('No object selected', 'Objektas nepasirinktas')}</h2><p>{tr('Select an object on the plan to inspect exact coordinates, dimensions and operational data.', 'Pasirinkite objektą plane, kad matytumėte koordinates, matmenis ir veikimo duomenis.')}</p><small>{tr('Shift-click to select multiple objects.', 'Shift + paspaudimas pasirenka kelis objektus.')}</small></div></aside>
  if (selected.length > 1) return <aside className="gh-right-panel"><section className="gh-properties"><header><small>MULTI-SELECTION</small><h2>{selected.length} objects selected</h2></header><p className="gh-muted">Align selected objects to their shared bounds.</p><div className="gh-align-grid">
    {(['left', 'center', 'right', 'bottom', 'middle', 'top'] as const).map((edge) => <button key={edge} onClick={() => onAlign(edge)}><i className={`fa-solid fa-align-${edge === 'middle' ? 'center' : edge}`} />{edge}</button>)}
  </div></section></aside>
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
      <header><div><small>OBJECT INSPECTOR</small><h2>{object.name}</h2></div><span className="gh-type-badge"><i className={`fa-solid ${OBJECT_LIBRARY.find((item) => item.type === object.type)?.icon}`} /></span></header>
      <label className="gh-field wide"><span>Name</span><input value={object.name} onChange={(event) => onUpdate(object.id, { name: event.target.value })} /></label>
      <label className="gh-field wide"><span>Type</span><select value={object.type} onChange={(event) => onUpdate(object.id, { type: event.target.value as GreenhouseObject['type'] })}>{OBJECT_LIBRARY.map((item) => <option value={item.type} key={item.type}>{item.label}</option>)}</select></label>
      <div className="gh-coordinate-box"><span>POSITION · ORIGIN LOWER LEFT</span><div className="gh-field-row">
        <label className="gh-field"><span>X <em>m</em></span><NumericInput step={map.gridSizeM} value={Number(object.xM.toFixed(3))} onCommit={(value) => onUpdate(object.id, { xM: value ?? object.xM })} /></label>
        <label className="gh-field"><span>Y <em>m</em></span><NumericInput step={map.gridSizeM} value={Number(object.yM.toFixed(3))} onCommit={(value) => onUpdate(object.id, { yM: value ?? object.yM })} /></label>
      </div></div>
      {sensor ? <label className="gh-field wide"><span>Automatic marker size <em>m</em></span><input value={Number(object.widthM.toFixed(3))} readOnly /><small>Calculated from greenhouse scale.</small></label> : <div className="gh-field-row">
        <label className="gh-field"><span>Width <em>m</em></span><NumericInput min=".05" step=".05" value={Number(object.widthM.toFixed(3))} onCommit={(value) => onUpdate(object.id, { widthM: value ?? object.widthM })} /></label>
        <label className="gh-field"><span>Length <em>m</em></span><NumericInput min=".05" step=".05" value={Number(object.lengthM.toFixed(3))} onCommit={(value) => onUpdate(object.id, { lengthM: value ?? object.lengthM })} /></label>
      </div>}
      <div className="gh-field-row">
        {wallMounted ? <label className="gh-field"><span>{tr('Mounted wall', 'Tvirtinimo siena')}</span><input value={object.metadata.wallMount?.wall ?? tr('Automatic', 'Automatinė')} readOnly /></label> : <label className="gh-field"><span>Rotation <em>°</em></span><NumericInput value={Number(object.rotationDeg.toFixed(1))} onCommit={(value) => onUpdate(object.id, { rotationDeg: value ?? object.rotationDeg })} /></label>}
        <label className="gh-field"><span>Layer</span><select value={object.layerId} onChange={(event) => onUpdate(object.id, { layerId: event.target.value })}>{map.layers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      </div>
      {wallMounted ? <p className="gh-muted"><i className="fa-solid fa-magnet" /> {tr('This object stays attached to the nearest perimeter wall. Drag it toward another wall to remount it.', 'Šis objektas lieka pritvirtintas prie artimiausios perimetro sienos. Nutempkite prie kitos sienos, kad pakeistumėte tvirtinimą.')}</p> : null}
      <div className="gh-toggle-row">
        <label><input type="checkbox" checked={object.visible} onChange={(event) => onUpdate(object.id, { visible: event.target.checked })} /><span>Visible</span></label>
        <label><input type="checkbox" checked={object.locked} onChange={(event) => onUpdate(object.id, { locked: event.target.checked })} /><span>Locked</span></label>
      </div>
      <label className="gh-field wide"><span>Status</span><input value={object.metadata.status ?? ''} placeholder="Optional status" onChange={(event) => patchMetadata({ status: event.target.value })} /></label>
      <label className="gh-field wide"><span>Notes</span><textarea value={object.metadata.notes ?? ''} placeholder="Installation or planning notes…" onChange={(event) => patchMetadata({ notes: event.target.value })} /></label>
    </section>
    {sensor ? <section className="gh-properties gh-sensor-properties">
      <header><div><small>NEUROSENSE DATA</small><h2>Node configuration</h2></div><span className={`gh-status-dot ${sensor.status}`} /></header>
      <div className="gh-node-summary"><div><span>Air</span><strong>{measurements?.airTemperatureC ?? '—'}°C</strong></div><div><span>RH</span><strong>{measurements?.relativeHumidityPercent ?? '—'}%</strong></div><div><span>CO₂</span><strong>{measurements?.co2Ppm ?? '—'}<small> ppm</small></strong></div><div><span>VPD</span><strong>{measurements?.vpdKpa ?? '—'}<small> kPa</small></strong></div></div>
      <label className="gh-field wide"><span>Node ID</span><input value={sensor.nodeId ?? ''} onChange={(event) => patchSensor({ nodeId: event.target.value })} /></label>
      <label className="gh-field wide"><span>DevEUI</span><input value={sensor.devEui ?? ''} onChange={(event) => patchSensor({ devEui: event.target.value })} /></label>
      <label className="gh-field wide"><span>Display name</span><input value={sensor.displayName ?? ''} onChange={(event) => patchSensor({ displayName: event.target.value })} /></label>
      <div className="gh-field-row"><label className="gh-field"><span>Area</span><input value={sensor.areaId ?? ''} onChange={(event) => patchSensor({ areaId: event.target.value })} /></label><label className="gh-field"><span>Height <em>m</em></span><NumericInput allowEmpty min="0" value={sensor.installationHeightM} onCommit={(value) => patchSensor({ installationHeightM: value })} /></label></div>
      <div className="gh-field-row"><label className="gh-field"><span>Model</span><input value={sensor.model ?? ''} onChange={(event) => patchSensor({ model: event.target.value })} /></label><label className="gh-field"><span>Status</span><select value={sensor.status} onChange={(event) => patchSensor({ status: event.target.value as NodeStatus })}><option>online</option><option>warning</option><option>offline</option><option>unassigned</option><option value="low-battery">low battery</option><option value="stale">stale data</option></select></label></div>
      <div className="gh-field-row"><label className="gh-field"><span>Battery <em>%</em></span><NumericInput allowEmpty min="0" max="100" value={sensor.batteryPercent} onCommit={(value) => patchSensor({ batteryPercent: value })} /></label><label className="gh-field"><span>Coverage <em>m</em></span><NumericInput min=".1" step=".1" value={sensor.coverageRadiusM ?? 3} onCommit={(value) => patchSensor({ coverageRadiusM: value ?? sensor.coverageRadiusM ?? 3 })} /></label></div>
      <div className="gh-radio-row"><span><small>RSSI</small><strong>{sensor.rssi ?? '—'} dBm</strong></span><span><small>SNR</small><strong>{sensor.snr ?? '—'} dB</strong></span><span><small>Last uplink</small><strong>{sensor.lastSeenAt ? new Date(sensor.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</strong></span></div>
      <label className="gh-field wide"><span>Active sensors</span><input value={sensor.sensors.join(', ')} onChange={(event) => patchSensor({ sensors: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></label>
      <div className="gh-measurement-list">{(Object.keys(METRICS) as Array<keyof typeof METRICS>).map((key) => <span key={key}><small>{METRICS[key].label}</small><strong>{String(measurements?.[METRICS[key].field] ?? '—')} {METRICS[key].unit}</strong></span>)}</div>
      <div className="gh-installation-check">
        <h3><i className="fa-solid fa-screwdriver-wrench" />{tr('Installation check', 'Montavimo patikra')}</h3>
        <p data-tone={sensor.sectionId ? 'good' : 'warning'}>{sensor.sectionId ? tr(`Assigned to ${sensor.sectionName || 'a Section'}`, `Priskirtas prie ${sensor.sectionName || 'Section'}`) : tr('Not assigned to a Section', 'Nepriskirtas prie Section')}</p>
        <p data-tone={nearestNodeDistance === null || nearestNodeDistance >= suggestedSpacing * .55 ? 'good' : 'warning'}>{nearestNodeDistance === null ? tr('First node in this Area', 'Pirmasis node šioje Area') : tr(`Nearest node ${nearestNodeDistance.toFixed(1)} m · suggested spacing about ${suggestedSpacing.toFixed(1)} m`, `Artimiausias node ${nearestNodeDistance.toFixed(1)} m · siūlomas tarpas apie ${suggestedSpacing.toFixed(1)} m`)}</p>
        <p>{tr('Recommended starting height: 1.2–1.8 m above crop level; confirm against the installed sensor type and crop canopy.', 'Rekomenduojamas pradinis aukštis: 1,2–1,8 m virš augalų; patikslinkite pagal jutiklio tipą ir augalų lają.')}</p>
        <button className={sensor.installationConfirmedAt ? 'confirmed' : ''} type="button" onClick={() => patchSensor({ installationConfirmedAt: sensor.installationConfirmedAt ? undefined : new Date().toISOString() })}><i className={`fa-solid ${sensor.installationConfirmedAt ? 'fa-circle-check' : 'fa-location-dot'}`} />{sensor.installationConfirmedAt ? `${tr('Installed', 'Sumontuota')} · ${new Date(sensor.installationConfirmedAt).toLocaleDateString()}` : tr('Confirm physical installation', 'Patvirtinti fizinį montavimą')}</button>
      </div>
    </section> : null}
    <footer className="gh-wall-distances"><span><small>Left wall</small><strong>{object.xM.toFixed(2)} m</strong></span><span><small>Right wall</small><strong>{Math.max(0, map.dimensions.widthM - object.xM - object.widthM).toFixed(2)} m</strong></span><span><small>Bottom wall</small><strong>{object.yM.toFixed(2)} m</strong></span><span><small>Top wall</small><strong>{Math.max(0, map.dimensions.lengthM - object.yM - object.lengthM).toFixed(2)} m</strong></span></footer>
  </aside>
}
