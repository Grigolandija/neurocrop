export type Page = 'overview' | 'locations' | 'blocks' | 'nodes' | 'alerts' | 'history' | 'settings'
export type ViewMode = 'simple' | 'detailed'
export type MetricKey = 'airTemp' | 'humidity' | 'co2' | 'lux' | 'vpd' | 'soilMoisture'

export type NodeDevice = {
  id: string
  devEui?: string
  battery: number
  active: boolean
}

export type Block = {
  id: string
  locationId: string
  name: string
  cropProfile: string
  nodes: NodeDevice[]
  installedMetrics: MetricKey[]
  readings: Partial<Record<MetricKey, number>>
}

export type Location = {
  id: string
  name: string
}

export type DashboardData = {
  areas: Location[]
  sections: Block[]
}

export type MetricDefinition = {
  key: MetricKey
  label: string
  unit: string
  target: [number, number]
  domain: [number, number]
}
