import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { neurocropApi } from '../../services/api/neurocropApi'

type AdminSection = 'organizations' | 'requests' | 'users' | 'administrators'
type CurrentUser = { id: string; name: string; email: string; isPlatformAdmin: boolean; isSuperAdmin: boolean }
type Organization = {
  id: string
  name: string
  status: string
  memberCount: number
  areaCount: number
  sectionCount: number
  nodeCount: number
  faultNodeCount: number | null
  createdAt?: string
}
type OrganizationRequest = {
  id: string
  name?: string
  email: string
  organizationName: string
  status: string
  createdAt?: string
}
type PlatformUser = {
  id: string
  name?: string
  email: string
  active: boolean
  isPlatformAdmin: boolean
  isSuperAdmin: boolean
  organizationCount: number
  pendingRequestCount: number
  lastLoginAt?: string
}
type DiagnosticNode = {
  devEui: string
  name: string
  areaName?: string | null
  sectionName?: string | null
  transportStatus?: string
  level?: number | null
  firmwareVersion?: string | null
  lastSeen?: string | null
  health?: { state?: string; label?: string; reasons?: string[] }
}
type Feedback = { tone: 'success' | 'warning'; text: string }

const sectionMeta: Record<AdminSection, { title: string; description: string; icon: string }> = {
  organizations: { title: 'Customer organizations', description: 'Create, inspect, archive, and restore isolated customer workspaces.', icon: 'fa-building' },
  requests: { title: 'Access requests', description: 'Review new workspace requests before customer data storage is created.', icon: 'fa-inbox' },
  users: { title: 'Platform users', description: 'Review account access and organization membership across the platform.', icon: 'fa-users' },
  administrators: { title: 'Platform administrators', description: 'Control the small group allowed to administer all NeuroCrop customers.', icon: 'fa-user-shield' },
}

function formatDate(value?: string | null) {
  if (!value) return 'Never'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function initials(value: string) {
  return value.split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'NC'
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : 'The requested administration action could not be completed.'
}

function hasFiniteNumber(value: unknown) {
  return value !== null && value !== undefined && value !== '' && typeof value !== 'boolean' && Number.isFinite(Number(value))
}

export default function AdminWorkspace() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [section, setSection] = useState<AdminSection>('organizations')
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [requests, setRequests] = useState<OrganizationRequest[]>([])
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState('')
  const [query, setQuery] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [organizationName, setOrganizationName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [latestInvite, setLatestInvite] = useState<{ url: string; email: string; sent: boolean } | null>(null)
  const [diagnostics, setDiagnostics] = useState<{ organization: Organization; nodes: DiagnosticNode[]; loading: boolean } | null>(null)

  useEffect(() => {
    document.body.dataset.reactAdminActive = 'true'
    return () => { delete document.body.dataset.reactAdminActive }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const meResponse = await neurocropApi.getCurrentUser() as { user?: CurrentUser }
      if (!meResponse.user?.isPlatformAdmin) {
        navigate('/', { replace: true })
        return
      }
      const [organizationsResponse, usersResponse, requestsResponse] = await Promise.all([
        neurocropApi.getPlatformOrganizations(),
        neurocropApi.getPlatformUsers(),
        neurocropApi.getOrganizationRequests('pending'),
      ]) as [{ organizations?: Organization[] }, { users?: PlatformUser[] }, { requests?: OrganizationRequest[] }]
      setCurrentUser(meResponse.user)
      setOrganizations(Array.isArray(organizationsResponse.organizations) ? organizationsResponse.organizations : [])
      setUsers(Array.isArray(usersResponse.users) ? usersResponse.users : [])
      setRequests(Array.isArray(requestsResponse.requests) ? requestsResponse.requests : [])
    } catch (reason) {
      setFeedback({ tone: 'warning', text: errorMessage(reason) })
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function runAction(key: string, action: () => Promise<unknown>, success: string) {
    setBusyKey(key)
    setFeedback(null)
    try {
      await action()
      setFeedback({ tone: 'success', text: success })
      await load()
    } catch (reason) {
      setFeedback({ tone: 'warning', text: errorMessage(reason) })
    } finally {
      setBusyKey('')
    }
  }

  async function createOrganization(event: FormEvent) {
    event.preventDefault()
    setBusyKey('create-organization')
    setFeedback(null)
    try {
      const response = await neurocropApi.createPlatformOrganization({ organizationName, ownerEmail }) as {
        organization?: Organization
        invitation?: { inviteUrl?: string; email?: string; emailDelivery?: { sent?: boolean } }
      }
      setOrganizationName('')
      setOwnerEmail('')
      if (response.invitation?.inviteUrl) {
        setLatestInvite({
          url: response.invitation.inviteUrl,
          email: response.invitation.email || ownerEmail,
          sent: Boolean(response.invitation.emailDelivery?.sent),
        })
      }
      setFeedback({
        tone: response.invitation?.emailDelivery?.sent ? 'success' : 'warning',
        text: response.invitation?.emailDelivery?.sent ? 'Organization created and owner invitation sent.' : 'Organization created. Email delivery was not confirmed; keep the backup invitation link.',
      })
      await load()
    } catch (reason) {
      setFeedback({ tone: 'warning', text: errorMessage(reason) })
    } finally {
      setBusyKey('')
    }
  }

  async function openDiagnostics(organization: Organization) {
    setDiagnostics({ organization, nodes: [], loading: true })
    try {
      const response = await neurocropApi.getPlatformOrganizationNodes(organization.id) as { nodes?: DiagnosticNode[] }
      setDiagnostics({ organization, nodes: Array.isArray(response.nodes) ? response.nodes : [], loading: false })
    } catch (reason) {
      setDiagnostics(null)
      setFeedback({ tone: 'warning', text: errorMessage(reason) })
    }
  }

  const normalizedQuery = query.trim().toLowerCase()
  const filteredOrganizations = organizations.filter((item) => !normalizedQuery || `${item.name} ${item.id} ${item.status}`.toLowerCase().includes(normalizedQuery))
  const filteredUsers = users.filter((item) => !normalizedQuery || `${item.name || ''} ${item.email}`.toLowerCase().includes(normalizedQuery))
  const administrators = filteredUsers.filter((item) => item.isPlatformAdmin || item.isSuperAdmin)
  const activeOrganizations = organizations.filter((item) => item.status !== 'archived').length
  const faultCount = organizations.reduce((sum, item) => sum + (Number(item.faultNodeCount) || 0), 0)
  const meta = sectionMeta[section]

  return <main className="nc-settings-page nc-admin-page" aria-busy={loading}>
    <header className="nc-settings-page-head nc-admin-page-head">
      <div><p>Platform administration</p><h1>Admin console</h1><span>Customer tenancy, account access, and infrastructure controls separated from grower settings.</span></div>
      <div className="nc-admin-head-actions"><button className="nc-settings-button secondary" onClick={() => navigate('/admin/integrations')}><i className="fa-solid fa-plug" />Integrations</button><button className="nc-settings-button" onClick={() => void load()} disabled={loading}><i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'}`} />Refresh</button></div>
    </header>

    {feedback ? <div className="nc-settings-feedback" data-tone={feedback.tone} role="status"><i className={`fa-solid ${feedback.tone === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} />{feedback.text}<button onClick={() => setFeedback(null)} aria-label="Dismiss"><i className="fa-solid fa-xmark" /></button></div> : null}
    {latestInvite ? <section className="nc-admin-invite-result"><i className="fa-solid fa-envelope-open-text" /><div><strong>{latestInvite.sent ? 'Owner invitation sent' : 'Backup invitation required'}</strong><span>{latestInvite.email}</span></div><button onClick={() => void navigator.clipboard.writeText(latestInvite.url)}><i className="fa-regular fa-copy" />Copy invitation link</button><button aria-label="Dismiss invitation details" onClick={() => setLatestInvite(null)}><i className="fa-solid fa-xmark" /></button></section> : null}

    <section className="nc-admin-overview" aria-label="Platform summary">
      <article><span><i className="fa-solid fa-building" /></span><div><strong>{activeOrganizations}</strong><small>Active organizations</small></div></article>
      <article><span><i className="fa-solid fa-inbox" /></span><div><strong>{requests.length}</strong><small>Pending requests</small></div></article>
      <article><span><i className="fa-solid fa-users" /></span><div><strong>{users.length}</strong><small>Platform users</small></div></article>
      <article data-tone={faultCount > 0 ? 'warning' : 'success'}><span><i className="fa-solid fa-microchip" /></span><div><strong>{faultCount}</strong><small>Nodes with active faults</small></div></article>
    </section>

    <section className="nc-settings-center nc-admin-center">
      <aside className="nc-settings-nav nc-admin-nav" aria-label="Administration sections">
        <div className="nc-settings-identity"><span><i className="fa-solid fa-shield-halved" /></span><div><strong>NeuroCrop platform</strong><small>{currentUser?.isSuperAdmin ? 'Super administrator' : 'Platform administrator'}</small></div></div>
        <p>Manage</p>
        {(Object.keys(sectionMeta) as AdminSection[]).map((key) => <button key={key} className={section === key ? 'active' : ''} onClick={() => { setSection(key); setQuery('') }}><i className={`fa-solid ${sectionMeta[key].icon}`} /><span><strong>{sectionMeta[key].title.replace('Customer ', '').replace('Platform ', '')}</strong><small>{key === 'organizations' ? `${organizations.length} workspaces` : key === 'requests' ? `${requests.length} awaiting review` : key === 'users' ? `${users.length} accounts` : `${users.filter((item) => item.isPlatformAdmin).length} privileged accounts`}</small></span><i className="fa-solid fa-chevron-right" /></button>)}
        <p>Workspace</p>
        <button onClick={() => navigate('/settings')}><i className="fa-solid fa-gear" /><span><strong>Settings</strong><small>Current customer workspace</small></span><i className="fa-solid fa-arrow-up-right-from-square" /></button>
      </aside>

      <div className="nc-settings-main nc-admin-main">
        <header className="nc-settings-panel-head nc-admin-panel-head"><div><p>Protected workspace</p><h2>{meta.title}</h2><span>{meta.description}</span></div>{section !== 'requests' ? <label className="nc-admin-search"><i className="fa-solid fa-magnifying-glass" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${section}`} /></label> : null}</header>

        {section === 'organizations' ? <div className="nc-settings-flow">
          <form className="nc-admin-create" onSubmit={createOrganization}><div><strong>Create customer organization</strong><span>The owner receives an isolated workspace invitation.</span></div><label><span>Organization name</span><input required value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Company or institution" /></label><label><span>Owner email</span><input required type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} placeholder="owner@example.com" /></label><button disabled={busyKey === 'create-organization'}><i className="fa-solid fa-plus" />{busyKey === 'create-organization' ? 'Creating…' : 'Create organization'}</button></form>
          <section className="nc-admin-table-card"><div className="nc-admin-table-wrap"><table><thead><tr><th>Organization</th><th>Status</th><th>Coverage</th><th>Nodes</th><th>Faults</th><th>Created</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filteredOrganizations.map((organization) => <tr key={organization.id}><td><strong>{organization.name}</strong><small>{organization.id}</small></td><td><span className="nc-settings-status" data-tone={organization.status === 'archived' ? 'neutral' : 'success'}><i />{organization.status || 'active'}</span></td><td><strong>{organization.areaCount || 0} areas · {organization.sectionCount || 0} sections</strong><small>{organization.memberCount || 0} members</small></td><td>{organization.nodeCount || 0}</td><td><span className="nc-settings-status" data-tone={Number(organization.faultNodeCount) > 0 ? 'warning' : 'success'}><i />{Number(organization.faultNodeCount) || 0}</span></td><td>{formatDate(organization.createdAt)}</td><td><div className="nc-admin-row-actions"><button title="Node diagnostics" onClick={() => void openDiagnostics(organization)}><i className="fa-solid fa-stethoscope" /></button>{organization.status === 'archived' ? <button title="Restore" disabled={busyKey === `restore-${organization.id}`} onClick={() => void runAction(`restore-${organization.id}`, () => neurocropApi.restorePlatformOrganization(organization.id), `${organization.name} restored.`)}><i className="fa-solid fa-arrow-rotate-left" /></button> : <button title="Archive" disabled={busyKey === `archive-${organization.id}`} onClick={() => { if (window.confirm(`Archive ${organization.name}? Customer access will stop, but data will be kept.`)) void runAction(`archive-${organization.id}`, () => neurocropApi.archivePlatformOrganization(organization.id), `${organization.name} archived.`) }}><i className="fa-solid fa-box-archive" /></button>}{currentUser?.isSuperAdmin ? <button className="danger" title="Delete permanently" disabled={busyKey === `delete-${organization.id}`} onClick={() => { if (window.confirm(`Permanently delete ${organization.name} and all of its data? This cannot be undone.`)) void runAction(`delete-${organization.id}`, () => neurocropApi.deletePlatformOrganization(organization.id), `${organization.name} permanently deleted.`) }}><i className="fa-solid fa-trash" /></button> : null}</div></td></tr>)}{!filteredOrganizations.length && !loading ? <tr><td colSpan={7}><div className="nc-settings-empty"><i className="fa-regular fa-building" /><strong>No matching organizations</strong><span>Clear the search or create a customer workspace.</span></div></td></tr> : null}</tbody></table></div></section>
        </div> : null}

        {section === 'requests' ? <section className="nc-admin-request-list">{requests.map((request) => <article key={request.id}><span><i className="fa-solid fa-building-circle-arrow-right" /></span><div><strong>{request.organizationName}</strong><p>{request.name || 'New customer'} · {request.email}</p><small>Requested {formatDate(request.createdAt)}</small></div><span className="nc-settings-status" data-tone="warning"><i />Pending</span><div><button className="secondary" disabled={Boolean(busyKey)} onClick={() => { if (window.confirm(`Reject ${request.organizationName}?`)) void runAction(`reject-${request.id}`, () => neurocropApi.rejectOrganizationRequest(request.id), `${request.organizationName} request rejected.`) }}>Reject</button><button disabled={Boolean(busyKey)} onClick={() => { if (window.confirm(`Approve ${request.organizationName} and create its workspace?`)) void runAction(`approve-${request.id}`, () => neurocropApi.approveOrganizationRequest(request.id), `${request.organizationName} approved and created.`) }}>Approve</button></div></article>)}{!requests.length && !loading ? <div className="nc-settings-empty"><i className="fa-regular fa-circle-check" /><strong>No pending requests</strong><span>New organization requests will appear here for review.</span></div> : null}</section> : null}

        {section === 'users' ? <section className="nc-admin-table-card"><div className="nc-admin-table-wrap"><table><thead><tr><th>User</th><th>Account</th><th>Organizations</th><th>Requests</th><th>Last login</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.id}><td><div className="nc-admin-person"><span>{initials(user.name || user.email)}</span><div><strong>{user.name || 'Unnamed user'}</strong><small>{user.email}</small></div></div></td><td><span className="nc-settings-status" data-tone={user.active ? 'success' : 'neutral'}><i />{user.isSuperAdmin ? 'Super admin' : user.isPlatformAdmin ? 'Platform admin' : user.active ? 'Active' : 'Inactive'}</span></td><td>{user.organizationCount || 0}</td><td>{user.pendingRequestCount || 0}</td><td>{formatDate(user.lastLoginAt)}</td><td>{currentUser?.isSuperAdmin && !user.isSuperAdmin ? <div className="nc-admin-row-actions"><button title={user.active ? 'Deactivate' : 'Activate'} disabled={user.id === currentUser.id || Boolean(busyKey)} onClick={() => { if (window.confirm(`${user.active ? 'Deactivate' : 'Activate'} ${user.email}?`)) void runAction(`status-${user.id}`, () => neurocropApi.setPlatformUserActive(user.id, !user.active), `${user.email} ${user.active ? 'deactivated' : 'activated'}.`) }}><i className={`fa-solid ${user.active ? 'fa-user-slash' : 'fa-user-check'}`} /></button><button className="danger" title="Delete user" disabled={user.id === currentUser.id || Boolean(busyKey)} onClick={() => { if (window.confirm(`Permanently delete ${user.email}? Organization measurements will be kept.`)) void runAction(`delete-user-${user.id}`, () => neurocropApi.deletePlatformUser(user.id), `${user.email} permanently deleted.`) }}><i className="fa-solid fa-trash" /></button></div> : <span className="nc-admin-readonly">Read only</span>}</td></tr>)}</tbody></table></div></section> : null}

        {section === 'administrators' ? <section className="nc-admin-table-card"><div className="nc-admin-table-wrap"><table><thead><tr><th>Administrator</th><th>Level</th><th>Account</th><th>Organizations</th><th>Last login</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{administrators.map((user) => <tr key={user.id}><td><div className="nc-admin-person"><span>{initials(user.name || user.email)}</span><div><strong>{user.name || 'Unnamed administrator'}</strong><small>{user.email}</small></div></div></td><td>{user.isSuperAdmin ? 'Super administrator' : 'Platform administrator'}</td><td><span className="nc-settings-status" data-tone={user.active ? 'success' : 'neutral'}><i />{user.active ? 'Active' : 'Inactive'}</span></td><td>{user.organizationCount || 0}</td><td>{formatDate(user.lastLoginAt)}</td><td>{currentUser?.isSuperAdmin && !user.isSuperAdmin ? <button className="nc-admin-text-danger" disabled={user.id === currentUser.id || Boolean(busyKey)} onClick={() => { if (window.confirm(`Remove platform administrator access from ${user.email}?`)) void runAction(`revoke-${user.id}`, () => neurocropApi.revokePlatformAdmin(user.id), `${user.email} is no longer a platform administrator.`) }}>Revoke access</button> : <span className="nc-admin-readonly">Protected</span>}</td></tr>)}{!administrators.length && !loading ? <tr><td colSpan={6}><div className="nc-settings-empty">No matching administrators.</div></td></tr> : null}</tbody></table></div>{currentUser?.isSuperAdmin ? <div className="nc-admin-grant"><div><strong>Grant platform access</strong><span>Select an active user from the Users section and grant global administration deliberately.</span></div><select defaultValue="" onChange={(event) => { const user = users.find((item) => item.id === event.target.value); if (user && window.confirm(`Grant platform administrator access to ${user.email}?`)) void runAction(`grant-${user.id}`, () => neurocropApi.grantPlatformAdmin({ userId: user.id }), `${user.email} is now a platform administrator.`); event.target.value = '' }}><option value="" disabled>Select eligible user</option>{users.filter((user) => user.active && !user.isPlatformAdmin && !user.isSuperAdmin).map((user) => <option key={user.id} value={user.id}>{user.name || user.email} · {user.email}</option>)}</select></div> : null}</section> : null}
      </div>
    </section>

    {diagnostics ? <div className="nc-admin-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDiagnostics(null) }}><section className="nc-admin-diagnostics" role="dialog" aria-modal="true" aria-labelledby="adminDiagnosticsTitle"><header><div><p>Node diagnostics</p><h2 id="adminDiagnosticsTitle">{diagnostics.organization.name}</h2><span>{diagnostics.nodes.length} registered nodes</span></div><button onClick={() => setDiagnostics(null)} aria-label="Close diagnostics"><i className="fa-solid fa-xmark" /></button></header>{diagnostics.loading ? <div className="nc-settings-empty"><i className="fa-solid fa-spinner fa-spin" /><strong>Loading node diagnostics</strong></div> : <div className="nc-admin-table-wrap"><table><thead><tr><th>Node</th><th>Location</th><th>Transport</th><th>Health</th><th>Battery</th><th>Firmware</th><th>Last packet</th></tr></thead><tbody>{diagnostics.nodes.map((node) => <tr key={node.devEui}><td><strong>{node.name}</strong><small>{node.devEui}</small></td><td>{[node.areaName, node.sectionName].filter(Boolean).join(' · ') || 'Unassigned'}</td><td><span className="nc-settings-status" data-tone={node.transportStatus === 'live' ? 'success' : node.transportStatus === 'delayed' ? 'warning' : 'neutral'}><i />{node.transportStatus || 'unknown'}</span></td><td>{node.health?.label || node.health?.state || 'No active fault'}</td><td>{hasFiniteNumber(node.level) ? `${node.level}%` : 'Unknown'}</td><td>{node.firmwareVersion || 'Unknown'}</td><td>{formatDate(node.lastSeen)}</td></tr>)}{!diagnostics.nodes.length ? <tr><td colSpan={7}>No nodes are registered for this organization.</td></tr> : null}</tbody></table></div>}</section></div> : null}
  </main>
}
