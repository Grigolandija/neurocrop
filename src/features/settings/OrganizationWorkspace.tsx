import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { neurocropApi } from '../../services/api/neurocropApi'

type User = { id: string; email: string; name: string; role: string; organizationId: string; organizationName: string }
type Membership = { id: string; name: string; role: string }
type Member = { id: string; email: string; name: string; role: string; joinedAt?: string }
type Invitation = { id: string; email: string; role: string; expiresAt?: string; createdAt?: string; inviteUrl?: string }
type Area = { id: string; name: string; sections?: number; nodes?: number }
type Section = { id: string; name: string; area_id?: string; area_name?: string; nodes?: number }
type Node = { devEui: string; transportStatus?: string; areaId?: string | null; sectionId?: string | null }

function initials(value: string) {
  return value.replace(/[._-]+/g, ' ').split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'NC'
}

function formatDate(value?: string) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : 'The organization action could not be completed.'
}

export default function OrganizationWorkspace() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [areas, setAreas] = useState<Area[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState('')
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [organizationName, setOrganizationName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('grower')
  const [memberQuery, setMemberQuery] = useState('')
  const [latestInviteUrl, setLatestInviteUrl] = useState('')
  const canManage = user?.role === 'owner' || user?.role === 'admin'

  useEffect(() => {
    document.body.dataset.reactOrganizationActive = 'true'
    return () => { delete document.body.dataset.reactOrganizationActive }
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [userResponse, membershipsResponse, teamResponse, areasResponse, sectionsResponse, nodesResponse] = await Promise.all([
        neurocropApi.getCurrentUser(),
        neurocropApi.getOrganizations(),
        neurocropApi.getTeam(),
        neurocropApi.getAreas(),
        neurocropApi.getSections(),
        neurocropApi.getNodes(),
      ]) as [
        { user?: User }, { organizations?: Membership[] }, { members?: Member[] },
        { areas?: Area[] }, { sections?: Section[] }, { nodes?: Node[] },
      ]
      const nextUser = userResponse.user || null
      setUser(nextUser)
      setOrganizationName(nextUser?.organizationName || '')
      setMemberships(Array.isArray(membershipsResponse.organizations) ? membershipsResponse.organizations : [])
      setMembers(Array.isArray(teamResponse.members) ? teamResponse.members : [])
      setAreas(Array.isArray(areasResponse.areas) ? areasResponse.areas : [])
      setSections(Array.isArray(sectionsResponse.sections) ? sectionsResponse.sections : [])
      setNodes(Array.isArray(nodesResponse.nodes) ? nodesResponse.nodes : [])
      if (nextUser?.role === 'owner' || nextUser?.role === 'admin') {
        const invitationResponse = await neurocropApi.getInvitations() as { invitations?: Invitation[] }
        setInvitations(Array.isArray(invitationResponse.invitations) ? invitationResponse.invitations : [])
      } else {
        setInvitations([])
      }
    } catch (reason) {
      setFeedback({ tone: 'warning', text: errorMessage(reason) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  async function refreshTeam() {
    const teamResponse = await neurocropApi.getTeam() as { members?: Member[] }
    setMembers(Array.isArray(teamResponse.members) ? teamResponse.members : [])
    if (canManage) {
      const invitationResponse = await neurocropApi.getInvitations() as { invitations?: Invitation[] }
      setInvitations(Array.isArray(invitationResponse.invitations) ? invitationResponse.invitations : [])
    }
  }

  async function renameOrganization(event: FormEvent) {
    event.preventDefault()
    if (!canManage || !organizationName.trim()) return
    setBusyKey('rename')
    try {
      await neurocropApi.updateCurrentOrganization({ name: organizationName })
      setUser((current) => current ? { ...current, organizationName: organizationName.trim() } : current)
      setEditingName(false)
      setFeedback({ tone: 'success', text: 'Organization name updated.' })
    } catch (reason) {
      setFeedback({ tone: 'warning', text: errorMessage(reason) })
    } finally {
      setBusyKey('')
    }
  }

  async function inviteMember(event: FormEvent) {
    event.preventDefault()
    if (!canManage || !inviteEmail.trim()) return
    setBusyKey('invite')
    try {
      const response = await neurocropApi.inviteMember({ email: inviteEmail.trim(), role: inviteRole }) as { invitation?: Invitation }
      setLatestInviteUrl(response.invitation?.inviteUrl || '')
      setInviteEmail('')
      setFeedback({ tone: 'success', text: `Invitation prepared for ${response.invitation?.email || inviteEmail}.` })
      await refreshTeam()
    } catch (reason) {
      setFeedback({ tone: 'warning', text: errorMessage(reason) })
    } finally {
      setBusyKey('')
    }
  }

  async function updateRole(member: Member, role: string) {
    setBusyKey(`role-${member.id}`)
    try {
      await neurocropApi.updateTeamMemberRole(member.id, role)
      setMembers((current) => current.map((item) => item.id === member.id ? { ...item, role } : item))
      setFeedback({ tone: 'success', text: `${member.name || member.email} role updated.` })
    } catch (reason) {
      setFeedback({ tone: 'warning', text: errorMessage(reason) })
    } finally {
      setBusyKey('')
    }
  }

  async function revokeInvitation(invitation: Invitation) {
    if (!window.confirm(`Revoke the invitation for ${invitation.email}?`)) return
    setBusyKey(`revoke-${invitation.id}`)
    try {
      await neurocropApi.revokeInvitation(invitation.id)
      setInvitations((current) => current.filter((item) => item.id !== invitation.id))
      setFeedback({ tone: 'success', text: `Invitation for ${invitation.email} revoked.` })
    } catch (reason) {
      setFeedback({ tone: 'warning', text: errorMessage(reason) })
    } finally {
      setBusyKey('')
    }
  }

  async function switchOrganization(organizationId: string) {
    if (!organizationId || organizationId === user?.organizationId) return
    setBusyKey('switch')
    try {
      await neurocropApi.switchOrganization(organizationId)
      window.location.assign('/organization')
    } catch (reason) {
      setFeedback({ tone: 'warning', text: errorMessage(reason) })
      setBusyKey('')
    }
  }

  const normalizedQuery = memberQuery.trim().toLowerCase()
  const filteredMembers = members.filter((member) => !normalizedQuery || `${member.name || ''} ${member.email} ${member.role}`.toLowerCase().includes(normalizedQuery))
  const liveNodes = nodes.filter((node) => node.transportStatus === 'live').length
  const unassignedNodes = nodes.filter((node) => !node.sectionId).length

  return <main className="nc-settings-page nc-organization-page" aria-busy={loading}>
    <header className="nc-settings-page-head nc-organization-head">
      <div><p>Organization workspace</p><h1>{user?.organizationName || 'Organisation'}</h1><span>People, monitored structure, and access for the active NeuroCrop customer workspace.</span></div>
      <div className="nc-organization-head-actions">
        {memberships.length > 1 ? <label><span>Active organization</span><select value={user?.organizationId || ''} disabled={busyKey === 'switch'} onChange={(event) => void switchOrganization(event.target.value)}>{memberships.map((membership) => <option key={membership.id} value={membership.id}>{membership.name}</option>)}</select></label> : null}
        {canManage ? <button className="nc-settings-button secondary" onClick={() => setEditingName(true)}><i className="fa-solid fa-pen" />Edit organization</button> : null}
      </div>
    </header>

    {feedback ? <div className="nc-settings-feedback" data-tone={feedback.tone} role="status"><i className={`fa-solid ${feedback.tone === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`} />{feedback.text}<button onClick={() => setFeedback(null)} aria-label="Dismiss"><i className="fa-solid fa-xmark" /></button></div> : null}
    {latestInviteUrl ? <section className="nc-admin-invite-result"><i className="fa-solid fa-link" /><div><strong>Backup invitation link</strong><span>Keep this link if email delivery is unavailable.</span></div><button onClick={() => void navigator.clipboard.writeText(latestInviteUrl)}><i className="fa-regular fa-copy" />Copy link</button><button aria-label="Dismiss" onClick={() => setLatestInviteUrl('')}><i className="fa-solid fa-xmark" /></button></section> : null}

    <section className="nc-organization-kpis" aria-label="Organization summary">
      <article><small>Team members</small><strong>{members.length}</strong><span>{invitations.length} pending invitations</span></article>
      <article><small>Growing areas</small><strong>{areas.length}</strong><span>{sections.length} monitored sections</span></article>
      <article><small>Connected nodes</small><strong>{nodes.length}</strong><span>{liveNodes} currently reporting</span></article>
      <article data-tone={unassignedNodes > 0 ? 'warning' : 'success'}><small>Unassigned hardware</small><strong>{unassignedNodes}</strong><span>{unassignedNodes ? 'Review node placement' : 'All nodes assigned'}</span></article>
    </section>

    <section className="nc-organization-tools">
      <header><p>Workspace structure</p><h2>Manage where data belongs</h2><span>Organization-level navigation without exposing platform administration.</span></header>
      <div>
        <button onClick={() => navigate('/areas')}><span><i className="fa-solid fa-map" /></span><div><strong>Areas</strong><small>{areas.length} greenhouses, rooms, or fields</small></div><i className="fa-solid fa-arrow-right" /></button>
        <button onClick={() => navigate('/sections')}><span><i className="fa-solid fa-border-all" /></span><div><strong>Sections</strong><small>{sections.length} monitored growing sections</small></div><i className="fa-solid fa-arrow-right" /></button>
        <button onClick={() => navigate('/nodes')}><span><i className="fa-solid fa-microchip" /></span><div><strong>Nodes</strong><small>{nodes.length} registered sensor nodes</small></div><i className="fa-solid fa-arrow-right" /></button>
        <button onClick={() => navigate('/crop-profiles')}><span><i className="fa-solid fa-sliders" /></span><div><strong>Crop profiles</strong><small>Targets and agronomic thresholds</small></div><i className="fa-solid fa-arrow-right" /></button>
      </div>
    </section>

    <section className="nc-organization-team">
      <header><div><p>Organization access</p><h2>Members and roles</h2><span>People listed here can only access organizations where they hold a membership.</span></div><label><i className="fa-solid fa-magnifying-glass" /><input type="search" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Search members" /></label></header>
      {canManage ? <form className="nc-organization-invite" onSubmit={inviteMember}><div><strong>Invite a member</strong><span>Access begins after the invitation is accepted.</span></div><label><span>Email address</span><input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="grower@company.com" /></label><label><span>Role</span><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}><option value="grower">Grower</option><option value="technician">Technician</option><option value="viewer">Viewer</option>{user?.role === 'owner' ? <option value="admin">Admin</option> : null}</select></label><button disabled={busyKey === 'invite'}><i className="fa-solid fa-paper-plane" />{busyKey === 'invite' ? 'Sending…' : 'Send invite'}</button></form> : null}
      <div className="nc-admin-table-wrap"><table><thead><tr><th>Member</th><th>Role</th><th>Joined</th><th>Access</th></tr></thead><tbody>{filteredMembers.map((member) => <tr key={member.id}><td><div className="nc-admin-person"><span>{initials(member.name || member.email)}</span><div><strong>{member.name || 'Unnamed member'}</strong><small>{member.email}</small></div></div></td><td><select value={member.role} disabled={!canManage || member.role === 'owner' || member.id === user?.id || busyKey === `role-${member.id}`} onChange={(event) => void updateRole(member, event.target.value)}><option value="owner">Owner</option><option value="admin">Admin</option><option value="grower">Grower</option><option value="technician">Technician</option><option value="viewer">Viewer</option></select></td><td>{formatDate(member.joinedAt)}</td><td><span className="nc-settings-status" data-tone="success"><i />Active</span></td></tr>)}{!filteredMembers.length && !loading ? <tr><td colSpan={4}><div className="nc-settings-empty">No matching members.</div></td></tr> : null}</tbody></table></div>
    </section>

    {canManage && invitations.length ? <section className="nc-organization-pending"><header><p>Pending access</p><h2>Invitations</h2><span>{invitations.length} people have not joined yet.</span></header><div>{invitations.map((invitation) => <article key={invitation.id}><i className="fa-regular fa-envelope" /><div><strong>{invitation.email}</strong><span>{invitation.role} · expires {formatDate(invitation.expiresAt)}</span></div><button disabled={busyKey === `revoke-${invitation.id}`} onClick={() => void revokeInvitation(invitation)}>Revoke</button></article>)}</div></section> : null}

    {memberships.length > 1 ? <section className="nc-organization-memberships"><header><p>Your access</p><h2>Other organizations</h2><span>Switching changes the tenant context used by every NeuroCrop page.</span></header><div>{memberships.map((membership) => <button key={membership.id} className={membership.id === user?.organizationId ? 'active' : ''} disabled={membership.id === user?.organizationId || busyKey === 'switch'} onClick={() => void switchOrganization(membership.id)}><span>{initials(membership.name)}</span><div><strong>{membership.name}</strong><small>{membership.role}</small></div>{membership.id === user?.organizationId ? <i className="fa-solid fa-check" /> : <i className="fa-solid fa-arrow-right" />}</button>)}</div></section> : null}

    {editingName ? <div className="nc-admin-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingName(false) }}><form className="nc-organization-name-dialog" onSubmit={renameOrganization} role="dialog" aria-modal="true" aria-labelledby="organizationNameTitle"><header><div><p>Workspace identity</p><h2 id="organizationNameTitle">Edit organization</h2><span>This name appears across invitations, exports, and navigation.</span></div><button type="button" onClick={() => setEditingName(false)} aria-label="Close"><i className="fa-solid fa-xmark" /></button></header><label><span>Organization name</span><input autoFocus required minLength={2} maxLength={120} value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} /></label><footer><button type="button" onClick={() => { setOrganizationName(user?.organizationName || ''); setEditingName(false) }}>Cancel</button><button className="primary" disabled={busyKey === 'rename'}>{busyKey === 'rename' ? 'Saving…' : 'Save name'}</button></footer></form></div> : null}
  </main>
}
