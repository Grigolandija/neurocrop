import { useEffect, useMemo, useRef, useState } from 'react'
import { METRICS } from '../greenhouse-map/model'
import { createLivingScene, type LivingScene } from './gpuScene'
import { climateColor, sceneGeometry } from './sceneGeometry'
import { planToScene, project } from './sceneMath'
import { createSpatialDemo, demoMetricNames, demoMetrics, demoScales, demoValue, spatialDemoMap, type DemoMetric } from './spatialDemoData'
import './spatial-workspace-demo.css'

const navigation = ['Ūkis', 'Matavimai', 'Perspėjimai', 'Veiksmai', 'Ataskaita'] as const
type Panel = typeof navigation[number]
const clock = (stamp: string) => new Date(stamp).toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vilnius' })
const number = (value: number, digits = 1) => value.toLocaleString('lt-LT', { maximumFractionDigits: digits })
const color = (value: number, metric: DemoMetric) => `rgb(${climateColor(value, demoScales[metric].min, demoScales[metric].max).map(v => Math.round(v * 255)).join(',')})`

export default function SpatialWorkspaceDemo() {
  const [demo] = useState(createSpatialDemo)
  const [metric, setMetric] = useState<DemoMetric>('air-temperature')
  const [index, setIndex] = useState(96)
  const [selected, setSelected] = useState(demo.nodes[0].id)
  const [panel, setPanel] = useState<Panel>('Ūkis')
  const [volume, setVolume] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [labels, setLabels] = useState(true)
  const [tasks, setTasks] = useState<string[]>([])
  const [engine, setEngine] = useState('')
  const [failed, setFailed] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const pins = useRef(new Map<string, HTMLButtonElement>())
  const ticks = useRef(new Map<number, HTMLSpanElement>())
  const renderer = useRef<LivingScene | null>(null)
  const frame = demo.frames[index]
  const map = useMemo(() => spatialDemoMap(demo, index), [demo, index])
  const geometry = useMemo(() => sceneGeometry(map, metric, Date.parse(frame.measuredAt), demoScales[metric], { view: 'volume', schematic: true }), [map, metric, frame.measuredAt])
  const current = useRef(geometry)
  const selectedIndex = Math.max(0, demo.nodes.findIndex(n => n.id === selected))
  const node = demo.nodes[selectedIndex]
  const reading = frame.readings[selectedIndex]
  const height = node.metadata.sensor!.installationHeightM!
  const unit = METRICS[metric].unit
  const digits = METRICS[metric].decimals
  const values = frame.readings.map(r => demoValue(r, metric))
  const temperatures = frame.readings.map(r => r.airTemperatureC!)
  const alerts = temperatures.flatMap((v, i) => v > 22.5 ? [{ node: demo.nodes[i], value: v }] : [])
  const selectedValues = demo.frames.map(f => demoValue(f.readings[selectedIndex], metric))
  const graphMin = Math.min(...selectedValues) - .2, graphMax = Math.max(...selectedValues) + .2
  const graph = selectedValues.map((v, i) => `${i ? 'L' : 'M'}${10 + i / 96 * 260},${92 - (v - graphMin) / (graphMax - graphMin) * 76}`).join(' ')
  const choose = (id: string) => { setSelected(id); setPanel('Ūkis'); renderer.current?.invalidate() }

  useEffect(() => {
    current.current = geometry
    renderer.current?.update(geometry.vertices, 8, geometry.volume)
  }, [geometry])
  useEffect(() => {
    if (!host.current) return
    let cancelled = false
    createLivingScene(host.current, (matrix, width, viewportHeight) => {
      const occupied: Array<{ x: number; y: number; width: number; height: number }> = [{ x: 0, y: 0, width: 210, height: 100 }]
      const ordered = current.current.sensors.slice().sort((a, b) => Number(pins.current.get(b.object.id)?.classList.contains('is-selected')) - Number(pins.current.get(a.object.id)?.classList.contains('is-selected')))
      for (const sensor of ordered) {
        const pin = pins.current.get(sensor.object.id)
        if (!pin) continue
        const p = project(planToScene(sensor.object.xM + sensor.object.widthM / 2, sensor.object.yM + sensor.object.lengthM / 2, sensor.heightM ?? 0, demo.map.dimensions), matrix, width, viewportHeight)
        pin.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`
        pin.style.visibility = p.visible && p.x > 8 && p.x < width - 8 && p.y > 8 && p.y < viewportHeight - 8 ? 'visible' : 'hidden'
        pin.style.zIndex = String(pin.classList.contains('is-selected') ? 100 : 20 + Math.round((sensor.heightM ?? 0) * 10))
        const label = pin.querySelector('span')!
        const lw = label.offsetWidth, lh = label.offsetHeight
        const offsets = [[-lw / 2, -lh - 15], [-lw / 2, -lh - 58], [-lw / 2, 15], [18, -lh / 2], [-lw - 18, -lh / 2], [-lw / 2, -lh - 100]]
        const candidates = offsets.map(([dx, dy]) => ({ x: Math.max(8, Math.min(width - lw - 8, p.x + dx)), y: Math.max(8, Math.min(viewportHeight - lh - 70, p.y + dy)), width: lw, height: lh }))
        const overlaps = (a: typeof candidates[number], b: typeof candidates[number]) => a.x < b.x + b.width + 5 && a.x + a.width + 5 > b.x && a.y < b.y + b.height + 5 && a.y + a.height + 5 > b.y
        const placement = candidates.find(candidate => !occupied.some(rect => overlaps(candidate, rect))) ?? candidates[0]
        occupied.push(placement)
        label.style.left = `${16 + placement.x - p.x}px`; label.style.top = `${16 + placement.y - p.y}px`
        label.style.bottom = 'auto'; label.style.transform = 'none'
        const leader = pin.querySelector('line')!
        leader.setAttribute('x2', String(16 + Math.max(placement.x, Math.min(p.x, placement.x + lw)) - p.x))
        leader.setAttribute('y2', String(16 + Math.max(placement.y, Math.min(p.y, placement.y + lh)) - p.y))
      }
      for (const [heightM, element] of ticks.current) {
        const p = project([-4.35, heightM, 2.5], matrix, width, viewportHeight)
        element.style.transform = `translate(${p.x - 14}px,${p.y}px) translate(-100%,-50%)`
        element.style.visibility = p.visible && p.x > 30 && p.x < width ? 'visible' : 'hidden'
      }
    }, () => { if (!cancelled) setFailed(true) }, { targetHeight: 1.15, elevation: .58, zoom: .98 }).then(scene => {
      if (cancelled) { scene.dispose(); return }
      renderer.current = scene
      scene.update(current.current.vertices, 8, current.current.volume)
      scene.setPresentation('volume', false, true)
      setEngine(scene.name)
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true; renderer.current?.dispose(); renderer.current = null }
  }, [demo])
  useEffect(() => { renderer.current?.setPresentation(volume ? 'volume' : 'points', false, true) }, [volume, engine])
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => setIndex(i => (i + 1) % 97), 450)
    return () => clearInterval(timer)
  }, [playing])
  const addTask = () => setTasks(previous => previous.includes(node.id) ? previous : [...previous, node.id])

  return <div className="nc-spatial-demo">
    <header className="nsd-header">
      <a href="/" className="nsd-brand"><span>✦</span> NeuroCrop</a>
      <nav aria-label="Demonstracijos navigacija">{navigation.map(item => <button key={item} aria-current={panel === item ? 'page' : undefined} onClick={() => setPanel(item)}>{item}{item === 'Perspėjimai' && alerts.length > 0 && <b>{alerts.length}</b>}{item === 'Veiksmai' && tasks.length > 0 && <b>{tasks.length}</b>}</button>)}</nav>
      <span className="nsd-demo-badge">DEMO</span>
    </header>
    <div className="nsd-notice"><span>Interaktyvi koncepcija</span> Pavyzdinis planas ir sintetiniai matavimai. Pakeitimai lieka šioje demonstracijoje.</div>
    <div className="nsd-workspace">
      <aside className="nsd-tree">
        <p className="nsd-eyebrow">MANO ŪKIS</p><h2>Šiltnamis 1 <small>8 × 5 m</small></h2>
        <p className="nsd-tree-heading">Sensoriai <span>6</span></p>
        {demo.nodes.map(n => <button key={n.id} className={selected === n.id ? 'is-selected' : ''} onClick={() => choose(n.id)}><i />{n.name}<small>{number(n.metadata.sensor!.installationHeightM!)} m</small></button>)}
        <p className="nsd-tree-heading">Patalpos objektai</p>
        {demo.map.objects.filter(o => o.type !== 'sensor-node').map(o => <div className="nsd-tree-object" key={o.id}><i className={`fa-solid ${o.type === 'door' ? 'fa-door-open' : 'fa-table-cells-large'}`} />{o.name}</div>)}
        <div className="nsd-tree-note">Schemai pakanka patalpos matmenų, objektų vietų ir sensorių aukščių.</div>
      </aside>
      <main className="nsd-main">
        <div className="nsd-toolbar"><div><h1>Šiltnamis 1</h1><span>3D darbo aplinka</span></div><label className="nsd-metric"><span className="sr-only">Rodiklis</span><select aria-label="Rodiklis" value={metric} onChange={e => setMetric(e.target.value as DemoMetric)}>{demoMetrics.map(m => <option key={m} value={m}>{demoMetricNames[m]}</option>)}</select></label><div className="nsd-segments"><button aria-pressed={volume} onClick={() => setVolume(true)}>Mikroklimatas</button><button aria-pressed={!volume} onClick={() => setVolume(false)}>Taškai</button></div></div>
        <div className="nsd-scene" ref={host} aria-label="Sukamas 3D patalpos modelis">
          <div className="nsd-scene-info"><span className="nsd-eyebrow">{index === 96 ? 'DABAR' : 'ISTORIJA'} · {clock(frame.measuredAt)}</span><strong>{number(Math.min(...values), digits)}–{number(Math.max(...values), digits)} {unit}</strong><span>6 sensoriai · 0,6–2,7 m aukštyje</span></div>
          <div className="nsd-pins" data-labels={labels}>{geometry.sensors.map((sensor, i) => <button ref={element => { if (element) pins.current.set(sensor.object.id, element); else pins.current.delete(sensor.object.id) }} key={sensor.object.id} className={`nsd-pin ${selected === sensor.object.id ? 'is-selected' : ''}`} aria-label={`${sensor.object.name}, ${number(values[i], digits)} ${unit}, aukštis ${number(sensor.heightM!)} m`} onClick={() => choose(sensor.object.id)} style={{ '--sensor-color': color(values[i], metric) } as React.CSSProperties}><svg className="nsd-label-leader" aria-hidden="true"><line x1="16" y1="16" x2="16" y2="0" /></svg><i /><span><b>{number(values[i], digits)} <small>{unit}</small></b><em>{number(sensor.heightM!)} m</em></span></button>)}{[0, 1, 2, 3].map(h => <span className="nsd-height-tick" key={h} ref={element => { if (element) ticks.current.set(h, element); else ticks.current.delete(h) }}>{h} m</span>)}</div>
          {failed && <div className="nsd-render-error" role="alert">Nepavyko paleisti 3D. Matavimai ir istorija lieka pasiekiami šoniniame skydelyje.</div>}
          {!engine && !failed && <div className="nsd-loading">Ruošiamas 3D vaizdas…</div>}
          <div className="nsd-camera"><button title="Pradinis vaizdas" aria-label="Pradinis vaizdas" onClick={() => renderer.current?.reset()}>⌂</button><button title="Vaizdas iš viršaus" aria-label="Vaizdas iš viršaus" onClick={() => renderer.current?.reset(true)}>▦</button><button aria-label="Priartinti" onClick={() => renderer.current?.zoom(.85)}>+</button><button aria-label="Atitolinti" onClick={() => renderer.current?.zoom(1.18)}>−</button><button aria-pressed={labels} title="Matavimų etiketės" onClick={() => setLabels(v => !v)}>Aa</button></div>
          <div className="nsd-legend"><span>{demoMetricNames[metric]} · {unit}</span><div /><p><b>{number(demoScales[metric].min, digits)}</b><span>Spalva = vertė</span><b>{number(demoScales[metric].max, digits)}</b></p></div>
        </div>
        <div className="nsd-timeline"><button className="nsd-play" aria-label={playing ? 'Sustabdyti istoriją' : 'Paleisti istoriją'} onClick={() => { if (!playing && index === 96) setIndex(0); setPlaying(v => !v) }}>{playing ? 'Ⅱ' : '▶'}</button><div className="nsd-time-value"><b>{clock(frame.measuredAt)}</b><span>{new Date(frame.measuredAt).toLocaleDateString('lt-LT', { month: '2-digit', day: '2-digit', timeZone: 'Europe/Vilnius' })}</span></div><label className="nsd-time-slider"><span className="sr-only">Pavyzdinės paros laikas</span><input aria-label="Pavyzdinės paros laikas" type="range" min="0" max="96" value={index} onChange={e => { setIndex(Number(e.target.value)); setPlaying(false) }} /><span><b>Prieš 24 val.</b><b>Pavyzdinė paros istorija · Europe/Vilnius</b><b>Dabar</b></span></label><button className="nsd-now" onClick={() => { setIndex(96); setPlaying(false) }}>Dabar</button></div>
        <footer className="nsd-explanation"><span><i /> Taškai – matavimai nurodytame aukštyje.</span><span>Spalvinis tūris – įvertis tarp sensorių; už jų aukščių ribų duomenų atrama silpnesnė.</span><small>{engine}</small></footer>
      </main>
      <aside className="nsd-inspector" aria-label="Pasirinkto objekto duomenys">
        {panel === 'Ūkis' && <>
          <p className="nsd-eyebrow">PASIRINKTAS SENSORIUS</p><h2>{node.name}</h2><span className="nsd-online"><i /> Pavyzdinis matavimas · {clock(frame.measuredAt)}</span>
          <div className="nsd-big-value">{number(demoValue(reading, metric), digits)} <small>{unit}</small></div><p className="nsd-muted">{demoMetricNames[metric]}</p>
          <div className="nsd-properties"><div><span>Aukštis nuo grindų</span><b>{number(height)} m</b></div><div><span>Baterija</span><b>{node.metadata.sensor!.batteryPercent} %</b></div><div><span>Vieta plane (X / Y)</span><b>{number(node.xM + .08, 2)} / {number(node.yM + .08, 2)} m</b></div></div>
          <h3>Paskutinės 24 valandos</h3><div className="nsd-chart"><span>{number(graphMax, digits)} {unit}</span><svg viewBox="0 0 280 110" role="img" aria-label={`${node.name}: ${demoMetricNames[metric]} per parą`}><path d="M10 28H270 M10 60H270 M10 92H270" className="nsd-chart-grid" /><path d={graph} className="nsd-chart-line" /><line x1={10 + index / 96 * 260} x2={10 + index / 96 * 260} y1="10" y2="100" className="nsd-chart-cursor" /><circle cx={10 + index / 96 * 260} cy={92 - (demoValue(reading, metric) - graphMin) / (graphMax - graphMin) * 76} r="4" /></svg><div><span>{clock(demo.frames[0].measuredAt)}</span><span>{clock(demo.frames[96].measuredAt)}</span></div></div>
          <h3>Kiti matavimai</h3><div className="nsd-properties">{demoMetrics.filter(m => m !== metric).map(m => <button key={m} onClick={() => setMetric(m)}><span>{demoMetricNames[m]}</span><b>{number(demoValue(reading, m), METRICS[m].decimals)} {METRICS[m].unit} →</b></button>)}</div>
          <button className="nsd-primary" onClick={addTask}>{tasks.includes(node.id) ? '✓ Patikra pridėta į veiksmus' : '+ Pridėti sensoriaus patikrą'}</button><p className="nsd-small-note">Tai parodo, kaip nuo objekto pereinama prie duomenų ir veiksmo. Užduotis saugoma tik šioje demo sesijoje.</p>
        </>}
        {panel === 'Matavimai' && <><p className="nsd-eyebrow">VISI SENSORIAI</p><h2>Matavimai</h2><p className="nsd-muted">{demoMetricNames[metric]} · {clock(frame.measuredAt)}</p>{demo.nodes.map((n, i) => <button className="nsd-result" key={n.id} onClick={() => choose(n.id)}><span><b>{n.name}</b><small>{number(n.metadata.sensor!.installationHeightM!)} m aukštyje</small></span><strong>{number(values[i], digits)} {unit} →</strong></button>)}</>}
        {panel === 'Perspėjimai' && <><p className="nsd-eyebrow">PAVYZDINĖ TAISYKLĖ</p><h2>Perspėjimai</h2><p className="nsd-muted">Demo taisyklė: oro temperatūra virš 22,5 °C. Tai nėra agronominė rekomendacija.</p>{alerts.length ? alerts.map(alert => <button className="nsd-result" key={alert.node.id} onClick={() => { setMetric('air-temperature'); choose(alert.node.id) }}><span><b>{alert.node.name}</b><small>Virš demo ribos</small></span><strong>{number(alert.value)} °C →</strong></button>) : <div className="nsd-empty">Šiuo pavyzdinės istorijos metu riba neviršyta.</div>}</>}
        {panel === 'Veiksmai' && <><p className="nsd-eyebrow">DEMO SESIJA</p><h2>Veiksmai</h2>{tasks.length ? tasks.map(id => <div className="nsd-task" key={id}><b>Patikrinti {demo.nodes.find(n => n.id === id)!.name}</b><span>Patikrinti sensoriaus vietą ir matavimą.</span><button onClick={() => setTasks(t => t.filter(task => task !== id))}>Pažymėti atlikta ✓</button></div>) : <div className="nsd-empty">Pasirinkite sensorių ir pridėkite jo patikrą.</div>}</>}
        {panel === 'Ataskaita' && <><p className="nsd-eyebrow">PASIRINKTAS LAIKAS · {clock(frame.measuredAt)}</p><h2>Patalpos santrauka</h2><div className="nsd-properties"><div><span>Matavimai / sensoriai</span><b>6 / 6</b></div><div><span>Skirtingi aukščiai</span><b>6</b></div><div><span>Oro temperatūra</span><b>{number(Math.min(...temperatures))}–{number(Math.max(...temperatures))} °C</b></div><div><span>Skirtumas tarp sensorių</span><b>{number(Math.max(...temperatures) - Math.min(...temperatures))} °C</b></div></div><p className="nsd-small-note">Skirtumas apima ir horizontalų atstumą, ir aukštį. Šie sensoriai nematuoja vienos vertikalios kolonos, todėl iš jų negalima atskirai nustatyti vertikalaus temperatūros gradiento.</p><h3>Ką šiuo būdu galima matyti?</h3><p className="nsd-muted">Kur yra matavimas, kokiame aukštyje jis gautas ir kaip keičiasi kartu su kitais patalpos matavimais.</p><h3>Ko tai nepatvirtina?</h3><p className="nsd-muted">Oro srautų, tikslios reikšmės kiekviename tūrio taške ar augalų būklės. Spalvinis laukas yra interpoliacija.</p></>}
      </aside>
    </div>
  </div>
}
