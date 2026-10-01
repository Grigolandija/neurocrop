import { useState } from 'react'
import { metricDefinitions } from '../../domain/metricRegistry'
import type { DiagnosticReport } from './types'
import { prioritizeFindings } from './findings'
import { findingNarrative } from './narrative'
import DiagnosticExplanation from './DiagnosticExplanation'
import { DiagnosticEvidence } from './DiagnosticEvidence'

type Props={report:DiagnosticReport;lt:boolean;onCheckSensors:()=>void}
export default function DiagnosticSummary({report,lt,onCheckSensors}:Props){
  const t=(a:string,b:string)=>lt?a:b
  const groups=prioritizeFindings(report)
  const [selectedId,setSelected]=useState('')
  const unknown=report.insights.filter(i=>i.kind==='insufficient-data')
  const hasReadings=report.metrics.some(m=>m.observedMinutes>0)
  const label=(metric:string)=>{const d=metricDefinitions[metric as keyof typeof metricDefinitions];return d?(lt?d.labelLt:d.label):metric}
  return <div className="diag-summary diag-simple">
    <h2>{groups.length?t('Kur reikia dėmesio','What needs attention'):!hasReadings||unknown.length?t('Išvadai dar trūksta matavimų','More readings are needed'):t('Reikšmingų nukrypimų nenustatyta','No significant deviations detected')}</h2>
    <div className="diag-insights">{groups.map(g=><article key={g.id} className="diag-finding">
      <strong className="diag-place">{g.name}</strong>
      {g.items.filter((m,index,items)=>items.findIndex(i=>i.metric===m.metric)===index).map(m=>{
        const conclusion=findingNarrative(report,m,lt)
        return <section className="diag-finding-fact" key={m.metric}>
          <h3>{conclusion.headline}</h3>
          <p>{conclusion.evidence.join(' ')}</p>
          {conclusion.pattern.length?<p><strong>{t('Kada ir kaip kartojasi.','When and how it recurs.')}</strong> {conclusion.pattern.join(' ')}</p>:null}
          {conclusion.interpretation.length?<div className="diag-interpretation"><strong>{t('Ką tai rodo.','What this indicates.')}</strong>{conclusion.interpretation.map((text,index)=><p key={index}>{text}</p>)}</div>:null}
          <p className="diag-first-check"><strong>{t('Ką tikrinti.','What to check.')}</strong> {conclusion.action}</p>
          <small className="diag-confidence">{conclusion.confidence}</small>
        </section>
      })}
      <button aria-expanded={selectedId===g.id} onClick={()=>setSelected(selectedId===g.id?'':g.id)}>{selectedId===g.id?t('Suskleisti','Show less'):t('Epizodai, jutikliai ir matavimų grafikas','Episodes, sensors and measurement chart')}</button>
      {selectedId===g.id?<div className="diag-expanded"><DiagnosticExplanation report={report} group={g} lt={lt}/><details className="diag-supporting"><summary>{t('Parodyti žemėlapį ir matavimų grafiką','Show map and measurement chart')}</summary><DiagnosticEvidence report={report} group={g} lt={lt}/></details></div>:null}
    </article>)}</div>
    {unknown.length||!hasReadings?<aside className="diag-data-gap"><strong>{t('Kur dar trūksta duomenų','Where evidence is missing')}</strong><p>{Array.from(new Set(unknown.map(m=>`${m.name} · ${label(m.metric)}`))).join('; ')||t('Nėra tinkamų matavimų.','No usable readings.')}</p><button onClick={onCheckSensors}>{t('Patikrinti jutiklių ryšį','Check sensor connectivity')}</button></aside>:null}
  </div>
}
