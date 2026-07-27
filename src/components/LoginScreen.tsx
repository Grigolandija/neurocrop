import { useState, type FormEvent } from 'react'
import { useInterfaceLanguage } from '../i18n'
import { invalidateRequestCache } from '../services/api/client'
import { neurocropApi } from '../services/api/neurocropApi'
import type { DashboardUser } from './DashboardShell'

type LoginScreenProps = {
  onAuthenticated: (user: DashboardUser) => void
}

export default function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const { language, setLanguage, t } = useInterfaceLanguage()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!email.trim() || !password || busy) return
    setBusy(true)
    setError('')
    try {
      const response = await neurocropApi.login(email.trim(), password) as { user?: DashboardUser }
      invalidateRequestCache()
      const current = response.user || (await neurocropApi.getCurrentUser() as { user?: DashboardUser }).user
      if (!current?.email) throw new Error('The account response is incomplete.')
      onAuthenticated(current)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-screen">
      <div className="login-layout">
        <aside className="login-aside">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/12 text-xl text-[#f5c26b] ring-1 ring-white/16"><i className="fa-solid fa-seedling" /></div>
          <p className="mt-10 text-xs font-bold uppercase tracking-[0.30em] text-white/58">NeuroCrop</p>
          <h1 className="mt-3 max-w-sm font-display text-4xl font-bold leading-tight">{t('Know what your crop needs next.')}</h1>
          <p className="mt-5 max-w-sm text-sm leading-7 text-white/70">{t('A single workspace for live growing conditions, section history, alerts, and sensor health.')}</p>
          <div className="relative mt-12 flex items-center gap-3 text-sm font-semibold text-white/76"><span className="h-2.5 w-2.5 rounded-full bg-[#88c69f]" />{t('Workspace access')}</div>
        </aside>
        <section className="login-form-panel" aria-labelledby="loginTitle">
          <div className="language-switch login-language-switch" role="group" aria-label={t('Language')}>
            <button type="button" data-language-option="lt" data-active={language === 'lt'} aria-pressed={language === 'lt'} onClick={() => setLanguage('lt')}>LT</button>
            <button type="button" data-language-option="en" data-active={language === 'en'} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.26em] text-pine/52">{t('Workspace access')}</p>
          <h2 id="loginTitle" className="mt-3 font-display text-3xl font-bold text-ink">{t('Sign in to NeuroCrop')}</h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-ink/60">{t('Use the email address assigned to your farm workspace.')}</p>
          <form id="loginForm" className="mt-8 space-y-5" autoComplete="on" noValidate onSubmit={(event) => void submit(event)}>
            <label className="block"><span className="text-sm font-bold text-ink/76">{t('Email address')}</span><input id="loginEmail" className="login-field mt-2" name="username" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@farm.com" required /></label>
            <label className="block"><span className="text-sm font-bold text-ink/76">{t('Password')}</span><input id="loginPassword" className="login-field mt-2" name="password" type="password" autoComplete="current-password" maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('Enter your password')} required /></label>
            {error ? <p id="loginError" className="rounded-2xl bg-[#f9e3df] px-4 py-3 text-sm font-semibold text-[#8f3d2d]" role="alert">{error}</p> : null}
            <button id="loginSubmit" type="submit" className="login-submit" disabled={busy || !email.trim() || !password}>{t(busy ? 'Signing in…' : 'Sign in')} <i className="fa-solid fa-arrow-right ml-2" /></button>
          </form>
          <p className="mt-7 text-xs leading-5 text-ink/46">{t('Need access?')} <a className="font-bold text-pine underline underline-offset-4" href="/register">{t('Create account and request workspace')}</a>.</p>
        </section>
      </div>
    </main>
  )
}
