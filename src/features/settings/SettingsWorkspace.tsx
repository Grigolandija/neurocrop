import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { neurocropApi } from '../../services/api/neurocropApi'

type SettingsSection = 'workspace' | 'team' | 'notifications' | 'security' | 'audit'
type User = { id: string; email: string; name: string; role: string; organizationName: string; isPlatformAdmin: boolean }
type Member = { id: string; email: string; name: string; role: string; joinedAt?: string }
type Invitation = { id: string; email: string; role: string; expiresAt?: string; createdAt?: string }
type Session = { id: string; current: boolean; createdAt?: string; lastSeenAt?: string; expiresAt?: string }
type AuditEvent = { id: string; time: string; category: 'access' | 'configuration' | 'security'; actor: string; action: string; detail: string }
type Preferences = {
  organizationName: string
  timezone: string
  locale: string
  temperatureUnit: string
  timeFormat: string
  emailEnabled: boolean
  browserEnabled: boolean
  smsEnabled: boolean
  criticalOverride: boolean
  quietStart: string
  quietEnd: string
  warningAfterMinutes: number
}

const settingsStorageKey = 'neurocrop-dashboard-settings-v1'
const auditStorageKey = 'neurocrop-settings-audit-v1'
const defaults: Preferences = {
  organizationName: 'NeuroCrop workspace', timezone: 'Europe/Vilnius', locale: 'en-GB', temperatureUnit: 'C', timeFormat: '24h',
  emailEnabled: true, browserEnabled: true, smsEnabled: false, criticalOverride: true, quietStart: '22:00', quietEnd: '06:00', warningAfterMinutes: 15,
}

const sectionMeta: Record<SettingsSection, { eyebrow: string; title: string; description: string }> = {
  workspace: { eyebrow: 'Workspace profile', title: 'General settings', description: 'Shared workspace identity and your personal display preferences.' },
  team: { eyebrow: 'Access control', title: 'Team & roles', description: 'Invite people and control what each workspace member can change.' },
  notifications: { eyebrow: 'Operational routing', title: 'Notifications', description: 'Choose delivery channels, escalation timing, and quiet hours.' },
  security: { eyebrow: 'Account protection', title: 'Security', description: 'Change your password and revoke other authenticated sessions.' },
  audit: { eyebrow: 'Local governance', title: 'Settings activity', description: 'A transparent record of settings actions performed in this browser.' },
}

function readPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(settingsStorageKey) || '{}')
    return {
      organizationName: value.organization?.name || defaults.organizationName,
      timezone: value.preferences?.timezone || defaults.timezone,
      locale: value.preferences?.locale || defaults.locale,
      temperatureUnit: value.preferences?.temperatureUnit || defaults.temperatureUnit,
      timeFormat: value.preferences?.timeFormat || defaults.timeFormat,
      emailEnabled: value.notifications?.emailEnabled ?? defaults.emailEnabled,
      browserEnabled: value.notifications?.browserEnabled ?? defaults.browserEnabled,
      smsEnabled: value.notifications?.smsEnabled ?? defaults.smsEnabled,
      criticalOverride: value.notifications?.criticalOverride ?? defaults.criticalOverride,
      quietStart: value.notifications?.quietStart || defaults.quietStart,
      quietEnd: value.notifications?.quietEnd || defaults.quietEnd,
      warningAfterMinutes: Number(value.alerts?.warningAfterMinutes || defaults.warningAfterMinutes),
    }
  } catch {
    return defaults
  }
}

function readAudit(): AuditEvent[] {
  try {
    const value = JSON.parse(localStorage.getItem(auditStorageKey) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function initials(value: string) {
  const parts = value.replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'NC'
}

function formatDate(value?: string) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function Status({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className="nc-settings-status" data-tone={tone}><i />{children}</span>
}

export default function SettingsWorkspace({ initialSection = 'workspace' }: { initialSection?: SettingsSection }) {
  const navigate = useNavigate()
  const [section, setSection] = useState<SettingsSection>(initialSection)
  const [user, setUser] = useState<User | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsAvailable, setSessionsAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null)
  const [saved, setSaved] = useState(readPreferences)
  const [draft, setDraft] = useState(readPreferences)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('grower')
  const [busyKey, setBusyKey] = useState('')
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [auditEvents, setAuditEvents] = useState(readAudit)
  const [auditFilter, setAuditFilter] = useState<'all' | AuditEvent['category']>('all')
  const [auditQuery, setAuditQuery] = useState('')
  const meta = sectionMeta[section]
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  const canManageTeam = user?.role === 'owner' || user?.role === 'admin'

  useEffect(() => {
    document.body.dataset.reactSettingsActive = 'true'
    return () => { delete document.body.dataset.reactSettingsActive }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const [userResponse, teamResponse] = await Promise.all([
          neurocropApi.getCurrentUser(), neurocropApi.getTeam(),
        ]) as Array<Record<string, unknown>>
        if (cancelled) return
        const nextUser = (userResponse.user || {}) as User
        const nextPreferences = { ...readPreferences(), organizationName: nextUser.organizationName || readPreferences().organizationName }
        setUser(nextUser)
        setSaved(nextPreferences)
        setDraft(nextPreferences)
        setMembers(Array.isArray(teamResponse.members) ? teamResponse.members as Member[] : [])
        try {
          const sessionResponse = await neurocropApi.getSessions() as Record<string, unknown>
          if (!cancelled) {
            setSessions(Array.isArray(sessionResponse.sessions) ? sessionResponse.sessions as Session[] : [])
            setSessionsAvailable(true)
          }
        } catch {
          if (!cancelled) {
            setSessions([])
            setSessionsAvailable(false)
          }
        }
        if (nextUser.role === 'owner' || nextUser.role === 'admin') {
          const invitationResponse = await neurocropApi.getInvitations() as Record<string, unknown>
          if (!cancelled) setInvitations(Array.isArray(invitationResponse.invitations) ? invitationResponse.invitations as Invitation[] : [])
        }
      } catch (reason) {
        if (!cancelled) setFeedback({ tone: 'warning', text: reason instanceof Error ? reason.message : 'Settings could not be loaded.' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  function recordAudit(category: AuditEvent['category'], action: string, detail: string) {
    const event: AuditEvent = { id: crypto.randomUUID(), time: new Date().toISOString(), category, actor: user?.name || user?.email || 'Current user', action, detail }
    setAuditEvents((current) => {
      const next = [event, ...current].slice(0, 100)
      localStorage.setItem(auditStorageKey, JSON.stringify(next))
      return next
    })
  }

  async function savePreferences() {
    setBusyKey('save')
    setFeedback(null)
    try {
      if (draft.organizationName !== saved.organizationName && canManageTeam) {
        await neurocropApi.updateCurrentOrganization({ name: draft.organizationName })
        recordAudit('configuration', 'Changed workspace name', `${saved.organizationName} → ${draft.organizationName}`)
      }
      const existing = JSON.parse(localStorage.getItem(settingsStorageKey) || '{}')
      localStorage.setItem(settingsStorageKey, JSON.stringify({
        ...existing,
        organization: { ...(existing.organization || {}), name: draft.organizationName },
        preferences: { ...(existing.preferences || {}), timezone: draft.timezone, locale: draft.locale, temperatureUnit: draft.temperatureUnit, timeFormat: draft.timeFormat },
        alerts: { ...(existing.alerts || {}), warningAfterMinutes: draft.warningAfterMinutes },
        notifications: { ...(existing.notifications || {}), emailEnabled: draft.emailEnabled, browserEnabled: draft.browserEnabled, smsEnabled: draft.smsEnabled, criticalOverride: draft.criticalOverride, quietStart: draft.quietStart, quietEnd: draft.quietEnd },
      }))
      if (JSON.stringify(draft) !== JSON.stringify(saved)) recordAudit('configuration', 'Saved workspace preferences', 'Display, notification, or escalation settings changed')
      setSaved(draft)
      setFeedback({ tone: 'success', text: 'Settings saved.' })
    } catch (reason) {
      setFeedback({ tone: 'warning', text: reason instanceof Error ? reason.message : 'Settings could not be saved.' })
    } finally {
      setBusyKey('')
    }
  }

  async function refreshTeam() {
    const teamResponse = await neurocropApi.getTeam() as Record<string, unknown>
    setMembers(Array.isArray(teamResponse.members) ? teamResponse.members as Member[] : [])
    if (canManageTeam) {
      const invitationResponse = await neurocropApi.getInvitations() as Record<string, unknown>
      setInvitations(Array.isArray(invitationResponse.invitations) ? invitationResponse.invitations as Invitation[] : [])
    }
  }

  async function inviteMember(event: FormEvent) {
    event.preventDefault()
    if (!inviteEmail.trim()) return
    setBusyKey('invite')
    setFeedback(null)
    try {
      await neurocropApi.inviteMember({ email: inviteEmail.trim(), role: inviteRole })
      recordAudit('access', 'Invited workspace member', `${inviteEmail.trim()} · ${inviteRole}`)
      setInviteEmail('')
      await refreshTeam()
      setFeedback({ tone: 'success', text: 'Invitation created and delivery requested.' })
    } catch (reason) {
      setFeedback({ tone: 'warning', text: reason instanceof Error ? reason.message : 'Invitation could not be created.' })
    } finally {
      setBusyKey('')
    }
  }

  async function updateRole(member: Member, role: string) {
    setBusyKey(`role-${member.id}`)
    try {
      await neurocropApi.updateTeamMemberRole(member.id, role)
      recordAudit('access', 'Changed member role', `${member.email}: ${member.role} → ${role}`)
      await refreshTeam()
      setFeedback({ tone: 'success', text: `${member.name || member.email} role updated.` })
    } catch (reason) {
      setFeedback({ tone: 'warning', text: reason instanceof Error ? reason.message : 'Role could not be changed.' })
    } finally {
      setBusyKey('')
    }
  }

  async function revokeInvitation(invitation: Invitation) {
    setBusyKey(`invite-${invitation.id}`)
    try {
      await neurocropApi.revokeInvitation(invitation.id)
      recordAudit('access', 'Revoked invitation', invitation.email)
      await refreshTeam()
      setFeedback({ tone: 'success', text: `Invitation for ${invitation.email} revoked.` })
    } catch (reason) {
      setFeedback({ tone: 'warning', text: reason instanceof Error ? reason.message : 'Invitation could not be revoked.' })
    } finally {
      setBusyKey('')
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    if (passwords.next.length < 12) return setFeedback({ tone: 'warning', text: 'The new password must contain at least 12 characters.' })
    if (passwords.next !== passwords.confirm) return setFeedback({ tone: 'warning', text: 'The new passwords do not match.' })
    setBusyKey('password')
    try {
      await neurocropApi.changePassword({ currentPassword: passwords.current, newPassword: passwords.next })
      recordAudit('security', 'Changed account password', 'All other sessions were revoked')
      setPasswords({ current: '', next: '', confirm: '' })
      try {
        const response = await neurocropApi.getSessions() as Record<string, unknown>
        setSessions(Array.isArray(response.sessions) ? response.sessions as Session[] : [])
        setSessionsAvailable(true)
      } catch {
        setSessions([])
        setSessionsAvailable(false)
      }
      setFeedback({ tone: 'success', text: 'Password changed. Other sessions were signed out.' })
    } catch (reason) {
      setFeedback({ tone: 'warning', text: reason instanceof Error ? reason.message : 'Password could not be changed.' })
    } finally {
      setBusyKey('')
    }
  }

  async function revokeSession(session: Session) {
    setBusyKey(`session-${session.id}`)
    try {
      await neurocropApi.revokeSession(session.id)
      setSessions((current) => current.filter((item) => item.id !== session.id))
      recordAudit('security', 'Revoked authenticated session', `Session last active ${formatDate(session.lastSeenAt)}`)
      setFeedback({ tone: 'success', text: 'Session signed out.' })
    } catch (reason) {
      setFeedback({ tone: 'warning', text: reason instanceof Error ? reason.message : 'Session could not be revoked.' })
    } finally {
      setBusyKey('')
    }
  }

  function exportAudit() {
    const rows = [['Time', 'Category', 'Actor', 'Action', 'Detail'], ...auditEvents.map((event) => [event.time, event.category, event.actor, event.action, event.detail])]
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'neurocrop-settings-activity.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const filteredAudit = auditEvents.filter((event) => {
    const query = auditQuery.trim().toLowerCase()
    return (auditFilter === 'all' || event.category === auditFilter) && (!query || `${event.actor} ${event.action} ${event.detail}`.toLowerCase().includes(query))
  })

  return <main className="nc-settings-page" aria-busy={loading}>
    <header className="nc-settings-page-head"><div><p>Administration</p><h1>Settings</h1><span>Workspace configuration, access, delivery, and account security in one accountable place.</span></div><div className="nc-settings-save-state" data-dirty={dirty}><i /><span><strong>{dirty ? 'Unsaved changes' : 'All settings saved'}</strong><small>{dirty ? 'Review before leaving' : user?.organizationName || 'Workspace configuration'}</small></span></div></header>
    {feedback ? <div className="nc-settings-feedback" data-tone={feedback.tone} role="status"><i className={`fa-solid ${feedback.tone === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} />{feedback.text}<button onClick={() => setFeedback(null)} aria-label="Dismiss"><i className="fa-solid fa-xmark" /></button></div> : null}
    <section className="nc-settings-center">
      <aside className="nc-settings-nav" aria-label="Settings sections">
        <div className="nc-settings-identity"><span>{initials(user?.organizationName || 'NeuroCrop')}</span><div><strong>{user?.organizationName || 'Loading workspace'}</strong><small>{user?.role ? `${user.role} access` : 'Authenticated workspace'}</small></div></div>
        <p>Workspace</p>
        {([
          ['workspace', 'fa-building', 'General', 'Identity and locale'], ['team', 'fa-user-group', 'Team & access', 'Members and roles'],
          ['notifications', 'fa-bell', 'Notifications', 'Delivery and escalation'], ['security', 'fa-shield-halved', 'Security', 'Password and sessions'],
          ['audit', 'fa-clock-rotate-left', 'Activity', 'Settings changes'],
        ] as Array<[SettingsSection, string, string, string]>).map(([key, icon, label, note]) => <button key={key} className={section === key ? 'active' : ''} onClick={() => setSection(key)}><i className={`fa-solid ${icon}`} /><span><strong>{label}</strong><small>{note}</small></span><i className="fa-solid fa-chevron-right" /></button>)}
      </aside>
      <div className="nc-settings-main">
        <header className="nc-settings-panel-head"><div><p>{meta.eyebrow}</p><h2>{meta.title}</h2><span>{meta.description}</span></div>{section === 'audit' ? <button className="nc-settings-button secondary" onClick={exportAudit}><i className="fa-solid fa-download" />Export</button> : null}</header>

        {section === 'workspace' ? <div className="nc-settings-flow"><section className="nc-settings-card"><header><div><h3>Workspace identity</h3><p>Shared name used throughout NeuroCrop and team invitations.</p></div><Status tone="neutral">Workspace-wide</Status></header><div className="nc-settings-fields"><label><span>Organization name</span><input value={draft.organizationName} disabled={!canManageTeam} onChange={(event) => setDraft({ ...draft, organizationName: event.target.value })} /></label><label><span>Signed-in account</span><input value={user?.email || ''} disabled /></label></div>{!canManageTeam ? <p className="nc-settings-helper">Only an owner or administrator can rename this workspace.</p> : null}</section><section className="nc-settings-card"><header><div><h3>Your display preferences</h3><p>Stored for this browser. Other team members keep their own preferences.</p></div><Status tone="info">Personal</Status></header><div className="nc-settings-fields three"><label><span>Language</span><select value={draft.locale} onChange={(event) => setDraft({ ...draft, locale: event.target.value })}><option value="en-GB">English</option><option value="lt-LT">Lithuanian</option></select></label><label><span>Time zone</span><select value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}><option>Europe/Vilnius</option><option>Europe/Riga</option><option>Europe/Warsaw</option></select></label><label><span>Time format</span><select value={draft.timeFormat} onChange={(event) => setDraft({ ...draft, timeFormat: event.target.value })}><option value="24h">24 hour</option><option value="12h">12 hour</option></select></label><label><span>Temperature</span><select value={draft.temperatureUnit} onChange={(event) => setDraft({ ...draft, temperatureUnit: event.target.value })}><option value="C">Celsius</option><option value="F">Fahrenheit</option></select></label></div></section><section className="nc-settings-note"><i className="fa-solid fa-seedling" /><div><strong>Agronomic targets live in Crop profiles</strong><p>Temperature, humidity, VPD, lighting, and root-zone limits are intentionally not duplicated here.</p></div><button onClick={() => navigate('/crop-profiles')}>Open crop profiles <i className="fa-solid fa-arrow-right" /></button></section></div> : null}

        {section === 'team' ? <div className="nc-settings-flow">{canManageTeam ? <form className="nc-settings-invite" onSubmit={inviteMember}><div><strong>Invite a team member</strong><span>Access starts after the invitation is accepted.</span></div><label><span>Email</span><input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="grower@company.com" /></label><label><span>Role</span><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}><option value="grower">Grower</option><option value="technician">Technician</option><option value="viewer">Viewer</option>{user?.role === 'owner' ? <option value="admin">Admin</option> : null}</select></label><button disabled={busyKey === 'invite'}><i className="fa-solid fa-paper-plane" />{busyKey === 'invite' ? 'Sending…' : 'Send invite'}</button></form> : null}<section className="nc-settings-card team"><header><div><h3>Workspace members</h3><p>{members.length} active · {invitations.length} pending</p></div></header><div className="nc-settings-members">{members.map((member) => <article key={member.id}><span>{initials(member.name || member.email)}</span><div><strong>{member.name || member.email}</strong><small>{member.email}</small></div><Status tone="success">Active</Status><label><span>Role</span><select value={member.role} disabled={!canManageTeam || member.role === 'owner' || member.id === user?.id || busyKey === `role-${member.id}`} onChange={(event) => void updateRole(member, event.target.value)}><option value="owner">Owner</option><option value="admin">Admin</option><option value="grower">Grower</option><option value="technician">Technician</option><option value="viewer">Viewer</option></select></label></article>)}{members.length === 0 && !loading ? <p className="nc-settings-empty">No workspace members were returned.</p> : null}</div></section>{invitations.length ? <section className="nc-settings-card team"><header><div><h3>Pending invitations</h3><p>Invitations expire automatically.</p></div></header><div className="nc-settings-invitations">{invitations.map((invitation) => <article key={invitation.id}><i className="fa-solid fa-envelope" /><div><strong>{invitation.email}</strong><small>{invitation.role} · expires {formatDate(invitation.expiresAt)}</small></div><button disabled={busyKey === `invite-${invitation.id}`} onClick={() => void revokeInvitation(invitation)}>Revoke</button></article>)}</div></section> : null}</div> : null}

        {section === 'notifications' ? <div className="nc-settings-flow"><section className="nc-settings-card"><header><div><h3>Delivery channels</h3><p>Personal delivery preferences stored in this browser.</p></div><Status tone="info">Personal</Status></header><div className="nc-settings-toggles">{([
          ['emailEnabled', 'fa-envelope', 'Email', 'Operational alerts and daily summaries'], ['browserEnabled', 'fa-window-maximize', 'Browser notifications', 'Immediate notice while NeuroCrop is open'], ['smsEnabled', 'fa-message', 'SMS', 'Reserved for critical escalation'],
        ] as Array<[keyof Preferences, string, string, string]>).map(([key, icon, label, note]) => <label key={key}><i className={`fa-solid ${icon}`} /><span><strong>{label}</strong><small>{note}</small></span><input type="checkbox" checked={Boolean(draft[key])} onChange={() => setDraft({ ...draft, [key]: !draft[key] })} /><i className="nc-settings-switch" /></label>)}</div></section><section className="nc-settings-card"><header><div><h3>Escalation behavior</h3><p>Controls notification timing, not crop-profile target limits.</p></div></header><div className="nc-settings-fields three"><label><span>Warning persistence</span><select value={draft.warningAfterMinutes} onChange={(event) => setDraft({ ...draft, warningAfterMinutes: Number(event.target.value) })}><option value="10">10 minutes</option><option value="15">15 minutes</option><option value="30">30 minutes</option></select></label><label><span>Quiet hours start</span><input type="time" value={draft.quietStart} onChange={(event) => setDraft({ ...draft, quietStart: event.target.value })} /></label><label><span>Quiet hours end</span><input type="time" value={draft.quietEnd} onChange={(event) => setDraft({ ...draft, quietEnd: event.target.value })} /></label></div><label className="nc-settings-inline-toggle"><span><strong>Critical alerts override quiet hours</strong><small>Critical conditions should be delivered immediately.</small></span><input type="checkbox" checked={draft.criticalOverride} onChange={() => setDraft({ ...draft, criticalOverride: !draft.criticalOverride })} /><i className="nc-settings-switch" /></label></section></div> : null}

        {section === 'security' ? <div className="nc-settings-flow"><div className="nc-settings-security-grid"><form className="nc-settings-card" onSubmit={changePassword}><header><div><h3>Change password</h3><p>At least 12 characters. Other sessions will be revoked.</p></div></header><div className="nc-settings-fields single"><label><span>Current password</span><input type="password" autoComplete="current-password" required value={passwords.current} onChange={(event) => setPasswords({ ...passwords, current: event.target.value })} /></label><label><span>New password</span><input type="password" autoComplete="new-password" required value={passwords.next} onChange={(event) => setPasswords({ ...passwords, next: event.target.value })} /></label><label><span>Confirm new password</span><input type="password" autoComplete="new-password" required value={passwords.confirm} onChange={(event) => setPasswords({ ...passwords, confirm: event.target.value })} /></label></div><button className="nc-settings-button primary" disabled={busyKey === 'password'}>{busyKey === 'password' ? 'Updating…' : 'Update password'}</button></form><section className="nc-settings-card"><header><div><h3>Active sessions</h3><p>Revoke any session you no longer recognize.</p></div></header>{sessionsAvailable ? <div className="nc-settings-sessions">{sessions.map((session) => <article key={session.id}><i className="fa-solid fa-display" /><div><strong>{session.current ? 'Current browser session' : 'Authenticated session'}</strong><small>Last active {formatDate(session.lastSeenAt || session.createdAt)}</small></div>{session.current ? <Status tone="success">Current</Status> : <button disabled={busyKey === `session-${session.id}`} onClick={() => void revokeSession(session)}>Sign out</button>}</article>)}</div> : <div className="nc-settings-empty"><i className="fa-solid fa-server" /><strong>Session management is being deployed</strong><span>Password changes still work. The signed-in device list will appear after the backend update.</span></div>}</section></div></div> : null}

        {section === 'audit' ? <div className="nc-settings-flow"><div className="nc-settings-audit-toolbar"><div>{(['all', 'access', 'configuration', 'security'] as const).map((filter) => <button className={auditFilter === filter ? 'active' : ''} key={filter} onClick={() => setAuditFilter(filter)}>{filter === 'all' ? 'All activity' : filter}</button>)}</div><label><i className="fa-solid fa-magnifying-glass" /><input value={auditQuery} onChange={(event) => setAuditQuery(event.target.value)} placeholder="Search actor or change" /></label></div><section className="nc-settings-audit">{filteredAudit.map((event) => <article key={event.id}><time>{formatDate(event.time)}</time><span><i className={`fa-solid ${event.category === 'access' ? 'fa-user-shield' : event.category === 'security' ? 'fa-lock' : 'fa-sliders'}`} /></span><div><strong>{event.action}</strong><p>{event.detail}</p></div><small>{event.actor}</small></article>)}{filteredAudit.length === 0 ? <div className="nc-settings-empty"><i className="fa-solid fa-clock-rotate-left" /><strong>No matching settings activity</strong><span>Actions performed from this browser will appear here.</span></div> : null}</section><p className="nc-settings-helper">This is a browser-local settings activity record, not the future organization-wide backend audit log.</p></div> : null}
      </div>
    </section>
    {dirty ? <div className="nc-settings-save-dock" role="status"><div><i /><span><strong>Unsaved settings</strong><small>Your changes are not active yet.</small></span></div><button onClick={() => setDraft(saved)}>Discard</button><button className="primary" disabled={busyKey === 'save'} onClick={() => void savePreferences()}><i className="fa-solid fa-floppy-disk" />{busyKey === 'save' ? 'Saving…' : 'Save changes'}</button></div> : null}
  </main>
}
