import { useState } from 'react'
import { metricDefinitions } from '../../domain/metricRegistry'
import type { DiagnosticReport } from './types'
import { prioritizeFindings, type Finding } from './findings'
import DiagnosticExplanation from './DiagnosticExplanation'
import { DiagnosticEvidence } from './DiagnosticEvidence'

type Props={report:DiagnosticReport;lt:boolean;onCheckSensors:()=>void}
export default function DiagnosticSummary({report,lt,onCheckSensors}:Props){
  const t=(a:string,b:string)=>lt?a:b
  const n=(v:number|null)=>v==null?'—':v.toLocaleString(lt?'lt-LT':'en-GB',{maximumFractionDigits:1})
  const groups=prioritizeFindings(report)
  const [selectedId,setSelected]=useState('')
  const unknown=report.insights.filter(i=>i.kind==='insufficient-data')
  const hasReadings=report.metrics.some(m=>m.observedMinutes>0)
  const label=(metric:string)=>{const d=metricDefinitions[metric as keyof typeof metricDefinitions];return d?(lt?d.labelLt:d.label):metric}
  function headline(m:Finding){
    if(m.kind==='systematic-peer'&&m.metric==='airTemp'&&m.peerDelta) return m.peerDelta>0?t('Šilčiau nei kitose zonose','Warmer than other zones'):t('Vėsiau nei kitose zonose','Cooler than other zones')
    if(m.kind==='outside-target'&&m.metric==='airTemp')return m.belowMinutes&&m.aboveMinutes?t('Pasitaiko ir per žema, ir per aukšta temperatūra','Both low and high temperature excursions'):m.belowMinutes?t('Temperatūra per žema pagal nustatytą ribą','Temperature below the configured target'):t('Temperatūra per aukšta pagal nustatytą ribą','Temperature above the configured target')
    return label(m.metric)
  }
  function explanation(m:Finding){
    const facts=(report.explanations||[]).filter(a=>a.sectionId===m.sectionId&&a.metric===m.metric).flatMap(a=>Object.entries(a.directions).map(([direction,d])=>({name:a.nodeName,direction,...d}))).sort((a,b)=>b.minutes-a.minutes)
    const fact=facts[0]
    if(fact&&m.kind==='outside-target')return t(`${fact.name}: ${fact.direction==='below'?'žemiau':'aukščiau'} ribos ${n(fact.minutes/60)} h per ${fact.days} d. Stipriausias skirtumas nuo ribos – ${n(fact.peak.departure)} ${m.unit}.`,`${fact.name}: ${fact.direction==='below'?'below':'above'} target for ${n(fact.minutes/60)} h across ${fact.days} days. Largest departure: ${n(fact.peak.departure)} ${m.unit}.`)

    if(m.kind==='systematic-peer')return t(`Skiriasi nuo kitų zonų: ${n(m.peerDelta)} ${m.unit}. Nukrypimas kartojosi ${m.recurringDays} dienas.`,`Differs from other zones: ${n(m.peerDelta)} ${m.unit}. Recurred on ${m.recurringDays} days.`)
    const below=m.observedMinutes?100*m.belowMinutes/m.observedMinutes:0,above=m.observedMinutes?100*m.aboveMinutes/m.observedMinutes:0
    return [below>0?t(`Žemiau ribos: ${n(below)} %`,`Below target: ${n(below)}%`):'',above>0?t(`Aukščiau ribos: ${n(above)} %`,`Above target: ${n(above)}%`):''].filter(Boolean).join(' · ')
  }
  return <div className="diag-summary diag-simple">
    <h2>{groups.length?t('Kur reikia dėmesio','What needs attention'):!hasReadings||unknown.length?t('Išvadai dar trūksta matavimų','More readings are needed'):t('Reikšmingų nukrypimų nenustatyta','No significant deviations detected')}</h2>
    <div className="diag-insights">{groups.map(g=><article key={g.id} className="diag-finding">
      <strong className="diag-place">{g.name}</strong>
      {g.items.map(m=><div className="diag-finding-fact" key={`${m.metric}:${m.kind}`}><h3>{headline(m)}</h3><p>{explanation(m)}</p></div>)}
      <p className="diag-first-check"><strong>{t('Pirma patikra:','First check:')}</strong> {g.items.some(m=>m.estimatedContextPct>0)?t('patvirtinkite, kokios ribos galiojo šiuo laikotarpiu.','confirm the targets that applied during this period.'):(report.explanations||[]).some(a=>a.sectionId===g.sectionId&&g.items.some(m=>m.metric===a.metric)&&Object.values(a.directions).some(d=>d.scope==='widespread'))?t('palyginkite bendrus klimato nustatymus su nukrypimų laiku.','compare greenhouse-wide climate settings with the excursion times.'):t('palyginkite šios vietos jutiklio rodmenį su kontroliniu matavimu.','compare the sensor at this location with a reference reading.')}</p>
      {g.items.some(m=>m.estimatedContextPct>0)?<small className="diag-caution">{t('Prieš keisdami nustatymus, patvirtinkite šio laikotarpio ribas.','Confirm the targets for this period before changing settings.')}</small>:null}
      <button aria-expanded={selectedId===g.id} onClick={()=>setSelected(selectedId===g.id?'':g.id)}>{selectedId===g.id?t('Suskleisti','Show less'):t('Plačiau: išvada ir patikros','Details: findings and checks')}</button>
      {selectedId===g.id?<div className="diag-expanded"><DiagnosticExplanation report={report} group={g} lt={lt}/><details className="diag-supporting"><summary>{t('Parodyti žemėlapį ir matavimų grafiką','Show map and measurement chart')}</summary><DiagnosticEvidence report={report} group={g} lt={lt}/></details></div>:null}
    </article>)}</div>
    {unknown.length||!hasReadings?<aside className="diag-data-gap"><strong>{t('Kur dar trūksta duomenų','Where evidence is missing')}</strong><p>{Array.from(new Set(unknown.map(m=>`${m.name} · ${label(m.metric)}`))).join('; ')||t('Nėra tinkamų matavimų.','No usable readings.')}</p><button onClick={onCheckSensors}>{t('Patikrinti jutiklių ryšį','Check sensor connectivity')}</button></aside>:null}
  </div>
}
