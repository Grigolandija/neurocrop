import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { neurocropApi } from '../../services/api/neurocropApi'

type Integration = { id: string; name: string; detail: string; configured: boolean; state: string; endpoint?: string | null }

const icons: Record<string, string> = { chirpstack: 'fa-tower-broadcast', database: 'fa-database', email: 'fa-envelope', api: 'fa-code' }

export default function AdminIntegrationsWorkspace() {
  const navigate = useNavigate()
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    document.body.dataset.reactAdminIntegrationsActive = 'true'
    return () => { delete document.body.dataset.reactAdminIntegrationsActive }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setState('loading')
      try {
        const userResponse = await neurocropApi.getCurrentUser() as { user?: { isPlatformAdmin?: boolean } }
        if (!userResponse.user?.isPlatformAdmin) {
          navigate('/', { replace: true })
          return
        }
        const response = await neurocropApi.getPlatformIntegrations() as { integrations?: Integration[] }
        if (!cancelled) {
          setIntegrations(Array.isArray(response.integrations) ? response.integrations : [])
          setState('ready')
        }
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Integration status could not be loaded.')
          setState('error')
        }
      }
    }
    void load()
    return () => { cancelled = true }
  }, [navigate])

  return <main className="nc-settings-page nc-admin-integrations" aria-busy={state === 'loading'}>
    <div className="nc-settings-breadcrumb"><button onClick={() => navigate('/admin')}>Admin</button><i className="fa-solid fa-chevron-right" /><span>Integrations</span></div>
    <header className="nc-settings-page-head"><div><p>Advanced administration</p><h1>Integrations</h1><span>Read-only infrastructure status for platform administrators. Secrets and connection changes remain server-managed.</span></div><button className="nc-settings-button secondary" onClick={() => navigate('/admin')}><i className="fa-solid fa-arrow-left" />Back to Admin</button></header>
    <section className="nc-admin-integration-layout"><aside><i className="fa-solid fa-shield-halved" /><div><p>Administrator access</p><h2>Connected infrastructure</h2><span>Configuration changes can interrupt telemetry or delivery. NeuroCrop therefore reports status here while deployment secrets remain outside the browser.</span></div><span className="nc-settings-status" data-tone="warning"><i />Advanced</span></aside><div className="nc-settings-flow">{state === 'error' ? <div className="nc-settings-feedback" data-tone="warning"><i className="fa-solid fa-triangle-exclamation" />{error}</div> : null}<section className="nc-settings-integrations">{integrations.map((integration) => <article key={integration.id}><span><i className={`fa-solid ${icons[integration.id] || 'fa-plug'}`} /></span><div><strong>{integration.name}</strong><p>{integration.detail}</p><small>{integration.endpoint || 'Internal service'}</small></div><span className="nc-settings-status" data-tone={integration.configured ? 'success' : 'warning'}><i />{integration.configured ? 'Connected' : 'Configuration required'}</span></article>)}{state === 'loading' ? <div className="nc-settings-empty"><i className="fa-solid fa-spinner fa-spin" /><strong>Checking infrastructure</strong><span>Reading live server configuration status.</span></div> : null}</section><section className="nc-settings-note"><i className="fa-solid fa-key" /><div><strong>Secrets never enter the frontend</strong><p>API tokens, database credentials, and delivery keys are managed through protected server configuration.</p></div></section></div></section>
  </main>
}
