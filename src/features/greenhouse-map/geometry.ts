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
