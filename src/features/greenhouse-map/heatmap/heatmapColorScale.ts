export function parseHex(hex: string) {
  const value = hex.replace('#', '')
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)]
}

export function colorAt(value: number, min: number, max: number, colors: [string, string, string]) {
  const t = Math.max(0, Math.min(1, (value - min) / Math.max(max - min, 1e-6)))
  const segment = t < 0.5 ? [colors[0], colors[1], t * 2] as const : [colors[1], colors[2], (t - 0.5) * 2] as const
  const a = parseHex(segment[0])
  const b = parseHex(segment[1])
  return [
    Math.round(a[0] + (b[0] - a[0]) * segment[2]),
    Math.round(a[1] + (b[1] - a[1]) * segment[2]),
    Math.round(a[2] + (b[2] - a[2]) * segment[2]),
  ]
}

export const HEATMAP_COLOR_STEPS = 12

export function bandedColorAt(value: number, min: number, max: number, colors: [string, string, string], stepCount = HEATMAP_COLOR_STEPS) {
  const safeStepCount = Math.max(1, Math.floor(stepCount))
  const safeRange = Math.max(max - min, 1e-6)
  const normalized = Math.max(0, Math.min(1, (value - min) / safeRange))
  const stepIndex = Math.min(safeStepCount - 1, Math.floor(normalized * safeStepCount))
  const stepCenter = min + (stepIndex + 0.5) / safeStepCount * safeRange
  return colorAt(stepCenter, min, max, colors)
}

export function bandedGradient(min: number, max: number, colors: [string, string, string], stepCount = HEATMAP_COLOR_STEPS) {
  const safeStepCount = Math.max(1, Math.floor(stepCount))
  const safeRange = Math.max(max - min, 1e-6)
  const stops: string[] = []
  for (let index = 0; index < safeStepCount; index += 1) {
    const startPercent = index / safeStepCount * 100
    const endPercent = (index + 1) / safeStepCount * 100
    const stepCenter = min + (index + 0.5) / safeStepCount * safeRange
    const [red, green, blue] = colorAt(stepCenter, min, max, colors)
    const color = `rgb(${red} ${green} ${blue})`
    stops.push(`${color} ${startPercent}%`, `${color} ${endPercent}%`)
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`
}
