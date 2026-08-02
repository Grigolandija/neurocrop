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

export function buildTrendsCsv(series: TrendExportSeries[], rangeLabel: string) {
  const header = [
    'Timestamp (ISO 8601)', 'Local date', 'Local time (Europe/Vilnius)',
    'Area', 'Section', 'Source type', 'Data source',
    'Metric', 'Value', 'Unit', 'Aggregation', 'Selected range',
  ]
  const rows = series.flatMap((item) => item.points.map((point) => {
    const dateTime = exportDateTime(point.observedAt)
    return {
      timestampMs: new Date(point.observedAt).getTime(),
      values: [
        dateTime.timestamp, dateTime.date, dateTime.time,
        item.area, item.section, item.sourceType, item.source,
        item.metric.label, point.value.toFixed(item.metric.decimals), item.metric.unit,
        item.aggregation, rangeLabel,
      ],
    }
  })).sort((left, right) => {
    const timeDifference = left.timestampMs - right.timestampMs
    if (timeDifference) return timeDifference
    return String(left.values[7]).localeCompare(String(right.values[7]))
      || String(left.values[6]).localeCompare(String(right.values[6]))
  })
  return `\ufeff${[header, ...rows.map((row) => row.values)].map((row) => row.map(csvCell).join(';')).join('\n')}\n`
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
