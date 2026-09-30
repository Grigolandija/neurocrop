import { useState } from 'react'
import GreenhouseCanvas from '../greenhouse-map/components/GreenhouseCanvas'
import { metricDefinitions } from '../../domain/metricRegistry'
import type { DiagnosticReport, DiagnosticTrace } from './types'
import type { FindingGroup } from './findings'

const noop=()=>{}
const center=(o:{xM:number;yM:number;widthM:number;lengthM:number;rotationDeg:number})=>{
  const angle=o.rotationDeg*Math.PI/180
  return {x:o.xM+Math.cos(angle)*o.widthM/2-Math.sin(angle)*o.lengthM/2,y:o.yM+o.lengthM-Math.sin(angle)*o.widthM/2-Math.cos(angle)*o.lengthM/2}
}
export function DiagnosticEvidence({report,group,lt}:{report:DiagnosticReport;group:FindingGroup;lt:boolean}){
  const t=(a:string,b:string)=>lt?a:b
  const fmt=(v:number|null|undefined)=>v==null?'—':v.toLocaleString(lt?'lt-LT':'en-GB',{maximumFractionDigits:1})
  const label=(key:string)=>{const d=metricDefinitions[key as keyof typeof metricDefinitions];return d?(lt?d.labelLt:d.label):key}
  const [chosenMetric,setMetric]=useState(group.items[0].metric)
  const metric=group.items.some(i=>i.metric===chosenMetric)?chosenMetric:group.items[0].metric
  const nodeMetrics=report.nodes.filter(n=>n.sectionId===group.sectionId&&n.metric===metric).sort((a,b)=>(b.outsideObservedPct||0)-(a.outsideObservedPct||0))
  const [chosenNode,setNode]=useState('')
  const node=nodeMetrics.find(n=>n.nodeId===chosenNode)||nodeMetrics[0]
  const trace=report.traces?.find(t=>t.nodeId===node?.nodeId&&t.sectionId===group.sectionId&&t.metric===metric)
  const map=report.diagnosticMap
  const mapped=map?.objects.filter(o=>o.type==='sensor-node'&&o.metadata.sensor?.devEui?.toLowerCase()===node?.nodeId?.toLowerCase())||[]
  const visibleMap=map?{...map,heatmapSettings:{...map.heatmapSettings,enabled:false},layers:map.layers.map(l=>({...l,visible:true,locked:true})),objects:map.objects.map(o=>({...o,visible:true,locked:true}))}:null
  const sensor=mapped[0]
  const nearby=sensor?.metadata.sensor?.installationConfirmedAt?map?.objects.filter(o=>['door','window','ventilation-opening','heater','fan'].includes(o.type)).map(o=>({name:o.name,distance:Math.hypot(center(sensor).x-center(o).x,center(sensor).y-center(o).y)})).sort((a,b)=>a.distance-b.distance)[0]:undefined
  const observation=group.items.find(i=>i.metric===metric)!
  return <section className="diag-evidence" aria-label={t('Pasirinkto pastebėjimo paaiškinimas','Selected finding explained')}>
    <header><p>{t('Pasirinkta vieta','Selected location')}</p><h2>{group.name}</h2></header>
    {new Set(group.items.map(i=>i.metric)).size>1?<div className="diag-related">{Array.from(new Set(group.items.map(i=>i.metric))).map(key=><button key={key} aria-pressed={metric===key} onClick={()=>setMetric(key)}>{label(key)}</button>)}</div>:null}
    {nodeMetrics.length?<label className="diag-node-picker">{t('Jutiklio vieta','Sensor location')}<select value={node?.nodeId||''} onChange={e=>setNode(e.target.value)}>{nodeMetrics.map(n=><option key={n.nodeId} value={n.nodeId}>{n.nodeName||n.nodeId}</option>)}</select></label>:null}
    {visibleMap?<div className="diag-location-map"><h3>{t('Vieta šiltnamyje','Location in the greenhouse')}</h3><p>{t('Pažymėtas pasirinktas jutiklis. Planas laikotarpio pabaigoje; spalvos nerodo dabartinio klimato.','The selected sensor is highlighted. Layout at the end of the period; colors do not show live climate.')}</p>{nearby?<p>{t('Artimiausias pažymėtas objektas','Nearest marked feature')}: {nearby.name} · {fmt(nearby.distance)} m {t('(iki objekto centro; tai nepatvirtina priežasties)','(to its center; this does not establish a cause)')}</p>:null}<GreenhouseCanvas map={visibleMap} mode="layout" readOnly language={lt?'lt':'en'} selectedIds={mapped.map(o=>o.id)} snap={false} onSelect={noop} onMove={noop} onUpdate={noop} onAdd={noop}/>{!mapped.length?<p>{t('Šio jutiklio vieta plane nepažymėta.','This sensor is not located on the plan.')}</p>:null}{mapped.some(o=>!o.metadata.sensor?.installationConfirmedAt)?<p>{t('Jutiklio įrengimo vieta dar nepatvirtinta.','Sensor installation location has not been confirmed.')}</p>:null}{report.mapSource==='backfill'?<p>{t('Ankstesnis planas atkurtas iš vėlesnio įrašo; vietas vertinkite atsargiai.','Earlier layout was backfilled from a later record; treat locations with care.')}</p>:null}{report.mapValidFrom&&+new Date(report.mapValidFrom)>+new Date(report.from)?<p>{t('Per šį laikotarpį planas keitėsi; ankstesnė jutiklio vieta galėjo skirtis.','The layout changed during this period; the earlier sensor location may differ.')}</p>:null}</div>:<p className="diag-map-empty">{t('Šiam laikotarpiui išsaugoto plano nėra. Vietos prie durų ar įrangos nustatyti negalime.','No saved layout is available for this period. Proximity to doors or equipment cannot be determined.')}</p>}
    <h3>{label(metric)} · {node?.nodeName||group.name}</h3>
    {node?<div className="diag-direction-stats"><article><strong>{t('Žemiau nustatytos ribos','Below the configured target')}</strong><b>{fmt(node.belowMinutes/60)} h</b><span>{t('Žemiausia užfiksuota reikšmė','Lowest recorded value')}: {fmt(node.minimum)} {node.unit}</span></article><article><strong>{t('Aukščiau nustatytos ribos','Above the configured target')}</strong><b>{fmt(node.aboveMinutes/60)} h</b><span>{t('Aukščiausia užfiksuota reikšmė','Highest recorded value')}: {fmt(node.maximum)} {node.unit}</span></article></div>:null}
    <p>{t('Trukmė skirta tik pasirinktam jutikliui. Duomenų tarpai nepriskiriami tinkamoms sąlygoms.','Durations apply only to the selected sensor. Missing observations are not counted as suitable conditions.')}</p>
    {trace?.points.length?<ObservationChart trace={trace} report={report} lt={lt} unit={node?.unit||observation.unit}/>:<p className="diag-notice">{t('Šioje ataskaitoje grafiko duomenų nėra. Išsaugotos išvados pateiktos sąraše.','This report has no chart evidence. Its recorded findings remain available in the list.')}</p>}
    {report.tracesTruncated?<p>{t('Grafikų duomenų limitas pasiektas. Rinkitės trumpesnį laikotarpį.','Chart evidence reached its limit. Choose a shorter period.')}</p>:null}
    {observation.kind==='systematic-peer'?<p>{t('Palyginimas su kitomis zonomis','Comparison with other zones')}: {fmt(observation.peerDelta)} {observation.unit}. {t('Skirtumas skaičiuotas tik sutampančiu matavimų laiku; tinkamumas augalui vertinamas atskirai.','Difference uses overlapping observations only; crop suitability is evaluated separately.')}</p>:null}
    <div className="diag-next-step"><strong>{t('Ką patikrinti','What to check')}</strong><p>{t('Pirmiausia patikrinkite, ar grafike pažymėtos ribos tinka kultūrai ir paros laikui. Tuomet pažymėtoje vietoje palyginkite jutiklio rodmenį su kontroliniu matavimu. Vien šis grafikas neįrodo įrangos gedimo.','First verify that the chart targets suit the crop and time of day. Then compare the selected sensor with a reference reading at the marked location. This chart alone does not prove equipment failure.')}</p></div>
    <details><summary>{t('Kiek galime pasitikėti šia išvada?','How reliable is this finding?')}</summary><p>{t('Pasirinkto jutiklio stebėjimo laikas','Observation coverage for this sensor')}: {fmt(node?.coveragePct)} %.</p><p>{observation.estimatedContextPct>0?t('Dalis senesnių duomenų įvertinta pagal dabartines ribas. Tai gali pakeisti išvadą.','Some older readings use current targets. This can change the conclusion.'):t('Ribos paimtos iš kartu su matavimais išsaugotos konfigūracijos.','Targets come from the configuration captured with observations.')}</p><p>{t('Grafike nerodome išgalvotų dienos ar nakties ribų. Naudojamos tik išsaugotos profilio ribos.','The chart does not invent day or night targets. Only captured profile targets are used.')}</p></details>
  </section>
}

function ObservationChart({trace,report,lt,unit}:{trace:DiagnosticTrace;report:DiagnosticReport;lt:boolean;unit:string}){
  const t=(a:string,b:string)=>lt?a:b
  const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);return (sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2}
  const [compare,setCompare]=useState(true)
  const peerHours=new Map<string,Map<string,number[]>>()
  for(const peer of report.traces||[])if(peer.metric===trace.metric&&peer.sectionId!==trace.sectionId)for(const point of peer.points){
    if(!peerHours.has(point.at))peerHours.set(point.at,new Map())
    const sections=peerHours.get(point.at)!;if(!sections.has(peer.sectionId))sections.set(peer.sectionId,[]);sections.get(peer.sectionId)!.push(point.mean)
  }
  const peers=trace.points.flatMap(p=>{const sections=peerHours.get(p.at);return sections?[{at:p.at,mean:median([...sections.values()].map(median))}]:[]})
  const points=trace.points,all=points.flatMap(p=>[p.min,p.max,...(p.target||[])])
  if(compare)all.push(...peers.map(p=>p.mean))
  let low=Math.min(...all),high=Math.max(...all);const pad=Math.max((high-low)*.12,.2);low-=pad;high+=pad
  const start=+new Date(report.from),end=+new Date(report.to)
  const x=(time:number)=>55+Math.max(0,Math.min(1,(time-start)/(end-start)))*690
  const y=(v:number)=>230-(v-low)/(high-low)*205
  const stamp=(value:string)=>new Date(value).toLocaleString(lt?'lt-LT':'en-GB',{timeZone:report.timeZone,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
  const path=points.map((p,i)=>`${i===0||+new Date(p.at)-+new Date(points[i-1].at)>3600000?'M':'L'}${x(+new Date(p.at)+1800000)},${y(p.mean)}`).join(' ')
  const peerPath=peers.map((p,i)=>`${i===0||+new Date(p.at)-+new Date(peers[i-1].at)>3600000?'M':'L'}${x(+new Date(p.at)+1800000)},${y(p.mean)}`).join(' ')
  return <div className="diag-chart">{peers.length?<label><input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)}/>{t('Palyginti su kitomis zonomis','Compare with other zones')}</label>:null}<p>{t('Valandiniai matavimai','Hourly observations')} · {unit}</p><svg viewBox="0 0 780 275" role="img" aria-label={t('Valandinė kreivė su mažiausiomis, didžiausiomis reikšmėmis ir nustatytomis ribomis','Hourly curve with recorded minima, maxima and configured targets')}>
    {[0,1,2,3,4].map(i=>{const value=low+(high-low)*i/4;return <g key={i}><line x1="55" x2="745" y1={y(value)} y2={y(value)} stroke="#dfe6df"/><text x="49" y={y(value)+4} textAnchor="end" fontSize="11">{value.toFixed(1)}</text></g>})}
    {points.map(p=>{const at=+new Date(p.at),width=Math.max(.5,x(at+3600000)-x(at));return <g key={p.at}>{p.target?<rect x={x(at)} y={y(p.target[1])} width={width} height={Math.max(1,y(p.target[0])-y(p.target[1]))} fill="#cee5cf"/>:null}<line x1={x(at+1800000)} x2={x(at+1800000)} y1={y(p.max)} y2={y(p.min)} stroke="#789eaa" strokeWidth="2"><title>{stamp(p.at)}: {p.min.toFixed(1)}–{p.max.toFixed(1)} {unit}</title></line></g>})}
    {compare?<path d={peerPath} stroke="#965f9c" strokeDasharray="5 4" strokeWidth="2" fill="none"/>:null}
    <path d={path} stroke="#184f3c" strokeWidth="2" fill="none"/>
    {[0,.5,1].map(i=><text key={i} x={x(start+(end-start)*i)} y="255" textAnchor={i===0?'start':i===1?'end':'middle'} fontSize="11">{stamp(new Date(start+(end-start)*i).toISOString())}</text>)}
  </svg>{compare&&peers.length?<p>{t('Violetinė punktyrinė linija – kitų zonų valandinių medianų mediana. Tai apžvalginis palyginimas; diagnostinis skirtumas skaičiuotas 5 min languose.','Purple dashed line: median of other zones’ hourly medians. This is an overview; the diagnostic difference uses 5-minute windows.')}</p>:null}<p className="diag-chart-legend">{t('Žalia juosta – nustatytas intervalas · Tamsi linija – valandos mėginių vidurkis · Vertikalios linijos – minimumas ir maksimumas.','Green band: configured range · Dark line: hourly sample mean · Vertical lines: recorded minimum and maximum.')}</p><p>{t('Tuščios valandos nejungiamos. Valandos be aiškių arba su keistomis ribomis neturi žalios juostos.','Empty hours are not connected. Hours with missing or changed targets have no green band.')}</p><details><summary>{t('Peržiūrėti grafiko skaičius','View chart values')}</summary><div className="diag-table-scroll"><table><thead><tr><th>{t('Laikas','Time')}</th><th>{t('Žemiausia','Lowest')}</th><th>{t('Vidurkis','Mean')}</th><th>{t('Aukščiausia','Highest')}</th><th>{t('Nustatytos ribos','Configured targets')}</th></tr></thead><tbody>{points.map(p=><tr key={p.at}><td>{stamp(p.at)}</td><td>{p.min.toFixed(1)}</td><td>{p.mean.toFixed(1)}</td><td>{p.max.toFixed(1)}</td><td>{p.target?.join('–')||'—'}</td></tr>)}</tbody></table></div></details></div>
}
