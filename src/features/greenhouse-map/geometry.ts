import type { GreenhouseObject, ObjectType } from './model'

export type ViewTransform = { scale: number; offsetX: number; offsetY: number }
export type PerimeterWall = 'south' | 'north' | 'west' | 'east'

const wallMountedTypes = new Set<ObjectType>(['door', 'window', 'ventilation-opening'])

export function isWallMountedType(type: ObjectType) {
  return wallMountedTypes.has(type)
}

export function worldToScreen(xM: number, yM: number, heightM: number, transform: ViewTransform) {
  return { x: transform.offsetX + xM * transform.scale, y: transform.offsetY + (heightM - yM) * transform.scale }
}

export function screenToWorld(x: number, y: number, heightM: number, transform: ViewTransform) {
  return { xM: (x - transform.offsetX) / transform.scale, yM: heightM - (y - transform.offsetY) / transform.scale }
}

export function snapValue(value: number, gridM: number, enabled = true) {
  return enabled ? Math.round(value / gridM) * gridM : value
}

function magneticAxisPosition(originM: number, sizeM: number, gridM: number, toleranceM: number) {
  const candidates = [0, sizeM / 2, sizeM].map((offsetM) => {
    const anchorM = originM + offsetM
    return { deltaM: snapValue(anchorM, gridM) - anchorM }
  })
  const nearest = candidates.reduce((best, candidate) =>
    Math.abs(candidate.deltaM) < Math.abs(best.deltaM) ? candidate : best)
  return Math.abs(nearest.deltaM) <= toleranceM ? originM + nearest.deltaM : originM
}

export function snapRectanglePosition(
  position: { xM: number; yM: number },
  size: { widthM: number; lengthM: number },
  gridM: number,
  enabled = true,
  toleranceM = gridM * 0.28,
) {
  if (!enabled || !Number.isFinite(gridM) || gridM <= 0) return position
  return {
    xM: magneticAxisPosition(position.xM, size.widthM, gridM, toleranceM),
    yM: magneticAxisPosition(position.yM, size.lengthM, gridM, toleranceM),
  }
}

export function snapRectangleBounds(
  rectangle: { xM: number; yM: number; widthM: number; lengthM: number },
  gridM: number,
  enabled = true,
  toleranceM = gridM * 0.28,
) {
  if (!enabled || !Number.isFinite(gridM) || gridM <= 0) return rectangle
  const snapEdge = (valueM: number) => {
    const snappedM = snapValue(valueM, gridM)
    return Math.abs(snappedM - valueM) <= toleranceM ? snappedM : valueM
  }
  const leftM = snapEdge(rectangle.xM)
  const rightM = snapEdge(rectangle.xM + rectangle.widthM)
  const bottomM = snapEdge(rectangle.yM)
  const topM = snapEdge(rectangle.yM + rectangle.lengthM)
  return {
    xM: leftM,
    yM: bottomM,
    widthM: Math.max(0.05, rightM - leftM),
    lengthM: Math.max(0.05, topM - bottomM),
  }
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

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))

export function snapWallMountedObject<T extends GreenhouseObject>(
  object: T,
  dimensions: { widthM: number; lengthM: number },
  preferredWall?: PerimeterWall,
): T {
  if (!isWallMountedType(object.type)) return object

  const centerX = object.xM + object.widthM / 2
  const centerY = object.yM + object.lengthM / 2
  const wall = preferredWall ?? ([
    ['west', Math.abs(centerX)],
    ['east', Math.abs(dimensions.widthM - centerX)],
    ['south', Math.abs(centerY)],
    ['north', Math.abs(dimensions.lengthM - centerY)],
  ] as Array<[PerimeterWall, number]>).reduce((closest, candidate) => candidate[1] < closest[1] ? candidate : closest)[0]

  const horizontal = wall === 'south' || wall === 'north'
  const maximumSpan = horizontal ? dimensions.widthM : dimensions.lengthM
  const maximumThickness = horizontal ? dimensions.lengthM : dimensions.widthM
  const spanM = Math.min(maximumSpan, Math.max(object.widthM, object.lengthM))
  const thicknessM = Math.min(maximumThickness, Math.min(object.widthM, object.lengthM))
  const alongWallCenter = horizontal ? centerX : centerY
  const offsetM = clamp(alongWallCenter - spanM / 2, 0, Math.max(0, maximumSpan - spanM))

  return {
    ...object,
    xM: wall === 'west' ? 0 : wall === 'east' ? dimensions.widthM - thicknessM : offsetM,
    yM: wall === 'south' ? 0 : wall === 'north' ? dimensions.lengthM - thicknessM : offsetM,
    widthM: horizontal ? spanM : thicknessM,
    lengthM: horizontal ? thicknessM : spanM,
    rotationDeg: 0,
    metadata: { ...object.metadata, wallMount: { wall, offsetM } },
  }
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
