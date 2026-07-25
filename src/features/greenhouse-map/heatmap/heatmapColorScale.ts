export const HEATMAP_COLOR_BANDS = 12

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

export function steppedColorAt(value: number, min: number, max: number, colors: [string, string, string], bands = HEATMAP_COLOR_BANDS) {
  const safeBands = Math.max(2, Math.round(bands))
  const t = Math.max(0, Math.min(1, (value - min) / Math.max(max - min, 1e-6)))
  const steppedT = Math.round(t * (safeBands - 1)) / (safeBands - 1)
  return colorAt(min + steppedT * (max - min), min, max, colors)
}

export function steppedGradient(colors: [string, string, string], bands = HEATMAP_COLOR_BANDS) {
  const safeBands = Math.max(2, Math.round(bands))
  const stops: string[] = []
  for (let index = 0; index < safeBands; index += 1) {
    const [red, green, blue] = colorAt(index, 0, safeBands - 1, colors)
    const color = `rgb(${red} ${green} ${blue})`
    stops.push(`${color} ${index / safeBands * 100}%`, `${color} ${(index + 1) / safeBands * 100}%`)
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`
}
