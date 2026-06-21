import type { Page, ViewMode } from '../types'

const nav: { page: Page; label: string; mark: string }[] = [
  { page: 'overview', label: 'Overview', mark: 'O' },
  { page: 'locations', label: 'Locations', mark: 'L' },
  { page: 'blocks', label: 'Blocks', mark: 'B' },
  { page: 'nodes', label: 'Nodes', mark: 'N' },
  { page: 'alerts', label: 'Alerts', mark: '!' },
  { page: 'history', label: 'History', mark: 'H' },
  { page: 'settings', label: 'Settings', mark: 'S' },
]

type Props = {
  page: Page
  email: string
  lowBatteryCount: number
  mode: ViewMode
  onNavigate: (page: Page) => void
  onMode: (mode: ViewMode) => void
  onLogout: () => void
  children: React.ReactNode
}

export function AppShell({ page, email, lowBatteryCount, mode, onNavigate, onMode, onLogout, children }: Props) {
  return <div className="app-shell">
    <aside className="sidebar">
      <nav>{nav.map((item) => <button key={item.page} data-active={page === item.page} onClick={() => onNavigate(item.page)}><span>{item.mark}</span>{item.label}</button>)}</nav>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="view-switch" role="group" aria-label="Dashboard view">
          <button data-active={mode === 'simple'} onClick={() => onMode('simple')}>Simple</button>
          <button data-active={mode === 'detailed'} onClick={() => onMode('detailed')}>Detailed</button>
        </div>
        <div className="account-pill"><span className="online-dot" />Online <span className="battery">▭ {lowBatteryCount}</span><span className="avatar">AK</span><span>{email}</span><button className="logout" onClick={onLogout}>Sign out</button></div>
      </header>
      <main className="page">{children}</main>
    </div>
  </div>
}
