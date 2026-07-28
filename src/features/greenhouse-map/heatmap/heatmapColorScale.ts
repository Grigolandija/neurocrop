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

export function bandedColorAt(value: number, min: number, max: number, colors: [string, string, string], interval: number) {
  const safeInterval = Number.isFinite(interval) && interval > 0 ? interval : Math.max(max - min, 1e-6)
  const bandStart = Math.floor((value + safeInterval * 1e-9) / safeInterval) * safeInterval
  const bandCenter = Math.max(min, Math.min(max, bandStart + safeInterval / 2))
  return colorAt(bandCenter, min, max, colors)
}

export function bandedGradient(min: number, max: number, colors: [string, string, string], interval: number) {
  const safeRange = Math.max(max - min, 1e-6)
  const safeInterval = Number.isFinite(interval) && interval > 0 ? interval : safeRange
  const boundaries = [min]
  const first = Math.ceil((min + safeInterval * 1e-9) / safeInterval) * safeInterval
  for (let boundary = first; boundary < max - safeInterval * 1e-9; boundary += safeInterval) boundaries.push(boundary)
  boundaries.push(max)
  const stops: string[] = []
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index]
    const end = boundaries[index + 1]
    const [red, green, blue] = colorAt((start + end) / 2, min, max, colors)
    const color = `rgb(${red} ${green} ${blue})`
    stops.push(`${color} ${(start - min) / safeRange * 100}%`, `${color} ${(end - min) / safeRange * 100}%`)
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`
}
