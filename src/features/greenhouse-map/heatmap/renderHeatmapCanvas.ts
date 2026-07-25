import { colorAt } from './heatmapColorScale'
import { createContourSegments } from './contourLines'
import type { HeatmapGrid } from './heatmapTypes'

type ContourOptions = { interval: number; unit: string }

export function renderHeatmapCanvas(grid: HeatmapGrid, colors: [string, string, string], opacity: number, showConfidence: boolean, contours?: ContourOptions): HTMLCanvasElement {
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
      image.data[target + 3] = Math.round(255 * opacity * (0.42 + confidence * 0.58))
    }
  }
  context.putImageData(image, 0, 0)
  if (contours && grid.sensorCount >= 3) {
    const segments = createContourSegments(grid, contours.interval)
    const drawSegments = (lowConfidence: boolean) => {
      context.beginPath()
      for (const segment of segments) {
        if ((segment.confidence < 0.35) !== lowConfidence) continue
        context.moveTo(segment.x1, segment.y1)
        context.lineTo(segment.x2, segment.y2)
      }
      context.setLineDash(lowConfidence ? [2, 2] : [])
      context.strokeStyle = lowConfidence ? 'rgba(20, 48, 40, .28)' : 'rgba(20, 48, 40, .62)'
      context.lineWidth = lowConfidence ? 0.65 : 0.8
      context.stroke()
    }
    drawSegments(true)
    drawSegments(false)
    context.setLineDash([])

    const bestLabelSegment = new Map<number, (typeof segments)[number]>()
    for (const segment of segments) {
      if (segment.confidence < 0.35) continue
      const current = bestLabelSegment.get(segment.level)
      const midpointX = (segment.x1 + segment.x2) / 2
      const midpointY = (segment.y1 + segment.y2) / 2
      const safelyInside = midpointX > 12 && midpointX < grid.width - 12 && midpointY > 7 && midpointY < grid.height - 7
      if (safelyInside && (!current || segment.confidence > current.confidence)) bestLabelSegment.set(segment.level, segment)
    }
    context.font = '600 6.5px "IBM Plex Mono", monospace'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    for (const [level, segment] of bestLabelSegment) {
      const x = (segment.x1 + segment.x2) / 2
      const y = (segment.y1 + segment.y2) / 2
      const label = `${level}${contours.unit === '°C' ? '°' : contours.unit}`
      const width = context.measureText(label).width + 4
      context.fillStyle = 'rgba(247, 249, 245, .82)'
      context.fillRect(x - width / 2, y - 4.5, width, 9)
      context.fillStyle = 'rgba(18, 48, 39, .9)'
      context.fillText(label, x, y + 0.25)
    }
  }
  return canvas
}
