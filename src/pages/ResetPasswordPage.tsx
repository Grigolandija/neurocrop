import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { AuthLayout, BackToSignIn } from '../features/auth/AuthLayout'
import { useInterfaceLanguage } from '../i18n'
import { neurocropApi } from '../services/api/neurocropApi'

export default function ResetPasswordPage() {
  const { t } = useInterfaceLanguage()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return
    setError('')
    if (!token) {
      setError(t('This password reset link is incomplete. Request a new one.'))
      return
    }
    if (password.length < 12) {
      setError(t('Use a password with at least 12 characters.'))
      return
    }
    if (password !== confirmation) {
      setError(t('The passwords do not match.'))
      return
    }

    setSubmitting(true)
    try {
      await neurocropApi.resetPassword(token, password)
      setCompleted(true)
      setPassword('')
      setConfirmation('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Password could not be changed.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Protect your growing workspace."
      description="Choose a new password. Existing NeuroCrop sessions will be signed out automatically."
      panelTitleId="resetPasswordTitle"
      panelTitle={completed ? 'Password changed' : 'Choose a new password'}
      panelDescription={completed
        ? 'Your new password is ready. Sign in again on this device.'
        : 'Use at least 12 characters and do not reuse your previous password.'}
    >
      {completed ? (
        <div className="mt-8">
          <div className="rounded-2xl bg-[#e5f3ea] px-5 py-4 text-sm font-semibold leading-6 text-[#245a42]" role="status">
            <i className="fa-solid fa-shield-halved mr-3" />
            {t('All previous sessions have been signed out.')}
          </div>
          <BackToSignIn />
        </div>
      ) : (
        <>
          <form className="mt-8 space-y-5" onSubmit={(event) => void submit(event)}>
            <label className="block">
              <span className="text-sm font-bold text-ink/76">{t('New password')}</span>
              <input className="login-field mt-2" type="password" autoComplete="new-password" minLength={12} maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('At least 12 characters')} required autoFocus />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-ink/76">{t('Confirm new password')}</span>
              <input className="login-field mt-2" type="password" autoComplete="new-password" minLength={12} maxLength={1024} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={t('Enter the password again')} required />
            </label>
            {error ? <p className="rounded-2xl bg-[#f9e3df] px-4 py-3 text-sm font-semibold text-[#8f3d2d]" role="alert">{error}</p> : null}
            <button type="submit" className="login-submit" disabled={submitting || !password || !confirmation}>
              {t(submitting ? 'Changing password…' : 'Change password')}
              <i className="fa-solid fa-arrow-right ml-2" />
            </button>
          </form>
          <BackToSignIn />
        </>
      )}
    </AuthLayout>
  )
}
