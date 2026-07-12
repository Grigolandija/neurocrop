import { countSectionNodes, type WorkspaceArea, type WorkspaceSection } from '../areas/model'

type Snapshot = { site?: { id?: string }; zone?: { id?: string }; overall?: { state?: string; indexScore?: number } }

export type ScopedSection = {
  area: WorkspaceArea
  section: WorkspaceSection
  snapshot: Snapshot | null
}

export function getSectionsForArea(areas: WorkspaceArea[], activeAreaId: string, snapshots: Snapshot[]) {
  return areas
    .filter((area) => area.id === activeAreaId)
    .flatMap((area) => (area.zones || []).map((section) => ({
      area,
      section,
      snapshot: snapshots.find((snapshot) => snapshot.site?.id === area.id && snapshot.zone?.id === section.id) || null,
    })))
    .sort((left, right) => (left.snapshot?.overall?.indexScore ?? 100) - (right.snapshot?.overall?.indexScore ?? 100))
}

export function summarizeSections(rows: ScopedSection[]) {
  return {
    sectionCount: rows.length,
    nodeCount: rows.reduce((total, row) => total + countSectionNodes(row.section), 0),
    attentionCount: rows.filter((row) => row.snapshot?.overall?.state && row.snapshot.overall.state !== 'optimal').length,
  }
}

export function getSectionFormCopy(mode: string) {
  const editing = mode === 'edit'
  return {
    title: editing ? 'Edit section' : 'Create section',
    buttonLabel: editing ? 'Save section' : 'Create section',
    summary: editing
      ? 'Rename, move, or reprofile the monitored section without changing its sensor history.'
      : 'Use one section for one monitored crop, field sector, laboratory setup, or growing block inside an area.',
  }
}

export function getEmptySectionsTitle(areaName?: string) {
  return areaName ? `No sections exist in ${areaName} yet.` : 'No sections exist yet.'
}
