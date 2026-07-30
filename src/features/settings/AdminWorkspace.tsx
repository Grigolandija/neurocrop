import { translateInterfaceText as tx } from '../../i18n'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { neurocropApi } from '../../services/api/neurocropApi'
import '../../styles/settings-workspace.css'

type AdminSection = 'organizations' | 'requests' | 'users' | 'administrators' | 'gateways'
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
type OrganizationMember = {
  id: string
  name?: string
  email: string
  role: string
  active: boolean
  isPlatformAdmin: boolean
  isSuperAdmin: boolean
  lastLoginAt?: string
  joinedAt?: string
}
type Feedback = { tone: 'success' | 'warning'; text: string }
type PlatformGateway = {
  gatewayId: string
  serialNumber: string
  name: string
  organizationId?: string | null
  organizationName?: string | null
  organizationStatus?: string | null
  connectivitySource?: string
  chirpstackRegistered?: boolean | null
  chirpstackName?: string | null
  agentEnrolled?: boolean
  agentStatus?: string
  agentLastSeenAt?: string | null
  hardwareModel?: string | null
  imageVersion?: string | null
  agentVersion?: string | null
  targetAgentVersion?: string | null
  status: string
  updateStatus: string
  updateError?: string | null
  updateAttempts: number
  lastSeenAt?: string | null
  updateCompletedAt?: string | null
  lastHealth?: {
    packetForwarder?: boolean
    gatewayBridge?: boolean
    temperatureC?: number | null
    uptimeSeconds?: number
  }
}
type GatewayRelease = { version: string; size: number; publishedAt: string }
type GatewayUpdatePolicy = { release_version?: string | null; rollout_percent: number; paused: boolean; updated_at?: string | null }

const sectionMeta: Record<AdminSection, { title: string; description: string; icon: string }> = {
  organizations: { title: 'Customer organizations', description: 'Create, inspect, archive, and restore isolated customer workspaces.', icon: 'fa-building' },
  requests: { title: 'Access requests', description: 'Review new workspace requests before customer data storage is created.', icon: 'fa-inbox' },
  users: { title: 'Platform users', description: 'Review account access and organization membership across the platform.', icon: 'fa-users' },
  administrators: { title: 'Platform administrators', description: 'Control the small group allowed to administer all NeuroCrop customers.', icon: 'fa-user-shield' },
  gateways: { title: 'Gateway fleet', description: 'Assign gateways to customers, monitor connectivity, and deploy signed software releases.', icon: 'fa-tower-broadcast' },
}

function formatDate(value?: string | null) {
  if (!value) return 'Never'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatRelativeTime(value?: string | null) {
  if (!value) return 'Never'
  const elapsedSeconds = Math.round((Date.now() - new Date(value).getTime()) / 1000)
  if (!Number.isFinite(elapsedSeconds)) return 'Unknown'
  if (elapsedSeconds < 60) return 'Just now'
  if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)} min ago`
  if (elapsedSeconds < 86400) return `${Math.floor(elapsedSeconds / 3600)} h ago`
  return `${Math.floor(elapsedSeconds / 86400)} d ago`
}

function formatStatusLabel(value?: string | null) {
  if (!value) return tx("Unknown")
  const label = value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
  return tx(label)
}

function gatewayServices(gateway: PlatformGateway) {
  const packetForwarder = gateway.lastHealth?.packetForwarder
  const gatewayBridge = gateway.lastHealth?.gatewayBridge
  if (packetForwarder === false || gatewayBridge === false) {
    const failed = [packetForwarder === false ? 'Radio' : '', gatewayBridge === false ? 'Bridge' : ''].filter(Boolean)
    return { tone: 'warning', label: `${failed.join(' + ')} fault` }
  }
  if (packetForwarder === true && gatewayBridge === true) {
    return {
      tone: gateway.agentStatus === 'online' ? 'success' : 'neutral',
      label: gateway.agentStatus === 'online' ? 'Radio + bridge OK' : 'Last report: radio + bridge OK'
    }
  }
  return { tone: 'neutral', label: 'No service data' }
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
  const [organizationMembers, setOrganizationMembers] = useState<{ organization: Organization; members: OrganizationMember[]; loading: boolean } | null>(null)
  const [gateways, setGateways] = useState<PlatformGateway[]>([])
  const [gatewayRelease, setGatewayRelease] = useState<GatewayRelease | null>(null)
  const [gatewayPolicy, setGatewayPolicy] = useState<GatewayUpdatePolicy | null>(null)
  const [gatewayChirpstackAvailable, setGatewayChirpstackAvailable] = useState(true)

  useEffect(() => {
    document.body.dataset.reactAdminActive = 'true'
    return () => { delete document.body.dataset.reactAdminActive }
  }, [])

  const loadGatewayFleet = useCallback(async () => {
    const gatewayResponse = await neurocropApi.getPlatformGatewayUpdates() as {
      gateways?: PlatformGateway[]
      release?: GatewayRelease | null
      policy?: GatewayUpdatePolicy
      chirpstackAvailable?: boolean
    }
    setGateways(Array.isArray(gatewayResponse.gateways) ? gatewayResponse.gateways : [])
    setGatewayRelease(gatewayResponse.release || null)
    setGatewayPolicy(gatewayResponse.policy || null)
    setGatewayChirpstackAvailable(gatewayResponse.chirpstackAvailable !== false)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const meResponse = await neurocropApi.getCurrentUser() as { user?: CurrentUser }
      if (!meResponse.user?.isPlatformAdmin) {
        if (window.location.pathname.startsWith('/admin')) navigate('/', { replace: true })
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
      if (meResponse.user.isSuperAdmin) {
        await loadGatewayFleet()
      }
    } catch (reason) {
      setFeedback({ tone: 'warning', text: errorMessage(reason) })
    } finally {
      setLoading(false)
    }
  }, [loadGatewayFleet, navigate])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => {
    if (section !== 'gateways' || !currentUser?.isSuperAdmin) return
    const timer = window.setInterval(() => {
      void loadGatewayFleet().catch(() => {})
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [currentUser?.isSuperAdmin, loadGatewayFleet, section])

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

  async function openOrganizationMembers(organization: Organization) {
    setOrganizationMembers({ organization, members: [], loading: true })
    try {
      const response = await neurocropApi.getPlatformOrganizationMembers(organization.id) as { members?: OrganizationMember[] }
      setOrganizationMembers({
        organization,
        members: Array.isArray(response.members) ? response.members : [],
        loading: false,
      })
    } catch (reason) {
      setOrganizationMembers(null)
      setFeedback({ tone: 'warning', text: errorMessage(reason) })
    }
  }

  const normalizedQuery = query.trim().toLowerCase()
  const filteredOrganizations = organizations.filter((item) => !normalizedQuery || `${item.name} ${item.id} ${item.status}`.toLowerCase().includes(normalizedQuery))
  const filteredUsers = users.filter((item) => !normalizedQuery || `${item.name || ''} ${item.email}`.toLowerCase().includes(normalizedQuery))
  const administrators = filteredUsers.filter((item) => item.isPlatformAdmin || item.isSuperAdmin)
  const filteredGateways = gateways.filter((item) => !normalizedQuery ||
    `${item.name} ${item.serialNumber} ${item.gatewayId} ${item.organizationName || ''} ${item.status} ${item.agentStatus || ''} ${item.updateStatus}`
      .toLowerCase().includes(normalizedQuery))
  const gatewayAttentionCount = gateways.filter(
    (gateway) => gateway.status !== 'online' || gateway.agentStatus !== 'online'
  ).length
  const activeOrganizations = organizations.filter((item) => item.status !== 'archived').length
  const faultCount = organizations.reduce((sum, item) => sum + (Number(item.faultNodeCount) || 0), 0)
  const meta = sectionMeta[section]
  const visibleAdminSections = (Object.keys(sectionMeta) as AdminSection[])
    .filter((key) => key !== 'gateways' || currentUser?.isSuperAdmin)

  return <main className="nc-settings-page nc-admin-page" aria-busy={loading}>
    <header className="nc-settings-page-head nc-admin-page-head">
      <div><p>{tx("Platform administration")}</p><h1>{tx("Admin console")}</h1><span>{tx("Customer tenancy, account access, and infrastructure controls separated from grower settings.")}</span></div>
      <div className="nc-admin-head-actions"><button className="nc-settings-button secondary" onClick={() => navigate('/admin/integrations')}><i className="fa-solid fa-plug" />{tx("Integrations")}</button><button className="nc-settings-button" onClick={() => void load()} disabled={loading}><i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'}`} />{tx("Refresh")}</button></div>
    </header>

    {feedback ? <div className="nc-settings-feedback" data-tone={feedback.tone} role="status"><i className={`fa-solid ${feedback.tone === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} />{feedback.text}<button onClick={() => setFeedback(null)} aria-label={tx("Dismiss")}><i className="fa-solid fa-xmark" /></button></div> : null}
    {latestInvite ? <section className="nc-admin-invite-result"><i className="fa-solid fa-envelope-open-text" /><div><strong>{latestInvite.sent ?tx("Owner invitation sent") :tx("Backup invitation required")}</strong><span>{latestInvite.email}</span></div><button onClick={() => void navigator.clipboard.writeText(latestInvite.url)}><i className="fa-regular fa-copy" />{tx("Copy invitation link")}</button><button aria-label={tx("Dismiss invitation details")} onClick={() => setLatestInvite(null)}><i className="fa-solid fa-xmark" /></button></section> : null}

    <section className="nc-admin-overview" aria-label={tx("Platform summary")}>
      <article><span><i className="fa-solid fa-building" /></span><div><strong>{activeOrganizations}</strong><small>{tx("Active organizations")}</small></div></article>
      <article><span><i className="fa-solid fa-inbox" /></span><div><strong>{requests.length}</strong><small>{tx("Pending requests")}</small></div></article>
      <article><span><i className="fa-solid fa-users" /></span><div><strong>{users.length}</strong><small>{tx("Platform users")}</small></div></article>
      <article data-tone={faultCount > 0 ? 'warning' : 'success'}><span><i className="fa-solid fa-microchip" /></span><div><strong>{faultCount}</strong><small>{tx("Nodes with active faults")}</small></div></article>
    </section>

    <section className="nc-settings-center nc-admin-center">
      <aside className="nc-settings-nav nc-admin-nav" aria-label={tx("Administration sections")}>
        <div className="nc-settings-identity"><span><i className="fa-solid fa-shield-halved" /></span><div><strong>{tx("NeuroCrop platform")}</strong><small>{currentUser?.isSuperAdmin ?tx("Super administrator") :tx("Platform administrator")}</small></div></div>
        <p>{tx("Manage")}</p>
        {visibleAdminSections.map((key) => <button key={key} className={section === key ? 'active' : ''} onClick={() => { setSection(key); setQuery('') }}><i className={`fa-solid ${sectionMeta[key].icon}`} /><span><strong>{sectionMeta[key].title.replace('Customer ', '').replace('Platform ', '')}</strong><small>{key === 'organizations' ? `${organizations.length} workspaces` : key === 'requests' ? `${requests.length} awaiting review` : key === 'users' ? `${users.length} accounts` : key === 'gateways' ? `${gateways.length} enrolled gateways` : `${users.filter((item) => item.isPlatformAdmin).length} privileged accounts`}</small></span><i className="fa-solid fa-chevron-right" /></button>)}
        <p>{tx("Workspace")}</p>
        <button onClick={() => navigate('/settings')}><i className="fa-solid fa-gear" /><span><strong>{tx("Settings")}</strong><small>{tx("Current customer workspace")}</small></span><i className="fa-solid fa-arrow-up-right-from-square" /></button>
      </aside>

      <div className="nc-settings-main nc-admin-main">
        <header className="nc-settings-panel-head nc-admin-panel-head"><div><p>{tx("Protected workspace")}</p><h2>{meta.title}</h2><span>{meta.description}</span></div>{section !== 'requests' ? <label className="nc-admin-search"><i className="fa-solid fa-magnifying-glass" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${section}`} /></label> : null}</header>

        {section === 'organizations' ? <div className="nc-settings-flow">
          <form className="nc-admin-create" onSubmit={createOrganization}><div><strong>{tx("Create customer organization")}</strong><span>{tx("The owner receives an isolated workspace invitation.")}</span></div><label><span>{tx("Organization name")}</span><input required value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder={tx("Company or institution")} /></label><label><span>{tx("Owner email")}</span><input required type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} placeholder="owner@example.com" /></label><button disabled={busyKey === 'create-organization'}><i className="fa-solid fa-plus" />{busyKey === 'create-organization' ? 'Creating…' :tx("Create organization")}</button></form>
          <section className="nc-admin-table-card"><div className="nc-admin-table-wrap"><table><thead><tr><th>{tx("Organization")}</th><th>{tx("Status")}</th><th>{tx("Coverage")}</th><th>{tx("Nodes")}</th><th>{tx("Faults")}</th><th>{tx("Created")}</th><th><span className="sr-only">{tx("Actions")}</span></th></tr></thead><tbody>{filteredOrganizations.map((organization) => <tr key={organization.id}><td><strong>{organization.name}</strong><small>{organization.id}</small></td><td><span className="nc-settings-status" data-tone={organization.status === 'archived' ? 'neutral' : 'success'}><i />{organization.status ||tx("active")}</span></td><td><strong>{organization.areaCount || 0} {tx("areas ·")} {organization.sectionCount || 0} {tx("sections")}</strong><button className="nc-admin-member-link" type="button" onClick={() => void openOrganizationMembers(organization)}><i className="fa-solid fa-users" />{organization.memberCount || 0} {tx("members")}</button></td><td>{organization.nodeCount || 0}</td><td><span className="nc-settings-status" data-tone={Number(organization.faultNodeCount) > 0 ? 'warning' : 'success'}><i />{Number(organization.faultNodeCount) || 0}</span></td><td>{formatDate(organization.createdAt)}</td><td><div className="nc-admin-row-actions"><button title={tx("View members")} onClick={() => void openOrganizationMembers(organization)}><i className="fa-solid fa-users" /></button><button title={tx("Node diagnostics")} onClick={() => void openDiagnostics(organization)}><i className="fa-solid fa-stethoscope" /></button>{organization.status === 'archived' ? <button title={tx("Restore")} disabled={busyKey === `restore-${organization.id}`} onClick={() => void runAction(`restore-${organization.id}`, () => neurocropApi.restorePlatformOrganization(organization.id), `${organization.name} restored.`)}><i className="fa-solid fa-arrow-rotate-left" /></button> : <button title={tx("Archive")} disabled={busyKey === `archive-${organization.id}`} onClick={() => { if (window.confirm(`Archive ${organization.name}? Customer access will stop, but data will be kept.`)) void runAction(`archive-${organization.id}`, () => neurocropApi.archivePlatformOrganization(organization.id), `${organization.name} archived.`) }}><i className="fa-solid fa-box-archive" /></button>}{currentUser?.isSuperAdmin ? <button className="danger" title={tx("Delete permanently")} disabled={busyKey === `delete-${organization.id}`} onClick={() => { if (window.confirm(`Permanently delete ${organization.name} and all of its data? This cannot be undone.`)) void runAction(`delete-${organization.id}`, () => neurocropApi.deletePlatformOrganization(organization.id), `${organization.name} permanently deleted.`) }}><i className="fa-solid fa-trash" /></button> : null}</div></td></tr>)}{!filteredOrganizations.length && !loading ? <tr><td colSpan={7}><div className="nc-settings-empty"><i className="fa-regular fa-building" /><strong>{tx("No matching organizations")}</strong><span>{tx("Clear the search or create a customer workspace.")}</span></div></td></tr> : null}</tbody></table></div></section>
        </div> : null}

        {section === 'requests' ? <section className="nc-admin-request-list">{requests.map((request) => <article key={request.id}><span><i className="fa-solid fa-building-circle-arrow-right" /></span><div><strong>{request.organizationName}</strong><p>{request.name ||tx("New customer")} · {request.email}</p><small>{tx("Requested")} {formatDate(request.createdAt)}</small></div><span className="nc-settings-status" data-tone="warning"><i />{tx("Pending")}</span><div><button className="secondary" disabled={Boolean(busyKey)} onClick={() => { if (window.confirm(`Reject ${request.organizationName}?`)) void runAction(`reject-${request.id}`, () => neurocropApi.rejectOrganizationRequest(request.id), `${request.organizationName} request rejected.`) }}>{tx("Reject")}</button><button disabled={Boolean(busyKey)} onClick={() => { if (window.confirm(`Approve ${request.organizationName} and create its workspace?`)) void runAction(`approve-${request.id}`, () => neurocropApi.approveOrganizationRequest(request.id), `${request.organizationName} approved and created.`) }}>{tx("Approve")}</button></div></article>)}{!requests.length && !loading ? <div className="nc-settings-empty"><i className="fa-regular fa-circle-check" /><strong>{tx("No pending requests")}</strong><span>{tx("New organization requests will appear here for review.")}</span></div> : null}</section> : null}

        {section === 'users' ? <section className="nc-admin-table-card"><div className="nc-admin-table-wrap"><table><thead><tr><th>{tx("User")}</th><th>{tx("Account")}</th><th>{tx("Organizations")}</th><th>{tx("Requests")}</th><th>{tx("Last login")}</th><th><span className="sr-only">{tx("Actions")}</span></th></tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.id}><td><div className="nc-admin-person"><span>{initials(user.name || user.email)}</span><div><strong>{user.name ||tx("Unnamed user")}</strong><small>{user.email}</small></div></div></td><td><span className="nc-settings-status" data-tone={user.active ? 'success' : 'neutral'}><i />{user.isSuperAdmin ?tx("Super admin") : user.isPlatformAdmin ?tx("Platform admin") : user.active ?tx("Active") :tx("Inactive")}</span></td><td>{user.organizationCount || 0}</td><td>{user.pendingRequestCount || 0}</td><td>{formatDate(user.lastLoginAt)}</td><td>{currentUser?.isSuperAdmin && !user.isSuperAdmin ? <div className="nc-admin-row-actions"><button title={user.active ? 'Deactivate' : 'Activate'} disabled={user.id === currentUser.id || Boolean(busyKey)} onClick={() => { if (window.confirm(`${user.active ? 'Deactivate' : 'Activate'} ${user.email}?`)) void runAction(`status-${user.id}`, () => neurocropApi.setPlatformUserActive(user.id, !user.active), `${user.email} ${user.active ? 'deactivated' : 'activated'}.`) }}><i className={`fa-solid ${user.active ? 'fa-user-slash' : 'fa-user-check'}`} /></button><button className="danger" title={tx("Delete user")} disabled={user.id === currentUser.id || Boolean(busyKey)} onClick={() => { if (window.confirm(`Permanently delete ${user.email} from NeuroCrop and Clerk? Their sessions, memberships, invitations, requests, and assignments will be removed. Organization sensor and measurement history will remain without this user reference. This cannot be undone.`)) void runAction(`delete-user-${user.id}`, () => neurocropApi.deletePlatformUser(user.id), `${user.email} permanently deleted from NeuroCrop and Clerk.`) }}><i className="fa-solid fa-trash" /></button></div> : <span className="nc-admin-readonly">{tx("Read only")}</span>}</td></tr>)}</tbody></table></div></section> : null}

        {section === 'administrators' ? <section className="nc-admin-table-card"><div className="nc-admin-table-wrap"><table><thead><tr><th>{tx("Administrator")}</th><th>{tx("Level")}</th><th>{tx("Account")}</th><th>{tx("Organizations")}</th><th>{tx("Last login")}</th><th><span className="sr-only">{tx("Actions")}</span></th></tr></thead><tbody>{administrators.map((user) => <tr key={user.id}><td><div className="nc-admin-person"><span>{initials(user.name || user.email)}</span><div><strong>{user.name ||tx("Unnamed administrator")}</strong><small>{user.email}</small></div></div></td><td>{user.isSuperAdmin ?tx("Super administrator") :tx("Platform administrator")}</td><td><span className="nc-settings-status" data-tone={user.active ? 'success' : 'neutral'}><i />{user.active ?tx("Active") :tx("Inactive")}</span></td><td>{user.organizationCount || 0}</td><td>{formatDate(user.lastLoginAt)}</td><td>{currentUser?.isSuperAdmin && !user.isSuperAdmin ? <button className="nc-admin-text-danger" disabled={user.id === currentUser.id || Boolean(busyKey)} onClick={() => { if (window.confirm(`Remove platform administrator access from ${user.email}?`)) void runAction(`revoke-${user.id}`, () => neurocropApi.revokePlatformAdmin(user.id), `${user.email} is no longer a platform administrator.`) }}>{tx("Revoke access")}</button> : <span className="nc-admin-readonly">{tx("Protected")}</span>}</td></tr>)}{!administrators.length && !loading ? <tr><td colSpan={6}><div className="nc-settings-empty">{tx("No matching administrators.")}</div></td></tr> : null}</tbody></table></div>{currentUser?.isSuperAdmin ? <div className="nc-admin-grant"><div><strong>{tx("Grant platform access")}</strong><span>{tx("Select an active user from the Users section and grant global administration deliberately.")}</span></div><select defaultValue="" onChange={(event) => { const user = users.find((item) => item.id === event.target.value); if (user && window.confirm(`Grant platform administrator access to ${user.email}?`)) void runAction(`grant-${user.id}`, () => neurocropApi.grantPlatformAdmin({ userId: user.id }), `${user.email} is now a platform administrator.`); event.target.value = '' }}><option value="" disabled>{tx("Select eligible user")}</option>{users.filter((user) => user.active && !user.isPlatformAdmin && !user.isSuperAdmin).map((user) => <option key={user.id} value={user.id}>{user.name || user.email} · {user.email}</option>)}</select></div> : null}</section> : null}

        {section === 'gateways' ? <div className="nc-settings-flow">
          <section className="nc-gateway-summary" aria-label={tx("Gateway fleet summary")}>
            <article><strong>{gateways.length}</strong><span>{tx("Gateways")}</span></article>
            <article><strong>{gateways.filter((gateway) => gateway.organizationId).length}</strong><span>{tx("Assigned")}</span></article>
            <article data-tone="success"><strong>{gateways.filter((gateway) => gateway.status === 'online').length}</strong><span>{tx("LoRa online")}</span></article>
            <article data-tone={gatewayAttentionCount ? 'warning' : 'success'}><strong>{gatewayAttentionCount}</strong><span>{tx("Agent attention")}</span></article>
          </section>
          {!gatewayChirpstackAvailable ? <section className="nc-settings-feedback" data-tone="warning"><i className="fa-solid fa-triangle-exclamation" />{tx("ChirpStack status is temporarily unavailable. Gateway connectivity is shown as unknown.")}</section> : null}
          <section className="nc-admin-create nc-gateway-release-card">
            <div><strong>{tx("Signed gateway release")}</strong><span>{gatewayRelease ? `${gatewayRelease.version} · ${(gatewayRelease.size / 1024).toFixed(1)} KB · ${formatDate(gatewayRelease.publishedAt)}` : tx("No signed release is available on the server.")}</span></div>
            <label><span>{tx("Automatic rollout")}</span><select value={gatewayPolicy?.rollout_percent ?? 0} disabled={!gatewayRelease || Boolean(busyKey)} onChange={(event) => { const rolloutPercent = Number(event.target.value); const paused = rolloutPercent === 0; if (window.confirm(`${paused ? 'Pause automatic gateway updates' : `Roll out ${gatewayRelease?.version} to ${rolloutPercent}% of gateways`}?`)) void runAction('gateway-rollout', () => neurocropApi.updatePlatformGatewayRollout({ rolloutPercent, paused }), paused ? 'Automatic gateway rollout paused.' : `Gateway rollout set to ${rolloutPercent}%.`) }}><option value={0}>{tx("Paused")}</option><option value={10}>10%</option><option value={25}>25%</option><option value={50}>50%</option><option value={100}>100%</option></select></label>
            <span className="nc-settings-status" data-tone={gatewayPolicy?.paused ? 'neutral' : 'success'}><i />{gatewayPolicy?.paused ? tx("Paused") : `${gatewayPolicy?.rollout_percent || 0}% rollout`}</span>
          </section>
          <section className="nc-admin-table-card nc-gateway-table"><div className="nc-admin-table-wrap"><table><thead><tr><th>{tx("Gateway")}</th><th>{tx("Customer")}</th><th>{tx("LoRa connectivity")}</th><th>{tx("Management agent")}</th><th>{tx("Software")}</th><th>{tx("Last seen by ChirpStack")}</th><th><span className="sr-only">{tx("Actions")}</span></th></tr></thead><tbody>{filteredGateways.map((gateway) => {
            const current = gatewayRelease && gateway.agentVersion === gatewayRelease.version
            const updating = ['scheduled', 'downloading', 'verifying', 'installing'].includes(gateway.updateStatus)
            const services = gatewayServices(gateway)
            return <tr key={gateway.gatewayId}>
              <td><strong>{gateway.name || gateway.serialNumber}</strong><small>{gateway.serialNumber} · {gateway.gatewayId}</small></td>
              <td><select className="nc-gateway-customer-select" aria-label={`${tx("Customer for")} ${gateway.name || gateway.serialNumber}`} value={gateway.organizationId || ''} disabled={Boolean(busyKey) || gateway.status === 'retired'} onChange={(event) => {
                const organizationId = event.target.value || null
                const organization = organizations.find((item) => item.id === organizationId)
                const assignment = organization ? organization.name : 'Unassigned'
                if (window.confirm(`${organization ? 'Assign' : 'Unassign'} ${gateway.name || gateway.serialNumber}${organization ? ` to ${assignment}` : ''}?`)) {
                  void runAction(`gateway-owner-${gateway.gatewayId}`, () => neurocropApi.assignPlatformGateway(gateway.gatewayId, organizationId), `${gateway.name || gateway.serialNumber} assigned to ${assignment}.`)
                }
              }}><option value="">{tx("Unassigned")}</option>{organizations.map((organization) => <option key={organization.id} value={organization.id} disabled={organization.status === 'archived'}>{organization.name}{organization.status === 'archived' ? ` · ${tx("Archived")}` : ''}</option>)}</select><small>{gateway.organizationName ||tx("No customer")}</small></td>
              <td><span className="nc-settings-status" data-tone={gateway.status === 'online' ? 'success' : gateway.status === 'not_registered' ? 'warning' : 'neutral'}><i />{formatStatusLabel(gateway.status)}</span><small>{gateway.chirpstackName || (gateway.chirpstackRegistered === false ? tx("Not registered in ChirpStack") : tx("ChirpStack"))}</small></td>
              <td><span className="nc-settings-status" data-tone={gateway.agentStatus === 'online' ? 'success' : 'neutral'}><i />{formatStatusLabel(gateway.agentStatus)}</span><small>{services.label} · {formatRelativeTime(gateway.agentLastSeenAt)}</small>{hasFiniteNumber(gateway.lastHealth?.temperatureC) ? <small>{gateway.lastHealth?.temperatureC} °C</small> : null}</td>
              <td><strong>{gateway.agentVersion || gateway.imageVersion ||tx("Unknown")}</strong><small><span className="nc-settings-status" data-tone={gateway.updateStatus === 'succeeded' || current ? 'success' : gateway.updateStatus === 'failed' || gateway.updateStatus === 'rolled_back' ? 'warning' : 'neutral'}><i />{current ? tx("Current") : formatStatusLabel(gateway.updateStatus || 'idle')}</span></small></td>
              <td title={formatDate(gateway.lastSeenAt)}><strong>{formatRelativeTime(gateway.lastSeenAt)}</strong><small>{formatDate(gateway.lastSeenAt)}</small></td>
              <td><div className="nc-admin-row-actions"><button title={tx("Deploy software update")} disabled={!gatewayRelease || current || updating || Boolean(busyKey)} onClick={() => { if (window.confirm(`Schedule signed gateway release ${gatewayRelease?.version} for ${gateway.name || gateway.serialNumber}?`)) void runAction(`gateway-${gateway.gatewayId}`, () => neurocropApi.schedulePlatformGatewayUpdate(gateway.gatewayId), `${gateway.name || gateway.serialNumber} update scheduled.`) }}><i className={`fa-solid ${updating ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-down'}`} /></button>{currentUser?.isSuperAdmin ? <button className="danger" title={tx("Delete gateway everywhere")} disabled={Boolean(busyKey)} onClick={() => { const name = gateway.name || gateway.serialNumber; if (window.confirm(`Permanently delete ${name} (${gateway.gatewayId}) from ChirpStack and NeuroCrop? Its enrollment, customer assignment, software state, and node gateway associations will be removed. This cannot be undone.`)) void runAction(`delete-gateway-${gateway.gatewayId}`, () => neurocropApi.deletePlatformGateway(gateway.gatewayId), `${name} permanently deleted from ChirpStack and NeuroCrop.`) }}><i className="fa-solid fa-trash" /></button> : null}</div></td>
            </tr>
          })}{!filteredGateways.length && !loading ? <tr><td colSpan={7}>{gateways.length ? tx("No gateways match this search.") : tx("No gateways are enrolled.")}</td></tr> : null}</tbody></table></div></section>
        </div> : null}
      </div>
    </section>

    {diagnostics ? <div className="nc-admin-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDiagnostics(null) }}><section className="nc-admin-diagnostics" role="dialog" aria-modal="true" aria-labelledby="adminDiagnosticsTitle"><header><div><p>{tx("Node diagnostics")}</p><h2 id="adminDiagnosticsTitle">{diagnostics.organization.name}</h2><span>{diagnostics.nodes.length} {tx("registered nodes")}</span></div><button onClick={() => setDiagnostics(null)} aria-label={tx("Close diagnostics")}><i className="fa-solid fa-xmark" /></button></header>{diagnostics.loading ? <div className="nc-settings-empty"><i className="fa-solid fa-spinner fa-spin" /><strong>{tx("Loading node diagnostics")}</strong></div> : <div className="nc-admin-table-wrap"><table><thead><tr><th>{tx("Node")}</th><th>{tx("Location")}</th><th>{tx("Transport")}</th><th>{tx("Health")}</th><th>{tx("Battery")}</th><th>{tx("Firmware")}</th><th>{tx("Last packet")}</th></tr></thead><tbody>{diagnostics.nodes.map((node) => <tr key={node.devEui}><td><strong>{node.name}</strong><small>{node.devEui}</small></td><td>{[node.areaName, node.sectionName].filter(Boolean).join(' · ') ||tx("Unassigned")}</td><td><span className="nc-settings-status" data-tone={node.transportStatus === 'live' ? 'success' : node.transportStatus === 'delayed' ? 'warning' : 'neutral'}><i />{node.transportStatus || 'unknown'}</span></td><td>{node.health?.label || node.health?.state ||tx("No active fault")}</td><td>{hasFiniteNumber(node.level) ? `${node.level}%` :tx("Unknown")}</td><td>{node.firmwareVersion ||tx("Unknown")}</td><td>{formatDate(node.lastSeen)}</td></tr>)}{!diagnostics.nodes.length ? <tr><td colSpan={7}>{tx("No nodes are registered for this organization.")}</td></tr> : null}</tbody></table></div>}</section></div> : null}
    {organizationMembers ? <div className="nc-admin-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOrganizationMembers(null) }}><section className="nc-admin-diagnostics nc-admin-members-dialog" role="dialog" aria-modal="true" aria-labelledby="adminMembersTitle"><header><div><p>{tx("Organization members")}</p><h2 id="adminMembersTitle">{organizationMembers.organization.name}</h2><span>{organizationMembers.members.length} {tx("member accounts")}</span></div><button onClick={() => setOrganizationMembers(null)} aria-label={tx("Close members")}><i className="fa-solid fa-xmark" /></button></header>{organizationMembers.loading ? <div className="nc-settings-empty"><i className="fa-solid fa-spinner fa-spin" /><strong>{tx("Loading organization members")}</strong></div> : <div className="nc-admin-table-wrap"><table><thead><tr><th>{tx("User")}</th><th>{tx("Role")}</th><th>{tx("Account")}</th><th>{tx("Last login")}</th><th>{tx("Joined")}</th></tr></thead><tbody>{organizationMembers.members.map((member) => <tr key={member.id}><td><div className="nc-admin-person"><span>{initials(member.name || member.email)}</span><div><strong>{member.name ||tx("Unnamed user")}</strong><small>{member.email}</small></div></div></td><td><span className="nc-settings-status" data-tone={member.role === 'owner' ? 'success' : 'neutral'}><i />{member.role}</span></td><td><span className="nc-settings-status" data-tone={member.active ? 'success' : 'neutral'}><i />{member.isSuperAdmin ?tx("Super admin") : member.isPlatformAdmin ?tx("Platform admin") : member.active ?tx("Active") :tx("Inactive")}</span></td><td>{formatDate(member.lastLoginAt)}</td><td>{formatDate(member.joinedAt)}</td></tr>)}{!organizationMembers.members.length ? <tr><td colSpan={5}>{tx("No users belong to this organization.")}</td></tr> : null}</tbody></table></div>}</section></div> : null}
  </main>
}
