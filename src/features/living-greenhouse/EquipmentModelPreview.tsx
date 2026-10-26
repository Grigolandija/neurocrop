import { useEffect, useMemo, useRef, useState } from 'react'
import { OBJECT_LIBRARY, type GreenhouseObject, type ObjectType } from '../greenhouse-map/model'
import { ltObjectLabels } from '../greenhouse-map/components/objectLabels'
import { createLivingScene, type LivingScene } from './gpuScene'
import { objectGeometry } from './objectGeometry'
import type { VolumeField } from './sceneGeometry'
import { DEFAULT_DOOR_HEIGHT_M, DOOR_TYPES, type DoorType } from '../greenhouse-map/doorConfiguration'
import './equipment-model-preview.css'

const library = OBJECT_LIBRARY.filter(o => !['sensor-node', 'section-zone', 'text-label', 'rectangle', 'technical-zone', 'walkway', 'partition'].includes(o.type))
const descriptions: Partial<Record<ObjectType, string>> = {
  door: 'Pasirinkite durų tipą ir matmenis. Rankenos bei vyriai išlaiko įprastą dydį, kai anga platėja.',
  window: 'Lango rėmas, skersiniai, palangė ir rankena. Skaidri anga leidžia matyti patalpos vidų.',
  rack: 'Trijų aukštų metalinis stelažas su atskiromis lentynomis, statramsčiais ir standumo įstrižainėmis.',
  fan: 'Apvalus korpusas, penkios lenktos mentės, variklio stebulė ir apsauginės grotelės abiejose pusėse.',
  'growing-table': 'Vieno aukšto auginimo stalas su padėklo borteliais, atramomis ir skersiniais.',
  'ibc-tank': 'Stačiakampė talpa ant padėklo, metalinis apsauginis narvas, viršutinis dangtis ir apatinis išleidimo čiaupas.',
  'water-tank': 'Vertikali apvali vandens talpa su standumo žiedais, dangčiu ir išleidimo jungtimi.',
  'water-pump': 'Siurblio korpusas, variklis, aušinimo briaunos ir vamzdžių jungtys ant bendro pagrindo.',
  'filter-unit': 'Du vertikalūs filtrų korpusai, jungiamieji vamzdžiai ir manometras ant metalinio rėmo.',
  dehumidifier: 'Pastatomas oro sausintuvas su ratukais, įsiurbimo grotelėmis ir kondensato išleidimu.',
  'hydroponic-channel': 'Atskiri kanalai su sodinimo angomis ir atramomis.',
  'ventilation-opening': 'Rėmas ir atskiros žaliuzės, tarp kurių lieka matomi tarpai.',
  lamp: 'LED profiliai su šviesos paviršiais, aušinimo briaunomis ir pakabinimu.',
}

export default function EquipmentModelPreview() {
  const [type, setType] = useState<ObjectType>('door')
  const [rotation, setRotation] = useState(0)
  const [doorWidth, setDoorWidth] = useState(1.2)
  const [doorHeight, setDoorHeight] = useState(DEFAULT_DOOR_HEIGHT_M)
  const [doorType, setDoorType] = useState<DoorType>('single')
  const [engine, setEngine] = useState('')
  const [error, setError] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const renderer = useRef<LivingScene | null>(null)
  const item = library.find(o => o.type === type)!
  const minimumFraming = type === 'door' ? 2.7 : type === 'rack' ? 2.6 : type === 'electrical-cabinet' ? 2.2 : ['reservoir','cooling-unit'].includes(type) ? 1.8 : type === 'fan' ? 1.2 : 1.5
  const sceneSize = Math.max(...item.size, minimumFraming, type === 'door' ? Math.max(doorWidth, doorHeight * 1.2) : 0)
  const vertices = useMemo(() => {
    const [widthM, lengthM] = type === 'door' ? [doorWidth, item.size[1]] : item.size
    const angle = rotation * Math.PI / 180
    const object: GreenhouseObject = { id: 'equipment-preview', type, name: item.label, xM: 3 - widthM / 2 * Math.cos(angle) + lengthM / 2 * Math.sin(angle), yM: 2 - widthM / 2 * Math.sin(angle) - lengthM / 2 * Math.cos(angle), widthM, lengthM, rotationDeg: rotation, layerId: item.layerId, visible: true, locked: true, metadata: type === 'door' ? { door: { type: doorType, heightM: doorHeight } } : {} }
    return objectGeometry(object, { widthM: 6, lengthM: 4, heightM: 3.2 }, 3.2)
  }, [item, type, rotation, doorWidth, doorHeight, doorType])
  const current = useRef(vertices)
  const currentSize = useRef(sceneSize)
  const volume = useMemo<VolumeField>(() => ({ width: 1, height: 1, layers: 1, pixels: new Uint8Array(4), bounds: [6,4,3.2], levels: [], contours: [] }), [])
  useEffect(() => {
    current.current = vertices
    currentSize.current = sceneSize
    renderer.current?.update(vertices, sceneSize, volume)
  }, [vertices, sceneSize, volume])
  useEffect(() => {
    if (!host.current) return
    let cancelled = false
    // Frame the generated model, including equipment that follows the ceiling.
    let low=Infinity,high=-Infinity
    for(let i=1;i<current.current.length;i+=6){low=Math.min(low,current.current[i]);high=Math.max(high,current.current[i])}
    const targetHeight=Number.isFinite(low+high) ? (low+high)/2 : .95
    createLivingScene(host.current, () => {}, () => { if (!cancelled) setError(true) }, { targetHeight, elevation: .38, zoom: 1 }).then(scene => {
      if (cancelled) { scene.dispose(); return }
      renderer.current = scene
      scene.update(current.current, currentSize.current, volume)
      scene.setPresentation('points'); setEngine(scene.name)
    }).catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true; renderer.current?.dispose(); renderer.current = null }
  }, [type, volume])
  return <main className="nc-equipment-preview">
    <header><a href="/greenhouse-live/demo">← NeuroCrop</a><span>3D OBJEKTŲ BIBLIOTEKA</span><b>PERŽIŪRA</b></header>
    <div className="nep-workspace"><aside><h1>Išplanavimo objektai</h1><p>Pasirinkite objektą ir apžiūrėkite jo modelį.</p>{library.map(entry => <button key={entry.type} aria-pressed={type === entry.type} onClick={() => { setType(entry.type); setError(false); setRotation(0) }}><i className={`fa-solid ${entry.icon}`} />{ltObjectLabels[entry.type] || entry.label}</button>)}<small>Tie patys modeliai naudojami ir išsaugoto išplanavimo 3D vaizde.</small></aside>
      <section><div className="nep-title"><div><span>OBJEKTO MODELIS</span><h2>{ltObjectLabels[type] || item.label}</h2><p>{descriptions[type] || 'Atskiras įrangos modelis pagal išplanavime pasirinktą objekto tipą.'}</p></div><span>{(type === 'door' ? doorWidth : item.size[0]).toLocaleString('lt-LT')} × {item.size[1].toLocaleString('lt-LT')} m plane</span></div>
        {type === 'door' && <div className="nep-door-settings"><label>Durų tipas<select aria-label="Durų tipas" value={doorType} onChange={e => setDoorType(e.target.value as DoorType)}>{DOOR_TYPES.map(value => <option key={value} value={value}>{value === 'single' ? 'Vienvėrės' : value === 'double' ? 'Dvivėrės' : 'Stumdomos'}</option>)}</select></label><label>Angos plotis <b>{doorWidth.toLocaleString('lt-LT')} m</b><input aria-label="Durų angos plotis" type="range" min=".6" max="3" step=".1" value={doorWidth} onChange={e => setDoorWidth(Number(e.target.value))} /></label><label>Aukštis <b>{doorHeight.toLocaleString('lt-LT')} m</b><input aria-label="Durų aukštis" type="range" min="1.5" max="3" step=".1" value={doorHeight} onChange={e => setDoorHeight(Number(e.target.value))} /></label></div>}
        <div className="nep-scene" ref={host} aria-label={`${ltObjectLabels[type]} – sukamas 3D modelis`}>{error && <p role="alert">Nepavyko paleisti 3D atvaizdavimo.</p>}<div className="nep-controls"><button onClick={() => renderer.current?.reset()} aria-label="Pradinis vaizdas">⌂</button><button onClick={() => renderer.current?.zoom(.85)} aria-label="Priartinti">+</button><button onClick={() => renderer.current?.zoom(1.18)} aria-label="Atitolinti">−</button></div><span className="nep-engine">{engine} · tempkite, kad pasuktumėte</span></div>
        <footer><label>Pasukimas išplanavime <select aria-label="Pasukimas išplanavime" value={rotation} onChange={e => setRotation(Number(e.target.value))}>{[0,45,90,180,270].map(angle => <option key={angle} value={angle}>{angle}°</option>)}</select></label><p>{type === 'door' ? 'Keiskite plotį ir aukštį: pasirinktas durų tipas išlieka. Ši peržiūra nekeičia išsaugoto ūkio išplanavimo.' : 'Vieta, dydis ir pasukimas gaunami iš išplanavimo. Nepateikti įrangos aukščiai ir konstrukcijos detalės yra tipiniai, iliustraciniai.'}</p></footer>
      </section></div>
  </main>
}
