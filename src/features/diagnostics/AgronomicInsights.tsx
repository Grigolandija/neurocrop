import type { AgronomicAdvice } from './agronomicAdvice'

export default function AgronomicInsights({ advice, lt, available=true, legacy=false }: { advice: AgronomicAdvice[]; lt: boolean; available?:boolean; legacy?:boolean }) {
  const t = (a: string, b: string) => lt ? a : b
  return <section className="diag-agronomy" aria-label={t('Agronominės įžvalgos', 'Agronomic insights')}>
    <h2>{t('Ką tai reiškia augalams ir ką daryti', 'What this means for plants and what to do')}</h2>
    <p className="diag-section-intro">{t('Visos įžvalgos vienoje vietoje, surikiuotos pagal svarbą. Priežastį patvirtinkite patikra šiltnamyje.', 'All findings together, ordered by priority. Confirm the cause with a check in the greenhouse.')}</p>
    {legacy?<p className="diag-section-intro">{t('Senos ataskaitos matavimai išliko nepakeisti. Agronominiai paaiškinimai parengti pagal dabartines taisykles.','The old report’s measurements are unchanged. Agronomic explanations use the current rules.')}</p>:null}
    {advice.length ? <div className="diag-agro-list">{advice.map((item, index) => <article className="diag-agro-card" key={item.id} data-priority={index === 0 ? 'first' : 'next'}>
      <header className="diag-agro-heading">
        <span className="diag-agro-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <div><small>{item.place}</small><h3>{item.title}</h3></div>
        {index === 0 ? <span className="diag-priority-label">{t('Patikrinkite pirmiausia', 'Check first')}</span> : null}
      </header>
      <div className="diag-agro-body">
        <section className="diag-agro-impact"><h4>{t('Poveikis augalams', 'What this means for plants')}</h4><p>{item.meaning}</p></section>
        <section className="diag-agro-action"><h4>{t('Sprendimas augintojui', 'Grower decision')}</h4><p>{item.action}</p></section>
      </div>
      <section className="diag-agro-verify"><i className="fa-solid fa-check" aria-hidden="true"/><div><h4>{t('Kaip įvertinti rezultatą', 'How to assess the result')}</h4><p>{item.verify}</p></div></section>
      <footer className="diag-agro-footer">
        <p className="diag-agro-evidence"><i className="fa-solid fa-chart-line" aria-hidden="true"/><span><strong>{t('Kuo pagrįsta.', 'Evidence.')}</strong> {item.evidence}</span></p>
        <details><summary>{t('Vertinimo ribos ir šaltinis', 'Interpretation limits and source')}</summary><p>{item.limits}</p><a href={item.source.url} target="_blank" rel="noreferrer">{item.source.title}<i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"/></a></details>
      </footer>
    </article>)}</div> : <div className="diag-agro-empty"><i className="fa-solid fa-seedling" aria-hidden="true"/><p>{!available?t('Šios ataskaitos agronominiai paaiškinimai neįkelti. Atverkite išsaugotą ataskaitą iš naujo arba sugeneruokite naują analizę.','Agronomic explanations have not been loaded for this report. Reopen the saved report or generate a new analysis.'):t('Turimų duomenų deriniai nepagrindžia konkrečios agronominės rizikos išvados. Vien drėgmės svyravimas neparodo, ar augalui trūksta vandens. Sprendimui dėl laistymo reikia kartu vertinti temperatūrą, VPD ir substrato drėgmę; dėl kondensato — lapo temperatūrą ir rasos tašką.', 'Available measurement combinations do not support a specific agronomic risk finding. Humidity variation alone does not establish plant water shortage. Irrigation decisions need temperature, VPD and substrate moisture together; condensation assessment needs leaf temperature and dew point.')}</p></div>}
  </section>
}
