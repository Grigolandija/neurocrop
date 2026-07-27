export function resolveTrendContext(
  sections: Array<{ id: string; areaId: string }>,
  currentAreaId: string,
  currentSectionId: string,
  requestedAreaId: string,
  requestedSectionId: string,
) {
  const requestedSection = sections.find((section) => section.id === requestedSectionId)
  if (requestedSection) return { areaId: requestedSection.areaId, sectionId: requestedSection.id }

  if (requestedAreaId) {
    const currentSection = sections.find((section) =>
      section.id === currentSectionId && section.areaId === requestedAreaId)
    const firstAreaSection = sections.find((section) => section.areaId === requestedAreaId)
    return {
      areaId: requestedAreaId,
      sectionId: currentSection?.id || firstAreaSection?.id || '',
    }
  }

  const currentSection = sections.find((section) => section.id === currentSectionId)
  if (currentSection) return { areaId: currentSection.areaId, sectionId: currentSection.id }
  const firstSection = sections.find((section) => section.areaId === currentAreaId) || sections[0]
  return firstSection
    ? { areaId: firstSection.areaId, sectionId: firstSection.id }
    : { areaId: currentAreaId, sectionId: '' }
}
