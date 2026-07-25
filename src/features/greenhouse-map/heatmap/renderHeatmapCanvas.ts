import { colorAt } from './heatmapColorScale'
import type { HeatmapGrid } from './heatmapTypes'

export function renderHeatmapCanvas(grid: HeatmapGrid, colors: [string, string, string], opacity: number, showConfidence: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = grid.width
  canvas.height = grid.height
  const context = canvas.getContext('2d')
  if (!context) return canvas
  const image = context.createImageData(grid.width, grid.height)
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const source = y * grid.width + x
      const target = ((grid.height - 1 - y) * grid.width + x) * 4
      const [r, g, b] = colorAt(grid.values[source], grid.min, grid.max, colors)
      const confidence = showConfidence ? grid.confidence[source] : 1
      image.data[target] = r
      image.data[target + 1] = g
      image.data[target + 2] = b
      image.data[target + 3] = Math.round(255 * opacity * (0.25 + confidence * 0.75))
    }
  }
  context.putImageData(image, 0, 0)
  return canvas
}
