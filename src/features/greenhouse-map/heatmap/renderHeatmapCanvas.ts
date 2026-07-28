import { bandedColorAt } from './heatmapColorScale'
import type { HeatmapGrid } from './heatmapTypes'

const TARGET_LONG_SIDE_PX = 1200
const MAX_RENDER_PIXELS = 1_200_000

function renderResolution(grid: HeatmapGrid) {
  const longest = Math.max(grid.width, grid.height)
  let width = Math.max(grid.width, Math.round(TARGET_LONG_SIDE_PX * grid.width / longest))
  let height = Math.max(grid.height, Math.round(TARGET_LONG_SIDE_PX * grid.height / longest))
  if (width * height > MAX_RENDER_PIXELS) {
    const ratio = Math.sqrt(MAX_RENDER_PIXELS / (width * height))
    width = Math.max(grid.width, Math.floor(width * ratio))
    height = Math.max(grid.height, Math.floor(height * ratio))
  }
  return { width, height }
}

function bilinearSample(values: Float32Array, gridWidth: number, gridHeight: number, x: number, y: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(gridWidth - 1, x0 + 1)
  const y1 = Math.min(gridHeight - 1, y0 + 1)
  const tx = x - x0
  const ty = y - y0
  const top = values[y0 * gridWidth + x0] * (1 - tx) + values[y0 * gridWidth + x1] * tx
  const bottom = values[y1 * gridWidth + x0] * (1 - tx) + values[y1 * gridWidth + x1] * tx
  return top * (1 - ty) + bottom * ty
}

export function renderHeatmapCanvas(grid: HeatmapGrid, colors: [string, string, string], colorStepCount: number, opacity: number, showConfidence: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const resolution = renderResolution(grid)
  canvas.width = resolution.width
  canvas.height = resolution.height
  const context = canvas.getContext('2d')
  if (!context) return canvas
  const image = context.createImageData(resolution.width, resolution.height)
  for (let y = 0; y < resolution.height; y += 1) {
    const sourceY = y / Math.max(1, resolution.height - 1) * (grid.height - 1)
    for (let x = 0; x < resolution.width; x += 1) {
      const sourceX = x / Math.max(1, resolution.width - 1) * (grid.width - 1)
      const target = (y * resolution.width + x) * 4
      const value = bilinearSample(grid.values, grid.width, grid.height, sourceX, sourceY)
      const [r, g, b] = bandedColorAt(value, grid.min, grid.max, colors, colorStepCount)
      const confidence = showConfidence
        ? bilinearSample(grid.confidence, grid.width, grid.height, sourceX, sourceY)
        : 1
      image.data[target] = r
      image.data[target + 1] = g
      image.data[target + 2] = b
      image.data[target + 3] = Math.round(255 * opacity * (0.78 + confidence * 0.22))
    }
  }
  context.putImageData(image, 0, 0)
  return canvas
}
