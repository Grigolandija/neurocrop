import type { DiagnosticMetric, DiagnosticReport } from './types'

type Finding = DiagnosticReport['insights'][number]
type Props = { report: DiagnosticReport; lt: boolean; onInspect: (metric: string) => void; onCheckSensors: () => void }

export default function DiagnosticSummary({ report, lt, onInspect, onCheckSensors }: Props) {
  const t = (a: string, b: string) => lt ? a : b
  const n = (value: number | null) => value == null ? '—' : value.toLocaleString(lt ? 'lt-LT' : 'en-GB', { maximumFractionDigits: 1 })
  const labels: Record<string, string> = {
    airTemp: t('Temperatūra', 'Temperature'), humidity: t('Oro drėgmė', 'Humidity'),
    vpd: t('Oro sausumas (VPD)', 'Air dryness (VPD)'), co2: 'CO₂', lux: t('Apšvietimas', 'Light'),
    ppfd: t('Augalams naudinga šviesa', 'Plant-available light'), soilTemp: t('Dirvos temperatūra', 'Soil temperature'),
    soilMoisture: t('Dirvos drėgmė', 'Soil moisture'), ec: t('Tirpalo laidumas', 'Solution conductivity'),
    ph: 'pH', soilEc: t('Dirvos laidumas', 'Soil conductivity'), leafTemp: t('Lapų temperatūra', 'Leaf temperature'), waterTemp: t('Vandens temperatūra', 'Water temperature'),
  }
  // One card per zone and metric; recurring peer differences take precedence.
  const findings = Array.from(new Map([...report.insights.filter(i => i.kind === 'outside-target'), ...report.insights.filter(i => i.kind === 'systematic-peer')].map(i => [`${i.sectionId}:${i.metric}`, i])).values())
    .sort((a, b) => Number(b.severity === 'high') - Number(a.severity === 'high') || b.recurringDays - a.recurringDays)
  const unknown = report.insights.filter(i => i.kind === 'insufficient-data')
  const zones = new Set(findings.map(i => i.sectionId)).size
  const hasReadings = report.metrics.some(m => m.observedMinutes > 0)
  const limited = unknown.length > 0 || !hasReadings
  function title(m: Finding) {
    const label = labels[m.metric] || m.metric
    if (m.kind === 'systematic-peer' && m.peerDelta != null && m.peerDelta !== 0) {
      if (m.metric === 'airTemp') return m.peerDelta > 0 ? t('Čia šilčiau nei kitose zonose', 'Warmer here than in other zones') : t('Čia vėsiau nei kitose zonose', 'Cooler here than in other zones')
      if (m.metric === 'humidity') return m.peerDelta > 0 ? t('Čia oras drėgnesnis nei kitose zonose', 'More humid here than in other zones') : t('Čia oras sausesnis nei kitose zonose', 'Drier here than in other zones')
    }
    if (m.kind === 'systematic-peer') return `${label} ${t('skiriasi nuo kitų zonų', 'differs from other zones')}`
    return `${label} ${m.aboveMinutes > 0 && m.belowMinutes > 0 ? t('svyruoja už nustatytų ribų', 'fluctuates outside your targets') : m.aboveMinutes > 0 ? t('viršija nustatytą ribą', 'exceeds your upper target') : t('nesiekia nustatytos ribos', 'falls below your lower target')}`
  }
  function evidence(m: Finding) {
    if (m.kind === 'systematic-peer') return t(
      `Lyginant tuo pačiu metu, skirtumas nuo kitų zonų: ${n(m.peerDelta)} ${m.unit}. Didesnis skirtumas kartojosi ${m.recurringDays} d.`,
      `Compared at the same time, the difference from other zones was ${n(m.peerDelta)} ${m.unit}. A larger difference recurred on ${m.recurringDays} days.`)
    return t(`Už jūsų nustatytų ribų buvo ${n(m.outsideObservedPct)} % užfiksuoto jutiklių stebėjimo laiko.`, `Outside your configured targets for ${n(m.outsideObservedPct)}% of recorded sensor observation time.`)
  }
  function check(m: DiagnosticMetric) {
    if (m.metric === 'airTemp' || m.metric === 'humidity' || m.metric === 'vpd') return t('Patikrinkite, ar šioje zonoje neužstotas oro judėjimas ir ar jutiklis nekabo prie šildytuvo ar atviros angos.', 'Check for obstructed airflow and whether the sensor is beside a heater or an open vent.')
    if (m.metric === 'co2') return t('Palyginkite CO₂ dozavimo laiką su nukrypimais ir patikrinkite dujų paskirstymą šioje zonoje.', 'Compare CO₂ dosing times with the deviations and inspect gas distribution in this zone.')
    if (m.metric === 'lux' || m.metric === 'ppfd') return t('Patikrinkite šešėliavimą, šviestuvus ir ar jutiklio neuždengia lapai.', 'Check shading, lamps and whether leaves cover the sensor.')
    return t('Patikrinkite jutiklio vietą bei kalibravimą ir ar nustatytos ribos tinka auginamai kultūrai.', 'Check sensor placement, calibration and whether the targets suit the crop.')
  }
  function card(m: Finding, index: number) {
    return <article className="diag-finding" key={`${m.sectionId}:${m.metric}`}>
      <div className="diag-finding-location"><span>{String(index + 1).padStart(2, '0')}</span><strong>{m.name}</strong><small>{m.kind === 'systematic-peer' ? t('Kartojasi', 'Recurring') : t('Verta patikrinti', 'Worth checking')}</small></div>
      <h3>{title(m)}</h3><p>{evidence(m)}</p>
      <div className="diag-next-step"><strong>{t('Ką patikrinti pirmiausia', 'What to check first')}</strong><p>{check(m)}</p></div>
      <div className="diag-finding-footer"><small>{t('Turime', 'Available')}: {n(m.coveragePct)} % {t('tikėto stebėjimo laiko', 'of expected observation time')}{m.estimatedContextPct > 0 ? t(' · Ankstesnės ribos nėra patvirtintos', ' · Historical targets are not verified') : ''}</small><button className="no-print" onClick={() => onInspect(m.metric)}>{t('Peržiūrėti matavimus', 'View measurements')} →</button></div>
    </article>
  }
  return <div className="diag-summary">
    <section className="diag-verdict" data-state={findings.length ? 'attention' : 'neutral'}>
      <p>{t('Pasirinkto laikotarpio išvada', 'Conclusion for this period')}</p>
      <h2>{findings.length ? t(`Patikrinkite šias zonas (${zones})`, `Check these zones (${zones})`) : limited ? t('Patikimai išvadai dar trūksta matavimų', 'More readings are needed for a reliable conclusion') : t('Pasikartojančių problemų pagal šias taisykles neradome', 'No recurring problems found by these checks')}</h2>
      <span>{findings.length ? t('Žemiau – pastebėti skirtumai ir pirmos patikros. Galimą priežastį reikia patvirtinti vietoje.', 'Below are the observed differences and first checks. Possible causes need to be verified on site.') : limited ? t('Patikrinkite jutiklių ryšį ir leiskite sistemai sukaupti daugiau duomenų. Trūkstami matavimai nėra gerų sąlygų patvirtinimas.', 'Check sensor connectivity and allow more data to accumulate. Missing readings do not confirm good conditions.') : t('Tai apima tik turimus matavimus ir jūsų nustatytas ribas. Visų augimo sąlygų ši išvada nepatvirtina.', 'This covers available readings and your configured targets. It does not confirm every growing condition.')}</span>
    </section>
    <div className="diag-insights">{findings.slice(0, 3).map(card)}</div>
    {findings.length > 3 ? <details className="diag-more"><summary>{t(`Kiti pastebėjimai (${findings.length - 3})`, `More findings (${findings.length - 3})`)}</summary>{findings.slice(3).map((m, i) => card(m, i + 3))}</details> : null}
    {limited ? <aside className="diag-data-gap"><strong>{t('Kur dar negalime įvertinti sąlygų', 'Where conditions cannot yet be assessed')}</strong><p>{unknown.length ? Array.from(new Set(unknown.map(m => m.name))).join(', ') : t('Dar nėra tinkamų matavimų.', 'No usable readings yet.')}</p><p>{t('Šiose vietose daliai rodiklių turime mažiau nei pusę tikėto stebėjimo laiko.', 'For some measurements in these locations, less than half of the expected observation time is available.')}</p><button className="no-print" onClick={onCheckSensors}>{t('Patikrinti jutiklių ryšį', 'Check sensor connectivity')}</button></aside> : null}
  </div>
}
