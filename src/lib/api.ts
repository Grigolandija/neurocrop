import type { DashboardData, MetricKey } from '../types'

declare global {
  interface Window { NEUROCROP_CONFIG?: { apiBaseUrl?: string } }
}

const apiBaseUrl = String(window.NEUROCROP_CONFIG?.apiBaseUrl || import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!apiBaseUrl) throw new Error('API is not configured')
  const response = await fetch(`${apiBaseUrl}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    ...options,
  })
  if (!response.ok) throw new Error((await response.text()) || `API request failed: ${response.status}`)
  return response.json() as Promise<T>
}

export const api = {
  configured: Boolean(apiBaseUrl),
  login: (email: string, password: string) => request<{ user: { email: string } }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  dashboard: () => request<DashboardData>('/dashboard'),
  history: (sectionId: string, metric: MetricKey, from: string, to: string) => {
    const query = new URLSearchParams({ sectionId, metric, from, to })
    return request<{ points: { timestamp: string; value: number }[] }>(`/history?${query}`)
  },
  createArea: (name: string) => request('/areas', { method: 'POST', body: JSON.stringify({ name }) }),
  updateArea: (areaId: string, name: string) => request(`/areas/${areaId}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteArea: (areaId: string, moveSectionsToAreaId: string | null) => request(`/areas/${areaId}`, { method: 'DELETE', body: JSON.stringify({ moveSectionsToAreaId }) }),
  createSection: (areaId: string, name: string) => request('/sections', { method: 'POST', body: JSON.stringify({ areaId, name }) }),
  updateSection: (sectionId: string, patch: object) => request(`/sections/${sectionId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteSection: (sectionId: string) => request(`/sections/${sectionId}`, { method: 'DELETE' }),
  createNode: (sectionId: string, devEui: string) => request('/nodes', { method: 'POST', body: JSON.stringify({ sectionId, devEui }) }),
  updateNode: (nodeId: string, patch: object) => request(`/nodes/${nodeId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteNode: (nodeId: string) => request(`/nodes/${nodeId}`, { method: 'DELETE' }),
}
