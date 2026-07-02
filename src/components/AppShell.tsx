import { useState } from 'react'
import { NavLink } from 'react-router-dom'

const nav = [
  { to: '/', label: 'Overview', icon: 'fa-house', end: true },
  { to: '/areas', label: 'Areas', icon: 'fa-location-dot' },
  { to: '/sections', label: 'Sections', icon: 'fa-vector-square' },
  { to: '/nodes', label: 'Nodes', icon: 'fa-microchip' },
  { to: '/alerts', label: 'Alerts', icon: 'fa-triangle-exclamation' },
  { to: '/history', label: 'Trends', icon: 'fa-chart-line' },
  { to: '/settings', label: 'Settings', icon: 'fa-sliders' },
]

type Props = {
  email: string
  lowBatteryCount: number
  onLogout: () => void
  children: React.ReactNode
}

export function AppShell({ email, lowBatteryCount, onLogout, children }: Props) {
  const [accountOpen, setAccountOpen] = useState(false)
  const [batteryOpen, setBatteryOpen] = useState(false)
  const [language, setLanguage] = useState<'LT' | 'EN'>('EN')

  return <div className="dashboard-shell flex min-h-screen">
    <header id="dashboardHeader" className="global-system-bar">
      <div className="global-system-bar-actions">
        <div className="header-status-card">
          <div className="language-switch" role="group" aria-label="Language">
            <button type="button" data-active={language === 'LT'} aria-pressed={language === 'LT'} onClick={() => setLanguage('LT')}>LT</button>
            <button type="button" data-active={language === 'EN'} aria-pressed={language === 'EN'} onClick={() => setLanguage('EN')}>EN</button>
          </div>
          <span className="flex items-center gap-2 text-moss"><span className="h-2.5 w-2.5 rounded-full bg-moss" />Online</span>
          <div className="header-battery-wrap">
            <button type="button" className="header-battery-indicator actionable" data-state={lowBatteryCount ? 'warning' : 'optimal'} aria-expanded={batteryOpen} onClick={() => { setBatteryOpen((open) => !open); setAccountOpen(false) }}>
              <i className="fa-solid fa-battery-half" aria-hidden="true" /><span className="header-battery-count">{lowBatteryCount}</span>
            </button>
            <div className={`header-battery-dropdown${batteryOpen ? ' is-open' : ''}`} aria-hidden={!batteryOpen}>
              <div className="header-battery-dropdown-header"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/42">Low battery nodes</p><p className="mt-1 text-sm text-ink/64">Nodes below configured threshold</p></div><span className="control-pill rounded-full px-3 py-1.5 text-xs font-semibold text-ink/68">{lowBatteryCount} nodes</span></div>
              <div className="header-battery-dropdown-empty">{lowBatteryCount ? `${lowBatteryCount} nodes need a battery check.` : 'All node batteries are healthy.'}</div>
            </div>
          </div>
          <div className="header-account-wrap">
            <button type="button" className="header-account-button" aria-expanded={accountOpen} onClick={() => { setAccountOpen((open) => !open); setBatteryOpen(false) }}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#d8c8b4] text-[10px] font-bold text-pine">AK</span>
              <span>{email}</span><i className="fa-solid fa-chevron-down text-[10px] text-ink/38" aria-hidden="true" />
            </button>
            <div className="header-account-menu" hidden={!accountOpen}><NavLink to="/settings" onClick={() => setAccountOpen(false)}>Account settings</NavLink><button type="button" onClick={onLogout}><i className="fa-solid fa-arrow-right-from-bracket mr-2" />Sign out</button></div>
          </div>
        </div>
      </div>
    </header>

    <aside className="dashboard-sidebar hidden w-72 shrink-0 border-r border-black/6 bg-[#f6f0e4]/88 xl:flex xl:flex-col">
      <div className="border-b border-black/6 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pine text-white shadow-lg shadow-pine/15"><i className="fa-solid fa-seedling text-base" /></div>
          <div className="min-w-0 flex-1"><p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-pine/58">NeuroCrop</p><h1 className="font-display text-[1.65rem] font-bold leading-[0.94] text-ink">Control Center</h1></div>
        </div>
      </div>
      <nav className="flex-1 px-4 py-5">
        <div className="space-y-2">
          {nav.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link flex items-center justify-between gap-3 rounded-[20px] px-4 py-3.5 text-ink/56${isActive ? ' active' : ''}`}>
            <span className="flex items-center gap-3"><i className={`fa-solid ${item.icon} w-5 text-center text-amber`} /><span className="text-[1.02rem]">{item.label}</span></span>
          </NavLink>)}
        </div>
      </nav>
    </aside>

    <main className="min-w-0 flex-1">
      <div className="dashboard-main-inner px-3 py-2 md:px-4 md:py-3 lg:px-4 lg:py-3">
        <main className="route-page">{children}</main>
      </div>
    </main>
  </div>
}
