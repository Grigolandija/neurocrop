/** Round 1/2/5 axis intervals, without extending the field's actual colour range. */
export function colorLegend(min: number, max: number, metricDecimals: number) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return { ticks: [], decimals: metricDecimals }
  if (min === max) return { ticks: [{ value: min, position: .5 }], decimals: metricDecimals }

  const interval = (max - min) / 5
  const power = Math.floor(Math.log10(interval))
  const magnitude = 10 ** power
  const fraction = interval / magnitude
  const factor = fraction >= Math.sqrt(50) ? 10 : fraction >= Math.sqrt(10) ? 5 : fraction >= Math.sqrt(2) ? 2 : 1
  const step = factor * magnitude
  const first = Math.ceil(min / step - 1e-9)
  const last = Math.floor(max / step + 1e-9)
  const decimals = Math.min(12, Math.max(metricDecimals, -Math.floor(Math.log10(step))))
  const ticks = Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => {
    const value = Number(((first + index) * step).toPrecision(12))
    return { value: Object.is(value, -0) ? 0 : value, position: Math.max(0, Math.min(1, (max - value) / (max - min))) }
  })
  return { ticks, decimals }
}
