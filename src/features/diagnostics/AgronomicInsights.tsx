import { agronomicAdvice } from './agronomicAdvice'
import type { DiagnosticReport } from './types'

export default function AgronomicInsights({report,lt}:{report:DiagnosticReport;lt:boolean}){
 const t=(a:string,b:string)=>lt?a:b
 const advice=agronomicAdvice(report,lt)
 return <section className="diag-agronomy" aria-label={t('Agronominės įžvalgos','Agronomic insights')}>
  <h2>{t('Ką tai reiškia augalams ir ką daryti','What this means for plants and what to do')}</h2>
  {advice.length?advice.map(a=><article key={a.id}>
   <small>{a.place}</small><h3>{a.title}</h3>
   <p>{a.meaning}</p>
   <p className="diag-agro-action"><strong>{t('Sprendimas augintojui.','Grower decision.')}</strong> {a.action}</p>
   <p><strong>{t('Kaip įvertinti rezultatą.','How to assess the result.')}</strong> {a.verify}</p>
   <p className="diag-agro-evidence"><strong>{t('Kuo pagrįsta.','Evidence.')}</strong> {a.evidence}</p>
   <details><summary>{t('Vertinimo ribos ir šaltinis','Interpretation limits and source')}</summary><p>{a.limits}</p><a href={a.source.url} target="_blank" rel="noreferrer">{a.source.title}</a></details>
  </article>):<p>{t('Turimų duomenų deriniai nepagrindžia konkrečios agronominės rizikos išvados. Vien drėgmės svyravimas neparodo, ar augalui trūksta vandens. Sprendimui dėl laistymo reikia kartu vertinti temperatūrą, VPD ir substrato drėgmę; dėl kondensato — lapo temperatūrą ir rasos tašką.','Available measurement combinations do not support a specific agronomic risk finding. Humidity variation alone does not establish plant water shortage. Irrigation decisions need temperature, VPD and substrate moisture together; condensation assessment needs leaf temperature and dew point.')}</p>}
 </section>
}
