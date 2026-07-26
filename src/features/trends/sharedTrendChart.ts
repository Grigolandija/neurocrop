export type TrendRangeKey = '24h' | '7d' | '30d'

export type TrendPoint = {
  observedAt: string
  receivedAt?: string
  value: number
}

export type TrendMetric = {
  key: string
  label: string
  short?: string
  unit: string
  decimals: number
}

export type TrendSeries = {
  name: string
  color?: string
  points: TrendPoint[]
}

export type TrendChartInput = {
  metric: TrendMetric
  series: TrendSeries[]
  target: [number, number] | null
  rangeKey: TrendRangeKey
}

export type TrendChartInstance = {
  resize: () => void
  dispose: () => void
}

type EChartsEngine = {
  init?: (element: HTMLElement) => {
    setOption: (option: Record<string, unknown>, settings?: Record<string, unknown>) => void
    resize: () => void
    dispose: () => void
  }
}

const defaultSeriesColors = ['#287f70', '#d87655', '#507ea2', '#b18a35', '#845f8e', '#68746f']
const metricColorTokens: Record<string, [string, string]> = {
  airTemp: ['--chart-temperature', '#d36c5b'],
  leafTemp: ['--chart-temperature', '#d36c5b'],
  soilTemp: ['--chart-temperature', '#d36c5b'],
  humidity: ['--chart-humidity', '#4c82b8'],
  vpd: ['--chart-vpd', '#8a6bbe'],
  co2: ['--chart-co2', '#7a6f64'],
  lux: ['--chart-light', '#d6a436'],
  ec: ['--chart-ec', '#b45f87'],
  soilEc: ['--chart-ec', '#b45f87'],
  ph: ['--chart-ph', '#6c70c9'],
  waterTemp: ['--chart-water', '#2c91a3'],
  soilMoisture: ['--chart-water', '#2c91a3'],
  batteryLevel: ['--chart-battery', '#738e95'],
}

function translate(value: string) {
  return typeof window !== 'undefined' ? window.NeuroCropI18n?.translate(value) || value : value
}

function locale() {
  return typeof window !== 'undefined' && window.NeuroCropI18n?.getLanguage() === 'lt' ? 'lt-LT' : 'en-GB'
}

function format(value: number, metric: TrendMetric) {
  return `${new Intl.NumberFormat(locale(), {
    minimumFractionDigits: metric.decimals,
    maximumFractionDigits: metric.decimals,
  }).format(value)} ${metric.unit}`.trim()
}

function colorWithAlpha(color: string, alpha: number) {
  if (color.startsWith('rgba(')) return color.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${alpha})`)
  if (color.startsWith('rgb(')) return color.replace(/^rgb\(([^)]+)\)$/, `rgba($1, ${alpha})`)
  if (color.startsWith('#')) {
    const source = color.slice(1)
    const hex = source.length === 3 ? [...source].map((part) => `${part}${part}`).join('') : source
    if (/^[\da-f]{6}$/i.test(hex)) {
      return `rgba(${Number.parseInt(hex.slice(0, 2), 16)}, ${Number.parseInt(hex.slice(2, 4), 16)}, ${Number.parseInt(hex.slice(4, 6), 16)}, ${alpha})`
    }
  }
  return color
}

function cssColor(token: string, fallback: string) {
  if (typeof document === 'undefined') return fallback
  return window.getComputedStyle?.(document.documentElement).getPropertyValue(token).trim() || fallback
}

function seriesColor(series: TrendSeries, metric: TrendMetric, index: number, count: number) {
  if (series.color) return series.color
  if (count === 1 && metricColorTokens[metric.key]) {
    const [token, fallback] = metricColorTokens[metric.key]
    return cssColor(token, fallback)
  }
  return defaultSeriesColors[index % defaultSeriesColors.length]
}

function normalizedPoints(points: TrendPoint[]) {
  return points
    .map((point) => ({
      timestamp: new Date(point.observedAt || point.receivedAt || '').getTime(),
      value: Number(point.value),
    }))
    .filter((point) => Number.isFinite(point.timestamp) && Number.isFinite(point.value))
    .sort((left, right) => left.timestamp - right.timestamp)
}

export function getTrendAxisDomain(values: number[], metric: TrendMetric, target: [number, number] | null) {
  if (metric.key === 'batteryLevel') return [0, 100] as const
  const finiteValues = values.map(Number).filter(Number.isFinite)
  if (!finiteValues.length) return target || [0, 1]

  const dataMinimum = Math.min(...finiteValues)
  const dataMaximum = Math.max(...finiteValues)
  const precisionStep = 10 ** -Math.max(0, metric.decimals)
  const minimumSpan = Math.max(precisionStep * 4, Math.max(Math.abs(dataMinimum), Math.abs(dataMaximum), 1) * .02)
  const dataSpan = Math.max(dataMaximum - dataMinimum, minimumSpan)
  const padding = dataSpan * .18
  let minimum = dataMinimum - padding
  let maximum = dataMaximum + padding

  // A distant crop target must not flatten the measured curve. Nearby limits
  // are included, while an off-screen target is still explained in the labels.
  if (target) {
    const nearbyLimit = dataSpan * .5
    target.forEach((limit) => {
      if (limit >= dataMinimum - nearbyLimit && limit <= dataMaximum + nearbyLimit) {
        minimum = Math.min(minimum, limit - padding)
        maximum = Math.max(maximum, limit + padding)
      }
    })
  }
  return [minimum, maximum] as const
}

export function buildTrendChartOption(input: TrendChartInput) {
  const prepared = input.series
    .map((series) => ({ ...series, normalized: normalizedPoints(series.points) }))
    .filter((series) => series.normalized.length > 1)
  if (!prepared.length) return null

  const { metric, target, rangeKey } = input
  const colors = prepared.map((series, index) => seriesColor(series, metric, index, prepared.length))
  const allValues = prepared.flatMap((series) => series.normalized.map((point) => point.value))
  const [axisMinimum, axisMaximum] = getTrendAxisDomain(allValues, metric, target)
  const targetVisible = target
    ? [Math.max(target[0], axisMinimum), Math.min(target[1], axisMaximum)] as const
    : null
  const hasVisibleTargetBand = Boolean(targetVisible && targetVisible[0] < targetVisible[1])
  const dateFormatter = new Intl.DateTimeFormat(locale(), {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  const valueLabel = (value: number) => format(value, metric)
  const targetBelow = Boolean(target && target[1] < axisMinimum)
  const targetAbove = Boolean(target && target[0] > axisMaximum)
  const offscreenTargetLabel = target && (targetBelow || targetAbove)
    ? `${translate('Target')} ${valueLabel(target[0])}–${valueLabel(target[1])} ${targetBelow ? '↓' : '↑'}`
    : ''

  return {
    animation: false,
    color: colors,
    textStyle: { fontFamily: 'IBM Plex Sans, sans-serif', color: '#202522' },
    aria: {
      enabled: true,
      label: { description: `${translate(metric.label)}, ${rangeKey} ${translate('trend')}` },
    },
    grid: { left: 88, right: 36, top: prepared.length > 1 ? 58 : 34, bottom: 52 },
    legend: {
      show: prepared.length > 1,
      top: 10,
      left: 88,
      right: 36,
      type: 'scroll',
      itemWidth: 18,
      itemHeight: 3,
      icon: 'roundRect',
      textStyle: { color: '#5d655f', fontSize: 12, fontWeight: 500 },
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      renderMode: 'html',
      backgroundColor: 'rgba(37, 43, 41, .97)',
      borderColor: 'rgba(255, 255, 255, .22)',
      borderWidth: 1,
      padding: [10, 12],
      textStyle: { color: '#fff', fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 12 },
      axisPointer: {
        type: 'cross',
        lineStyle: { color: 'rgba(32, 37, 34, .38)', width: 1 },
        crossStyle: { color: 'rgba(32, 37, 34, .38)', width: 1 },
        label: { backgroundColor: '#252b29', color: '#fff' },
      },
      valueFormatter: (value: unknown) => valueLabel(Number(value)),
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      name: `${translate('Time')} (${rangeKey})`,
      nameLocation: 'middle',
      nameGap: 34,
      axisLine: { show: true, lineStyle: { color: 'rgba(32, 37, 34, .30)', width: 1.2 } },
      axisTick: { show: true, lineStyle: { color: 'rgba(32, 37, 34, .30)' } },
      axisLabel: {
        color: '#5d655f',
        fontSize: 11,
        fontWeight: 500,
        hideOverlap: true,
        formatter: (value: number) => dateFormatter.format(new Date(value)),
      },
      nameTextStyle: { color: '#5d655f', fontSize: 11, fontWeight: 600 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: axisMinimum,
      max: axisMaximum,
      splitNumber: 4,
      name: `${translate(metric.short || metric.label)} (${metric.unit})`,
      nameLocation: 'middle',
      nameGap: 56,
      axisLine: { show: true, lineStyle: { color: colors[0], width: 1.2 } },
      axisTick: { show: true, lineStyle: { color: colors[0] } },
      axisLabel: {
        color: colors[0],
        fontSize: 12,
        fontWeight: 500,
        margin: 12,
        formatter: (value: number) => new Intl.NumberFormat(locale(), {
          minimumFractionDigits: metric.decimals,
          maximumFractionDigits: metric.decimals,
        }).format(value),
      },
      nameTextStyle: { color: colors[0], fontSize: 12, fontWeight: 600 },
      splitLine: { lineStyle: { color: 'rgba(216, 219, 215, .72)', width: 1 } },
    },
    series: prepared.map((item, index) => {
      const values = item.normalized.map((point) => point.value)
      const minimum = Math.min(...values)
      const maximum = Math.max(...values)
      const minimumPoint = item.normalized[values.indexOf(minimum)]
      const maximumPoint = item.normalized[values.indexOf(maximum)]
      const color = colors[index]
      const firstSeries = index === 0
      return {
        name: item.name,
        type: 'line',
        showSymbol: false,
        symbol: 'circle',
        symbolSize: 7,
        smooth: rangeKey === '24h' ? .32 : false,
        smoothMonotone: rangeKey === '24h' ? 'x' : undefined,
        connectNulls: false,
        animation: false,
        lineStyle: { width: 2, cap: 'round', join: 'round' },
        emphasis: { focus: prepared.length > 1 ? 'series' : 'none' },
        data: item.normalized.map((point) => [point.timestamp, point.value]),
        markArea: firstSeries && hasVisibleTargetBand ? {
          silent: true,
          itemStyle: { color: colorWithAlpha(color, .09) },
          data: [[{ yAxis: targetVisible?.[0] }, { yAxis: targetVisible?.[1] }]],
        } : undefined,
        markLine: firstSeries && target ? {
          silent: true,
          symbol: ['none', 'none'],
          lineStyle: { color, width: 1.25, type: 'dashed', opacity: .72 },
          label: {
            show: true,
            position: 'insideStartTop',
            color,
            fontSize: 11,
            fontWeight: 600,
            backgroundColor: 'rgba(255, 255, 255, .92)',
            borderColor: 'rgba(216, 219, 215, .75)',
            borderWidth: 1,
            borderRadius: 8,
            padding: [4, 7],
          },
          data: [
            target[0] >= axisMinimum && target[0] <= axisMaximum
              ? { yAxis: target[0], label: { formatter: `${translate('Selected target min')} ${valueLabel(target[0])}` } }
              : null,
            target[1] >= axisMinimum && target[1] <= axisMaximum
              ? { yAxis: target[1], label: { formatter: `${translate('Selected target max')} ${valueLabel(target[1])}` } }
              : null,
            offscreenTargetLabel
              ? {
                  yAxis: targetBelow ? axisMinimum : axisMaximum,
                  lineStyle: { type: 'dotted', opacity: .48 },
                  label: {
                    formatter: offscreenTargetLabel,
                    position: targetBelow ? 'insideStartBottom' : 'insideStartTop',
                  },
                }
              : null,
          ].filter(Boolean),
        } : undefined,
        markPoint: prepared.length === 1 ? {
          silent: true,
          symbol: 'circle',
          symbolSize: 9,
          itemStyle: { color: '#fff', borderColor: color, borderWidth: 2 },
          label: {
            color,
            fontSize: 11,
            fontWeight: 600,
            backgroundColor: 'rgba(255, 255, 255, .94)',
            borderRadius: 7,
            padding: [3, 6],
          },
          data: [
            { name: translate('Minimum'), coord: [minimumPoint.timestamp, minimum], label: { formatter: `MIN ${valueLabel(minimum)}`, position: 'bottom' } },
            { name: translate('Maximum'), coord: [maximumPoint.timestamp, maximum], label: { formatter: `MAX ${valueLabel(maximum)}`, position: 'top' } },
          ],
        } : undefined,
      }
    }),
  }
}

export function renderTrendChart(element: HTMLElement, input: TrendChartInput): TrendChartInstance | null {
  const option = buildTrendChartOption(input)
  const engine = window.echarts as EChartsEngine | undefined
  if (!option || !engine?.init) return null
  const chart = engine.init(element)
  chart.setOption(option, { notMerge: true })
  window.requestAnimationFrame(() => chart.resize())
  return chart
}
