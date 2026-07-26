import { describe, expect, it } from 'vitest'
import { buildTrendChartOption, getTrendAxisDomain, type TrendMetric } from './sharedTrendChart'

const temperature: TrendMetric = {
  key: 'airTemp',
  label: 'Air temperature',
  short: 'Temperature',
  unit: '°C',
  decimals: 1,
}

const point = (hour: number, value: number) => ({
  observedAt: `2026-07-26T${String(hour).padStart(2, '0')}:00:00.000Z`,
  value,
})

describe('shared trend chart', () => {
  it('keeps each Node series independent', () => {
    const option = buildTrendChartOption({
      metric: temperature,
      rangeKey: '24h',
      target: [18, 22],
      series: [
        { name: 'NSN-000003', points: [point(10, 27.1), point(11, 27.8)] },
        { name: 'NSN-000004', points: [point(10, 19.6), point(11, 20.4)] },
        { name: 'NSN-000006', points: [point(10, 18.9), point(11, 17.2)] },
      ],
    }) as unknown as { series: Array<{ name: string; data: Array<[number, number]> }> }

    expect(option.series.map((series) => series.name)).toEqual(['NSN-000003', 'NSN-000004', 'NSN-000006'])
    expect(option.series.map((series) => series.data.map((entry) => entry[1]))).toEqual([
      [27.1, 27.8],
      [19.6, 20.4],
      [18.9, 17.2],
    ])
  })

  it('does not flatten a measured curve to include a distant target', () => {
    const [minimum, maximum] = getTrendAxisDomain([26.1, 26.4, 26.8], temperature, [18, 22])

    expect(minimum).toBeGreaterThan(25)
    expect(maximum).toBeLessThan(28)
  })

  it('keeps the battery axis fixed to its physical percentage range', () => {
    expect(getTrendAxisDomain([63, 61], { ...temperature, key: 'batteryLevel', unit: '%' }, [20, 100]))
      .toEqual([0, 100])
  })

  it('drops invalid points without merging values between series', () => {
    const option = buildTrendChartOption({
      metric: temperature,
      rangeKey: '24h',
      target: null,
      series: [{
        name: 'NSN-000003',
        points: [
          point(10, 20),
          { observedAt: 'invalid', value: 999 },
          point(11, 21),
        ],
      }],
    }) as unknown as { series: Array<{ data: Array<[number, number]> }> }

    expect(option.series[0].data.map((entry) => entry[1])).toEqual([20, 21])
  })
})
