import { useEffect, useMemo, useState } from 'react'
import { neurocropApi } from '../../services/api/neurocropApi'

// Dashboard payloads intentionally remain open because firmware and API versions
// can add telemetry fields without requiring an Overview release.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>
type Tone = 'action' | 'watch' | 'good' | 'unknown'
type LoadState = 'loading' | 'ready' | 'empty' | 'error'

type OverviewRow = {
  id: string
  name: string
  crop: string
  status: string
  detail: string
  updated: string
  tone: Tone
  score: number | null
}

type OverviewModel = {
  areaId: string
  areaName: string
  rows: OverviewRow[]
  actions: JsonRecord[]
  priority: JsonRecord | null
  reporting: string
  updated: string
  growingScore: number | null
}

const demoDashboard = {
  sites: [
    {
      id: 'greenhouse-1',
      name: 'Greenhouse No. 1',
      zones: [
        { id: 'tomato-rear', name: 'Tomato block A · Rear', profile: 'Tomato · Vegetative', score: 78, conditionStatus: 'warning', sensorCount: 4 },
        { id: 'lettuce-east', name: 'Lettuce · East bench', profile: 'Lettuce · Intensive growth', score: 86, conditionStatus: 'watch', sensorCount: 4 },
        { id: 'tomato-front', name: 'Tomato block A · Front', profile: 'Tomato · Vegetative', score: 94, conditionStatus: 'optimal', sensorCount: 4 },
      ],
    },
    {
      id: 'greenhouse-2',
      name: 'Greenhouse No. 2',
      zones: [
        { id: 'strawberry-north', name: 'Strawberry · North', profile: 'Fruiting', score: 94, conditionStatus: 'optimal', sensorCount: 4 },
        { id: 'strawberry-south', name: 'Strawberry · South', profile: 'Fruiting', score: 92, conditionStatus: 'optimal', sensorCount: 3 },
        { id: 'lettuce-west', name: 'Lettuce · West bench', profile: 'Intensive growth', score: 96, conditionStatus: 'optimal', sensorCount: 3 },
      ],
    },
    {
      id: 'north-field',
      name: 'North field trial',
      zones: [
        { id: 'basil-north', name: 'Basil · North bed', profile: 'Profile not assigned', score: null, conditionStatus: 'unknown', sensorCount: 2 },
        { id: 'basil-south', name: 'Basil · South bed', profile: 'Vegetative', score: 88, conditionStatus: 'optimal', sensorCount: 2 },
      ],
    },
  ],
}

const demoActions = [{
  id: 'tomato-rear:soilMoisture:low',
  areaId: 'greenhouse-1',
  areaName: 'Greenhouse No. 1',
  sectionId: 'tomato-rear',
  sectionName: 'Tomato block A · Rear',
  metricId: 'soilMoisture',
  metricLabel: 'Substrate moisture',
  value: 42,
  unit: '%',
  target: [45, 60],
  title: 'Check the rear irrigation line.',
  reason: 'Moisture is below target and has fallen 4 percentage points in 3 hours.',
  recommendedAction: 'Check rear valve and dripper line.',
  confidence: 'high',
  observedAt: new Date().toISOString(),
}]

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value : []
}

function readSelectedAreaId() {
  try {
    const stored = JSON.parse(localStorage.getItem('neurocrop-active-context-v1') || 'null')
    const scope = stored?.lastScopeKey
    return String(stored?.contexts?.[scope]?.siteId || stored?.siteId || '')
  } catch {
    return ''
  }
}

function statusTone(value: unknown): Tone {
  const status = String(value || '').toLowerCase()
  if (status.includes('critical') || status.includes('action') || status.includes('warning')) return 'action'
  if (status.includes('watch') || status.includes('stale')) return 'watch'
  if (status.includes('optimal') || status.includes('stable') || status.includes('healthy')) return 'good'
  return 'unknown'
}

function relativeTime(value: unknown) {
  const timestamp = new Date(String(value || '')).getTime()
  if (!Number.isFinite(timestamp)) return 'Current'
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return `${seconds} sec ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  return `${Math.floor(seconds / 3600)} h ago`
}

function profileLabel(zone: JsonRecord) {
  const value = String(zone.profileName || zone.profile || zone.cropProfileName || '')
  return value && !value.includes('-') ? value : 'Active crop profile'
}

function buildModel(dashboard: JsonRecord, actionPayload: JsonRecord, selectedAreaId: string): OverviewModel | null {
  const sites = asArray(dashboard?.sites)
  if (!sites.length) return null
  const actions = asArray(actionPayload?.actions).filter((action) => action.feedback?.status !== 'completed')
  const priorityAreaId = String(actions[0]?.areaId || '')
  const site = sites.find((item) => String(item.id) === selectedAreaId)
    || sites.find((item) => String(item.id) === priorityAreaId)
    || sites[0]
  const areaActions = actions.filter((action) => String(action.areaId) === String(site.id))
  const actionBySection = new Map(areaActions.map((action) => [String(action.sectionId), action]))
  const zones = asArray(site.zones)
  const rows = zones.map((zone): OverviewRow => {
    const action = actionBySection.get(String(zone.id))
    const tone = action ? statusTone(action.state || 'action') : statusTone(zone.conditionStatus)
    const score = Number.isFinite(Number(zone.score)) ? Number(zone.score) : null
    return {
      id: String(zone.id),
      name: String(zone.name || 'Unnamed Section'),
      crop: profileLabel(zone),
      status: tone === 'action' ? 'Needs action' : tone === 'watch' ? 'Watch' : tone === 'good' ? 'Inside target' : 'Not verified',
      detail: action
        ? `${action.metricLabel || 'Condition'} ${action.value ?? '—'}${action.unit || ''}${Array.isArray(action.target) ? ` · target ${action.target[0]}–${action.target[1]}${action.unit || ''}` : ''}`
        : tone === 'good' ? 'Current conditions normal' : 'Current data or crop target is incomplete',
      updated: relativeTime(action?.observedAt || zone.computedAt),
      tone,
      score,
    }
  }).sort((left, right) => ['action', 'watch', 'unknown', 'good'].indexOf(left.tone) - ['action', 'watch', 'unknown', 'good'].indexOf(right.tone))

  const reportingNodes = zones.reduce((sum, zone) => sum + Number(zone.nodeSummary?.reporting || zone.sensorCount || 0), 0)
  const totalNodes = zones.reduce((sum, zone) => sum + Number(zone.nodeSummary?.registered || zone.sensorCount || 0), 0)
  const priorityScore = rows.find((row) => row.id === String(areaActions[0]?.sectionId))?.score
  const availableScores = rows.map((row) => row.score).filter((score): score is number => score !== null)
  return {
    areaId: String(site.id),
    areaName: String(site.name || 'Growing Area'),
    rows,
    actions: areaActions,
    priority: areaActions[0] || null,
    reporting: `${reportingNodes} of ${totalNodes} nodes reporting`,
    updated: relativeTime(areaActions[0]?.observedAt || zones[0]?.computedAt),
    growingScore: priorityScore ?? (availableScores.length
      ? Math.round(availableScores.reduce((sum, score) => sum + score, 0) / availableScores.length)
      : null),
  }
}

function EvidenceDrawer({ model, row, onClose }: {
  model: OverviewModel
  row: OverviewRow | null
  onClose: () => void
}) {
  const sectionAction = row
    ? model.actions.find((action) => String(action.sectionId) === row.id)
    : null
  const conclusion = row
    ? row.status
    : model.priority ? model.priority.title : `All ${model.rows.length} Sections are stable.`
  const evidence = row
    ? row.detail
    : model.priority?.reason || 'Every Section is inside its current crop-profile target range.'
  const score = row ? row.score : model.growingScore
  const decisionRule = row
    ? row.tone === 'action' ? 'Current reading outside crop-profile target'
      : row.tone === 'watch' ? 'Condition requires continued monitoring'
        : row.tone === 'good' ? 'No active crop-profile deviation'
          : 'Data or crop-profile target is incomplete'
    : model.priority ? 'Current reading outside crop-profile target' : 'No active profile deviation'

  return <div className="nc-overview-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="nc-overview-drawer" role="dialog" aria-modal="true" aria-labelledby="overview-evidence-title">
      <header>
        <div><span>{row ? 'Section evidence' : 'Area evidence'}</span><h2 id="overview-evidence-title">{row?.name || model.areaName}</h2>{row ? <p>{model.areaName}</p> : null}</div>
        <button type="button" onClick={onClose} aria-label="Close evidence"><i className="fa-solid fa-xmark" /></button>
      </header>
      <section className="nc-evidence-summary">
        <span>Current conclusion</span>
        <strong>{conclusion}</strong>
        <p>{evidence}</p>
      </section>
      <dl>
        <div><dt>Growing score</dt><dd>{score === null ? 'Not available' : `${score} / 100`}</dd></div>
        {row ? <div><dt>Crop profile</dt><dd>{row.crop}</dd></div> : null}
        {sectionAction ? <div><dt>Observed metric</dt><dd>{sectionAction.metricLabel || 'Condition'} · {sectionAction.value ?? '—'}{sectionAction.unit || ''}</dd></div> : null}
        <div><dt>Data coverage</dt><dd>{model.reporting}</dd></div>
        <div><dt>Decision rule</dt><dd>{decisionRule}</dd></div>
        <div><dt>Last evaluation</dt><dd>{row?.updated || model.updated}</dd></div>
      </dl>
      <footer><button type="button" onClick={onClose}>Close</button></footer>
    </aside>
  </div>
}

function ActionWorkflow({ action, onClose, onSubmitted }: {
  action: JsonRecord
  onClose: () => void
  onSubmitted: () => void
}) {
  const [assignee, setAssignee] = useState('Me')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<'open' | 'in-progress' | 'submitting' | 'checked'>(
    action.feedback?.status === 'completed' ? 'checked' : 'open',
  )
  const [error, setError] = useState('')

  async function completeAction() {
    if (status === 'open') {
      setStatus('in-progress')
      return
    }
    if (status === 'checked') return
    setStatus('submitting')
    setError('')
    try {
      if (neurocropApi.isConnected()) {
        await neurocropApi.submitTodayActionFeedback(String(action.id), {
          status: 'completed',
          note,
          executionDetails: { type: 'equipment_checked', adjustment: action.recommendedAction || 'Checked equipment', durationMinutes: null },
          action,
        })
      }
      setStatus('checked')
      onSubmitted()
    } catch (reason) {
      setStatus('in-progress')
      setError(reason instanceof Error ? reason.message : 'The result could not be saved.')
    }
  }

  return <div className="nc-overview-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="nc-overview-drawer nc-action-drawer" role="dialog" aria-modal="true" aria-labelledby="overview-action-title">
      <header>
        <div><span className={`nc-workflow-status ${status}`}><i />{status === 'checked' ? 'Checked' : status === 'open' ? 'Ready to start' : 'In progress'}</span><h2 id="overview-action-title">{action.title}</h2><p>{action.areaName} · {action.sectionName}</p></div>
        <button type="button" onClick={onClose} aria-label="Close action"><i className="fa-solid fa-xmark" /></button>
      </header>
      <section className="nc-action-brief">
        <span>Why this matters</span>
        <p>{action.reason}</p>
        <div><strong>Recommended check</strong><p>{action.recommendedAction}</p></div>
      </section>
      <section className="nc-action-form">
        <label><span>Assigned to</span><select value={assignee} onChange={(event) => setAssignee(event.target.value)}><option>Me</option><option>Grower on duty</option><option>Technician</option></select></label>
        <label><span>Result note</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="What did you find or change?" maxLength={500} /></label>
        {error ? <p className="nc-action-error" role="alert">{error}</p> : null}
      </section>
      <footer>
        <button type="button" onClick={onClose}>Cancel</button>
        <button className={`primary ${status}`} type="button" onClick={completeAction} disabled={status === 'submitting'}>
          {status === 'open' ? 'Start check' : status === 'checked' ? 'Checked' : status === 'submitting' ? 'Saving…' : 'Mark as checked'}
        </button>
      </footer>
    </aside>
  </div>
}

export default function OverviewWorkspace() {
  const [dashboard, setDashboard] = useState<JsonRecord | null>(null)
  const [actions, setActions] = useState<JsonRecord | null>(null)
  const [selectedAreaId, setSelectedAreaId] = useState(readSelectedAreaId)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState('')
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [selectedEvidenceRow, setSelectedEvidenceRow] = useState<OverviewRow | null>(null)
  const [actionOpen, setActionOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const updateContext = (event: Event) => {
      const detail = (event as CustomEvent<{ siteId?: string }>).detail
      setSelectedAreaId(String(detail?.siteId || readSelectedAreaId()))
    }
    window.addEventListener('neurocrop:context-change', updateContext)
    return () => window.removeEventListener('neurocrop:context-change', updateContext)
  }, [])

  useEffect(() => {
    let active = true
    Promise.all(neurocropApi.isConnected()
      ? [neurocropApi.getDashboard(), neurocropApi.getTodayActions()]
      : [Promise.resolve(demoDashboard), Promise.resolve({ actions: demoActions })])
      .then(([nextDashboard, nextActions]) => {
        if (!active) return
        setDashboard(nextDashboard as JsonRecord)
        setActions(nextActions as JsonRecord)
        setLoadState(asArray((nextDashboard as JsonRecord)?.sites).length ? 'ready' : 'empty')
      })
      .catch((reason) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : 'Overview could not be loaded.')
        setLoadState('error')
      })
    return () => { active = false }
  }, [refreshKey])

  const model = useMemo(
    () => dashboard && actions ? buildModel(dashboard, actions, selectedAreaId) : null,
    [dashboard, actions, selectedAreaId],
  )
  const areaOptions = useMemo(
    () => asArray(dashboard?.sites).map((site) => ({
      id: String(site.id),
      name: String(site.name || 'Unnamed Area'),
    })),
    [dashboard],
  )

  function handleActionSubmitted(actionId: string) {
    if (neurocropApi.isConnected()) {
      setRefreshKey((value) => value + 1)
      return
    }
    setActions((current) => current ? {
      ...current,
      actions: asArray(current.actions).filter((action) => String(action.id) !== actionId),
    } : current)
  }

  if (loadState === 'loading') return <section className="nc-overview-state" aria-busy="true"><i className="fa-solid fa-spinner fa-spin" /><h1>Preparing your live overview</h1><p>Evaluating Sections against their active crop profiles.</p></section>
  if (loadState === 'error') return <section className="nc-overview-state" role="alert"><i className="fa-solid fa-cloud-arrow-down" /><h1>Overview could not be loaded</h1><p>{error}</p><button type="button" onClick={() => setRefreshKey((value) => value + 1)}>Try again</button></section>
  if (loadState === 'empty' || !model) return <section className="nc-overview-state"><i className="fa-solid fa-seedling" /><h1>Your workspace is ready</h1><p>Create an Area and its first Section to begin monitoring.</p></section>

  const actionRows = model.rows.filter((row) => row.tone === 'action')
  const watchRows = model.rows.filter((row) => row.tone === 'watch')
  const stableRows = model.rows.filter((row) => row.tone === 'good')
  const verifiedRows = model.rows.filter((row) => row.tone !== 'unknown')
  const stable = !model.priority && actionRows.length === 0 && watchRows.length === 0 && verifiedRows.length === model.rows.length
  const headline = stable
    ? `All ${model.rows.length} Sections are stable.`
    : model.priority?.title || `${model.rows.length - verifiedRows.length} Sections cannot be verified.`
  const explanation = stable
    ? 'Every Section is inside its current target range.'
    : model.priority?.reason || 'Current data or an active crop profile is missing.'
  const unknownRows = model.rows.filter((row) => row.tone === 'unknown')

  function openAreaEvidence() {
    setSelectedEvidenceRow(null)
    setEvidenceOpen(true)
  }

  function openSectionEvidence(row: OverviewRow) {
    setSelectedEvidenceRow(row)
    setEvidenceOpen(true)
  }

  function changeArea(areaId: string) {
    setSelectedAreaId(areaId)
    window.dispatchEvent(new CustomEvent('neurocrop:overview-area-change', {
      detail: { siteId: areaId },
    }))
  }

  return <div className={`nc-overview ${stable ? 'stable' : model.priority ? 'action' : watchRows.length ? 'watch' : 'unknown'}`} data-nc-react-workspace="overview">
    <section className="nc-overview-stage">
      <div className="nc-overview-main">
        <section className="nc-overview-copy" aria-live="polite">
          <div className="nc-overview-area-picker">
            <span>Active Area</span>
            <div role="group" aria-label="Select active Area">
              {areaOptions.map((area) => <button type="button" key={area.id} data-active={area.id === model.areaId} aria-pressed={area.id === model.areaId} onClick={() => changeArea(area.id)}><i className="fa-solid fa-layer-group" aria-hidden="true" /><span>{area.name}</span></button>)}
            </div>
          </div>
          <div className="nc-overview-kicker"><span>{stable ? 'All systems normal' : model.priority ? 'Action recommended' : 'Setup required'}</span><strong>All {model.rows.length} Sections</strong></div>
          <h1>{headline}</h1>
          <p>{explanation}</p>
          {model.priority
            ? <button className="nc-overview-action" type="button" onClick={() => setActionOpen(true)}>{String(model.priority.recommendedAction || 'Review recommended action').replace(/\.$/, '')}<i className="fa-solid fa-arrow-right" /></button>
            : stable
              ? <div className="nc-overview-normal"><i className="fa-regular fa-circle-check" />No action required</div>
              : <a className="nc-overview-action" href="/sections">Review Section setup<i className="fa-solid fa-arrow-right" /></a>}
        </section>

        <figure className="nc-coverage" aria-labelledby="nc-coverage-title">
          <div className="nc-coverage-summary">
            <div className="nc-section-summary">
              <p id="nc-coverage-title">Section status</p>
              <div>
                <span className="action"><i />{actionRows.length} need{actionRows.length === 1 ? 's' : ''} action</span>
                <span className="watch"><i />{watchRows.length} watch</span>
                <span className="good"><i />{stableRows.length} stable</span>
                {unknownRows.length ? <span className="unknown"><i />{unknownRows.length} unverified</span> : null}
              </div>
            </div>
            <div className="nc-growing-score">
              <span>Growing score</span>
              <p><strong>{model.growingScore ?? '—'}</strong>{model.growingScore === null ? null : <small>/ 100</small>}</p>
            </div>
          </div>
          <div className="nc-coverage-list">
            {model.rows.map((row) => <button className={`nc-coverage-row ${row.tone}`} type="button" key={row.id} onClick={() => openSectionEvidence(row)} aria-label={`View evidence for ${row.name}`}>
              <i><span /></i>
              <div><strong>{row.name}</strong><small>{row.crop}</small><small className="nc-row-growing-score">Growing score <b>{row.score ?? '—'}{row.score === null ? '' : ' / 100'}</b></small></div>
              <p><strong>{row.status}</strong><small>{row.detail}</small><time>{row.updated}</time></p>
              <i className="fa-solid fa-chevron-right nc-coverage-chevron" aria-hidden="true" />
            </button>)}
          </div>
          <figcaption><i className="fa-solid fa-circle-check" />Based on current Section target evaluations. No aggregate trend is inferred.</figcaption>
        </figure>
      </div>
      <footer className="nc-overview-trust">
        <span><i />{model.reporting}</span>
        <span>{model.updated}</span>
        <span>{actionRows.length} actions · {watchRows.length} watch conditions</span>
        <button type="button" onClick={openAreaEvidence}>View Area evidence <i className="fa-solid fa-arrow-right" /></button>
      </footer>
    </section>
    {evidenceOpen ? <EvidenceDrawer model={model} row={selectedEvidenceRow} onClose={() => setEvidenceOpen(false)} /> : null}
    {actionOpen && model.priority ? <ActionWorkflow action={model.priority} onClose={() => setActionOpen(false)} onSubmitted={() => handleActionSubmitted(String(model.priority?.id || ''))} /> : null}
  </div>
}
