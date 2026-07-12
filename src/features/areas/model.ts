export type WorkspaceSection = {
  id: string
  name: string
  sensorCount?: number
  batteryNodes?: unknown[]
}

export type WorkspaceArea = {
  id: string
  name: string
  zones?: WorkspaceSection[]
}

type Snapshot = { site?: { id?: string }; overall?: { state?: string } }

export function countSectionNodes(section: WorkspaceSection) {
  return Array.isArray(section.batteryNodes) && section.batteryNodes.length > 0
    ? section.batteryNodes.length
    : Number(section.sensorCount || 0)
}

export function countAreaNodes(area: WorkspaceArea) {
  return (area.zones || []).reduce((total, section) => total + countSectionNodes(section), 0)
}

export function buildAreasSummary(areas: WorkspaceArea[], snapshots: Snapshot[]) {
  return {
    areaCount: areas.length,
    sectionCount: areas.reduce((total, area) => total + (area.zones || []).length, 0),
    nodeCount: areas.reduce((total, area) => total + countAreaNodes(area), 0),
    attentionCount: snapshots.filter((snapshot) => snapshot.overall?.state && snapshot.overall.state !== 'optimal').length,
  }
}

export function getAreaFormCopy(mode: string) {
  const editing = mode === 'edit'
  return {
    title: editing ? 'Edit area' : 'Create area',
    buttonLabel: editing ? 'Save area' : 'Create area',
    summary: editing
      ? 'Rename the monitored area without changing the sections already inside it.'
      : 'Use an area for a farm, field, greenhouse, laboratory, or another larger monitored location.',
  }
}

export const emptyAreasCopy = {
  eyebrow: 'Create area',
  title: 'Create your first area',
  description: 'An area can be a farm, field, greenhouse, laboratory, or another monitored location. Sections and nodes are added afterwards.',
}
