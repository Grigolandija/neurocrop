import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import type { ViewMode } from '../types'

const nav = [
  { to: '/', label: 'Overview', icon: '⌂', end: true },
  { to: '/areas', label: 'Areas', icon: '●' },
  { to: '/sections', label: 'Sections', icon: '□' },
  { to: '/nodes', label: 'Nodes', icon: '▦' },
  { to: '/alerts', label: 'Alerts', icon: '▲' },
  { to: '/history', label: 'Trends', icon: '⌁' },
  { to: '/settings', label: 'Settings', icon: '≡' },
]

type Props = {
  email: string
  lowBatteryCount: number
  mode: ViewMode
  onMode: (mode: ViewMode) => void
  onLogout: () => void
  children: React.ReactNode
}

export function AppShell({ email, lowBatteryCount, mode, onMode, onLogout, children }: Props) {
  const [accountOpen, setAccountOpen] = useState(false)
  const [batteryOpen, setBatteryOpen] = useState(false)
  const [language, setLanguage] = useState<'LT' | 'EN'>('EN')

  return <div className="control-layout">
    <header className="system-bar">
      <div className="language-switch" aria-label="Language">
        <button data-active={language === 'LT'} onClick={() => setLanguage('LT')}>LT</button>
        <button data-active={language === 'EN'} onClick={() => setLanguage('EN')}>EN</button>
      </div>
      <span className="online-status"><i />Online</span>
      <div className="header-popover">
        <button className="battery-pill" onClick={() => { setBatteryOpen((value) => !value); setAccountOpen(false) }}>▭ <strong>{lowBatteryCount}</strong></button>
        {batteryOpen && <div className="popover-card"><strong>Low battery nodes</strong><p>{lowBatteryCount ? `${lowBatteryCount} nodes need a battery check.` : 'All node batteries are healthy.'}</p><NavLink to="/nodes" onClick={() => setBatteryOpen(false)}>Open nodes</NavLink></div>}
      </div>
      <div className="header-popover">
        <button className="account-button" onClick={() => { setAccountOpen((value) => !value); setBatteryOpen(false) }}><span>AK</span><strong>{email}</strong><b>⌄</b></button>
        {accountOpen && <div className="popover-card account-menu"><strong>{email}</strong><NavLink to="/settings" onClick={() => setAccountOpen(false)}>Account settings</NavLink><button onClick={onLogout}>Sign out</button></div>}
      </div>
    </header>

    <aside className="control-sidebar">
      <div className="control-brand"><div className="brand-mark">⌁</div><div><small>NeuroCrop</small><strong>Control<br />Center</strong></div></div>
      <nav>{nav.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => isActive ? 'active' : ''}><span>{item.icon}</span>{item.label}</NavLink>)}</nav>
    </aside>

    <div className="control-workspace">
      <div className="workspace-tools">
        <div className="view-switch"><span>View</span><button data-active={mode === 'simple'} onClick={() => onMode('simple')}>Simple</button><button data-active={mode === 'detailed'} onClick={() => onMode('detailed')}>Detailed</button></div>
      </div>
      <main className="route-page">{children}</main>
    </div>
  </div>
}
