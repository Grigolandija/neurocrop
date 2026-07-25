import { useEffect, useMemo, useState } from 'react'
import { neurocropApi } from '../../services/api/neurocropApi'

// API payloads intentionally remain flexible while the legacy dashboard is still being retired.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>
type Tab = 'open' | 'in_progress' | 'history'

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value : []
}

function labelStatus(status: string) {
  if (status === 'in_progress') return 'In progress'
  if (status === 'completed') return 'Completed'
  if (status === 'deferred') return 'Deferred'
  if (status === 'failed') return 'Failed'
  return 'Open'
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
  const [notes, setNotes] = useState<Record<string, string>>({})
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
    return () => {
      active = false
    }
  }, [])

  const currentById = useMemo(() => new Map(today.map((item) => [String(item.id), item])), [today])
  const open = useMemo(() => today.filter((item) => !item.feedback || !['in_progress', 'completed'].includes(String(item.feedback.status))), [today])
  const inProgress = useMemo<JsonRecord[]>(() => {
    const current: JsonRecord[] = today.filter((item) => item.feedback?.status === 'in_progress').map((item): JsonRecord => {
      const historyItem = history.find((entry) => entry.status === 'in_progress' && String(entry.actionId) === String(item.id))
      return {
        ...item,
        status: 'in_progress',
        createdAt: historyItem?.createdAt || item.feedback?.createdAt,
        createdByName: historyItem?.createdByName || null,
        action: item,
      }
    })
    const ids = new Set(current.map((item) => String(item.id)))
    return [...current, ...history.filter((item) => item.status === 'in_progress' && !ids.has(String(item.actionId)))]
  }, [history, today])

  const source = tab === 'open' ? open : tab === 'in_progress' ? inProgress : history
  const areas = useMemo(() => [...new Set([...today, ...history].map((item) => String(item.areaName || '')).filter(Boolean))].sort(), [history, today])
  const employees = useMemo(() => [...new Set(history.map((item) => String(item.createdByName || '')).filter(Boolean))].sort(), [history])
  const filtered = useMemo(() => source.filter((item) => {
    const haystack = [item.title, item.metricLabel, item.areaName, item.sectionName, item.createdByName, item.note].join(' ').toLowerCase()
    const itemDate = item.createdAt ? new Date(item.createdAt).toISOString().slice(0, 10) : ''
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

  async function complete(item: JsonRecord) {
    const action = item.action || currentById.get(String(item.actionId))
    if (!action) {
      setError('This older check no longer has a matching action snapshot.')
      return
    }
    const id = String(action.id)
    setBusyId(id)
    setError('')
    try {
      await neurocropApi.submitTodayActionFeedback(id, {
        status: 'completed',
        note: notes[id] || '',
        executionDetails: {
          type: 'equipment_checked',
          adjustment: notes[id] || action.recommendedAction || 'Equipment checked',
          durationMinutes: null,
        },
        action,
      })
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The result could not be saved.')
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
        <i data-state="completed" /><strong>{history.filter((item) => item.status === 'completed').length}</strong><span>Completed</span>
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
            const status = tab === 'open' ? 'open' : String(item.status || item.feedback?.status || 'open')
            return <article className="nc-actions-row" key={`${tab}-${item.id || item.actionId}`}>
              <span><b className="nc-actions-status" data-state={status}><i />{labelStatus(status)}</b></span>
              <span><strong>{item.title || item.metricLabel || 'Recommended check'}</strong><small>{item.recommendedAction || item.metricLabel || ''}</small></span>
              <span><strong>{item.sectionName || 'Unknown section'}</strong><small>{item.areaName || 'Unknown area'}</small></span>
              <span><strong>{item.createdByName || (status === 'open' ? 'Unassigned' : 'Current user')}</strong><small>{status === 'open' ? 'Not started' : 'Recorded account'}</small></span>
              <span><strong>{status === 'open' ? relativeTime(item.observedAt) : relativeTime(item.createdAt)}</strong><small>{status === 'open' ? 'Condition detected' : 'Activity logged'}</small></span>
              <span><strong>{status === 'open' ? 'Check required' : resultText(item)}</strong><small>{item.note || ''}</small></span>
              <span className="nc-actions-controls">
                {status === 'open' && <button type="button" disabled={busyId === actionId} onClick={() => void start(item)}>Start</button>}
                {status === 'in_progress' && <>
                  <input value={notes[actionId] || ''} onChange={(event) => setNotes((current) => ({ ...current, [actionId]: event.target.value }))} placeholder="Result note" />
                  <button type="button" disabled={busyId === actionId} onClick={() => void complete(item)}>Complete</button>
                </>}
              </span>
            </article>
          })}
          <footer>Showing {filtered.length} of {source.length} actions</footer>
        </div>}
    </section>
  </main>
}
