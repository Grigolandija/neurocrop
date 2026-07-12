type Translator = (english: string, lithuanian: string) => string

type NodeHealthInput = {
  sensorPresence?: Record<string, boolean>
  errorFlags?: Record<string, boolean>
  errorCounters?: Record<string, number>
  rssi?: number
  snr?: number
  spreadingFactor?: number
  lastReceivedAt?: string | null
  lastSeen?: string | null
}

type Freshness = { transportStatus?: string; ageSec?: number | null }

export function getDetectedSensorNames(node: NodeHealthInput) {
  const presence = node.sensorPresence || {}
  const sensors: string[] = []
  if (presence.sht45) sensors.push('Temperature', 'Humidity')
  if (presence.scd41) sensors.push('CO2')
  if (presence.bh1750) sensors.push('Light')
  if (presence.ds18b20) sensors.push('Temperature probe')
  if (presence.pressure_sensor) sensors.push('Air pressure')
  if (presence.leaf_temperature_probe) sensors.push('Leaf temperature')
  if (presence.soil_moisture_probe) sensors.push('Soil moisture')
  if (presence.soil_ec_probe) sensors.push('Substrate EC')
  if (presence.ec_probe) sensors.push('Nutrient EC')
  if (presence.ph_probe) sensors.push('Nutrient pH')
  if (presence.water_temperature_probe) sensors.push('Water temperature')
  return sensors
}

export function getHealthSummary(node: NodeHealthInput, freshness: Freshness) {
  const flags = node.errorFlags || {}
  const counters = node.errorCounters || {}
  const reasons: string[] = []
  if (flags.tx_timeout) reasons.push('Transmission timeout')
  if (flags.last_tx_failed) reasons.push('Last transmission failed')
  if (flags.watchdog_reset) reasons.push('Watchdog reset reported')
  if (flags.join_backoff) reasons.push('Network join backoff')
  if (flags.boot_fault) reasons.push('Boot fault reported')
  if (Number(counters.read_fail || 0) >= 3) reasons.push(`${counters.read_fail} sensor read failures`)
  if (Number(counters.tx_fail || 0) >= 3) reasons.push(`${counters.tx_fail} transmission failures`)
  if (Number(counters.reinit || 0) >= 5) reasons.push(`Sensor reinitialised ${counters.reinit} times`)

  if (freshness.transportStatus === 'offline') return { label: 'Offline', detail: 'No recent uplink', tone: 'critical' }
  if (reasons.length > 0) return { label: reasons[0], detail: reasons.join(' · '), tone: 'warning' }
  return { label: 'Healthy', detail: 'No device faults reported', tone: 'optimal' }
}

export function formatSignal(node: NodeHealthInput) {
  if (!Number.isFinite(node.rssi) || !Number.isFinite(node.snr)) return 'Signal unavailable'
  const spreadingFactor = Number.isFinite(node.spreadingFactor) ? ` · SF${node.spreadingFactor}` : ''
  return `${node.rssi} dBm · SNR ${node.snr}${spreadingFactor}`
}

export function getReportingModeLabel(profile: unknown) {
  const key = String(profile || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const labels: Record<string, string> = { power_save: 'Power save', powersave: 'Power save', normal: 'Normal', intense: 'Intense' }
  return labels[key] || (key ? key.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Mode unavailable')
}

export function getFreshnessLabel(status: string, translate: Translator) {
  const labels: Record<string, [string, string]> = {
    live: ['Live', 'Tiesiogiai'],
    delayed: ['Delayed', 'Vėluoja'],
    stale: ['Stale', 'Pasenę'],
    offline: ['Offline', 'Neprisijungęs'],
  }
  const label = labels[status] || ['Unknown', 'Nežinoma']
  return translate(label[0], label[1])
}

export function formatFreshnessAge(ageSec: number | null | undefined, translate: Translator) {
  if (!Number.isFinite(ageSec)) return translate('time unknown', 'laikas nežinomas')
  const seconds = Number(ageSec)
  if (seconds < 60) return translate(`${Math.max(1, Math.round(seconds))} sec ago`, `prieš ${Math.max(1, Math.round(seconds))} sek.`)
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return translate(`${minutes} min ago`, `prieš ${minutes} min.`)
  const hours = Math.round(minutes / 60)
  return translate(`${hours} h ago`, `prieš ${hours} val.`)
}

export function formatLastPayload(node: NodeHealthInput, freshness: Freshness, translate: Translator) {
  const rawTimestamp = node.lastReceivedAt || node.lastSeen || null
  if (!rawTimestamp) return { relative: translate('No payload yet', 'Payload dar negautas'), absolute: translate('Waiting for first uplink', 'Laukiama pirmo uplink') }
  const date = new Date(rawTimestamp)
  if (Number.isNaN(date.getTime())) return { relative: translate('Payload time unknown', 'Payload laikas nežinomas'), absolute: String(rawTimestamp) }
  return {
    relative: Number.isFinite(freshness.ageSec) ? formatFreshnessAge(freshness.ageSec, translate) : translate('Payload received', 'Payload gautas'),
    absolute: new Intl.DateTimeFormat('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date),
  }
}
