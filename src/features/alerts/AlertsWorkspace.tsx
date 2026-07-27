import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useInterfaceLanguage } from '../../i18n'
import { neurocropApi } from '../../services/api/neurocropApi'
import '../../styles/redesign-alerts.css'

// API workflow records intentionally stay flexible while older alert records expire.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonRecord = Record<string, any>
type Tone = 'critical' | 'warning' | 'offline'
type FilterKey = 'open' | Tone | 'acknowledged'
type Feedback = { tone: 'success' | 'danger'; text: string } | null
type AlertItem = {
  id: string
  tone: Tone
  status: string
  acknowledged: boolean
  siteId: string
  siteName: string
  zoneId: string
  zoneName: string
  nodeId: string
  title: string
  detail: string
  timestamp: string
  icon: string
  context: JsonRecord
}

const manageableRoles = new Set(['owner', 'admin', 'grower', 'technician'])
const toneRank: Record<Tone, number> = { critical: 0, warning: 1, offline: 2 }

function text(value: unknown, fallback = '') {
  return value === null || value === undefined || value === '' ? fallback : String(value)
}

function normalizeAlert(record: JsonRecord): AlertItem | null {
  const context = record.context && typeof record.context === 'object' ? record.context as JsonRecord : {}
  const id = text(record.id || context.id)
  if (!id || record.managed !== true || record.active !== true) return null
  const snoozedUntil = new Date(text(record.snoozedUntil)).getTime()
  if (record.status === 'snoozed' && Number.isFinite(snoozedUntil) && snoozedUntil > Date.now()) return null
  const rawTone = text(context.tone, 'warning')
  const tone: Tone = rawTone === 'critical' || rawTone === 'offline' ? rawTone : 'warning'
  return {
    id,
    tone,
    status: text(record.status, 'open'),
    acknowledged: record.status === 'acknowledged' || Boolean(record.acknowledgedAt),
    siteId: text(context.siteId),
    siteName: text(context.siteName, 'Unassigned area'),
    zoneId: text(context.zoneId),
    zoneName: text(context.zoneName, 'Unassigned section'),
    nodeId: text(context.nodeId),
    title: text(context.title, 'Operational alert'),
    detail: text(context.detail, 'Review the current sensor condition.'),
    timestamp: text(context.timestamp || record.lastDetectedAt || record.updatedAt),
    icon: text(context.icon, tone === 'offline' ? 'fa-link-slash' : 'fa-triangle-exclamation'),
    context,
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export default function AlertsWorkspace() {
  const navigate = useNavigate()
  const { language } = useInterfaceLanguage()
  const lt = language === 'lt'
  const [items, setItems] = useState<AlertItem[]>([])
  const [filter, setFilter] = useState<FilterKey>('open')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())
  const [canManage, setCanManage] = useState(false)

  const copy = useCallback((english: string, lithuanian: string) => lt ? lithuanian : english, [lt])

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setStatus('loading')
    setError('')
    try {
      const [alertsResponse, userResponse] = await Promise.all([
        neurocropApi.getAlerts('all') as Promise<JsonRecord>,
        neurocropApi.getCurrentUser() as Promise<JsonRecord>,
      ])
      const normalized = (Array.isArray(alertsResponse?.alerts) ? alertsResponse.alerts : [])
        .map((record: JsonRecord) => normalizeAlert(record))
        .filter((item: AlertItem | null): item is AlertItem => Boolean(item))
        .sort((left: AlertItem, right: AlertItem) =>
          toneRank[left.tone] - toneRank[right.tone]
          || new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime())
      setItems(normalized)
      setCanManage(manageableRoles.has(text(userResponse?.user?.role).toLowerCase()))
      setStatus('ready')
    } catch (loadError) {
      setStatus('error')
      setError(errorMessage(loadError, copy('Alerts could not be loaded.', 'Perspėjimų įkelti nepavyko.')))
    }
  }, [copy])

  useEffect(() => {
    document.body.dataset.reactAlertsActive = 'true'
    const loadTimer = window.setTimeout(() => { void load() }, 0)
    return () => {
      window.clearTimeout(loadTimer)
      delete document.body.dataset.reactAlertsActive
    }
  }, [load])

  const openItems = useMemo(() => items.map((item) => ({ ...item })), [items])
  const acknowledged = useMemo(() => openItems.filter((item) => item.acknowledged), [openItems])
  const filters = useMemo(() => [
    { key: 'open' as const, label: copy('Active', 'Aktyvūs'), count: openItems.length },
    { key: 'critical' as const, label: copy('Critical', 'Kritiniai'), count: openItems.filter((item) => item.tone === 'critical').length },
    { key: 'warning' as const, label: copy('Warnings', 'Įspėjimai'), count: openItems.filter((item) => item.tone === 'warning').length },
    { key: 'offline' as const, label: copy('Device offline', 'Node be ryšio'), count: openItems.filter((item) => item.tone === 'offline').length },
    { key: 'acknowledged' as const, label: copy('Seen', 'Peržiūrėti'), count: acknowledged.length },
  ], [acknowledged.length, copy, openItems])
  const visible = filter === 'acknowledged'
    ? acknowledged
    : filter === 'open'
      ? openItems
      : openItems.filter((item) => item.tone === filter)

  useEffect(() => {
    const badge = document.getElementById('sidebarAlertCount')
    if (!badge) return
    badge.textContent = String(openItems.length)
    badge.hidden = openItems.length === 0
  }, [openItems.length])

  function setPending(ids: string[], pending: boolean) {
    setPendingIds((current) => {
      const next = new Set(current)
      ids.forEach((id) => pending ? next.add(id) : next.delete(id))
      return next
    })
  }

  async function acknowledge(selected: AlertItem[]) {
    const actionable = selected.filter((item) => !item.acknowledged && !pendingIds.has(item.id))
    if (!actionable.length) return
    const ids = actionable.map((item) => item.id)
    setPending(ids, true)
    setFeedback(null)
    try {
      await Promise.all(actionable.map((item) => neurocropApi.acknowledgeAlert(item.id, { context: item.context })))
      await load(false)
      setFeedback({
        tone: 'success',
        text: actionable.length === 1
          ? copy('Alert marked as seen. The live condition remains active.', 'Perspėjimas pažymėtas peržiūrėtu. Gyva sąlyga lieka aktyvi.')
          : copy(`${actionable.length} alerts marked as seen. Live conditions remain active.`, `${actionable.length} įspėjimai pažymėti peržiūrėtais. Gyvos sąlygos lieka aktyvios.`),
      })
    } catch (actionError) {
      setFeedback({ tone: 'danger', text: errorMessage(actionError, copy('Alert could not be acknowledged.', 'Nepavyko pažymėti įspėjimo peržiūrėtu.')) })
    } finally {
      setPending(ids, false)
    }
  }

  async function snooze(item: AlertItem) {
    if (pendingIds.has(item.id)) return
    setPending([item.id], true)
    setFeedback(null)
    try {
      await neurocropApi.snoozeAlert(item.id, { minutes: 60, context: item.context })
      await load(false)
      setFeedback({
        tone: 'success',
        text: copy('Alert muted for one hour. This does not resolve the live condition.', 'Perspėjimas nutildytas vienai valandai. Tai neišsprendžia gyvos sąlygos.'),
      })
    } catch (actionError) {
      setFeedback({ tone: 'danger', text: errorMessage(actionError, copy('Alert workflow could not be saved.', 'Nepavyko išsaugoti įspėjimo veiksmo.')) })
    } finally {
      setPending([item.id], false)
    }
  }

  function openContext(item: AlertItem) {
    if (item.nodeId) {
      navigate(`/nodes/${encodeURIComponent(item.nodeId)}`)
      return
    }
    const query = new URLSearchParams()
    if (item.siteId) query.set('area', item.siteId)
    if (item.zoneId) query.set('section', item.zoneId)
    navigate(`/sections${query.size ? `?${query}` : ''}`)
  }

  function formatTimestamp(value: string) {
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return copy('Current', 'Dabar')
    const sameDay = date.toDateString() === new Date().toDateString()
    const locale = lt ? 'lt-LT' : 'en-GB'
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)
    return sameDay ? `${copy('Today', 'Šiandien')} · ${time}` : new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
  }

  const emptyTitle = filter === 'acknowledged'
    ? copy('No active alerts have been seen', 'Nė vienas aktyvus įspėjimas dar neperžiūrėtas')
    : copy('No alerts in this view', 'Šiame vaizde įspėjimų nėra')
  const emptyText = filter === 'open'
    ? copy('Current growing conditions and device reporting are within the configured limits.', 'Dabartinės auginimo sąlygos ir node ryšys atitinka nustatytas ribas.')
    : copy('Choose another filter to review the rest of the operational queue.', 'Pasirinkite kitą filtrą, kad peržiūrėtumėte likusius įrašus.')

  return <div className="nc-alerts-page">
    <header className="nc-alerts-head">
      <div>
        <p className="nc-alerts-eyebrow">{copy('Operational attention', 'Operacinis dėmesys')}</p>
        <h1>{copy('Alerts', 'Perspėjimai')}</h1>
        <p className="nc-alerts-description">{copy(
          'Live sensor deviations and device connectivity events. Alerts explain what is happening; employee work, assignment, and verification are managed in Actions.',
          'Gyvi sensorių nukrypimai ir įrenginių ryšio įvykiai. Perspėjimai parodo, kas vyksta; darbuotojų darbai, priskyrimas ir patikra valdomi Veiksmų puslapyje.',
        )}</p>
      </div>
      <button type="button" className="nc-alerts-review-all" onClick={() => void acknowledge(openItems)} disabled={!canManage || !openItems.some((item) => !item.acknowledged) || pendingIds.size > 0}>
        <i className="fa-solid fa-check-double" aria-hidden="true" />{copy('Mark all as seen', 'Pažymėti visus peržiūrėtais')}
      </button>
    </header>

    {feedback ? <div className="nc-alerts-feedback" data-tone={feedback.tone} role={feedback.tone === 'danger' ? 'alert' : 'status'}>{feedback.text}</div> : null}
    {status === 'error' ? <div className="nc-alerts-empty" role="alert"><span><i className="fa-solid fa-cloud-arrow-down" /></span><h2>{copy('Alerts could not be loaded', 'Perspėjimų įkelti nepavyko')}</h2><p>{error}</p><button type="button" className="nc-alert-primary-action" onClick={() => void load()}>{copy('Try again', 'Bandyti dar kartą')}</button></div> : null}
    {status === 'loading' ? <div className="nc-alerts-empty" aria-busy="true"><span><i className="fa-solid fa-circle-notch fa-spin" /></span><h2>{copy('Loading alerts', 'Įkeliami įspėjimai')}</h2></div> : null}
    {status === 'ready' ? <div className="nc-alerts-layout">
      <aside className="nc-alerts-filters" aria-label={copy('Alert views', 'Perspėjimų filtrai')}>
        <p>{copy('Status', 'Būsena')}</p>
        <div role="list">{filters.map((item, index) => <span key={item.key} style={{ display: 'contents' }}>{index === 4 ? <span className="nc-alert-filter-divider" aria-hidden="true" /> : null}<button type="button" data-active={item.key === filter} aria-pressed={item.key === filter} onClick={() => { setFilter(item.key); setFeedback(null) }}><span>{item.label}</span><strong>{item.count}</strong></button></span>)}</div>
      </aside>
      <section className="nc-alerts-stream" aria-label={filters.find((item) => item.key === filter)?.label}>
        {visible.length ? visible.map((item) => {
          const pending = pendingIds.has(item.id)
          const toneLabel = item.tone === 'critical' ? copy('Critical', 'Kritinis') : item.tone === 'warning' ? copy('Warning', 'Įspėjimas') : copy('Offline', 'Be ryšio')
          return <article className="nc-alert-card" data-tone={item.tone} key={item.id}>
            <span className="nc-alert-card-icon" aria-hidden="true"><i className={`fa-solid ${item.icon}`} /></span>
            <div className="nc-alert-card-body">
              <div className="nc-alert-card-meta"><span><span className="nc-alert-status" data-tone={item.tone}><i className="fa-solid fa-circle" />{toneLabel}</span>{item.acknowledged ? <span className="nc-alert-seen"><i className="fa-solid fa-check" />{copy('Seen', 'Peržiūrėta')}</span> : null}</span><time>{formatTimestamp(item.timestamp)}</time></div>
              <h3>{item.title}</h3><p>{item.detail}</p>
              <div className="nc-alert-location"><span>{item.siteName}</span><i className="fa-solid fa-chevron-right" /><span>{item.zoneName}</span></div>
            </div>
            <div className="nc-alert-card-actions">
              <button type="button" className="nc-alert-secondary-action" onClick={() => openContext(item)}>{copy('View live context', 'Atidaryti gyvą būseną')}</button>
              <button type="button" className="nc-alert-secondary-action" onClick={() => void snooze(item)} disabled={!canManage || pending}>{copy('Mute 1h', 'Nutildyti 1 val.')}</button>
              <button type="button" className="nc-alert-primary-action" onClick={() => void acknowledge([item])} disabled={!canManage || pending || item.acknowledged}>{pending ? <i className="fa-solid fa-spinner fa-spin" /> : null}{item.acknowledged ? copy('Seen', 'Peržiūrėta') : copy('Mark as seen', 'Pažymėti peržiūrėtu')}</button>
            </div>
          </article>
        }) : <div className="nc-alerts-empty"><span><i className="fa-solid fa-check" /></span><h2>{emptyTitle}</h2><p>{emptyText}</p></div>}
      </section>
    </div> : null}
  </div>
}
