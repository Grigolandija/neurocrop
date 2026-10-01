import { metricDefinitions } from '../../domain/metricRegistry'
import type { DiagnosticReport } from './types'
import type { Finding } from './findings'

export function findingNarrative(report: DiagnosticReport, finding: Finding, lt: boolean) {
  const t = (a: string, b: string) => lt ? a : b
  const n = (v: number) => v.toLocaleString(lt ? 'lt-LT' : 'en-GB', { maximumFractionDigits: 1 })
  const label = (key: string) => { const d = metricDefinitions[key as keyof typeof metricDefinitions]; return d ? (lt ? d.labelLt : d.label) : key }
  const metric = report.metrics.find(m => m.sectionId === finding.sectionId && m.metric === finding.metric) || finding
  const analyses = (report.explanations || []).filter(a => a.sectionId === metric.sectionId && a.metric === metric.metric)
  const strongest = analyses.flatMap(a => Object.entries(a.directions).map(([direction, d]) => ({ a, direction, d }))).sort((a, b) => b.d.minutes - a.d.minutes)[0]
  const node = report.nodes.filter(m => m.sectionId === metric.sectionId && m.metric === metric.metric && m.observedMinutes > 0)
    .sort((a, b) => (b.aboveMinutes + b.belowMinutes) / b.observedMinutes - (a.aboveMinutes + a.belowMinutes) / a.observedMinutes)[0]
  const sample = node || metric
  const below = metric.belowMinutes > 0, above = metric.aboveMinutes > 0
  const headline = label(metric.metric) + ': ' + (below && above
    ? t('nukrypimai abiem kryptimis', 'excursions in both directions')
    : below ? t('žemiau nustatytos ribos', 'below the configured target') : above ? t('aukščiau nustatytos ribos', 'above the configured target') : t('skiriasi tarp vietų', 'differs between locations'))
  const evidence: string[] = []
  if (sample.observedMinutes > 0) {
    const percent = 100 * (sample.belowMinutes + sample.aboveMinutes) / sample.observedMinutes
    evidence.push(node
      ? t(`${node.nodeName || node.nodeId}: už ribų ${n(percent)} % stebėto laiko — ${n(sample.belowMinutes / 60)} h žemiau ir ${n(sample.aboveMinutes / 60)} h aukščiau ribos.`, `${node.nodeName || node.nodeId}: outside targets for ${n(percent)}% of observed time — ${n(sample.belowMinutes / 60)} h below and ${n(sample.aboveMinutes / 60)} h above target.`)
      : t(`Už ribų ${n(percent)} % bendro jutiklių stebėjimo laiko.`, `Outside targets for ${n(percent)}% of combined sensor observation time.`))
  }
  if (sample.minimum != null && sample.maximum != null) evidence.push(t(`Užfiksuotas intervalas: ${n(sample.minimum)}–${n(sample.maximum)} ${metric.unit}.`, `Recorded range: ${n(sample.minimum)}–${n(sample.maximum)} ${metric.unit}.`))
  const pattern: string[] = [], interpretation: string[] = []
  if (strongest) {
    const { a, d, direction } = strongest
    const dir = direction === 'below' ? t('žemiau', 'below') : t('aukščiau', 'above')
    pattern.push(t(`${a.nodeName}: ${d.days} dienas pasitaikė reikšmių ${dir} ribos; ${d.eventCount} atskirų epizodų. Ilgiausias truko ${n(d.longestMinutes / 60)} h.`, `${a.nodeName}: readings ${dir} target on ${d.days} days, across ${d.eventCount} separate episodes. The longest lasted ${n(d.longestMinutes / 60)} h.`))
    const hour = d.peakHours[0]
    if (hour) pattern.push(t(`Daugiausia šios krypties nukrypimo laiko: ${hour.hour}:00–${(hour.hour + 1) % 24}:00 (${n(hour.minutes / 60)} h per visą laikotarpį, ${report.timeZone}).`, `Most excursion time in this direction: ${hour.hour}:00–${(hour.hour + 1) % 24}:00 (${n(hour.minutes / 60)} h across the period, ${report.timeZone}).`))
    evidence.push(t(`Stipriausias nukrypimas šiame epizodų rinkinyje: ${n(d.peak.value)} ${metric.unit}, lyginant su ${n(d.peak.limit)} ${metric.unit} riba.`, `Largest excursion in these episodes: ${n(d.peak.value)} ${metric.unit}, against a ${n(d.peak.limit)} ${metric.unit} target.`))
    if (d.meanDeparture != null) evidence.push(t(`Vidutinis skirtumas nuo ribos per šios krypties nukrypimus: ${n(d.meanDeparture)} ${metric.unit}.`, `Mean departure during excursions in this direction: ${n(d.meanDeparture)} ${metric.unit}.`))
    if (d.scope === 'local') interpretation.push(t(`Stipriausio nukrypimo metu nė vienas iš ${d.peersAtPeak.configuredCount} palyginamų kitų jutiklių nebuvo už savo ribų ta pačia kryptimi. Tai pagrindas pirmiausia tikrinti šią vietą.`, `At the largest excursion, none of ${d.peersAtPeak.configuredCount} comparable other sensors was outside its targets in the same direction. This supports checking this location first.`))
    else if (d.scope === 'widespread') interpretation.push(t(`Tuo momentu ta pačia kryptimi nukrypo ${d.peersAtPeak.sameDirectionCount} iš ${d.peersAtPeak.configuredCount} kitų jutiklių. Požymis apėmė kelias vietas — tikrinkite bendrą valdymą.`, `${d.peersAtPeak.sameDirectionCount} of ${d.peersAtPeak.configuredCount} other sensors shared the excursion at that moment. Several locations were affected — check shared controls.`))
    for (const r of (d.matchedRelated || []).slice(0, 2)) interpretation.push(t(`${label(r.metric)} per šiuos nukrypimus buvo vidutiniškai ${n(r.during)}, o tuo pačiu paros metu esant pagrindiniam rodikliui ribose — ${n(r.baseline)} ${metricDefinitions[r.metric as keyof typeof metricDefinitions]?.unit || ''}. Palyginta ${n(r.matchedMinutes / 60)} h abiejose grupėse; sutapimas nepatvirtina priežasties.`, `${label(r.metric)} averaged ${n(r.during)} during these excursions, versus ${n(r.baseline)} ${metricDefinitions[r.metric as keyof typeof metricDefinitions]?.unit || ''} at matching hours when the main metric was in target. Matched ${n(r.matchedMinutes / 60)} h in each group; association does not establish cause.`))
    if (a.trend === 'comparable' && a.halves[0]?.outsidePct != null && a.halves[1]?.outsidePct != null) {
      const first = a.halves[0].outsidePct, last = a.halves[1].outsidePct
      interpretation.push(t(`Laikotarpio antroje pusėje šio jutiklio laiko už ribų dalis ${last > first ? 'padidėjo' : last < first ? 'sumažėjo' : 'nepakito'}: ${n(first)} % → ${n(last)} %. Ribos nesikeitė; tai tendencija, ne atlikto veiksmo poveikio įrodymas.`, `This sensor’s share of time outside targets ${last > first ? 'rose' : last < first ? 'fell' : 'stayed unchanged'} in the second half: ${n(first)}% → ${n(last)}%. Targets were unchanged; this is a trend, not proof of an intervention’s effect.`))
    }
  } else {
    const recurring = metric.hourly.filter(h => h.observedMinutes >= 60 && h.recurringDays >= 2 && h.outsideMinutes > 0)
      .sort((a, b) => b.outsideMinutes / b.observedMinutes - a.outsideMinutes / a.observedMinutes)[0]
    if (recurring) pattern.push(t(`Dažniausiai už ribų: ${recurring.hour}:00–${(recurring.hour + 1) % 24}:00 — ${n(100 * recurring.outsideMinutes / recurring.observedMinutes)} % šios valandos stebėjimo laiko; pasikartojo ${recurring.recurringDays} dienas (${report.timeZone}).`, `Highest out-of-target share: ${recurring.hour}:00–${(recurring.hour + 1) % 24}:00 — ${n(100 * recurring.outsideMinutes / recurring.observedMinutes)}% of observed time in this hour; recurred on ${recurring.recurringDays} days (${report.timeZone}).`))
    pattern.push(t('Šiame rezultate nėra atskirų epizodų analizės, todėl jų nenutrūkstamos trukmės ir sutapimo su kitais rodikliais nustatyti negalima.', 'This result contains no individual episode analysis, so continuous durations and concurrence with other measurements cannot be determined.'))
  }
  if (metric.dayMean != null && metric.nightMean != null) pattern.push(t(`Pagal nustatytą apšvietimo grafiką dienos vidurkis ${n(metric.dayMean)}, nakties ${n(metric.nightMean)} ${metric.unit}.`, `Under the configured lighting schedule, daytime mean was ${n(metric.dayMean)}, nighttime mean ${n(metric.nightMean)} ${metric.unit}.`))
  if (metric.peerDelta != null && metric.peerMinutes >= 60) interpretation.push(t(`Lyginant vienalaikius matavimus su kitomis zonomis, vidutinis skirtumas ${n(metric.peerDelta)} ${metric.unit} (${n(metric.peerMinutes / 60)} h palyginamo stebėjimo).`, `Against simultaneous readings in other zones, the mean difference was ${n(metric.peerDelta)} ${metric.unit} (${n(metric.peerMinutes / 60)} h of comparable observations).`))
  if (below && above) interpretation.push(t('Pasitaiko nukrypimų į abi puses. Vien bendro nustatymo pakėlimas ar sumažinimas gali sustiprinti kitą nukrypimą; pirmiausia atskirkite jų laikus ir vietas.', 'Excursions occur in both directions. Raising or lowering a single overall setting could worsen the opposite excursion; first separate their timing and locations.'))
  if (metric.metric === 'vpd') interpretation.push(t('VPD apskaičiuojamas iš temperatūros ir santykinės drėgmės. Jo sutapimas su šiais rodikliais nėra nepriklausomas problemos patvirtinimas.', 'VPD is calculated from temperature and relative humidity. Agreement with those metrics is not independent confirmation of a problem.'))
  const action = metric.metric === 'airTemp'
    ? t('Nurodytais nukrypimų laikais palyginkite temperatūros grafiką su šildymo ir vėdinimo įjungimais bei dienos / nakties nustatymais. Jei skiriasi tik ši vieta, atlikite kontrolinį matavimą šalia jutiklio.', 'At the excursion times, compare temperature with heating and ventilation events and day/night setpoints. If only this location differs, take a reference reading beside the sensor.')
    : ['humidity', 'vpd'].includes(metric.metric)
      ? t('Tais pačiais nukrypimų laikais kartu peržiūrėkite temperatūrą ir drėgmę bei užregistruotus vėdinimo, drėkinimo ar laistymo įvykius. Patikrinkite, ar drėgmės pokytis sutampa su temperatūros pokyčiu; vien iš VPD priežasties nustatyti negalima.', 'At the same excursion times, review temperature and humidity together with recorded ventilation, humidification or irrigation events. Check whether humidity changes coincide with temperature changes; VPD alone cannot identify the cause.')
      : metric.metric === 'co2'
        ? t('Palyginkite CO₂ nukrypimų laikus su apšvietimo grafiku, vėdinimo ir CO₂ tiekimo įvykiais. Patikrinkite, ar pokytis apima kitus jutiklius.', 'Compare CO₂ excursion times with the lighting schedule, ventilation and CO₂ supply events. Check whether other sensors share the change.')
        : t('Sulyginkite nurodytus nukrypimų laikus su šį rodiklį keičiančios įrangos įvykiais ir atlikite kontrolinį matavimą toje pačioje vietoje.', 'Compare the excursion times with events from equipment affecting this measurement and take a reference reading at the same location.')
  const confidence = t(`Tinkamų matavimų aprėptis: ${n(sample.coveragePct)} %.`, `Usable measurement coverage: ${n(sample.coveragePct)}%.`) + (metric.estimatedContextPct > 0 ? t(` ${n(metric.estimatedContextPct)} % stebėto laiko vertinta pagal nepatvirtintas istorines ribas. Laikai ir reikšmės išmatuoti, tačiau prieš reguliuodami įrangą patvirtinkite ribas.`, ` ${n(metric.estimatedContextPct)}% of observed time was assessed against unverified historical targets. Times and values were measured, but confirm targets before adjusting equipment.`) : '')
  return { headline, evidence, pattern, interpretation, action, confidence }
}
