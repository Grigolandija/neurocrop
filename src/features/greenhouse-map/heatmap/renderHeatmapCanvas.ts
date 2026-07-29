import { colorAt, colorAtStops } from './heatmapColorScale'
import type { HeatmapGrid } from './heatmapTypes'
import { METRICS, type MetricKey } from '../model'

export function renderHeatmapCanvas(grid: HeatmapGrid, metric: MetricKey, colors: readonly string[], opacity: number, showConfidence: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = grid.width
  canvas.height = grid.height
  const context = canvas.getContext('2d')
  if (!context) return canvas
  const image = context.createImageData(grid.width, grid.height)
  for (let index = 0; index < grid.values.length; index += 1) {
    const target = index * 4
    if (!grid.dataMask[index] || !Number.isFinite(grid.values[index])) {
      image.data[target] = 174
      image.data[target + 1] = 181
      image.data[target + 2] = 177
      image.data[target + 3] = Math.round(255 * opacity * 0.16)
      continue
    }
    const value = grid.values[index]
    const colorStops = METRICS[metric].colorStops
    const [r, g, b] = colorStops?.length
      ? colorAtStops(value, colorStops)
      : colorAt(value, grid.min, grid.max, colors)
    const confidence = showConfidence ? grid.confidence[index] : 1
    const gray = Math.round(r * 0.2126 + g * 0.7152 + b * 0.0722)
    const saturation = 0.68 + confidence * 0.32
    image.data[target] = Math.round(gray + (r - gray) * saturation)
    image.data[target + 1] = Math.round(gray + (g - gray) * saturation)
    image.data[target + 2] = Math.round(gray + (b - gray) * saturation)
    image.data[target + 3] = Math.round(255 * opacity)
  }
  context.putImageData(image, 0, 0)
  return canvas
}
