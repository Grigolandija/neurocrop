type TrendExportPoint = { observedAt: string; value: number }
type TrendExportMetric = { label: string; unit: string; decimals: number }

export type TrendExportSeries = {
  area: string
  section: string
  sourceType: 'Section aggregate' | 'Node'
  source: string
  metric: TrendExportMetric
  aggregation: string
  points: TrendExportPoint[]
}

function csvCell(value: unknown) {
  let content = String(value ?? '')
  if (/^[=+\-@]/.test(content)) content = `'${content}`
  return `"${content.replaceAll('"', '""')}"`
}

function exportDateTime(observedAt: string) {
  const value = new Date(observedAt)
  const timestamp = Number.isFinite(value.getTime()) ? value.toISOString() : observedAt
  const local = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(value).replace(',', '').split(' ')
  return { timestamp, date: local[0] || '', time: local[1] || '' }
}

export function buildTrendsCsv(series: TrendExportSeries[]) {
  const sameMetric = series.every((item) => item.metric.label === series[0]?.metric.label && item.metric.unit === series[0]?.metric.unit)
  const sameSource = series.every((item) => item.section === series[0]?.section && item.source === series[0]?.source)
  const usedLabels = new Map<string, number>()
  const columns = series.map((item) => {
    const metric = `${item.metric.label}${item.metric.unit ? ` (${item.metric.unit})` : ''}`
    const base = series.length === 1 || sameSource
      ? metric
      : sameMetric
        ? `${item.sourceType === 'Node' ? item.source : item.section}${item.metric.unit ? ` (${item.metric.unit})` : ''}`
        : `${item.source} – ${metric}`
    const occurrence = (usedLabels.get(base) || 0) + 1
    usedLabels.set(base, occurrence)
    return {
      label: occurrence === 1 ? base : `${base} ${occurrence}`,
      decimals: item.metric.decimals,
      values: new Map(item.points.map((point) => [new Date(point.observedAt).toISOString(), point.value])),
    }
  })
  const timestamps = [...new Set(series.flatMap((item) => item.points.map((point) => new Date(point.observedAt).toISOString())))]
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())
  const rows = timestamps.map((timestamp) => {
    const dateTime = exportDateTime(timestamp)
    return [dateTime.date, dateTime.time, ...columns.map((column) => {
      const value = column.values.get(timestamp)
      return value === undefined ? '' : value.toFixed(column.decimals).replace('.', ',')
    })]
  })
  const table = [['Date', 'Time', ...columns.map((column) => column.label)], ...rows]
  return `\ufeff${table.map((row) => row.map(csvCell).join(';')).join('\n')}\n`
}

export function downloadTrendsCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function filenamePart(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
