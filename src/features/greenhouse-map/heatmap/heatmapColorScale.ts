export function parseHex(hex: string) {
  const value = hex.replace('#', '')
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)]
}

export function colorAt(value: number, min: number, max: number, colors: readonly string[]) {
  const t = Math.max(0, Math.min(1, (value - min) / Math.max(max - min, 1e-6)))
  const position = t * Math.max(1, colors.length - 1)
  const lowerIndex = Math.min(colors.length - 1, Math.floor(position))
  const upperIndex = Math.min(colors.length - 1, lowerIndex + 1)
  const mix = position - lowerIndex
  const lower = parseHex(colors[lowerIndex])
  const upper = parseHex(colors[upperIndex])
  return lower.map((channel, index) =>
    Math.round(channel + (upper[index] - channel) * mix),
  ) as [number, number, number]
}

type EsriTemperatureStop = {
  fahrenheit: number
  rgb: [number, number, number]
}

// ArcGIS Living Atlas "National Weather Service 72 Hour Temperature Forecast".
// The published layer classifies temperatures every 5 °F. NeuroCrop interpolates
// those exact class colours and then classifies the result every 1 °C.
const ESRI_TEMPERATURE_STOPS: EsriTemperatureStop[] = [
  { fahrenheit: -80, rgb: [228, 240, 255] },
  { fahrenheit: -57.5, rgb: [219, 233, 251] },
  { fahrenheit: -52.5, rgb: [211, 226, 247] },
  { fahrenheit: -47.5, rgb: [202, 219, 243] },
  { fahrenheit: -42.5, rgb: [193, 212, 238] },
  { fahrenheit: -37.5, rgb: [184, 205, 234] },
  { fahrenheit: -32.5, rgb: [175, 198, 230] },
  { fahrenheit: -27.5, rgb: [166, 191, 226] },
  { fahrenheit: -22.5, rgb: [157, 184, 222] },
  { fahrenheit: -17.5, rgb: [147, 176, 215] },
  { fahrenheit: -12.5, rgb: [137, 165, 205] },
  { fahrenheit: -7.5, rgb: [127, 155, 195] },
  { fahrenheit: -2.5, rgb: [117, 144, 185] },
  { fahrenheit: 2.5, rgb: [96, 123, 165] },
  { fahrenheit: 7.5, rgb: [86, 113, 155] },
  { fahrenheit: 12.5, rgb: [76, 102, 145] },
  { fahrenheit: 17.5, rgb: [66, 92, 136] },
  { fahrenheit: 22.5, rgb: [56, 81, 126] },
  { fahrenheit: 27.5, rgb: [46, 71, 116] },
  { fahrenheit: 32.5, rgb: [38, 66, 110] },
  { fahrenheit: 37.5, rgb: [38, 79, 119] },
  { fahrenheit: 42.5, rgb: [39, 91, 128] },
  { fahrenheit: 47.5, rgb: [39, 104, 137] },
  { fahrenheit: 52.5, rgb: [40, 117, 146] },
  { fahrenheit: 57.5, rgb: [67, 129, 143] },
  { fahrenheit: 62.5, rgb: [100, 141, 138] },
  { fahrenheit: 67.5, rgb: [134, 154, 132] },
  { fahrenheit: 72.5, rgb: [172, 168, 126] },
  { fahrenheit: 77.5, rgb: [194, 172, 117] },
  { fahrenheit: 82.5, rgb: [194, 157, 97] },
  { fahrenheit: 87.5, rgb: [195, 138, 84] },
  { fahrenheit: 92.5, rgb: [190, 112, 77] },
  { fahrenheit: 97.5, rgb: [174, 77, 76] },
  { fahrenheit: 102.5, rgb: [158, 41, 76] },
  { fahrenheit: 107.5, rgb: [134, 32, 63] },
  { fahrenheit: 112.5, rgb: [110, 22, 49] },
  { fahrenheit: 117.5, rgb: [85, 12, 36] },
  { fahrenheit: 135, rgb: [61, 2, 22] },
]

const ESRI_DISPLAY_RAMP: Array<[number, number, number]> = [
  [255, 255, 204],
  [255, 237, 160],
  [254, 217, 118],
  [254, 178, 76],
  [253, 141, 60],
  [252, 78, 42],
  [227, 26, 28],
  [189, 0, 38],
  [128, 0, 38],
]

function colorFromRamp(colors: Array<[number, number, number]>, amount: number): [number, number, number] {
  const position = Math.max(0, Math.min(1, amount)) * (colors.length - 1)
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.min(colors.length - 1, lowerIndex + 1)
  const mix = position - lowerIndex
  return colors[lowerIndex].map((channel, index) =>
    Math.round(channel + (colors[upperIndex][index] - channel) * mix),
  ) as [number, number, number]
}

function esriTemperatureRampColorAtCelsius(valueC: number): [number, number, number] {
  const valueF = valueC * 9 / 5 + 32
  const first = ESRI_TEMPERATURE_STOPS[0]
  const last = ESRI_TEMPERATURE_STOPS.at(-1)!
  if (valueF <= first.fahrenheit) return first.rgb
  if (valueF >= last.fahrenheit) return last.rgb
  const upperIndex = ESRI_TEMPERATURE_STOPS.findIndex((stop) => stop.fahrenheit >= valueF)
  const lower = ESRI_TEMPERATURE_STOPS[upperIndex - 1]
  const upper = ESRI_TEMPERATURE_STOPS[upperIndex]
  const amount = (valueF - lower.fahrenheit) / (upper.fahrenheit - lower.fahrenheit)
  return lower.rgb.map((channel, index) =>
    Math.round(channel + (upper.rgb[index] - channel) * amount),
  ) as [number, number, number]
}

export function esriTemperatureColorAt(valueC: number, min?: number, max?: number): [number, number, number] {
  const classCenterC = Math.floor(valueC + 1e-9) + 0.5
  if (min === undefined || max === undefined) return esriTemperatureRampColorAtCelsius(classCenterC)
  return colorFromRamp(ESRI_DISPLAY_RAMP, (valueC - min) / Math.max(max - min, 1e-6))
}

export function esriTemperatureGradient(): string {
  const stops = ESRI_DISPLAY_RAMP.map(([red, green, blue], index) =>
    `rgb(${red} ${green} ${blue}) ${index / Math.max(1, ESRI_DISPLAY_RAMP.length - 1) * 100}%`)
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

export function continuousGradient(colors: readonly string[]): string {
  return `linear-gradient(90deg, ${colors.map((color, index) =>
    `${color} ${index / Math.max(1, colors.length - 1) * 100}%`).join(', ')})`
}

export function bandedColorAt(value: number, min: number, max: number, colors: readonly string[], interval: number) {
  const safeInterval = Number.isFinite(interval) && interval > 0 ? interval : Math.max(max - min, 1e-6)
  const bandStart = Math.floor((value + safeInterval * 1e-9) / safeInterval) * safeInterval
  const bandCenter = Math.max(min, Math.min(max, bandStart + safeInterval / 2))
  return colorAt(bandCenter, min, max, colors)
}

export function bandedGradient(min: number, max: number, colors: readonly string[], interval: number) {
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
