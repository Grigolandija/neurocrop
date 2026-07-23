import { useEffect, useRef } from 'react'

type TopographicTone = 'action' | 'watch' | 'stable' | 'unknown'
type Point = { x: number; y: number }
type Peak = { x: number; y: number; amplitude: number; radiusX: number; radiusY: number }

const peaksByTone: Record<TopographicTone, Peak[]> = {
  action: [
    { x: .18, y: .48, amplitude: 1.25, radiusX: .18, radiusY: .23 },
    { x: .74, y: .23, amplitude: 1.05, radiusX: .2, radiusY: .18 },
    { x: .67, y: .79, amplitude: .78, radiusX: .24, radiusY: .2 },
    { x: .96, y: .62, amplitude: .56, radiusX: .16, radiusY: .23 },
    { x: .42, y: .46, amplitude: -.34, radiusX: .22, radiusY: .18 },
  ],
  watch: [
    { x: .2, y: .42, amplitude: 1.02, radiusX: .2, radiusY: .22 },
    { x: .7, y: .28, amplitude: .9, radiusX: .22, radiusY: .19 },
    { x: .7, y: .82, amplitude: .68, radiusX: .25, radiusY: .2 },
    { x: .43, y: .5, amplitude: -.3, radiusX: .24, radiusY: .2 },
  ],
  stable: [
    { x: .18, y: .27, amplitude: .82, radiusX: .2, radiusY: .2 },
    { x: .75, y: .24, amplitude: .9, radiusX: .21, radiusY: .18 },
    { x: .6, y: .78, amplitude: .78, radiusX: .25, radiusY: .21 },
    { x: .96, y: .7, amplitude: .55, radiusX: .16, radiusY: .2 },
    { x: .4, y: .48, amplitude: -.28, radiusX: .24, radiusY: .2 },
  ],
  unknown: [
    { x: .18, y: .3, amplitude: .7, radiusX: .21, radiusY: .22 },
    { x: .73, y: .27, amplitude: .67, radiusX: .22, radiusY: .2 },
    { x: .6, y: .78, amplitude: .58, radiusX: .26, radiusY: .22 },
    { x: .4, y: .5, amplitude: -.25, radiusX: .25, radiusY: .22 },
  ],
}

const palettes: Record<TopographicTone, [number, number, number][]> = {
  action: [[39, 117, 112], [110, 178, 96], [219, 213, 72], [235, 145, 45], [210, 75, 56]],
  watch: [[43, 119, 118], [91, 169, 105], [201, 216, 72], [224, 159, 45]],
  stable: [[43, 119, 121], [55, 151, 113], [113, 188, 91], [193, 225, 78]],
  unknown: [[88, 132, 136], [92, 155, 137], [151, 180, 117], [196, 196, 100]],
}

function interpolateColor(palette: [number, number, number][], value: number) {
  const scaled = Math.max(0, Math.min(1, value)) * (palette.length - 1)
  const index = Math.min(palette.length - 2, Math.floor(scaled))
  const amount = scaled - index
  return palette[index].map((channel, channelIndex) =>
    Math.round(channel + (palette[index + 1][channelIndex] - channel) * amount),
  )
}

function createField(columns: number, rows: number, tone: TopographicTone) {
  const values = new Float32Array(columns * rows)
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column / (columns - 1)
      const y = row / (rows - 1)
      let value = .08 * Math.sin(x * Math.PI * 3.2 + y * 2.1)
        + .05 * Math.cos(y * Math.PI * 4.1 - x * 1.7)

      for (const peak of peaksByTone[tone]) {
        const distance = ((x - peak.x) ** 2) / (2 * peak.radiusX ** 2)
          + ((y - peak.y) ** 2) / (2 * peak.radiusY ** 2)
        value += peak.amplitude * Math.exp(-distance)
      }

      const index = row * columns + column
      values[index] = value
      minimum = Math.min(minimum, value)
      maximum = Math.max(maximum, value)
    }
  }

  const range = Math.max(.001, maximum - minimum)
  for (let index = 0; index < values.length; index += 1) {
    values[index] = (values[index] - minimum) / range
  }
  return values
}

function edgePoint(
  edge: number,
  column: number,
  row: number,
  threshold: number,
  topLeft: number,
  topRight: number,
  bottomRight: number,
  bottomLeft: number,
): Point {
  const interpolate = (start: number, end: number) =>
    Math.max(0, Math.min(1, (threshold - start) / (end - start || .0001)))

  if (edge === 0) return { x: column + interpolate(topLeft, topRight), y: row }
  if (edge === 1) return { x: column + 1, y: row + interpolate(topRight, bottomRight) }
  if (edge === 2) return { x: column + interpolate(bottomLeft, bottomRight), y: row + 1 }
  return { x: column, y: row + interpolate(topLeft, bottomLeft) }
}

function drawContours(
  context: CanvasRenderingContext2D,
  values: Float32Array,
  columns: number,
  rows: number,
  width: number,
  height: number,
) {
  const thresholds = [.14, .23, .32, .41, .5, .59, .68, .77, .86]
  const scaleX = width / (columns - 1)
  const scaleY = height / (rows - 1)

  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'

  thresholds.forEach((threshold, thresholdIndex) => {
    context.beginPath()
    for (let row = 0; row < rows - 1; row += 1) {
      for (let column = 0; column < columns - 1; column += 1) {
        const topLeft = values[row * columns + column]
        const topRight = values[row * columns + column + 1]
        const bottomRight = values[(row + 1) * columns + column + 1]
        const bottomLeft = values[(row + 1) * columns + column]
        const corners = [topLeft, topRight, bottomRight, bottomLeft]
        const edges: number[] = []

        for (let edge = 0; edge < 4; edge += 1) {
          const next = (edge + 1) % 4
          if ((corners[edge] >= threshold) !== (corners[next] >= threshold)) edges.push(edge)
        }
        if (edges.length !== 2 && edges.length !== 4) continue

        const points = edges.map((edge) => edgePoint(
          edge, column, row, threshold, topLeft, topRight, bottomRight, bottomLeft,
        ))
        const drawSegment = (start: Point, end: Point) => {
          context.moveTo(start.x * scaleX, start.y * scaleY)
          context.lineTo(end.x * scaleX, end.y * scaleY)
        }

        if (points.length === 2) {
          drawSegment(points[0], points[1])
        } else {
          const center = (topLeft + topRight + bottomRight + bottomLeft) / 4
          if (center >= threshold) {
            drawSegment(points[0], points[1])
            drawSegment(points[2], points[3])
          } else {
            drawSegment(points[0], points[3])
            drawSegment(points[1], points[2])
          }
        }
      }
    }
    context.strokeStyle = thresholdIndex % 3 === 0
      ? 'rgba(30, 72, 57, .25)'
      : 'rgba(42, 87, 68, .17)'
    context.lineWidth = thresholdIndex % 3 === 0 ? 1 : .7
    context.stroke()
  })
  context.restore()
}

function drawField(canvas: HTMLCanvasElement, tone: TopographicTone) {
  const bounds = canvas.getBoundingClientRect()
  const width = Math.max(1, Math.round(bounds.width))
  const height = Math.max(1, Math.round(bounds.height))
  const ratio = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)

  const context = canvas.getContext('2d')
  if (!context) return
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, width, height)

  const columns = 150
  const rows = Math.max(80, Math.round(columns * height / width))
  const values = createField(columns, rows, tone)
  const heatmap = document.createElement('canvas')
  heatmap.width = columns
  heatmap.height = rows
  const heatmapContext = heatmap.getContext('2d')
  if (!heatmapContext) return
  const image = heatmapContext.createImageData(columns, rows)
  const palette = palettes[tone]

  values.forEach((value, index) => {
    const [red, green, blue] = interpolateColor(palette, value)
    image.data[index * 4] = red
    image.data[index * 4 + 1] = green
    image.data[index * 4 + 2] = blue
    image.data[index * 4 + 3] = Math.round(28 + value * 55)
  })
  heatmapContext.putImageData(image, 0, 0)

  context.save()
  context.imageSmoothingEnabled = true
  context.filter = 'blur(13px) saturate(.92)'
  context.drawImage(heatmap, -18, -18, width + 36, height + 36)
  context.restore()
  drawContours(context, values, columns, rows, width, height)
}

export default function TopographicField({ tone }: { tone: TopographicTone }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const render = () => drawField(canvas, tone)
    const observer = new ResizeObserver(render)
    observer.observe(canvas)
    render()
    return () => observer.disconnect()
  }, [tone])

  return <canvas ref={canvasRef} className="nc-topographic-field" aria-hidden="true" />
}
