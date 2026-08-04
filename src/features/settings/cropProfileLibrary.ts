import librarySource from '../../data/crop-profile-library.v1.json'
import { getMetricDefinition } from '../../domain/metricRegistry'

type NumericRange = [number, number]

type SourceParameter = {
  enabled: boolean
  min: number | null
  target: number | null
  max: number | null
  unit: string
  role: string
  note_lt: string | null
}

type SourceProfile = {
  profile_id: string
  crop: { code: string; name_lt: string; name_en: string }
  system: { code: string; name_lt: string }
  phase: {
    code: string
    order: number
    name_lt: string
    name_en: string
    duration_min_days: number | null
    duration_max_days: number | null
    transition_criterion_lt: string
  }
  period_basis_lt: string
  night_note_lt: string
  substrate_basis_lt: string
  confidence: string
  source_ids: string[]
  parameters: Record<string, SourceParameter>
}

type LibrarySource = {
  metadata: { library_name: string; version: string; language: string }
  parameter_definitions: Array<{ parameter_code: string; name_lt: string; unit: string }>
  profiles: SourceProfile[]
}

export type CropProfileLibraryParameter = SourceParameter & {
  code: string
  metricId: string
  labelLt: string
}

export type CropProfileLibraryTemplate = Omit<SourceProfile, 'parameters'> & {
  parameters: CropProfileLibraryParameter[]
}

const source = librarySource as LibrarySource

const metricIds: Record<string, string> = {
  air_temperature: 'airTemp',
  relative_humidity: 'humidity',
  co2: 'co2',
  vpd: 'vpd',
  leaf_temperature: 'leafTemp',
  substrate_temperature: 'soilTemp',
  substrate_moisture: 'soilMoisture',
  solution_ec: 'ec',
  substrate_ec: 'soilEc',
  solution_ph: 'ph',
  water_temperature: 'waterTemp',
  illuminance: 'lux',
}

const parameterLabels = Object.fromEntries(
  source.parameter_definitions.map((parameter) => [parameter.parameter_code, parameter.name_lt]),
)

export const cropProfileLibraryVersion = source.metadata.version

export const cropProfileLibrary: CropProfileLibraryTemplate[] = source.profiles.map((profile) => ({
  ...profile,
  parameters: Object.entries(profile.parameters).map(([code, parameter]) => ({
    ...parameter,
    code,
    metricId: metricIds[code],
    labelLt: parameterLabels[code] || code,
  })),
}))

export const cropProfileLibraryCrops = Array.from(new Map(
  cropProfileLibrary.map((profile) => [profile.crop.code, profile.crop]),
).values())

function rounded(value: number, decimals: number) {
  const power = 10 ** decimals
  return Math.round(value * power) / power
}

function expandBand(metricId: string, optimal: NumericRange, padding: NumericRange) {
  const definition = getMetricDefinition(metricId)
  const limits = definition?.physicalRange || [-1000000, 1000000]
  const decimals = definition?.decimals ?? 2
  return [
    rounded(Math.max(limits[0], optimal[0] - padding[0]), decimals),
    rounded(Math.min(limits[1], optimal[1] + padding[1]), decimals),
  ] as NumericRange
}

export function createMetricsFromLibraryTemplate(template: CropProfileLibraryTemplate) {
  return Object.fromEntries(template.parameters.flatMap((parameter) => {
    if (!parameter.enabled || !parameter.metricId || parameter.min === null || parameter.target === null || parameter.max === null) return []
    const definition = getMetricDefinition(parameter.metricId)
    if (!definition) return []
    const optimal = [parameter.min, parameter.max] as NumericRange
    return [[parameter.metricId, {
      label: definition.label,
      unit: definition.unit,
      decimals: definition.decimals,
      enabled: true,
      target: parameter.target,
      optimal,
      warning: expandBand(parameter.metricId, optimal, definition.profile.warningPadding),
      critical: expandBand(parameter.metricId, optimal, definition.profile.criticalPadding),
      library: {
        version: cropProfileLibraryVersion,
        profileId: template.profile_id,
        role: parameter.role,
        noteLt: parameter.note_lt,
      },
      ...(definition.profile.lightingSchedule
        ? { lightingSchedule: structuredClone(definition.profile.lightingSchedule) }
        : {}),
    }]]
  }))
}

export function libraryProfileHint(template: CropProfileLibraryTemplate) {
  const duration = template.phase.duration_max_days === null
    ? `from day ${template.phase.duration_min_days ?? 0}`
    : `${template.phase.duration_min_days ?? 0}–${template.phase.duration_max_days} days`
  return `NeuroCrop library v${cropProfileLibraryVersion} · ${duration}. Review for cultivar, season, equipment and local calibration before assignment.`
}
