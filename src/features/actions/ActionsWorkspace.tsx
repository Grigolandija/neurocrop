import { useEffect, useMemo, useState } from 'react'
import { neurocropApi } from '../../services/api/neurocropApi'

// API payloads intentionally remain flexible while the legacy dashboard is still being retired.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>
type Tab = 'open' | 'in_progress' | 'history'
type CompletionForm = { type: string; adjustment: string; duration: string; note: string }

const emptyCompletionForm: CompletionForm = { type: '', adjustment: '', duration: '', note: '' }
const executionTypes = [
  ['ventilation_increased', 'Ventilation increased'],
  ['ventilation_reduced', 'Ventilation reduced'],
  ['vents_opened', 'Vents opened'],
  ['heating_increased', 'Heating increased'],
  ['heating_reduced', 'Heating reduced'],
  ['cooling_increased', 'Cooling increased'],
  ['cooling_reduced', 'Cooling reduced'],
  ['humidification_increased', 'Humidification increased'],
  ['humidification_reduced', 'Humidification reduced'],
  ['irrigation_adjusted', 'Irrigation adjusted'],
  ['shading_adjusted', 'Shading adjusted'],
  ['equipment_checked', 'Equipment checked'],
  ['other', 'Other'],
] as const

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value : []
}

function labelStatus(status: string) {
  if (status === 'in_progress') return 'In progress'
  if (status === 'awaiting_verification') return 'Awaiting verification'
  if (status === 'verified') return 'Verified improvement'
  if (status === 'no_change') return 'No change'
  if (status === 'worsened') return 'Worsened'
  if (status === 'unverified') return 'Not verified'
  if (status === 'completed') return 'Action recorded'
  if (status === 'deferred') return 'Deferred'
  if (status === 'failed') return 'Failed'
  return 'Open'
}

function displayStatus(item: JsonRecord, workflowStatus: string) {
  if (workflowStatus !== 'completed') return workflowStatus
  const outcomeState = String(item.outcome?.state || '')
  if (outcomeState === 'awaiting_data') return 'awaiting_verification'
  if (outcomeState === 'target_reached' || outcomeState === 'improving') return 'verified'
  if (outcomeState === 'unchanged') return 'no_change'
  if (outcomeState === 'worsened') return 'worsened'
  if (outcomeState === 'insufficient_data') return 'unverified'
  return 'completed'
}

function relativeTime(value: unknown) {
  const timestamp = new Date(String(value || '')).getTime()
  if (!Number.isFinite(timestamp)) return 'Not recorded'
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`
  return `${Math.round(seconds / 86400)} d ago`
}

function resultText(item: JsonRecord) {
  if (item.status === 'in_progress') return 'Awaiting completion'
  if (item.status === 'deferred') return item.note || 'Deferred'
  if (item.status === 'failed') return item.note || 'Check failed'
  const outcome = item.outcome || {}
  return outcome.summary || outcome.label || item.note || item.executionDetails?.adjustment || 'Result saved'
}

export default function ActionsWorkspace() {
  const [today, setToday] = useState<JsonRecord[]>([])
  const [history, setHistory] = useState<JsonRecord[]>([])
  const [tab, setTab] = useState<Tab>('open')
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('all')
  const [employee, setEmployee] = useState('all')
  const [date, setDate] = useState('')
  const [completionItem, setCompletionItem] = useState<JsonRecord | null>(null)
  const [completionForm, setCompletionForm] = useState<CompletionForm>(emptyCompletionForm)
  const [completionError, setCompletionError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [todayPayload, historyPayload] = await Promise.all([
        neurocropApi.getTodayActions(),
        neurocropApi.getActionHistory(100),
      ]) as JsonRecord[]
      setToday(asArray(todayPayload?.actions))
      setHistory(asArray(historyPayload?.items))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Actions could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    Promise.all([
      neurocropApi.getTodayActions(),
      neurocropApi.getActionHistory(100),
    ]).then(([todayPayload, historyPayload]) => {
      if (!active) return
      setToday(asArray((todayPayload as JsonRecord)?.actions))
      setHistory(asArray((historyPayload as JsonRecord)?.items))
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Actions could not be loaded.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    const refreshTimer = window.setInterval(() => {
      Promise.all([
        neurocropApi.getTodayActions(),
        neurocropApi.getActionHistory(100),
      ]).then(([todayPayload, historyPayload]) => {
        if (!active) return
        setToday(asArray((todayPayload as JsonRecord)?.actions))
        setHistory(asArray((historyPayload as JsonRecord)?.items))
      }).catch(() => undefined)
    }, 30_000)
    return () => {
      active = false
      window.clearInterval(refreshTimer)
    }
  }, [])

  const currentById = useMemo(() => new Map(today.map((item) => [String(item.id), item])), [today])
  const open = useMemo(() => today.filter((item) => !item.feedback), [today])
  const inProgress = useMemo<JsonRecord[]>(() => {
    const current: JsonRecord[] = today.filter((item) => item.feedback?.status === 'in_progress').map((item): JsonRecord => {
      const historyItem = history.find((entry) => entry.status === 'in_progress' && String(entry.actionId) === String(item.id))
      return {
        ...item,
        status: 'in_progress',
        createdAt: historyItem?.createdAt || item.feedback?.createdAt,
        createdByName: historyItem?.createdByName || null,
        action: item.workflowAction || item,
      }
    })
    const ids = new Set(current.map((item) => String(item.id)))
    return [...current, ...history.filter((item) => item.status === 'in_progress' && !ids.has(String(item.actionId)))]
  }, [history, today])

  const source = tab === 'open' ? open : tab === 'in_progress' ? inProgress : history
  const areas = useMemo(() => [...new Set([...today, ...history].map((item) => String(item.areaName || '')).filter(Boolean))].sort(), [history, today])
  const employees = useMemo(() => [...new Set(history.map((item) => String(item.createdByName || '')).filter(Boolean))].sort(), [history])
  const filtered = useMemo(() => source.filter((item) => {
    const haystack = [item.title, item.metricLabel, item.areaName, item.sectionName, item.createdByName, item.note, item.executionDetails?.adjustment].join(' ').toLowerCase()
    const itemDateSource = item.createdAt || item.observedAt
    const itemDate = itemDateSource ? new Date(itemDateSource).toISOString().slice(0, 10) : ''
    return (!query || haystack.includes(query.toLowerCase()))
      && (area === 'all' || item.areaName === area)
      && (employee === 'all' || item.createdByName === employee)
      && (!date || itemDate === date)
  }), [area, date, employee, query, source])

  async function start(item: JsonRecord) {
    const action = item.action || item
    setBusyId(String(action.id))
    setError('')
    try {
      await neurocropApi.submitTodayActionFeedback(String(action.id), { status: 'in_progress', note: '', action })
      setTab('in_progress')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The check could not be started.')
    } finally {
      setBusyId('')
    }
  }

  function openCompletion(item: JsonRecord) {
    setCompletionItem(item)
    setCompletionForm(emptyCompletionForm)
    setCompletionError('')
  }

  async function complete() {
    const item = completionItem
    if (!item) return
    const action = item.action || currentById.get(String(item.actionId))
    if (!action) {
      setCompletionError('This older check no longer has a matching action snapshot.')
      return
    }
    if (!completionForm.type) {
      setCompletionError('Select what was actually done.')
      return
    }
    if (!completionForm.adjustment.trim()) {
      setCompletionError('Describe the actual change or finding.')
      return
    }
    const duration = completionForm.duration === '' ? null : Number(completionForm.duration)
    if (duration !== null && (!Number.isInteger(duration) || duration < 1 || duration > 1440)) {
      setCompletionError('Duration must be between 1 and 1440 minutes.')
      return
    }
    const id = String(action.id)
    setBusyId(id)
    setError('')
    try {
      await neurocropApi.submitTodayActionFeedback(id, {
        status: 'completed',
        note: completionForm.note.trim(),
        executionDetails: {
          type: completionForm.type,
          adjustment: completionForm.adjustment.trim(),
          durationMinutes: duration,
        },
        action,
      })
      setCompletionItem(null)
      setTab('history')
      await load()
    } catch (reason) {
      setCompletionError(reason instanceof Error ? reason.message : 'The performed work could not be recorded.')
    } finally {
      setBusyId('')
    }
  }

  async function fail() {
    const item = completionItem
    if (!item) return
    const action = item.action || currentById.get(String(item.actionId))
    if (!action) {
      setCompletionError('This older check no longer has a matching action snapshot.')
      return
    }
    if (!completionForm.adjustment.trim()) {
      setCompletionError('Describe why the work could not be completed.')
      return
    }
    const id = String(action.id)
    setBusyId(id)
    setCompletionError('')
    try {
      await neurocropApi.submitTodayActionFeedback(id, {
        status: 'failed',
        note: completionForm.adjustment.trim(),
        action,
      })
      setCompletionItem(null)
      setTab('history')
      await load()
    } catch (reason) {
      setCompletionError(reason instanceof Error ? reason.message : 'The failed check could not be recorded.')
    } finally {
      setBusyId('')
    }
  }

  return <main className="nc-actions-page">
    <header className="nc-actions-head">
      <div>
        <p>Operational follow-through</p>
        <h1>Actions</h1>
        <span>See what needs attention, who performed each check, and whether conditions improved.</span>
      </div>
      <button type="button" className="nc-actions-refresh" onClick={() => void load()}>
        <i className="fa-solid fa-rotate" /> Refresh
      </button>
    </header>

    <section className="nc-actions-summary" aria-label="Action summary">
      <button type="button" className={tab === 'open' ? 'active' : ''} onClick={() => setTab('open')}>
        <i data-state="open" /><strong>{open.length}</strong><span>Open checks</span>
      </button>
      <button type="button" className={tab === 'in_progress' ? 'active' : ''} onClick={() => setTab('in_progress')}>
        <i data-state="in_progress" /><strong>{inProgress.length}</strong><span>In progress</span>
      </button>
      <button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
        <i data-state="completed" /><strong>{history.filter((item) => item.status === 'completed').length}</strong><span>Recorded checks</span>
      </button>
      <p><i className="fa-solid fa-circle-info" /><span><strong>History is auditable.</strong> Every result records the employee and time.</span></p>
    </section>

    {error && <div className="nc-actions-feedback"><i className="fa-solid fa-triangle-exclamation" /><span>{error}</span></div>}

    <section className="nc-actions-shell">
      <div className="nc-actions-toolbar">
        <label className="nc-actions-search">
          <i className="fa-solid fa-magnifying-glass" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search action, area, section or employee" />
        </label>
        <label><span>Area</span><select value={area} onChange={(event) => setArea(event.target.value)}><option value="all">All areas</option>{areas.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Employee</span><select value={employee} onChange={(event) => setEmployee(event.target.value)}><option value="all">All employees</option>{employees.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
      </div>

      {loading ? <div className="nc-actions-loading"><span /><span /><span /></div> : filtered.length === 0
        ? <div className="nc-actions-empty"><i className="fa-solid fa-list-check" /><h2>No matching actions</h2><p>Change the filters or select another status.</p></div>
        : <div className="nc-actions-table">
          <div className="nc-actions-row head"><span>Status</span><span>Check</span><span>Location</span><span>Employee</span><span>Recorded</span><span>Result</span><span /></div>
          {filtered.map((item) => {
            const action = item.action || item
            const actionId = String(action.id || item.actionId)
            const workflowStatus = tab === 'open' ? 'open' : String(item.status || item.feedback?.status || 'open')
            const status = displayStatus(item, workflowStatus)
            return <article className="nc-actions-row" key={`${tab}-${item.id || item.actionId}`}>
              <span><b className="nc-actions-status" data-state={status}><i />{labelStatus(status)}</b></span>
              <span><strong>{item.title || item.metricLabel || 'Recommended check'}</strong><small>{item.recommendedAction || item.metricLabel || ''}</small></span>
              <span><strong>{item.sectionName || 'Unknown section'}</strong><small>{item.areaName || 'Unknown area'}</small></span>
              <span><strong>{item.createdByName || (workflowStatus === 'open' ? 'Unassigned' : 'Current user')}</strong><small>{workflowStatus === 'open' ? 'Not started' : 'Recorded account'}</small></span>
              <span><strong>{workflowStatus === 'open' ? relativeTime(item.observedAt) : relativeTime(item.createdAt)}</strong><small>{workflowStatus === 'open' ? 'Condition detected' : 'Activity logged'}</small></span>
              <span><strong>{workflowStatus === 'open' ? 'Check required' : resultText(item)}</strong><small>{item.executionDetails?.adjustment || item.note || ''}</small></span>
              <span className="nc-actions-controls">
                {workflowStatus === 'open' && <button type="button" disabled={busyId === actionId} onClick={() => void start(item)}>Start</button>}
                {workflowStatus === 'in_progress' && <button type="button" disabled={busyId === actionId} onClick={() => openCompletion(item)}>Record work</button>}
              </span>
            </article>
          })}
          <footer>Showing {filtered.length} of {source.length} actions</footer>
      </div>}
    </section>
    {completionItem && <div className="nc-actions-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setCompletionItem(null)}>
      <section className="nc-actions-modal" role="dialog" aria-modal="true" aria-labelledby="record-work-title">
        <header>
          <div><p>Performed action</p><h2 id="record-work-title">Record work for {completionItem.sectionName || 'Section'}</h2><span>This records the employee action. Sensor verification starts after submission.</span></div>
          <button type="button" onClick={() => setCompletionItem(null)} aria-label="Close"><i className="fa-solid fa-xmark" /></button>
        </header>
        <div className="nc-actions-form">
          <label><span>What was done</span><select value={completionForm.type} onChange={(event) => setCompletionForm((current) => ({ ...current, type: event.target.value }))}><option value="">Select performed action</option>{executionTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label><span>Actual change or finding</span><input value={completionForm.adjustment} onChange={(event) => setCompletionForm((current) => ({ ...current, adjustment: event.target.value }))} placeholder="Example: AC setpoint increased from 18 to 20 °C" maxLength={160} /></label>
          <label><span>Duration, minutes (optional)</span><input type="number" min="1" max="1440" value={completionForm.duration} onChange={(event) => setCompletionForm((current) => ({ ...current, duration: event.target.value }))} /></label>
          <label><span>Additional note (optional)</span><textarea value={completionForm.note} onChange={(event) => setCompletionForm((current) => ({ ...current, note: event.target.value }))} placeholder="Anything the next employee should know" maxLength={500} /></label>
          {completionError && <p className="nc-actions-form-error"><i className="fa-solid fa-triangle-exclamation" />{completionError}</p>}
        </div>
        <footer>
          <button type="button" onClick={() => setCompletionItem(null)}>Cancel</button>
          <button type="button" className="danger" disabled={busyId === String((completionItem.action || completionItem).id || completionItem.actionId)} onClick={() => void fail()}>Could not complete</button>
          <button type="button" className="primary" disabled={busyId === String((completionItem.action || completionItem).id || completionItem.actionId)} onClick={() => void complete()}>Submit for verification</button>
        </footer>
      </section>
    </div>}
  </main>
}
