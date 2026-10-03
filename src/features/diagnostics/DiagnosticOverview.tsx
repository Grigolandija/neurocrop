import { overviewFacts } from './overviewFacts'
import type { AgronomicAdvice } from './agronomicAdvice'
import type { DiagnosticReport } from './types'

export default function DiagnosticOverview({ report, advice, lt }: {
  report: DiagnosticReport; advice: AgronomicAdvice[]; lt: boolean
}) {
  const t = (a: string, b: string) => lt ? a : b
  const { nodeCount, coverage } = overviewFacts(report)
  const places = new Set(advice.map(item => item.place)).size
  const hasReadings = report.metrics.some(metric => metric.observedMinutes > 0)
  return <section className="diag-overview" aria-label={t('Laikotarpio apžvalga', 'Period overview')}>
    <div className="diag-overview-copy">
      <span className="diag-eyebrow">{t('LAIKOTARPIO IŠVADA', 'PERIOD CONCLUSION')}</span>
      <h2>{advice.length
        ? t('Yra sąlygų, kurias verta patikrinti', 'Conditions worth reviewing')
        : hasReadings ? t('Konkrečių agronominių rizikų nenustatyta', 'No specific agronomic risks identified')
          : t('Išvadai dar trūksta matavimų', 'More readings are needed')}</h2>
      <p>{advice.length
        ? t('Įžvalgos surikiuotos pagal svarbą. Pradėkite nuo pirmos.', 'Findings are ordered by priority. Start with the first.')
        : t('Išvada remiasi tik turimais matavimais ir nustatytomis auginimo ribomis. Trūkstami duomenys gali riboti vertinimą.', 'This conclusion uses available readings and configured crop targets. Missing measurements may limit the assessment.')}</p>
    </div>
    <dl className="diag-overview-stats">
      <div><dt>{t('Agronominės įžvalgos', 'Agronomic findings')}</dt><dd>{advice.length}<small>{places ? t(`${places} ${places===1?'zonoje':'zonose'}`,  `${places} zone${places === 1 ? '' : 's'}`) : t('pagal turimus duomenis', 'from available data')}</small></dd></div>
      <div><dt>{t('Matavimų aprėptis', 'Reading coverage')}</dt><dd>{coverage === null ? '—' : `${coverage.toLocaleString(lt ? 'lt-LT' : 'en-GB', { maximumFractionDigits: 0 })}%`}<small>{t(`Matavimo mazgų: ${nodeCount}`, `${nodeCount} reporting node${nodeCount === 1 ? '' : 's'}`)}</small></dd></div>
    </dl>
  </section>
}
