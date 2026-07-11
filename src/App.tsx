import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import approvedMarkup from './approved-dashboard-markup.html?raw'
import './App.css'
import './styles/approved-dashboard.css'

declare global {
  interface Window {
    echarts?: unknown
    NeuroCropStateEngine?: unknown
    NEUROCROP_CONFIG?: { apiBaseUrl?: string }
  }
}

declare const __BUILD_VERSION__: string

const supportedRoutes = new Set(['/', '/areas', '/sections', '/nodes', '/readings', '/alerts', '/history', '/settings', '/crop-profiles', '/admin'])

function RegisterPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const apiBaseUrl = String(window.NEUROCROP_CONFIG?.apiBaseUrl || 'https://api.neurocrop.lt').replace(/\/$/, '')
      const response = await fetch(`${apiBaseUrl}/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, organizationName, password })
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error?.message || 'We could not create this account.')
      }
      setSuccess(payload?.message || 'Account created. NeuroCrop will review your workspace request.')
      setPassword('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not create this account.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-screen">
      <div className="login-layout">
        <aside className="login-aside">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/12 text-xl text-[#f5c26b] ring-1 ring-white/16">NC</div>
          <p className="mt-10 text-xs font-bold uppercase tracking-[0.30em] text-white/58">NeuroCrop</p>
          <h1 className="mt-3 max-w-sm font-display text-4xl font-bold leading-tight">Request your workspace.</h1>
          <p className="mt-5 max-w-sm text-sm leading-7 text-white/70">Create your user account first. NeuroCrop will approve the organization before sensor data is connected.</p>
        </aside>
        <section className="login-form-panel" aria-labelledby="registerTitle">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-pine/52">New account</p>
          <h1 id="registerTitle" className="mt-3 font-display text-3xl font-bold text-ink">Create NeuroCrop access</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-ink/60">Enter your details and the organization name you want to manage.</p>
          <form className="mt-8 space-y-5" onSubmit={register} noValidate>
            <label className="block"><span className="text-sm font-bold text-ink/76">Email address</span><input className="login-field mt-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@farm.com" /></label>
            <label className="block"><span className="text-sm font-bold text-ink/76">Your name</span><input className="login-field mt-2" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required placeholder="Full name" /></label>
            <label className="block"><span className="text-sm font-bold text-ink/76">Organization name</span><input className="login-field mt-2" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} required placeholder="Farm or company name" /></label>
            <label className="block"><span className="text-sm font-bold text-ink/76">Password</span><input className="login-field mt-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required placeholder="At least 12 characters" /></label>
            {error ? <p className="rounded-2xl bg-[#f9e3df] px-4 py-3 text-sm font-semibold text-ember" role="alert">{error}</p> : null}
            {success ? <p className="rounded-2xl bg-[#e5f1ea] px-4 py-3 text-sm font-semibold text-pine" role="status">{success}</p> : null}
            <button type="submit" className="login-submit" disabled={submitting}>{submitting ? 'Creating account...' : 'Create account'}</button>
          </form>
          <button type="button" className="mt-6 text-sm font-semibold text-pine underline underline-offset-4" onClick={() => navigate('/')}>Back to sign in</button>
        </section>
      </div>
    </main>
  )
}

function AcceptInvitePage() {
  const navigate = useNavigate()
  const token = new URLSearchParams(window.location.search).get('token') || ''
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function acceptInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) {
      setError('This invitation link is incomplete.')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const apiBaseUrl = String(window.NEUROCROP_CONFIG?.apiBaseUrl || 'https://api.neurocrop.lt').replace(/\/$/, '')
      const response = await fetch(`${apiBaseUrl}/auth/accept-invite`, {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, password })
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error?.message || 'We could not accept this invitation.')
      }
      navigate('/', { replace: true })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not accept this invitation.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-screen">
      <div className="login-layout">
        <aside className="login-aside">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/12 text-xl text-[#f5c26b] ring-1 ring-white/16">NC</div>
          <p className="mt-10 text-xs font-bold uppercase tracking-[0.30em] text-white/58">NeuroCrop</p>
          <h1 className="mt-3 max-w-sm font-display text-4xl font-bold leading-tight">Join your farm workspace.</h1>
          <p className="mt-5 max-w-sm text-sm leading-7 text-white/70">Use this invitation to create your account or connect an existing NeuroCrop account.</p>
        </aside>
        <section className="login-form-panel" aria-labelledby="acceptInviteTitle">
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-pine/52">Workspace invitation</p>
          <h1 id="acceptInviteTitle" className="mt-3 font-display text-3xl font-bold text-ink">Set up access</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-ink/60">If you already have a NeuroCrop account, enter its password. New users must also provide their name.</p>
          <form className="mt-8 space-y-5" onSubmit={acceptInvitation} noValidate>
            <label className="block"><span className="text-sm font-bold text-ink/76">Your name</span><input className="login-field mt-2" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Name for a new account" /></label>
            <label className="block"><span className="text-sm font-bold text-ink/76">Password</span><input className="login-field mt-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required placeholder="At least 12 characters for a new account" /></label>
            {error ? <p className="rounded-2xl bg-[#f9e3df] px-4 py-3 text-sm font-semibold text-ember" role="alert">{error}</p> : null}
            <button type="submit" className="login-submit" disabled={submitting || !token}>{submitting ? 'Setting up access...' : 'Accept invitation'}</button>
          </form>
          <button type="button" className="mt-6 text-sm font-semibold text-pine underline underline-offset-4" onClick={() => navigate('/')}>Back to sign in</button>
        </section>
      </div>
    </main>
  )
}

function ApprovedDashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const hostRef = useRef<HTMLDivElement>(null)
  const runtimeReady = useRef(false)

  useEffect(() => {
    if (hostRef.current && !hostRef.current.childElementCount) {
      hostRef.current.innerHTML = approvedMarkup
    }

    document.body.classList.add('designer-app')
    document.body.dataset.dashboardState = 'optimal'
    document.body.dataset.workspaceFocus = 'all'

    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const payload = event.data
      if (!payload || payload.type !== 'neurocrop:navigate') return
      const route = supportedRoutes.has(payload.route) ? payload.route : '/'
      if (route !== window.location.pathname) navigate(route, { replace: Boolean(payload.replace) })
    }

    window.addEventListener('message', handleMessage)

    const loadRuntime = () => {
      if (document.querySelector('script[data-neurocrop-runtime]')) return
      const attachRuntime = () => {
        const runtime = document.createElement('script')
        runtime.src = `/approved-dashboard-runtime.js?v=${__BUILD_VERSION__}`
        runtime.dataset.neurocropRuntime = 'true'
        runtime.onload = () => {
          runtimeReady.current = true
          window.postMessage({ type: 'neurocrop:route', route: window.location.pathname }, window.location.origin)
        }
        document.body.appendChild(runtime)
      }

      if (window.NeuroCropStateEngine) {
        attachRuntime()
        return
      }

      const stateEngine = document.createElement('script')
      stateEngine.src = `/neurocrop-state-engine.js?v=${__BUILD_VERSION__}`
      stateEngine.dataset.neurocropStateEngine = 'true'
      stateEngine.onload = attachRuntime
      document.body.appendChild(stateEngine)
    }

    if (window.echarts) {
      loadRuntime()
    } else {
      const vendor = document.createElement('script')
      vendor.src = '/vendor/echarts.min.js'
      vendor.dataset.neurocropVendor = 'true'
      vendor.onload = loadRuntime
      document.body.appendChild(vendor)
    }

    return () => {
      window.removeEventListener('message', handleMessage)
      document.body.classList.remove('designer-app')
    }
  }, [navigate])

  useEffect(() => {
    if (!runtimeReady.current) return
    window.postMessage({ type: 'neurocrop:route', route: location.pathname }, window.location.origin)
  }, [location.pathname])

  return <div ref={hostRef} />
}

function RoutedDashboard() {
  const location = useLocation()
  return supportedRoutes.has(location.pathname) ? <ApprovedDashboard /> : <Navigate to="/" replace />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route path="*" element={<RoutedDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
