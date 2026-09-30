import { useState } from 'react'
import { metricDefinitions } from '../../domain/metricRegistry'
import type { DiagnosticReport } from './types'
import { prioritizeFindings, type Finding } from './findings'
import { DiagnosticEvidence } from './DiagnosticEvidence'

type Props={report:DiagnosticReport;lt:boolean;onCheckSensors:()=>void}
export default function DiagnosticSummary({report,lt,onCheckSensors}:Props){
  const t=(a:string,b:string)=>lt?a:b
  const n=(v:number|null)=>v==null?'—':v.toLocaleString(lt?'lt-LT':'en-GB',{maximumFractionDigits:1})
  const groups=prioritizeFindings(report)
  const [selectedId,setSelected]=useState('')
  const selected=groups.find(g=>g.id===selectedId)||groups[0]
  const unknown=report.insights.filter(i=>i.kind==='insufficient-data')
  const hasReadings=report.metrics.some(m=>m.observedMinutes>0)
  const label=(metric:string)=>{const d=metricDefinitions[metric as keyof typeof metricDefinitions];return d?(lt?d.labelLt:d.label):metric}
  function headline(m:Finding){
    if(m.kind==='systematic-peer'&&m.metric==='airTemp'&&m.peerDelta) return m.peerDelta>0?t('Šilčiau nei kitose zonose','Warmer than other zones'):t('Vėsiau nei kitose zonose','Cooler than other zones')
    if(m.kind==='outside-target'&&m.metric==='airTemp')return m.belowMinutes&&m.aboveMinutes?t('Pasitaiko ir per žema, ir per aukšta temperatūra','Both low and high temperature excursions'):m.belowMinutes?t('Temperatūra per žema pagal nustatytą ribą','Temperature below the configured target'):t('Temperatūra per aukšta pagal nustatytą ribą','Temperature above the configured target')
    return label(m.metric)
  }
  function explanation(m:Finding){
    if(m.kind==='systematic-peer')return t(`Skiriasi nuo kitų zonų: ${n(m.peerDelta)} ${m.unit}. Nukrypimas kartojosi ${m.recurringDays} dienas.`,`Differs from other zones: ${n(m.peerDelta)} ${m.unit}. Recurred on ${m.recurringDays} days.`)
    const below=m.observedMinutes?100*m.belowMinutes/m.observedMinutes:0,above=m.observedMinutes?100*m.aboveMinutes/m.observedMinutes:0
    return [below>0?t(`Žemiau ribos: ${n(below)} %`,`Below target: ${n(below)}%`):'',above>0?t(`Aukščiau ribos: ${n(above)} %`,`Above target: ${n(above)}%`):''].filter(Boolean).join(' · ')
  }
  return <div className="diag-summary">
    <div className="diag-verdict"><h2>{groups.length?t('Kas šiame šiltnamyje verta dėmesio','What needs attention in this greenhouse'):!hasReadings||unknown.length?t('Išvadai dar trūksta matavimų','More readings are needed'):t('Šios patikros reikšmingų nukrypimų neparodė','These checks found no significant deviations')}</h2><p>{t('Visi turimi rodikliai įvertinti kartu. Pirmiau rodomi stipresni, ilgesni ir pasikartojantys nukrypimai, atsižvelgiant į duomenų patikimumą.','All available metrics are checked together. Priority reflects severity, time outside targets, recurrence and evidence reliability.')}</p></div>
    {groups.length?<div className="diag-review-layout"><div className="diag-insights"><p className="diag-list-help">{t('Pasirinkite pastebėjimą — jo vieta ir grafikas rodomi šalia.','Select a finding to see its location and chart.')} {t('Procentai – stebėto jutiklių laiko dalis.','Percentages describe observed sensor time.')}</p>{groups.map((g,index)=><article key={g.id} className="diag-finding" data-selected={selected?.id===g.id}><div className="diag-finding-location"><span>{String(index+1).padStart(2,'0')}</span><strong>{g.name}</strong></div>{g.items.map(m=><div className="diag-finding-fact" key={`${m.metric}:${m.kind}`}><h3>{headline(m)}</h3><p>{explanation(m)}</p></div>)}<button aria-pressed={selected?.id===g.id} onClick={()=>{setSelected(g.id);if(window.innerWidth<1000)requestAnimationFrame(()=>document.querySelector('.diag-evidence')?.scrollIntoView({behavior:'smooth',block:'start'}))}}>{t('Vieta ir grafikas','Location & chart')} →</button>{g.items.some(m=>m.estimatedContextPct>0)?<small className="diag-caution">{t('Dalis ankstesnių ribų nepatvirtinta.','Some historical targets are unverified.')}</small>:null}</article>)}</div>{selected?<DiagnosticEvidence key={`${selected.id}:${report.from}:${report.to}`} report={report} group={selected} lt={lt}/>:null}</div>:<p>{t('Tai nėra patvirtinimas, kad visos sąlygos tinkamos. Vertinami tik turimi duomenys ir nustatytos ribos.','This does not confirm that every condition is suitable. Checks use available readings and configured targets.')}</p>}
    {unknown.length||!hasReadings?<aside className="diag-data-gap"><strong>{t('Kur dar trūksta duomenų','Where evidence is still missing')}</strong><p>{Array.from(new Set(unknown.map(m=>`${m.name} · ${label(m.metric)}`))).join('; ')||t('Nėra tinkamų matavimų.','No usable readings.')}</p><button onClick={onCheckSensors}>{t('Patikrinti jutiklių ryšį','Check sensor connectivity')}</button></aside>:null}
  </div>
}
