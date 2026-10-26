import { OBJECT_LIBRARY, type GreenhouseMap, type GreenhouseObject, type SensorNodeMetadata } from '../model'
import { isWallMountedType } from '../geometry'
import NumericInput from './NumericInput'
import EquipmentPlacementFields,{ EquipmentBodyHeightField } from './EquipmentPlacementFields'
import { activeEquipmentInspectorSection,type EquipmentInspector,type EquipmentInspectorSection } from '../equipmentInspector'
import EquipmentCollisionNotice from './EquipmentCollisionNotice'
import './object-inspector.css'
import { DOOR_TYPES, doorConfiguration, doorOpening, type DoorType } from '../doorConfiguration'

type Props = {
  map: GreenhouseMap
  selected: GreenhouseObject[]
  onUpdate: (id: string, patch: Partial<GreenhouseObject>) => void
  onAlign: (edge: 'left' | 'center' | 'right' | 'bottom' | 'middle' | 'top') => void
  language?: 'en' | 'lt'
  onSelect?: (id:string)=>void
  inspector?: EquipmentInspector
}

export default function ObjectPropertiesPanel({ map, selected, onUpdate, onAlign, language = 'en',onSelect,inspector }: Props) {
  const tr = (english: string, lithuanian: string) => language === 'lt' ? lithuanian : english
  if (!selected.length) return <aside className="gh-right-panel"><div className="gh-empty-selection"><span><i className="fa-solid fa-arrow-pointer" /></span><h2>{tr('No object selected', 'Objektas nepasirinktas')}</h2><p>{tr('Select an object to edit its placement and dimensions.', 'Pasirinkite objektą, kad pakeistumėte jo vietą ir matmenis.')}</p><small>{tr('Shift-click selects multiple objects.', 'Shift + paspaudimas pasirenka kelis objektus.')}</small></div></aside>

  const edgeLabels = { left: tr('left', 'kairė'), center: tr('center', 'centras'), right: tr('right', 'dešinė'), bottom: tr('bottom', 'apačia'), middle: tr('middle', 'vidurys'), top: tr('top', 'viršus') }
  if (selected.length > 1) {
    const movableCount = selected.filter((object) => !object.locked && !map.layers.find((layer) => layer.id === object.layerId)?.locked).length
    return <aside className="gh-right-panel"><section className="gh-properties"><header><small>{tr('MULTI-SELECTION', 'KELI PASIRINKIMAI')}</small><h2>{selected.length} {tr('objects selected', 'objektai pasirinkti')}</h2></header><p className="gh-muted">{movableCount >= 2 ? tr('Align selected objects to their shared bounds.', 'Lygiuokite pasirinktus objektus pagal bendras jų ribas.') : tr('Unlock at least two selected objects to align them.', 'Lygiavimui atrakinkite bent du pasirinktus objektus.')}</p><div className="gh-align-grid">
    {(['left', 'center', 'right', 'bottom', 'middle', 'top'] as const).map((edge) => <button disabled={movableCount < 2} key={edge} onClick={() => onAlign(edge)}><i className={`fa-solid fa-align-${edge === 'middle' ? 'center' : edge}`} />{edgeLabels[edge]}</button>)}
  </div></section></aside>
  }

  const object = selected[0]
  const wallMounted = isWallMountedType(object.type)
  const sensor = object.metadata.sensor
  const door = object.type === 'door' ? doorConfiguration(object, map.dimensions.heightM) : null
  const opening = doorOpening(object, map.dimensions,map.shape.type==='polygon' ? map.shape.points : undefined)
  const layerLocked = map.layers.find((layer) => layer.id === object.layerId)?.locked === true
  const placementLocked = object.locked || layerLocked
  const patchMetadata = (metadata: Partial<GreenhouseObject['metadata']>) => onUpdate(object.id, { metadata: { ...object.metadata, ...metadata } })
  const patchSensor = (update: Partial<SensorNodeMetadata>) => patchMetadata({ sensor: { ...sensor!, ...update } })
  const icon = OBJECT_LIBRARY.find((item) => item.type === object.type)?.icon || 'fa-vector-square'
  const active=inspector ? activeEquipmentInspectorSection(object,inspector.section) : null
  const panelProps=(section:EquipmentInspectorSection)=>inspector ? {role:'tabpanel',id:`${inspector.idPrefix}-panel-${section}`,'aria-labelledby':`${inspector.idPrefix}-tab-${section}`,hidden:active!==section} : {}
  const settings=<div className="gh-inspector-general-fields">
    {inspector && <label className="gh-field"><span>{tr('Name','Pavadinimas')}</span><input disabled={placementLocked} value={object.name} onChange={event=>onUpdate(object.id,{name:event.target.value})} /></label>}
    <label className="gh-field"><span>{tr('Notes','Pastabos')}</span><textarea disabled={placementLocked} value={object.metadata.notes ?? ''} placeholder={tr('Installation or planning notes…','Montavimo arba planavimo pastabos…')} onChange={event=>patchMetadata({notes:event.target.value})} /></label>
    <div className="gh-toggle-row"><label className={inspector ? 'gh-field gh-placement-lock' : undefined}>
      {inspector && <span>{tr('Placement','Vieta')}</span>}
      <span className="gh-placement-lock-control"><input disabled={layerLocked} type="checkbox" checked={object.locked} onChange={event=>onUpdate(object.id,{locked:event.target.checked})} /><span>{tr('Lock placement','Užrakinti vietą')}</span></span>
    </label></div>
  </div>


  return <aside className="gh-right-panel">
    <section className="gh-properties gh-object-inspector" data-docked={!!inspector}>
      <header><div><small>{sensor ? tr('NODE PLACEMENT', 'MAZGO VIETA') : tr('OBJECT', 'OBJEKTAS')}</small><h2>{object.name}</h2></div><span className="gh-type-badge"><i className={`fa-solid ${icon}`} /></span></header>
      {placementLocked ? <p className="gh-lock-notice"><i className="fa-solid fa-lock" />{layerLocked ? tr('This layer is locked.', 'Šis sluoksnis užrakintas.') : tr('Placement is locked.', 'Objekto vieta užrakinta.')}</p> : null}
      <div className="gh-property-groups">
        <div className="gh-inspector-panel" {...panelProps('size')}>
        {!sensor && <fieldset className="gh-property-group"><legend>{tr('Equipment', 'Įranga')}</legend><div className="gh-property-fields">
          {!inspector && <label className="gh-field"><span>{tr('Name', 'Pavadinimas')}</span><input disabled={placementLocked} value={object.name} onChange={event=>onUpdate(object.id,{name:event.target.value})} /></label>}
          {door ? <div className="gh-field-row">
            <label className="gh-field"><span>{tr('Opening width', 'Angos plotis')} <em>m</em></span><NumericInput aria-label={tr('Door opening width', 'Durų angos plotis')} disabled={placementLocked} min=".1" max={opening.maximumM} step=".05" value={Number(opening.widthM.toFixed(3))} onCommit={value=>onUpdate(object.id,{[opening.axis]:value ?? opening.widthM})} /></label>
            <label className="gh-field"><span>{tr('Height', 'Aukštis')} <em>m</em></span><NumericInput aria-label={tr('Door height', 'Durų aukštis')} disabled={placementLocked} min=".1" max={map.dimensions.heightM || 100} step=".05" value={door.heightM} onCommit={value=>patchMetadata({door:{...door,heightM:value ?? door.heightM}})} /></label>
          </div> : <div className="gh-field-row">
            <label className="gh-field"><span>{tr('Width', 'Plotis')} <em>m</em></span><NumericInput disabled={placementLocked} min=".05" max={map.dimensions.widthM} step=".05" value={Number(object.widthM.toFixed(3))} onCommit={value=>onUpdate(object.id,{widthM:value ?? object.widthM})} /></label>
            <label className="gh-field"><span>{tr('Length', 'Ilgis')} <em>m</em></span><NumericInput disabled={placementLocked} min=".05" max={map.dimensions.lengthM} step=".05" value={Number(object.lengthM.toFixed(3))} onCommit={value=>onUpdate(object.id,{lengthM:value ?? object.lengthM})} /></label>
            {inspector && <EquipmentBodyHeightField object={object} map={map} disabled={placementLocked} language={language} onChange={equipmentPlacement=>patchMetadata({equipmentPlacement})} />}
          </div>}
        </div></fieldset>}
        </div>
        <div className="gh-inspector-panel" {...panelProps('position')}>
        <fieldset className="gh-property-group"><legend>{tr('Position', 'Padėtis')}</legend><div className="gh-property-fields">
          <div className="gh-field-row">
            <label className="gh-field"><span>X <em>m</em></span><NumericInput disabled={placementLocked} min="0" max={Math.max(0,map.dimensions.widthM-(map.shape.type==='polygon' ? 0 : object.widthM))} step={map.gridSizeM} value={Number(object.xM.toFixed(3))} onCommit={value=>onUpdate(object.id,{xM:value ?? object.xM})} /></label>
            <label className="gh-field"><span>Y <em>m</em></span><NumericInput disabled={placementLocked} min="0" max={Math.max(0,map.dimensions.lengthM-(map.shape.type==='polygon' ? 0 : object.lengthM))} step={map.gridSizeM} value={Number(object.yM.toFixed(3))} onCommit={value=>onUpdate(object.id,{yM:value ?? object.yM})} /></label>
          </div>
          {!sensor && <div className="gh-field-row"><label className="gh-field"><span>{wallMounted ? tr('Mounted wall', 'Tvirtinimo siena') : tr('Rotation', 'Pasukimas')} {!wallMounted && <em>°</em>}</span>{wallMounted
            ? <input value={object.metadata.wallMount?.edgeIndex!==undefined ? `${tr('Wall','Siena')} ${object.metadata.wallMount.edgeIndex+1}` : object.metadata.wallMount?.wall ?? tr('Automatic','Automatinė')} readOnly />
            : <NumericInput disabled={placementLocked} value={Number(object.rotationDeg.toFixed(1))} onCommit={value=>onUpdate(object.id,{rotationDeg:value ?? object.rotationDeg})} />}</label></div>}
          {wallMounted && <p className="gh-placement-summary">{tr('Drag to another wall to remount.', 'Nutempkite prie kitos sienos tvirtinimui pakeisti.')}</p>}
        </div></fieldset>
        </div>
        <div className="gh-inspector-panel" {...panelProps('mounting')}>
        {!sensor && <EquipmentPlacementFields showBodyHeight={!inspector} object={object} map={map} disabled={placementLocked} language={language} onChange={equipmentPlacement=>patchMetadata({equipmentPlacement})} />}
        {door && <fieldset className="gh-property-group"><legend>{tr('Door', 'Durys')}</legend><div className="gh-property-fields">
          <label className="gh-field"><span>{tr('Door type', 'Durų tipas')}</span><select aria-label={tr('Door type', 'Durų tipas')} disabled={placementLocked} value={door.type} onChange={event=>patchMetadata({door:{...door,type:event.target.value as DoorType}})}>{DOOR_TYPES.map(type=><option key={type} value={type}>{type==='single' ? tr('Single-leaf','Vienvėrės') : type==='double' ? tr('Double-leaf','Dvivėrės') : tr('Sliding','Stumdomos')}</option>)}</select></label>
          <p className="gh-placement-summary">{tr('The 3D model follows the opening dimensions.', '3D modelis prisitaiko prie angos matmenų.')}</p>
        </div></fieldset>}
        </div>
        {inspector && <div className="gh-inspector-panel" {...panelProps('details')}>{settings}</div>}
      </div>
      {!sensor && <EquipmentCollisionNotice map={map} selectedIds={[object.id]} language={language} onSelect={onSelect} />}
      {!inspector && <details className="gh-object-options"><summary>{tr('Notes and locking','Pastabos ir užrakinimas')}</summary>{settings}</details>}
    </section>

    {sensor ? <section className="gh-properties gh-sensor-properties">
      <header><div><small>NEUROSENSE</small><h2>{tr('Node details', 'Mazgo informacija')}</h2></div><span className={`gh-status-dot ${sensor.status}`} /></header>
      <dl className="gh-node-identity">
        <div><dt>{tr('Node', 'Mazgas')}</dt><dd>{sensor.displayName || sensor.nodeId || '—'}</dd></div>
        <div><dt>DevEUI</dt><dd>{sensor.devEui || '—'}</dd></div>
        <div><dt>{tr('Section', 'Sekcija')}</dt><dd>{sensor.sectionName || tr('Unassigned', 'Nepriskirta')}</dd></div>
        <div><dt>{tr('Status', 'Būsena')}</dt><dd>{sensor.status}{sensor.batteryPercent !== undefined ? ` · ${sensor.batteryPercent}%` : ''}</dd></div>
      </dl>
      <p className="gh-muted">{tr('Node height is set in Nodes → Edit node. The 3D layout shows it automatically.', 'Mazgo aukštis įvedamas Mazgai → Redaguoti mazgą. 3D išdėstyme jis rodomas automatiškai.')}</p>
      <label className="gh-field"><span>{tr('Planned coverage', 'Planuojama aprėptis')} <em>m</em></span><NumericInput disabled={placementLocked} min=".1" step=".1" value={sensor.coverageRadiusM ?? 3} onCommit={value=>patchSensor({coverageRadiusM:value ?? sensor.coverageRadiusM ?? 3})} /></label>
      <div className="gh-radio-row"><span><small>RSSI</small><strong>{sensor.rssi ?? '—'} dBm</strong></span><span><small>SNR</small><strong>{sensor.snr ?? '—'} dB</strong></span><span><small>{tr('Last uplink', 'Paskutinis ryšys')}</small><strong>{sensor.lastSeenAt ? new Date(sensor.lastSeenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</strong></span></div>
    </section> : null}
  </aside>
}
