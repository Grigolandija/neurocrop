import { describe, expect, it } from 'vitest'
import { buildTrendsCsv } from './trendsCsv'

const temperature = {
  key: 'airTemp',
  label: 'Air temperature',
  short: 'Temperature',
  unit: '°C',
  decimals: 1,
  icon: 'fa-temperature-half',
}

describe('Trends CSV export', () => {
  it('exports displayed data in chronological, analysis-friendly rows', () => {
    const csv = buildTrendsCsv([{
      area: 'Šiltnamis 2',
      section: 'Pomidorai',
      sourceType: 'Section aggregate',
      source: 'Pomidorai',
      metric: temperature,
      aggregation: 'section median',
      points: [
        { observedAt: '2026-08-02T06:10:00.000Z', value: 26.24 },
        { observedAt: '2026-08-02T06:00:00.000Z', value: 25.96 },
      ],
    }], 'Last 24 hours')

    const lines = csv.trim().split('\n')
    expect(lines[0]).toContain('"Timestamp (ISO 8601)";"Local date";"Local time (Europe/Vilnius)"')
    expect(lines[1]).toContain('"2026-08-02T06:00:00.000Z";"2026-08-02";"09:00:00"')
    expect(lines[1]).toContain('"Air temperature";"26.0";"°C";"section median";"Last 24 hours"')
    expect(lines[2]).toContain('"2026-08-02T06:10:00.000Z"')
  })

  it('prevents spreadsheet formulas in customer-controlled labels', () => {
    const csv = buildTrendsCsv([{
      area: '=malicious()',
      section: 'Section',
      sourceType: 'Node',
      source: '+node',
      metric: temperature,
      aggregation: 'Node history',
      points: [{ observedAt: '2026-08-02T06:00:00.000Z', value: 20 }],
    }], 'Last 7 days')

    expect(csv).toContain('"\'=malicious()"')
    expect(csv).toContain('"\'+node"')
  })
})
