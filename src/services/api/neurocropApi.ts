import { downloadFile, invalidateRequestCache, isApiConnected, queryString, request } from './client'

type Payload = Record<string, unknown>

const json = (payload: Payload) => JSON.stringify(payload)
const encoded = (value: string) => encodeURIComponent(value)
const structuralMutation = async (path: string, options: RequestInit) => {
  const result = await request(path, options)
  // A GET may have started after the mutation request invalidated the cache but
  // before the server committed it. Clear that potentially stale result again.
  invalidateRequestCache()
  return result
}

export const neurocropApi = {
  isConnected: isApiConnected,
  register: (payload: Payload) => request('/auth/register', { method: 'POST', body: json(payload) }),
  getInvitationStatus: (token: string) => request(`/auth/invitations/${encoded(token)}`),
  acceptInvitation: (payload: Payload) => request('/auth/accept-invite', { method: 'POST', body: json(payload) }),
  login: (email: string, password: string) => request('/auth/login', { method: 'POST', body: json({ email, password }) }),
  requestPasswordReset: (email: string) => request('/auth/forgot-password', { method: 'POST', body: json({ email }) }),
  resetPassword: (token: string, newPassword: string) => request('/auth/reset-password', { method: 'POST', body: json({ token, newPassword }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getCurrentUser: () => request('/auth/me'),
  changePassword: (payload: Payload) => request('/auth/change-password', { method: 'POST', body: json(payload) }),
  getSessions: () => request('/auth/sessions'),
  revokeSession: (id: string) => request(`/auth/sessions/${encoded(id)}`, { method: 'DELETE' }),
  getOrganizations: () => request('/auth/organizations'),
  switchOrganization: (organizationId: string) => request('/auth/switch-organization', { method: 'POST', body: json({ organizationId }) }),
  getTeam: () => request('/team'),
  updateTeamMemberRole: (id: string, role: string) => request(`/team/${encoded(id)}/role`, { method: 'PATCH', body: json({ role }) }),
  removeTeamMember: (id: string) => request(`/team/${encoded(id)}`, { method: 'DELETE' }),
  updateCurrentOrganization: (payload: Payload) => request('/organization', { method: 'PATCH', body: json(payload) }),
  getInvitations: () => request('/invitations'),
  inviteMember: (payload: Payload) => request('/invitations', { method: 'POST', body: json(payload) }),
  revokeInvitation: (id: string) => request(`/invitations/${encoded(id)}`, { method: 'DELETE' }),
  getPlatformOrganizations: () => request('/platform/organizations'),
  getPlatformIntegrations: () => request('/platform/integrations'),
  getPlatformGatewayUpdates: () => request('/platform/gateway-updates', { cache: 'no-store' }),
  assignPlatformGateway: (gatewayId: string, organizationId: string | null) => request(`/platform/gateways/${encoded(gatewayId)}/organization`, { method: 'PATCH', body: json({ organizationId }) }),
  deletePlatformGateway: (gatewayId: string) => request(`/platform/gateways/${encoded(gatewayId)}?confirm=delete`, { method: 'DELETE' }),
  schedulePlatformGatewayUpdate: (gatewayId: string) => request(`/platform/gateways/${encoded(gatewayId)}/update`, { method: 'POST' }),
  updatePlatformGatewayRollout: (payload: Payload) => request('/platform/gateway-updates/policy', { method: 'PATCH', body: json(payload) }),
  getPlatformOrganizationNodes: (id: string) => request(`/platform/organizations/${encoded(id)}/nodes`),
  getPlatformOrganizationMembers: (id: string) => request(`/platform/organizations/${encoded(id)}/members`),
  createPlatformOrganization: (payload: Payload) => request('/platform/organizations', { method: 'POST', body: json(payload) }),
  archivePlatformOrganization: (id: string) => request(`/platform/organizations/${encoded(id)}/archive`, { method: 'PATCH' }),
  restorePlatformOrganization: (id: string) => request(`/platform/organizations/${encoded(id)}/restore`, { method: 'PATCH' }),
  deletePlatformOrganization: (id: string) => request(`/platform/organizations/${encoded(id)}?confirm=delete`, { method: 'DELETE' }),
  getPlatformUsers: () => request('/platform/users'),
  getOrganizationRequests: (status = 'pending') => request(`/platform/organization-requests${queryString({ status })}`),
  approveOrganizationRequest: (id: string) => request(`/platform/organization-requests/${encoded(id)}/approve`, { method: 'POST' }),
  rejectOrganizationRequest: (id: string) => request(`/platform/organization-requests/${encoded(id)}/reject`, { method: 'POST' }),
  grantPlatformAdmin: (payload: Payload) => request('/platform/admins', { method: 'POST', body: json(payload) }),
  revokePlatformAdmin: (id: string) => request(`/platform/admins/${encoded(id)}`, { method: 'DELETE' }),
  setPlatformUserActive: (id: string, active: boolean) => request(`/platform/users/${encoded(id)}/status`, { method: 'PATCH', body: json({ active }) }),
  movePlatformUser: (id: string, payload: Payload) => request(`/platform/users/${encoded(id)}/organization`, { method: 'PATCH', body: json(payload) }),
  deletePlatformUser: (id: string) => request(`/platform/users/${encoded(id)}?confirm=delete`, { method: 'DELETE' }),
  getDashboard: () => request('/dashboard'),
  getTodayActions: (sectionId?: string) => request(`/actions/today${queryString({ sectionId })}`),
  getActionHistory: (limit = 20) => request(`/actions/history${queryString({ limit })}`),
  getActionOverviewSummary: (areaId?: string) => request(`/actions/overview-summary${queryString({ areaId })}`),
  submitTodayActionFeedback: (actionId: string, payload: Payload) => request(`/actions/today/${encoded(actionId)}/feedback`, { method: 'POST', body: json(payload) }),
  assignTodayAction: (actionId: string, payload: Payload) => request(`/actions/today/${encoded(actionId)}/assignment`, { method: 'POST', body: json(payload) }),
  resetActions: () => request('/actions/reset', { method: 'DELETE', body: json({ confirm: 'RESET' }) }),
  getAlerts: (status = 'all') => request(`/alerts${queryString({ status })}`),
  acknowledgeAlert: (id: string, payload: Payload = {}) => request(`/alerts/${encoded(id)}/acknowledge`, { method: 'POST', body: json(payload) }),
  snoozeAlert: (id: string, payload: Payload) => request(`/alerts/${encoded(id)}/snooze`, { method: 'POST', body: json(payload) }),
  resolveAlert: (id: string, payload: Payload = {}) => request(`/alerts/${encoded(id)}/resolve`, { method: 'POST', body: json(payload) }),
  getPushConfig: () => request('/push/config', { cache: 'no-store' }),
  getNotificationPreferences: () => request('/notification-preferences', { cache: 'no-store' }),
  updateNotificationPreferences: (payload: Payload) => request('/notification-preferences', { method: 'PATCH', body: json(payload) }),
  savePushSubscription: (payload: Payload) => request('/push/subscriptions', { method: 'POST', body: json(payload) }),
  deletePushSubscription: (endpoint: string) => request('/push/subscriptions', { method: 'DELETE', body: json({ endpoint }) }),
  getInterventions: (params: Payload) => request(`/interventions${queryString(params)}`),
  createIntervention: (payload: Payload) => request('/interventions', { method: 'POST', body: json(payload) }),
  updateInterventionOutcome: (id: string, payload: Payload) => request(`/interventions/${encoded(id)}/outcome`, { method: 'PATCH', body: json(payload) }),
  getCropProfiles: () => request('/crop-profiles'),
  simulateAgronomicScenario: (payload: Payload) => request('/simulator/agronomic', { method: 'POST', body: json(payload) }),
  getLatestReadings: (sectionId: string) => request(`/readings/latest${queryString({ sectionId })}`),
  getLatestReadingsBatch: (sectionIds: string[]) => request(`/readings/latest-batch${queryString({ sectionIds: sectionIds.join(',') })}`),
  getHistory: (params: Payload) => request(`/history${queryString(params)}`),
  getSectionAnalytics: (params: Payload) => request(`/analytics/section${queryString(params)}`),
  getSectionDynamics: (sectionId: string) => request(`/analytics/dynamics${queryString({ sectionId })}`),
  getSiteComparison: (params: Payload) => request(`/analytics/site-comparison${queryString(params)}`),
  downloadMeasurementsCsv: (params: Payload) => downloadFile(`/exports/measurements.csv${queryString(params)}`, 'neurocrop-measurements.csv'),
  getAreas: () => request('/areas'),
  getGreenhouseMap: (areaId: string) => request(`/areas/${encoded(areaId)}/map`, { cache: 'no-store' }),
  getGreenhouseMapHistory: (areaId: string, params: Payload = {}) => request(`/areas/${encoded(areaId)}/map/history${queryString(params)}`),
  saveGreenhouseMap: (areaId: string, payload: Payload) => request(`/areas/${encoded(areaId)}/map`, { method: 'PATCH', body: json(payload) }),
  assignMapNodeSection: (areaId: string, devEui: string, sectionId: string) => request(`/areas/${encoded(areaId)}/map/nodes/${encoded(devEui)}/section`, { method: 'PATCH', body: json({ sectionId }) }),
  getSections: (areaId?: string) => request(`/sections${queryString({ areaId })}`),
  getNodes: (sectionId?: string) => request(`/nodes${queryString({ sectionId })}`),
  createArea: (payload: Payload) => structuralMutation('/areas', { method: 'POST', body: json(payload) }),
  updateArea: (id: string, payload: Payload) => structuralMutation(`/areas/${encoded(id)}`, { method: 'PATCH', body: json(payload) }),
  setAreaMapEnabled: (id: string, enabled: boolean) => structuralMutation(`/areas/${encoded(id)}/map-status`, { method: 'PATCH', body: json({ enabled }) }),
  deleteArea: (id: string, options: { keepSections?: boolean } = {}) => structuralMutation(`/areas/${encoded(id)}${queryString({ keepSections: options.keepSections ? 'true' : undefined })}`, { method: 'DELETE' }),
  createSection: (payload: Payload) => structuralMutation('/sections', { method: 'POST', body: json(payload) }),
  updateSection: (id: string, payload: Payload) => structuralMutation(`/sections/${encoded(id)}`, { method: 'PATCH', body: json(payload) }),
  deleteSection: (id: string) => structuralMutation(`/sections/${encoded(id)}`, { method: 'DELETE' }),
  updateNode: (devEui: string, payload: Payload) => structuralMutation(`/nodes/${encoded(devEui)}`, { method: 'PATCH', body: json(payload) }),
  getNodeSensors: (devEui: string) => request(`/nodes/${encoded(devEui)}/sensors`),
  updateNodeSensor: (devEui: string, port: string, payload: Payload) => request(`/nodes/${encoded(devEui)}/sensors/${encoded(port)}`, { method: 'PATCH', body: json(payload) }),
  createCropProfile: (payload: Payload) => request('/crop-profiles', { method: 'POST', body: json(payload) }),
  updateCropProfile: (id: string, payload: Payload) => request(`/crop-profiles/${encoded(id)}`, { method: 'PATCH', body: json(payload) }),
  duplicateCropProfile: (id: string, payload: Payload = {}) => request(`/crop-profiles/${encoded(id)}/duplicate`, { method: 'POST', body: json(payload) }),
  deleteCropProfile: (id: string, options: { replacementProfileId?: string } = {}) => request(`/crop-profiles/${encoded(id)}`, {
    method: 'DELETE',
    body: options.replacementProfileId ? json({ replacementProfileId: options.replacementProfileId }) : undefined,
  }),
  registerNode: (payload: Payload) => structuralMutation('/nodes/claim', { method: 'POST', body: json(payload) }),
  deleteNode: (devEui: string, options: { history?: 'keep' | 'delete' } = {}) => structuralMutation(`/nodes/${encoded(devEui)}${queryString({ history: options.history || 'keep' })}`, { method: 'DELETE' }),
}

export async function prefetchWorkspaceData() {
  // Prime only data shared by the main operational workspaces. Settings,
  // organization, alerts and history fetch their data when opened.
  await Promise.allSettled([
    neurocropApi.getDashboard(),
    neurocropApi.getAreas(),
    neurocropApi.getSections(),
    neurocropApi.getNodes(),
    neurocropApi.getCropProfiles(),
    neurocropApi.getTodayActions(),
  ])
}

export async function prefetchWorkspaceRouteData(route: string) {
  const requestsByRoute: Record<string, Array<() => Promise<unknown>>> = {
    '/': [neurocropApi.getDashboard, neurocropApi.getAreas, neurocropApi.getSections, neurocropApi.getNodes, neurocropApi.getCropProfiles, neurocropApi.getTodayActions],
    '/areas': [neurocropApi.getAreas, neurocropApi.getSections, neurocropApi.getNodes],
    '/sections': [neurocropApi.getAreas, neurocropApi.getSections, neurocropApi.getNodes, neurocropApi.getCropProfiles],
    '/nodes': [neurocropApi.getAreas, neurocropApi.getSections, neurocropApi.getNodes],
    '/readings': [neurocropApi.getAreas, neurocropApi.getSections, neurocropApi.getNodes, neurocropApi.getCropProfiles],
    '/history': [neurocropApi.getDashboard, neurocropApi.getAreas, neurocropApi.getSections, neurocropApi.getNodes, neurocropApi.getCropProfiles],
    '/alerts': [() => neurocropApi.getAlerts('all')],
    '/actions': [neurocropApi.getTodayActions, () => neurocropApi.getActionHistory(100)],
    '/crop-profiles': [neurocropApi.getCropProfiles, neurocropApi.getSections],
    '/simulator': [neurocropApi.getCropProfiles],
    '/settings': [neurocropApi.getCurrentUser, neurocropApi.getTeam, neurocropApi.getInvitations, neurocropApi.getSessions, neurocropApi.getNotificationPreferences],
    '/organization': [neurocropApi.getOrganizations, neurocropApi.getTeam, neurocropApi.getAreas, neurocropApi.getSections, neurocropApi.getNodes],
  }
  await Promise.allSettled((requestsByRoute[route] || []).map((requestData) => requestData()))
}
