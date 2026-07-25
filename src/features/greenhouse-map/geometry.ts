export type ViewTransform = { scale: number; offsetX: number; offsetY: number }

export function worldToScreen(xM: number, yM: number, heightM: number, transform: ViewTransform) {
  return { x: transform.offsetX + xM * transform.scale, y: transform.offsetY + (heightM - yM) * transform.scale }
}

export function screenToWorld(x: number, y: number, heightM: number, transform: ViewTransform) {
  return { xM: (x - transform.offsetX) / transform.scale, yM: heightM - (y - transform.offsetY) / transform.scale }
}

export function snapValue(value: number, gridM: number, enabled = true) {
  return enabled ? Math.round(value / gridM) * gridM : value
}

export function clampObjectPosition(xM: number, yM: number, widthM: number, lengthM: number, greenhouseWidthM: number, greenhouseLengthM: number) {
  return {
    xM: Math.max(0, Math.min(greenhouseWidthM - widthM, xM)),
    yM: Math.max(0, Math.min(greenhouseLengthM - lengthM, yM)),
  }
}

export function sensorMarkerSizeM(dimensions: { widthM: number; lengthM: number }) {
  return Math.max(.16, Math.min(1.5, Math.min(dimensions.widthM, dimensions.lengthM) * .06))
}

type Rectangle = { id: string; xM: number; yM: number; widthM: number; lengthM: number }

export function rectangleOverlapArea(left: Rectangle, right: Rectangle) {
  const width = Math.max(0, Math.min(left.xM + left.widthM, right.xM + right.widthM) - Math.max(left.xM, right.xM))
  const length = Math.max(0, Math.min(left.yM + left.lengthM, right.yM + right.lengthM) - Math.max(left.yM, right.yM))
  return width * length
}

export function sectionGeometrySummary(sections: Rectangle[], dimensions: { widthM: number; lengthM: number }) {
  const overlaps: Array<{ leftId: string; rightId: string; areaM2: number }> = []
  for (let left = 0; left < sections.length; left += 1) {
    for (let right = left + 1; right < sections.length; right += 1) {
      const areaM2 = rectangleOverlapArea(sections[left], sections[right])
      if (areaM2 > .001) overlaps.push({ leftId: sections[left].id, rightId: sections[right].id, areaM2 })
    }
  }
  const samplesX = 80
  const samplesY = Math.max(20, Math.round(samplesX * dimensions.lengthM / dimensions.widthM))
  let covered = 0
  for (let y = 0; y < samplesY; y += 1) {
    for (let x = 0; x < samplesX; x += 1) {
      const xM = (x + .5) * dimensions.widthM / samplesX
      const yM = (y + .5) * dimensions.lengthM / samplesY
      if (sections.some((section) => xM >= section.xM && xM <= section.xM + section.widthM && yM >= section.yM && yM <= section.yM + section.lengthM)) covered += 1
    }
  }
  const coveragePercent = sections.length ? Math.round(covered / (samplesX * samplesY) * 100) : 0
  return { overlaps, coveragePercent, uncoveredPercent: 100 - coveragePercent }
}

export function snapSectionToWalls<T extends Rectangle>(section: T, dimensions: { widthM: number; lengthM: number }, thresholdM: number): T {
  let { xM, yM } = section
  if (xM <= thresholdM) xM = 0
  if (yM <= thresholdM) yM = 0
  if (dimensions.widthM - xM - section.widthM <= thresholdM) xM = dimensions.widthM - section.widthM
  if (dimensions.lengthM - yM - section.lengthM <= thresholdM) yM = dimensions.lengthM - section.lengthM
  return { ...section, xM: Math.max(0, xM), yM: Math.max(0, yM) }
}
