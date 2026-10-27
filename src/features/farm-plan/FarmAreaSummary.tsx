import { useEffect, useState } from 'react'
import { METRICS, type MetricKey } from '../greenhouse-map/model'
import { areaMapRepository, type AreaMapHistory } from '../greenhouse-map/services/areaMapRepository'
import { farmAreaTrend, type FarmAreaComparison } from './farmMonitoringData'

type Props = { name: string; summary: FarmAreaComparison; metric: MetricKey; refreshToken: number; lt: boolean; targetsUnavailable: boolean; onClose: () => void; onRetry: () => void; onMap: () => void }
export default function FarmAreaSummary({ name, summary, metric, refreshToken, lt, targetsUnavailable, onClose, onRetry, onMap }: Props) {
  const [history, setHistory] = useState<AreaMapHistory | null>(null), [historyError, setHistoryError] = useState(false)
  useEffect(() => {
    let active = true
    areaMapRepository.loadHistory(summary.areaId).then(value => { if (active) { setHistory(value); setHistoryError(false) } }).catch(() => { if (active) setHistoryError(true) })
    return () => { active = false }
  }, [summary.areaId, refreshToken])
  const definition = METRICS[metric]
  const number = (value: number) => value.toLocaleString(lt ? 'lt-LT' : 'en-GB', { maximumFractionDigits: definition.decimals })
  const displayedRange = summary.range || summary.lastRange
  const rangeText = displayedRange ? `${number(displayedRange[0])}${displayedRange[0] === displayedRange[1] ? '' : `–${number(displayedRange[1])}`} ${definition.unit}` : '—'
  const points = history ? farmAreaTrend(history, metric).filter(point => Date.parse(point.at) >= Date.parse(history.to) - 6 * 3600_000) : []
  const values = points.flatMap(point => point.mean === null ? [] : [point.mean])
  const low = values.length ? Math.min(...values) : 0, high = values.length ? Math.max(...values) : 1
  const start = history ? Date.parse(history.to) - 6 * 3600_000 : 0, end = history ? Date.parse(history.to) : 1
  const path = points.map((point, index) => {
    if (point.mean === null) return ''
    const x = 8 + (Date.parse(point.at) - start) / Math.max(1, end - start) * 244
    const y = high === low ? 44 : 76 - (point.mean - low) / (high - low) * 64
    return `${points[index - 1]?.mean != null ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`
  }).join(' ')
  const status = summary.state === 'error' ? (lt ? 'Duomenų atnaujinti nepavyko' : 'Update failed') : summary.state === 'loading' ? (lt ? 'Kraunami matavimai…' : 'Loading readings…') : !summary.range && summary.lastRange ? (lt ? 'Paskutiniai matavimai · vėluoja' : 'Last readings · delayed') : !summary.range ? (lt ? 'Šio parametro matavimų nėra' : 'No readings for this metric') : (lt ? 'Dabartinis matavimų intervalas' : 'Current measured range')
  return <aside className="nc-farm-area-summary" aria-label={`${lt ? 'Area peržiūra' : 'Area overview'}: ${name}`}>
    <header><strong>{name}</strong><button type="button" onClick={onClose} aria-label={lt ? 'Uždaryti Area peržiūrą' : 'Close Area overview'}><i className="fa-solid fa-xmark" /></button></header>
    <span className="nc-farm-summary-metric">{lt ? definition.labelLt : definition.label}</span>
    <strong className="nc-farm-summary-range" data-delayed={!summary.range}>{rangeText}</strong>
    <p className="nc-farm-summary-status" role="status">{status}{summary.latest && summary.range && ` · ${new Date(summary.latest).toLocaleTimeString(lt ? 'lt-LT' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}`}</p>
    {onMap && <button type="button" className="nc-farm-open-map" onClick={onMap}>{lt ? 'Atidaryti 2D žemėlapį' : 'Open 2D map'}<i className="fa-solid fa-arrow-right" /></button>}
    <dl><div><dt>{lt ? 'Nauji matavimai' : 'Current readings'}</dt><dd>{summary.current}/{summary.total}</dd></div><div><dt>{lt ? 'Už nustatytų ribų' : 'Outside targets'}</dt><dd>{summary.assessed ? `${summary.outside.length}/${summary.assessed}` : '—'}</dd></div></dl>
    {targetsUnavailable || (summary.current > 0 && summary.assessed < summary.current) ? <p className="nc-farm-summary-note">{targetsUnavailable ? (lt ? 'Auginimo ribų įkelti nepavyko.' : 'Crop targets could not be loaded.') : (lt ? 'Ne visi matavimai turi nustatytas ribas.' : 'Targets are not set for every reading.')}</p> : null}
    {summary.state === 'partial' && <p className="nc-farm-summary-note">{lt ? 'Intervalui naudojami tik nauji matavimai.' : 'Only current readings contribute to the range.'}</p>}
    {summary.state === 'error' && <button className="nc-farm-summary-retry" type="button" onClick={onRetry}>{lt ? 'Bandyti dar kartą' : 'Retry'}</button>}
    {!!summary.outside.length && <ul className="nc-farm-summary-attention">{summary.outside.slice(0, 4).map(reading => <li key={reading.id}><span>{reading.name}</span><strong>{number(reading.value!)} {definition.unit}</strong></li>)}{summary.outside.length > 4 && <li>+{summary.outside.length - 4} {lt ? 'kiti' : 'more'}</li>}</ul>}
    <section className="nc-farm-summary-trend" aria-label={lt ? 'Paskutinių 6 valandų vidurkis' : 'Average over the last 6 hours'}>
      <header><span>{lt ? 'Paskutinės 6 val.' : 'Last 6 hours'}</span><small>{lt ? 'Area vidurkis' : 'Area average'}</small></header>
      {historyError ? <p>{lt ? 'Istorijos įkelti nepavyko.' : 'History could not be loaded.'}</p> : !history ? <p>{lt ? 'Kraunama istorija…' : 'Loading history…'}</p> : values.length ? <><svg viewBox="0 0 260 88" role="img" aria-label={`${lt ? definition.labelLt : definition.label}: ${number(low)}–${number(high)} ${definition.unit}`}><path d={path} />{points.filter(point => point.mean !== null).map(point => <circle key={point.at} cx={8 + (Date.parse(point.at) - start) / Math.max(1, end - start) * 244} cy={high === low ? 44 : 76 - (point.mean! - low) / (high - low) * 64} r={1.8} />)}</svg><div><span>−6 {lt ? 'val.' : 'h'}</span><span>{number(low)}–{number(high)} {definition.unit}</span><span>{lt ? 'Dabar' : 'Now'}</span></div></> : <p>{lt ? 'Šio parametro istorinių matavimų nėra.' : 'No historical readings for this metric.'}</p>}
    </section>
  </aside>
}
