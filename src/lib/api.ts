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
  dashboard: () => request<DashboardData>('/dashboard'),
  history: (blockId: string, metric: MetricKey, from: string, to: string) => {
    const query = new URLSearchParams({ blockId, metric, from, to })
    return request<{ points: { timestamp: string; value: number }[] }>(`/history?${query}`)
  },
}
