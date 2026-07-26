import { useEffect, useState, type FormEvent } from 'react'
import { neurocropApi } from '../../services/api/neurocropApi'

// Profile metric payloads are intentionally extensible for new firmware sensors.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>
type Profile = {
  id: string
  name: string
  heroName: string
  stage: string
  hint: string
  requiresReview: boolean
  metrics: Record<string, JsonRecord>
}
type ProfileDraft = Profile
type CreateState = { name: string; heroName: string; stage: string; sourceId: string }
type DuplicateState = { source: Profile; id: string; name: string }
type DeleteState = { profile: Profile; replacementId: string }

const sections = [
  { id: 'climate', label: 'Climate', kicker: 'Climate targets', title: 'Operating envelope', note: 'The target range is ideal. Warning and critical limits control status severity outside that range.', metrics: ['airTemp', 'humidity', 'co2', 'vpd', 'leafTemp'] },
  { id: 'root-zone', label: 'Root zone', kicker: 'Root-zone targets', title: 'Root-zone envelope', note: 'Set the preferred substrate and nutrient-solution ranges used by scoring and alerts.', metrics: ['soilTemp', 'soilMoisture', 'ec', 'soilEc', 'ph', 'waterTemp'] },
  { id: 'lighting', label: 'Lighting', kicker: 'Lighting targets', title: 'Lighting program', note: 'Define the target light range and schedule used to distinguish daylight from a genuine low-light condition.', metrics: ['lux'] },
  { id: 'alert-boundaries', label: 'Alert boundaries', kicker: 'Automatic severity', title: 'Alert boundaries', note: 'Warning and critical limits are calculated from each optimal target and saved with the profile.', metrics: [] },
] as const

const metricFallbacks: Record<string, { label: string; unit: string; decimals: number; limits: [number, number] }> = {
  airTemp: { label: 'Air temperature', unit: '°C', decimals: 1, limits: [-80, 80] },
  humidity: { label: 'Relative humidity', unit: '%', decimals: 0, limits: [0, 100] },
  co2: { label: 'CO₂', unit: 'ppm', decimals: 0, limits: [0, 100000] },
  lux: { label: 'Light', unit: 'lx', decimals: 0, limits: [0, 2000000] },
  soilTemp: { label: 'Substrate temperature', unit: '°C', decimals: 1, limits: [-80, 80] },
  soilMoisture: { label: 'Substrate moisture', unit: '%', decimals: 0, limits: [0, 100] },
  ec: { label: 'Nutrient EC', unit: 'mS/cm', decimals: 2, limits: [0, 100] },
  soilEc: { label: 'Substrate EC', unit: 'mS/cm', decimals: 2, limits: [0, 100] },
  ph: { label: 'Nutrient pH', unit: 'pH', decimals: 2, limits: [0, 14] },
  leafTemp: { label: 'Leaf temperature', unit: '°C', decimals: 1, limits: [-80, 80] },
  waterTemp: { label: 'Water temperature', unit: '°C', decimals: 1, limits: [-80, 100] },
  vpd: { label: 'VPD', unit: 'kPa', decimals: 2, limits: [0, 20] },
}

function records(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) return payload as JsonRecord[]
  const value = payload as JsonRecord | null
  for (const root of [value, value?.data]) {
    if (!root || typeof root !== 'object') continue
    for (const key of keys) if (Array.isArray(root[key])) return root[key] as JsonRecord[]
  }
  return []
}

function text(value: unknown, fallback = '') {
  return value === undefined || value === null || value === '' ? fallback : String(value)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeProfile(source: JsonRecord): Profile {
  const id = text(source.id || source.key || source.slug)
  return {
    id,
    name: id === 'default' ? 'Default' : text(source.name || id, 'Unnamed profile'),
    heroName: text(source.heroName || source.hero_name || source.crop || source.name || id, 'Crop'),
    stage: text(source.stage || source.growthStage || source.growth_stage, 'Custom program'),
    hint: text(source.hint),
    requiresReview: Boolean(source.requiresReview ?? source.requires_review),
    metrics: source.metrics && typeof source.metrics === 'object' && !Array.isArray(source.metrics) ? clone(source.metrics) : {},
  }
}

function slug(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

function sectionProfileId(section: JsonRecord) {
  return text(section.cropProfile || section.crop_profile || section.profileId || section.profile_id || section.profile)
}

function metricMeta(key: string, metric: JsonRecord) {
  const fallback = metricFallbacks[key] || { label: key, unit: '', decimals: 2, limits: [-1000000, 1000000] as [number, number] }
  return {
    label: text(metric.label, fallback.label),
    unit: text(metric.unit, fallback.unit),
    decimals: Number.isFinite(Number(metric.decimals)) ? Number(metric.decimals) : fallback.decimals,
    limits: fallback.limits,
  }
}

function range(metric: JsonRecord, key: 'optimal' | 'warning' | 'critical') {
  const source = Array.isArray(metric[key]) ? metric[key].map(Number) : []
  return source.length === 2 && source.every(Number.isFinite) ? source as [number, number] : [0, 1] as [number, number]
}

function round(value: number, decimals: number) {
  const power = 10 ** decimals
  return Math.round(value * power) / power
}

function automaticRanges(key: string, metric: JsonRecord, optimal: [number, number]) {
  const meta = metricMeta(key, metric)
  const span = Math.max(optimal[1] - optimal[0], 0.01)
  const previousWarning = range(metric, 'warning')
  const previousCritical = range(metric, 'critical')
  const warningLow = Math.max(span * .25, Math.max(0, optimal[0] - previousWarning[0]))
  const warningHigh = Math.max(span * .25, Math.max(0, previousWarning[1] - optimal[1]))
  const criticalLow = Math.max(span * .75, Math.max(warningLow, optimal[0] - previousCritical[0]))
  const criticalHigh = Math.max(span * .75, Math.max(warningHigh, previousCritical[1] - optimal[1]))
  const clamp = (value: number) => Math.min(meta.limits[1], Math.max(meta.limits[0], value))
  return {
    warning: [round(clamp(optimal[0] - warningLow), meta.decimals), round(clamp(optimal[1] + warningHigh), meta.decimals)] as [number, number],
    critical: [round(clamp(optimal[0] - criticalLow), meta.decimals), round(clamp(optimal[1] + criticalHigh), meta.decimals)] as [number, number],
  }
}

function formatRange(values: [number, number], unit: string) {
  return `${values[0]}–${values[1]}${unit ? ` ${unit}` : ''}`
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export default function CropProfilesWorkspace() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [usage, setUsage] = useState<Record<string, number>>({})
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState<ProfileDraft | null>(null)
  const [editorSection, setEditorSection] = useState('climate')
  const [expandedMetric, setExpandedMetric] = useState('')
  const [createState, setCreateState] = useState<CreateState | null>(null)
  const [duplicateState, setDuplicateState] = useState<DuplicateState | null>(null)
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null)
  const [busy, setBusy] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    document.body.dataset.reactCropProfilesActive = 'true'
    return () => { delete document.body.dataset.reactCropProfilesActive }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading'); setError('')
      try {
        const [profilePayload, sectionPayload] = await Promise.all([
          neurocropApi.getCropProfiles(), neurocropApi.getSections(),
        ])
        if (cancelled) return
        const nextProfiles = records(profilePayload, ['profiles', 'items']).map(normalizeProfile).filter((profile) => profile.id)
        const counts: Record<string, number> = {}
        records(sectionPayload, ['sections', 'zones', 'items']).forEach((section) => {
          const profileId = sectionProfileId(section)
          if (profileId) counts[profileId] = (counts[profileId] || 0) + 1
        })
        setProfiles(nextProfiles)
        setUsage(counts)
        setSelectedId((current) => current && nextProfiles.some((profile) => profile.id === current) ? current : '')
        setDraft((current) => current && nextProfiles.some((profile) => profile.id === current.id) ? current : null)
        setStatus('ready')
      } catch (loadError) {
        if (!cancelled) {
          setError(errorMessage(loadError, 'Crop profiles could not be loaded.'))
          setStatus('error')
        }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [refreshToken])

  const selected = profiles.find((profile) => profile.id === selectedId) || null
  const activeEditorSection = sections.find((section) => section.id === editorSection) || sections[0]
  const dirty = Boolean(selected && draft && JSON.stringify(selected) !== JSON.stringify(draft))
  const visibleMetricKeys = activeEditorSection.id === 'alert-boundaries'
    ? Object.keys(draft?.metrics || {}).filter((key) => key !== 'batteryLevel')
    : activeEditorSection.metrics.filter((key) => draft?.metrics[key])

  function openProfile(profile: Profile) {
    setSelectedId(profile.id)
    setDraft(clone(profile))
    setEditorSection('climate')
    setExpandedMetric('')
    setFeedback('')
  }

  function updateOptimal(metricKey: string, bound: 0 | 1, value: number) {
    if (!draft || !Number.isFinite(value)) return
    const metric = draft.metrics[metricKey]
    const optimal = range(metric, 'optimal')
    optimal[bound] = value
    if (optimal[0] >= optimal[1]) return
    const alerts = automaticRanges(metricKey, metric, optimal)
    setDraft({
      ...draft,
      requiresReview: false,
      metrics: { ...draft.metrics, [metricKey]: { ...metric, optimal, ...alerts } },
    })
  }

  function updateLighting(field: string, value: string | number | boolean) {
    if (!draft?.metrics.lux) return
    const lux = draft.metrics.lux
    setDraft({ ...draft, metrics: { ...draft.metrics, lux: { ...lux, lightingSchedule: { ...(lux.lightingSchedule || {}), [field]: value } } } })
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    if (!draft || busy) return
    if (!draft.name.trim() || !draft.heroName.trim()) return setError('Profile name and crop cannot be empty.')
    setBusy(true); setError('')
    try {
      await neurocropApi.updateCropProfile(draft.id, {
        name: draft.id === 'default' ? 'Default' : draft.name.trim(),
        heroName: draft.heroName.trim(),
        stage: draft.stage.trim(),
        hint: draft.hint,
        requiresReview: false,
        metrics: draft.metrics,
      })
      setFeedback(`${draft.name} targets saved. Scores, alerts, and history now use these ranges.`)
      setRefreshToken((value) => value + 1)
    } catch (mutationError) {
      setError(errorMessage(mutationError, 'Crop profile could not be saved.'))
    } finally {
      setBusy(false)
    }
  }

  async function createProfile(event: FormEvent) {
    event.preventDefault()
    if (!createState || busy) return
    const source = profiles.find((profile) => profile.id === createState.sourceId) || profiles[0]
    const id = slug(createState.name)
    if (!id || !source) return setError('Choose a source profile and enter a profile name.')
    setBusy(true); setError('')
    try {
      const payload = await neurocropApi.createCropProfile({
        id,
        name: createState.name.trim(),
        heroName: createState.heroName.trim() || createState.name.trim(),
        stage: createState.stage.trim(),
        hint: `Workspace copy of ${source.name}. Review every target before assigning it to a Section.`,
        requiresReview: true,
        metrics: clone(source.metrics),
      }) as { profile?: JsonRecord }
      const created = normalizeProfile(payload.profile || { ...source, id, ...createState })
      setCreateState(null); setSelectedId(created.id); setDraft(created)
      setFeedback(`${created.name} created. Review its targets before assigning sections.`)
      window.dispatchEvent(new CustomEvent('neurocrop:workspace-structure-changed'))
      setRefreshToken((value) => value + 1)
    } catch (mutationError) {
      setError(errorMessage(mutationError, 'Crop profile could not be created.'))
    } finally {
      setBusy(false)
    }
  }

  async function duplicateProfile(event: FormEvent) {
    event.preventDefault()
    if (!duplicateState || busy) return
    const id = duplicateState.id || slug(duplicateState.name)
    if (!id || !duplicateState.name.trim()) return setError('Duplicate name is required.')
    setBusy(true); setError('')
    try {
      const payload = await neurocropApi.duplicateCropProfile(duplicateState.source.id, { id, name: duplicateState.name.trim() }) as { profile?: JsonRecord }
      const created = normalizeProfile(payload.profile || { ...duplicateState.source, id, name: duplicateState.name })
      setDuplicateState(null); setSelectedId(created.id); setDraft(created)
      setFeedback(`${created.name} duplicated.`)
      window.dispatchEvent(new CustomEvent('neurocrop:workspace-structure-changed'))
      setRefreshToken((value) => value + 1)
    } catch (mutationError) {
      setError(errorMessage(mutationError, 'Crop profile could not be duplicated.'))
    } finally {
      setBusy(false)
    }
  }

  async function deleteProfile(event: FormEvent) {
    event.preventDefault()
    if (!deleteState || busy) return
    const assigned = usage[deleteState.profile.id] || 0
    if (assigned > 0 && !deleteState.replacementId) return setError('Choose a replacement crop profile for the assigned sections.')
    setBusy(true); setError('')
    try {
      await neurocropApi.deleteCropProfile(deleteState.profile.id, { replacementProfileId: deleteState.replacementId || undefined })
      setDeleteState(null); setSelectedId(''); setDraft(null)
      setFeedback(`${deleteState.profile.name} deleted${assigned ? ` and ${assigned} assigned sections were updated` : ''}.`)
      window.dispatchEvent(new CustomEvent('neurocrop:workspace-structure-changed'))
      setRefreshToken((value) => value + 1)
    } catch (mutationError) {
      setError(errorMessage(mutationError, 'Crop profile could not be deleted.'))
    } finally {
      setBusy(false)
    }
  }

  if (status === 'loading') return <div className="crop-profile-standalone nc-profile-state" data-react-crop-profiles aria-busy="true"><i className="fa-solid fa-spinner fa-spin" /><h2>Loading crop profiles…</h2></div>
  if (status === 'error' && !profiles.length) return <div className="crop-profile-standalone nc-profile-state" data-react-crop-profiles role="alert"><h2>Crop profiles could not be loaded</h2><p>{error}</p><button className="settings-secondary-button" onClick={() => setRefreshToken((value) => value + 1)}>Try again</button></div>

  if (!selected || !draft) return <div className="crop-profile-standalone" data-react-crop-profiles><section className="crop-profiles-page" aria-labelledby="settingsProfilesTitle">
    <header className="crop-profiles-page-head"><div><p className="profile-page-eyebrow">Agronomic configuration</p><h2 id="settingsProfilesTitle">Crop profiles</h2><p>Reusable target ranges that turn sensor readings into crop-specific status and scores.</p></div><div className="crop-profiles-page-actions"><button type="button" className="settings-primary-button" onClick={() => setCreateState({ name: '', heroName: '', stage: '', sourceId: profiles[0]?.id || '' })}><i className="fa-solid fa-plus" />Create profile</button></div></header>
    {feedback ? <p className="crop-profile-save-feedback" data-tone="success" role="status">{feedback}</p> : null}
    {error ? <p className="crop-profile-save-feedback" data-tone="warning" role="alert">{error}</p> : null}
    <div className="profile-layout"><aside className="profile-guide"><p className="profile-eyebrow">Profile logic</p><h3>One source of truth for every crop stage.</h3><p>Profiles define ideal ranges, warning boundaries, critical limits, photoperiod, and sensor coverage expectations.</p><ol><li><span>1</span>Set targets</li><li><span>2</span>Assign sections</li><li><span>3</span>Monitor score</li></ol></aside>
      <section className="profile-list-new" aria-label="Available crop profiles">{profiles.map((profile) => {
        const count = usage[profile.id] || 0
        return <button type="button" className="crop-profile-switcher-option" onClick={() => openProfile(profile)} key={profile.id}><span className="crop-monogram">{(profile.heroName || profile.name).slice(0, 2).toUpperCase()}</span><span className="profile-list-identity"><strong>{profile.name}</strong><small>{profile.heroName} · {profile.stage || 'No growth stage'}</small></span><span className="profile-list-assignment">{count} section{count === 1 ? '' : 's'}</span><span className="profile-list-status" data-tone={count ? 'active' : 'draft'}>{count ? 'Active' : 'Draft'}</span><span className="profile-list-edit">Edit <i className="fa-solid fa-arrow-right" /></span></button>
      })}</section>
    </div>
    {createState ? <CreateDialog state={createState} profiles={profiles} busy={busy} error={error} onChange={setCreateState} onClose={() => setCreateState(null)} onSubmit={createProfile} /> : null}
  </section></div>

  return <div className="crop-profile-standalone" data-react-crop-profiles><section className="crop-profiles-page"><form className="crop-profile-editor" onSubmit={saveProfile}>
    <nav className="profile-detail-breadcrumb" aria-label="Breadcrumb"><button type="button" onClick={() => { setSelectedId(''); setDraft(null); setError('') }}>Crop profiles</button><i className="fa-solid fa-chevron-right" /><span>{draft.name}</span></nav>
    <header className="profile-detail-header"><div className="profile-detail-heading"><p className="profile-detail-eyebrow">{draft.heroName} <span>·</span> {draft.stage || 'Custom program'}</p><h2>{draft.name}</h2><span>Used by {usage[draft.id] || 0} section{usage[draft.id] === 1 ? '' : 's'}. Changes affect future scoring and alerts after saving.</span></div><div className="profile-detail-actions"><button type="button" className="settings-secondary-button" onClick={() => setDuplicateState({ source: draft, id: `${draft.id}-copy`, name: `${draft.name} copy` })}><i className="fa-regular fa-copy" />Duplicate</button>{draft.id === 'default' ? <span className="default-profile-header-badge"><i className="fa-solid fa-lock" />Protected</span> : <button type="button" className="settings-secondary-button crop-profile-header-delete" onClick={() => setDeleteState({ profile: draft, replacementId: '' })}><i className="fa-regular fa-trash-can" />Delete</button>}<button type="button" className="crop-profile-discard-button" disabled={!dirty || busy} onClick={() => setDraft(clone(selected))}>Discard</button><button type="submit" className="settings-primary-button" disabled={!dirty || busy}><i className={`fa-solid ${busy ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} />{busy ? 'Saving…' : 'Save changes'}</button></div></header>
    {feedback ? <p className="crop-profile-save-feedback profile-detail-feedback" data-tone="success" role="status">{feedback}</p> : null}
    {error ? <p className="crop-profile-save-feedback profile-detail-feedback" data-tone="warning" role="alert">{error}</p> : null}
    <section className="crop-profile-identity-editor"><header><p>Profile details</p><span>Name this program for how it is actually used in your workspace.</span></header><div className="crop-profile-detail-fields"><label><span>Profile name</span><input value={draft.id === 'default' ? 'Default' : draft.name} readOnly={draft.id === 'default'} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label><span>Crop</span><input value={draft.heroName} onChange={(event) => setDraft({ ...draft, heroName: event.target.value })} /></label><label><span>Growth stage</span><input value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value })} /></label></div></section>
    <div className="crop-profile-editor-grid profile-editor-new"><aside className="profile-editor-navigation"><p>Profile sections</p>{sections.map((section, index) => <button type="button" data-active={section.id === activeEditorSection.id} onClick={() => { setEditorSection(section.id); setExpandedMetric('') }} key={section.id}><span>{index + 1}</span>{section.label}<i className="fa-solid fa-chevron-right" /></button>)}</aside>
      <main className="crop-profile-editor-main"><header className="crop-profile-editor-section-head"><div><p>{activeEditorSection.kicker}</p><h3>{activeEditorSection.title}</h3></div></header><p className="profile-editor-intro">{activeEditorSection.note}</p>
        {activeEditorSection.id === 'alert-boundaries' ? <BoundaryList profile={draft} /> : <div className="range-editor-list">{visibleMetricKeys.map((key) => <MetricEditor key={key} metricKey={key} metric={draft.metrics[key]} expanded={expandedMetric === key} onExpand={() => setExpandedMetric(expandedMetric === key ? '' : key)} onOptimal={updateOptimal} onLighting={updateLighting} />)}</div>}
      </main>
    </div>
  </form>
  {duplicateState ? <DuplicateDialog state={duplicateState} busy={busy} error={error} onChange={setDuplicateState} onClose={() => setDuplicateState(null)} onSubmit={duplicateProfile} /> : null}
  {deleteState ? <DeleteDialog state={deleteState} profiles={profiles} assigned={usage[deleteState.profile.id] || 0} busy={busy} error={error} onChange={setDeleteState} onClose={() => setDeleteState(null)} onSubmit={deleteProfile} /> : null}
  </section></div>
}

function MetricEditor({ metricKey, metric, expanded, onExpand, onOptimal, onLighting }: { metricKey: string; metric: JsonRecord; expanded: boolean; onExpand: () => void; onOptimal: (key: string, bound: 0 | 1, value: number) => void; onLighting: (field: string, value: string | number | boolean) => void }) {
  const meta = metricMeta(metricKey, metric)
  const optimal = range(metric, 'optimal')
  const warning = range(metric, 'warning')
  const critical = range(metric, 'critical')
  const step = meta.decimals === 0 ? 1 : 10 ** -meta.decimals
  const schedule = metric.lightingSchedule || {}
  return <div className="range-editor crop-profile-metric-row" data-expanded={expanded}><div className="crop-profile-metric-name"><strong>{meta.label}</strong><span>{meta.unit}</span></div><label className="range-editor-field"><span>Optimal minimum</span><input className="profile-target-input" type="number" step={step} value={optimal[0]} onChange={(event) => onOptimal(metricKey, 0, Number(event.target.value))} /></label><label className="range-editor-field"><span>Optimal maximum</span><input className="profile-target-input" type="number" step={step} value={optimal[1]} onChange={(event) => onOptimal(metricKey, 1, Number(event.target.value))} /></label><button type="button" className="range-editor-more" onClick={onExpand} aria-expanded={expanded}><i className="fa-solid fa-ellipsis-vertical" /></button>
    <div className="range-editor-advanced" hidden={!expanded}><div className="crop-profile-metric-boundary crop-profile-metric-warning"><b>Warning</b>{formatRange(warning, meta.unit)}</div><div className="crop-profile-metric-boundary crop-profile-metric-critical"><b>Critical</b>{formatRange(critical, meta.unit)}</div><p>These boundaries follow the saved optimal range and update automatically.</p></div>
    {metricKey === 'lux' ? <div className="crop-profile-lighting-schedule" data-enabled={schedule.enabled === true}><div className="lighting-schedule-head"><div><strong>Lighting schedule</strong><span>Use scheduled hours to distinguish expected darkness from a lighting fault.</span></div><label className="lighting-schedule-toggle"><input type="checkbox" checked={schedule.enabled === true} onChange={(event) => onLighting('enabled', event.target.checked)} /><span className="lighting-toggle-track"><i /></span><span>Use schedule</span></label></div><div className="lighting-schedule-fields"><label><span>Lights on</span><input type="time" value={schedule.start || '06:00'} onChange={(event) => onLighting('start', event.target.value)} /></label><label><span>Lights off</span><input type="time" value={schedule.end || '22:00'} onChange={(event) => onLighting('end', event.target.value)} /></label><label><span>Dark threshold</span><div className="lighting-threshold-input"><input type="number" min={0} step={10} value={schedule.darkThresholdLux ?? 100} onChange={(event) => onLighting('darkThresholdLux', Number(event.target.value))} /><small>lx</small></div></label></div></div> : null}
  </div>
}

function BoundaryList({ profile }: { profile: Profile }) {
  return <div className="profile-boundary-list">{Object.entries(profile.metrics).filter(([key]) => key !== 'batteryLevel').map(([key, metric]) => {
    const meta = metricMeta(key, metric)
    return <div className="profile-boundary-row" key={key}><span><strong>{meta.label}</strong><small>{meta.unit}</small></span><span><small>Optimal</small><b>{formatRange(range(metric, 'optimal'), meta.unit)}</b></span><span><small>Warning</small><b>{formatRange(range(metric, 'warning'), meta.unit)}</b></span><span><small>Critical</small><b>{formatRange(range(metric, 'critical'), meta.unit)}</b></span></div>
  })}</div>
}

function CreateDialog({ state, profiles, busy, error, onChange, onClose, onSubmit }: { state: CreateState; profiles: Profile[]; busy: boolean; error: string; onChange: (state: CreateState) => void; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  return <div className="profile-create-backdrop"><section className="crop-profile-create-drawer" role="dialog" aria-modal="true" aria-labelledby="createCropProfileTitle"><header><div><p>New agronomic program</p><h3 id="createCropProfileTitle">Create crop profile</h3><span>Start from a complete target set, then adjust it for this crop stage.</span></div><button type="button" onClick={onClose}><i className="fa-solid fa-xmark" /></button></header><form onSubmit={onSubmit}><label className="profile-create-field profile-create-field-wide"><span>Profile name</span><small>A clear name shown when assigning this profile to Sections.</small><input autoFocus value={state.name} onChange={(event) => onChange({ ...state, name: event.target.value })} required /></label><label className="profile-create-field"><span>Crop</span><input value={state.heroName} onChange={(event) => onChange({ ...state, heroName: event.target.value })} required /></label><label className="profile-create-field"><span>Growth stage</span><input value={state.stage} onChange={(event) => onChange({ ...state, stage: event.target.value })} /></label><label className="profile-create-field profile-create-field-wide profile-create-source"><span>Copy targets from</span><small>The new profile starts with these optimal ranges.</small><span className="profile-create-select-wrap"><select value={state.sourceId} onChange={(event) => onChange({ ...state, sourceId: event.target.value })}>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}</select><i className="fa-solid fa-chevron-down" /></span></label>{error ? <p className="nc-profile-modal-error" role="alert">{error}</p> : null}<footer><button type="button" className="settings-secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="settings-primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create profile'}</button></footer></form></section></div>
}

function DuplicateDialog({ state, busy, error, onChange, onClose, onSubmit }: { state: DuplicateState; busy: boolean; error: string; onChange: (state: DuplicateState) => void; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  return <div className="profile-create-backdrop"><section className="crop-profile-create-drawer" role="dialog" aria-modal="true"><header><div><p>Copy agronomic program</p><h3>Duplicate {state.source.name}</h3><span>Create an independent copy with the same targets.</span></div><button type="button" onClick={onClose}><i className="fa-solid fa-xmark" /></button></header><form onSubmit={onSubmit}><label className="profile-create-field profile-create-field-wide"><span>Profile name</span><input autoFocus value={state.name} onChange={(event) => onChange({ ...state, name: event.target.value, id: slug(event.target.value) })} required /></label><label className="profile-create-field profile-create-field-wide"><span>Profile ID</span><input value={state.id} pattern="[a-z0-9-]+" onChange={(event) => onChange({ ...state, id: slug(event.target.value) })} required /></label>{error ? <p className="nc-profile-modal-error" role="alert">{error}</p> : null}<footer><button type="button" className="settings-secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="settings-primary-button" disabled={busy}>{busy ? 'Duplicating…' : 'Duplicate'}</button></footer></form></section></div>
}

function DeleteDialog({ state, profiles, assigned, busy, error, onChange, onClose, onSubmit }: { state: DeleteState; profiles: Profile[]; assigned: number; busy: boolean; error: string; onChange: (state: DeleteState) => void; onClose: () => void; onSubmit: (event: FormEvent) => void }) {
  const replacements = profiles.filter((profile) => profile.id !== state.profile.id)
  return <div className="profile-create-backdrop profile-delete-backdrop"><section className="crop-profile-delete-dialog" role="dialog" aria-modal="true"><header><span className="profile-delete-icon"><i className="fa-solid fa-trash" /></span><div><p>Permanent action</p><h3>Delete {state.profile.name}?</h3></div><button type="button" onClick={onClose}><i className="fa-solid fa-xmark" /></button></header><form onSubmit={onSubmit}>{assigned ? <><div className="profile-delete-impact"><strong>{assigned} assigned section{assigned === 1 ? '' : 's'}</strong><span>Their measurement history will be kept. Choose the profile that should control future scoring and alerts.</span></div><label><span>Replacement crop profile</span><select value={state.replacementId} required onChange={(event) => onChange({ ...state, replacementId: event.target.value })}><option value="">Select replacement profile</option>{replacements.map((profile) => <option value={profile.id} key={profile.id}>{profile.name} · {profile.stage}</option>)}</select></label></> : <div className="profile-delete-impact"><strong>This profile is not assigned to any section.</strong><span>Deleting it will not remove measurements, sections, or nodes.</span></div>}{error ? <p className="nc-profile-modal-error" role="alert">{error}</p> : null}<footer><button type="button" className="settings-secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="crop-profile-delete-confirm" disabled={busy || (assigned > 0 && !state.replacementId)}>Delete profile</button></footer></form></section></div>
}
