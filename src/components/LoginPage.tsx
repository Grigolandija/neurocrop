import { useState, type FormEvent } from 'react'

type Props = { onLogin: (email: string, password: string) => Promise<void> }

export function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!email.includes('@') || password.length < 4) {
      setError('Enter a valid email and a password of at least 4 characters.')
      return
    }
    setBusy(true)
    setError('')
    try { await onLogin(email, password) }
    catch { setError('We could not sign you in. Check your details and try again.') }
    finally { setBusy(false) }
  }

  return <main className="login-page">
    <section className="login-card">
      <div className="login-story">
        <div className="brand-mark">N</div>
        <p className="eyebrow light">NeuroCrop</p>
        <h1>Know what your crop needs next.</h1>
        <p>Live growing conditions, sensor history, alerts and structure in one workspace.</p>
      </div>
      <form className="login-form" onSubmit={submit}>
        <p className="eyebrow">Workspace access</p>
        <h2>Sign in to NeuroCrop</h2>
        <p className="muted">Use the email assigned to your farm workspace.</p>
        <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@farm.com" /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in →'}</button>
      </form>
    </section>
  </main>
}
