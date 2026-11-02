import { useState } from 'react'
import { useInterfaceLanguage } from '../i18n'
import { sessionFailure } from '../features/auth/sessionFailure'

export default function SessionErrorScreen({ reason, onRetry, onSignOut }: {
  reason: unknown
  onRetry: () => void
  onSignOut?: () => Promise<void>
}) {
  const { t } = useInterfaceLanguage()
  const failure = sessionFailure(reason)
  const [busy, setBusy] = useState(false)
  const [signOutFailed, setSignOutFailed] = useState(false)

  async function signOut() {
    setBusy(true)
    setSignOutFailed(false)
    try {
      await onSignOut?.()
    } catch {
      setSignOutFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const primaryAction = failure.action === 'retry' ? onRetry : () => void signOut()
  return <main className="login-screen">
    <section className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-8 text-center" aria-labelledby="session-error-title">
      <div aria-hidden="true" className={`flex h-14 w-14 items-center justify-center rounded-3xl text-xl ${'pending' in failure ? 'bg-[#e5f1ea] text-pine' : 'bg-[#f9e3df] text-ember'}`}>
        <i className={`fa-solid ${'pending' in failure ? 'fa-clock' : 'fa-triangle-exclamation'}`} />
      </div>
      <h1 id="session-error-title" className="mt-6 font-display text-3xl font-bold text-ink">{t(failure.title)}</h1>
      <p className="mt-3 text-sm leading-6 text-ink/60" role="alert">{t(failure.message)}</p>
      {signOutFailed ? <p className="mt-3 text-sm text-ember" role="alert">{t('Could not sign out. Check your connection and try again.')}</p> : null}
      <button className="login-submit mt-7 max-w-xs" type="button" disabled={busy} onClick={primaryAction}>
        {t(busy ? 'Please wait…' : failure.action === 'retry' ? 'Try again' : failure.action === 'sign-in' ? 'Sign in again' : 'Sign out')}
      </button>
      {failure.action === 'sign-in' || failure.action === 'retry' ? <button className="mt-4 text-sm text-pine underline underline-offset-4" type="button" disabled={busy} onClick={failure.action === 'retry' ? () => void signOut() : onRetry}>
        {t(failure.action === 'retry' ? 'Sign out' : 'Try again')}
      </button> : null}
    </section>
  </main>
}
