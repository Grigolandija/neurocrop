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

  return <main className="login-screen">
    <section className="login-layout">
      <aside className="login-aside">
        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/12 text-xl text-[#f5c26b] ring-1 ring-white/16"><i className="fa-solid fa-seedling" /></div>
        <p className="mt-10 text-xs font-bold uppercase tracking-[0.30em] text-white/58">NeuroCrop</p>
        <h1 className="mt-3 max-w-sm font-display text-4xl font-bold leading-tight">Know what your crop needs next.</h1>
        <p className="mt-5 max-w-sm text-sm leading-7 text-white/70">A single workspace for live growing conditions, section history, alerts, and sensor health.</p>
        <div className="relative mt-12 flex items-center gap-3 text-sm font-semibold text-white/76"><span className="h-2.5 w-2.5 rounded-full bg-[#88c69f]" />Workspace access</div>
      </aside>
      <div className="login-form-panel">
        <div className="language-switch login-language-switch"><button type="button">LT</button><button type="button" data-active="true">EN</button></div>
        <p className="text-xs font-bold uppercase tracking-[0.26em] text-pine/52">Workspace access</p>
        <h2 className="mt-3 font-display text-3xl font-bold text-ink">Sign in to NeuroCrop</h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-ink/60">Use the email address assigned to your farm workspace.</p>
        <form className="mt-8 space-y-5" onSubmit={submit}>
          <label className="block"><span className="text-sm font-bold text-ink/76">Email address</span><input className="login-field mt-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@farm.com" /></label>
          <label className="block"><span className="text-sm font-bold text-ink/76">Password</span><input className="login-field mt-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /></label>
          {error && <p className="rounded-2xl bg-[#f9e3df] px-4 py-3 text-sm font-semibold text-ember">{error}</p>}
          <button className="login-submit" disabled={busy}>{busy ? 'Signing in…' : <><span>Sign in</span><i className="fa-solid fa-arrow-right ml-2" /></>}</button>
        </form>
        <p className="mt-7 text-xs leading-5 text-ink/46">Need access? Contact your workspace administrator.</p>
      </div>
    </section>
  </main>
}
