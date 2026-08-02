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
  it('exports a compact chronological table for a single metric', () => {
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
    }])

    const lines = csv.trim().split('\n')
    expect(lines[0]).toBe('"Date";"Time";"Air temperature (°C)"')
    expect(lines[1]).toBe('"2026-08-02";"09:00:00";"26,0"')
    expect(lines[2]).toBe('"2026-08-02";"09:10:00";"26,2"')
  })

  it('places compared sources in separate columns and prevents spreadsheet formulas', () => {
    const csv = buildTrendsCsv([{
      area: 'Area',
      section: '=Section A',
      sourceType: 'Section aggregate',
      source: '=Section A',
      metric: temperature,
      aggregation: 'section median',
      points: [{ observedAt: '2026-08-02T06:00:00.000Z', value: 20 }],
    }, {
      area: 'Area',
      section: 'Section B',
      sourceType: 'Node',
      source: '+node',
      metric: temperature,
      aggregation: 'Node history',
      points: [{ observedAt: '2026-08-02T06:00:00.000Z', value: 21.2 }],
    }])

    const lines = csv.trim().split('\n')
    expect(lines[0]).toContain('"\'=Section A (°C)"')
    expect(lines[0]).toContain('"\'+node (°C)"')
    expect(lines[1]).toBe('"2026-08-02";"09:00:00";"20,0";"21,2"')
  })
})
