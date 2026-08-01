import { translateInterfaceText as tx } from '../i18n'
import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useInterfaceLanguage } from '../i18n'
import { neurocropApi } from '../services/api/neurocropApi'
import { useDashboardState } from '../state/dashboardStore'
import { canAccessWorkspaceRoute, useWorkspaceAccess, workspaceLockReason } from '../state/workspaceAccess'

export type DashboardUser = {
  email: string
  name?: string
  role?: string
  isPlatformAdmin?: boolean
}

type ShellProps = {
  user: DashboardUser
  onSignOut: () => Promise<void>
  onPrefetchRoute?: (route: string) => void
  children: ReactNode
}

type NodeSummary = { id: string; name: string; batteryPercent: number | null }

const navigation = [
  { route: '/', action: 'overview', label: 'Overview', icon: 'fa-chart-pie' },
  { route: '/areas', action: 'sites', label: 'Areas', icon: 'fa-map' },
  { route: '/sections', action: 'zones', label: 'Sections', icon: 'fa-border-all' },
  { route: '/nodes', action: 'nodes', label: 'Nodes', icon: 'fa-microchip' },
  { route: '/readings', action: 'readings', label: 'Readings', icon: 'fa-wave-square' },
  { route: '/history', action: 'history', label: 'Trends', icon: 'fa-chart-line' },
  { route: '/alerts', action: 'alerts', label: 'Alerts', icon: 'fa-bell' },
  { route: '/actions', action: 'actions', label: 'Actions', icon: 'fa-list-check' },
  { route: '/crop-profiles', action: 'crop-profiles', label: 'Profiles', icon: 'fa-sliders' },
  { route: '/simulator', action: 'simulator', label: 'Simulator', icon: 'fa-flask', beta: true },
] as const

const management = [
  { route: '/settings', action: 'settings', label: 'Settings', icon: 'fa-gear' },
  { route: '/organization', action: 'organization', label: 'Organisation', icon: 'fa-building' },
] as const

function arrayFrom(value: unknown, keys: string[]) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  for (const key of keys) if (Array.isArray(record[key])) return record[key] as unknown[]
  return []
}

function numberValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = Number(record[key])
    if (Number.isFinite(value)) return value
  }
  return null
}

function initials(value: string) {
  return value.replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase()).join('') || 'NC'
}

export default function DashboardShell({ user, onSignOut, onPrefetchRoute, children }: ShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { language, setLanguage, t } = useInterfaceLanguage()
  const dashboardState = useDashboardState()
  const workspaceAccess = useWorkspaceAccess()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [accountMenu, setAccountMenu] = useState<'header' | 'sidebar' | null>(null)
  const [batteryOpen, setBatteryOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [navigationPending, startNavigationTransition] = useTransition()
  const [nodes, setNodes] = useState<NodeSummary[]>([])
  const [alertCount, setAlertCount] = useState(0)

  useEffect(() => {
    let active = true
    const loadSummary = () => {
      Promise.allSettled([neurocropApi.getNodes(), neurocropApi.getAlerts('all')]).then(([nodeResult, alertResult]) => {
        if (!active) return
        if (nodeResult.status === 'fulfilled') {
          setNodes(arrayFrom(nodeResult.value, ['nodes', 'items']).map((value, index) => {
            const node = value as Record<string, unknown>
            return {
              id: String(node.id || node.devEui || index),
              name: String(node.name || node.displayName || node.devEui || `Node ${index + 1}`),
              batteryPercent: numberValue(node, ['batteryPercent', 'batteryLevel', 'battery']),
            }
          }))
        }
        if (alertResult.status === 'fulfilled') {
          const alerts = arrayFrom(alertResult.value, ['alerts', 'items'])
          setAlertCount(alerts.filter((value) => {
            const status = String((value as Record<string, unknown>).status || 'active')
            return status !== 'resolved'
          }).length)
        }
      })
    }
    loadSummary()
    const interval = window.setInterval(() => {
      if (!document.hidden) loadSummary()
    }, 60_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      setMobileOpen(false)
      setAccountMenu(null)
      setBatteryOpen(false)
    })
    document.body.dataset.primaryPage = location.pathname === '/' ? 'overview' : location.pathname.slice(1).split('/')[0]
  }, [location.pathname])

  useEffect(() => {
    if (mobileOpen) document.body.dataset.sidebarOpen = 'true'
    else delete document.body.dataset.sidebarOpen
    return () => { delete document.body.dataset.sidebarOpen }
  }, [mobileOpen])

  const lowBatteryNodes = useMemo(
    () => nodes.filter((node) => node.batteryPercent !== null && node.batteryPercent <= 20),
    [nodes],
  )
  const reportingCount = nodes.length
  const displayName = user.name || user.email.split('@')[0] || 'NeuroCrop user'
  const pathIsActive = (route: string) => route === '/nodes'
    ? location.pathname === route || location.pathname.startsWith('/nodes/')
    : location.pathname === route

  function go(route: string) {
    if (!canAccessWorkspaceRoute(workspaceAccess.stage, route)) return
    onPrefetchRoute?.(route)
    startNavigationTransition(() => navigate(route))
  }

  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      await onSignOut()
    } finally {
      setSigningOut(false)
    }
  }

  const navButton = (item: { route: string; action: string; label: string; icon: string; beta?: boolean }) => {
    const active = pathIsActive(item.route)
    const locked = !canAccessWorkspaceRoute(workspaceAccess.stage, item.route)
    const lockReason = workspaceLockReason(workspaceAccess.stage)
    return (
      <button key={item.route} type="button" className="rail-link nav-link nav-link-button" data-sidebar-action={item.action} data-active={active} data-disabled={locked} aria-current={active ? 'page' : undefined} aria-disabled={locked || undefined} disabled={locked} title={locked ? t(lockReason) : undefined} onPointerEnter={() => onPrefetchRoute?.(item.route)} onPointerDown={() => onPrefetchRoute?.(item.route)} onFocus={() => onPrefetchRoute?.(item.route)} onClick={() => go(item.route)}>
        <i className={`fa-solid ${item.icon}`} aria-hidden="true" />
        <span>{t(item.label)}</span>
        {item.route === '/alerts' && alertCount > 0 ? <b className="nav-count" title={`${alertCount} ${t('open alerts')}`} aria-label={`${alertCount} ${t('open alerts')}`}>{alertCount}</b> : null}
        {item.beta ? <small className="nav-beta-badge">{tx("Beta")}</small> : null}
      </button>
    )
  }

  return (
    <>
      <a className="skip-to-content" href="#dashboardMain">{t('Skip to main content')}</a>
      <div id="dashboardShell" className="dashboard-shell flex min-h-screen" data-navigation-pending={navigationPending || undefined}>
        <header id="dashboardHeader" className="global-system-bar">
          <div className="global-system-bar-actions">
            <button className="sidebar-mobile-open" type="button" aria-label={t('Open navigation')} aria-controls="dashboardSidebar" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}>
              <i className="fa-solid fa-bars" aria-hidden="true" />
            </button>
            <div className="header-status-card">
              <div className="language-switch header-language-select" role="group" aria-label={t('Language')}>
                <button type="button" data-language-option="lt" data-active={language === 'lt'} aria-pressed={language === 'lt'} onClick={() => setLanguage('lt')}>LT</button>
                <button type="button" data-language-option="en" data-active={language === 'en'} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
              </div>
              <span className="header-connection-status" data-connection={dashboardState.connected ? 'online' : 'offline'}>
                <span className="header-connection-dot" />
                <span>{t(dashboardState.connected ? 'Online' : 'Offline')}</span>
              </span>
              <div className="header-battery-wrap">
                <button type="button" className="header-battery-indicator actionable" data-state={lowBatteryNodes.length ? 'warning' : 'optimal'} aria-label={t('Low battery nodes')} aria-expanded={batteryOpen} onClick={() => setBatteryOpen((open) => !open)}>
                  <i className="fa-solid fa-battery-half" aria-hidden="true" />
                  <span className="sr-only">{lowBatteryNodes.length}</span>
                </button>
                <div className="header-battery-dropdown" aria-hidden={!batteryOpen} hidden={!batteryOpen}>
                  <div className="header-battery-dropdown-header">
                    <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/42">{t('Low battery nodes')}</p><p className="mt-1 text-sm text-ink/64">{t('Nodes below configured threshold')}</p></div>
                    <span className="control-pill rounded-full px-3 py-1.5 text-xs font-semibold text-ink/68">{lowBatteryNodes.length}</span>
                  </div>
                  <div>{lowBatteryNodes.length ? lowBatteryNodes.map((node) => <p key={node.id}>{node.name} · {node.batteryPercent}%</p>) : <p>{t('No low-battery nodes.')}</p>}</div>
                </div>
              </div>
              <div className="header-account-wrap">
                <button type="button" className="header-account-button" aria-controls="headerAccountMenu" aria-expanded={accountMenu === 'header'} onClick={() => setAccountMenu((open) => open === 'header' ? null : 'header')}>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#d8c8b4] text-[10px] font-bold text-pine">{initials(displayName)}</span>
                  <span id="headerAccountEmail">{user.email}</span>
                  <i className="fa-solid fa-chevron-down text-[10px] text-ink/38" aria-hidden="true" />
                </button>
                <div id="headerAccountMenu" className="header-account-menu" hidden={accountMenu !== 'header'}><button type="button" disabled={signingOut} onClick={() => void signOut()}><i className="fa-solid fa-arrow-right-from-bracket mr-2" />{t('Sign out')}</button></div>
              </div>
            </div>
          </div>
        </header>
        <aside id="dashboardSidebar" className={`dashboard-sidebar rail hidden shrink-0 xl:flex xl:flex-col${mobileOpen ? ' rail-open' : ''}`} aria-label="Primary navigation">
          <div className="rail-brand"><span className="brand-mark"><i className="fa-solid fa-seedling" /></span><span className="brand-word"><strong>Neuro</strong>{tx("Crop")}</span><button className="rail-close" type="button" aria-label={t('Close navigation')} onClick={() => setMobileOpen(false)}><i className="fa-solid fa-xmark" /></button></div>
          <nav className="rail-nav">
            <p className="rail-label">{t('Monitor')}</p>
            {navigation.map(navButton)}
            <p className="rail-label rail-label-second">{t('Manage')}</p>
            {management.map(navButton)}
            {user.isPlatformAdmin ? navButton({ route: '/admin', action: 'admin', label: 'Admin', icon: 'fa-user-shield' }) : null}
          </nav>
          <div className="rail-foot">
            <div className="workspace-health" data-state={dashboardState.connected ? (alertCount ? 'attention' : 'optimal') : 'unknown'}><span className="pulse-dot" /><div><strong>{t(alertCount ? 'System attention' : 'Systems online')}</strong><small>{reportingCount} {t('Nodes').toLowerCase()}</small></div></div>
            <div className="sidebar-user-wrap">
              <button className="user-tile" type="button" aria-controls="sidebarAccountMenu" aria-expanded={accountMenu === 'sidebar'} onClick={() => setAccountMenu((open) => open === 'sidebar' ? null : 'sidebar')}><span>{initials(displayName)}</span><div><strong>{displayName}</strong><small>{user.role || t('Workspace member')}</small></div><i className="fa-solid fa-ellipsis" /></button>
              <div id="sidebarAccountMenu" className="sidebar-account-menu" hidden={accountMenu !== 'sidebar'}><button type="button" disabled={signingOut} onClick={() => void signOut()}><i className="fa-solid fa-arrow-right-from-bracket" />{t('Sign out')}</button></div>
            </div>
          </div>
        </aside>
        <button type="button" className="rail-scrim" aria-label={t('Close navigation')} hidden={!mobileOpen} onClick={() => setMobileOpen(false)} />
        <main id="dashboardMain" className="min-w-0 flex-1" tabIndex={-1}>
          <div className="dashboard-main-inner px-3 py-2 md:px-4 md:py-3 lg:px-4 lg:py-3">{children}</div>
        </main>
      </div>
      <nav className="mobile-dock" aria-label="Mobile navigation">
        {[
          { route: '/', label: 'Overview', icon: 'fa-chart-pie' },
          { route: '/areas', label: 'Areas', icon: 'fa-map' },
          { route: '/nodes', label: 'Nodes', icon: 'fa-microchip' },
          { route: '/alerts', label: 'Alerts', icon: 'fa-bell' },
        ].map((item) => {
          const locked = !canAccessWorkspaceRoute(workspaceAccess.stage, item.route)
          return <button key={item.route} type="button" className="mobile-dock-button" data-active={pathIsActive(item.route)} data-disabled={locked} aria-disabled={locked || undefined} disabled={locked} onPointerDown={() => onPrefetchRoute?.(item.route)} onFocus={() => onPrefetchRoute?.(item.route)} onClick={() => go(item.route)}><i className={`fa-solid ${item.icon}`} /><span>{t(item.label)}</span></button>
        })}
        <button type="button" className="mobile-dock-button mobile-dock-command" onClick={() => setMobileOpen(true)}><i className="fa-solid fa-bars" /><span>{t('Manage')}</span></button>
      </nav>
    </>
  )
}
