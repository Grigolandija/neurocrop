import { useState, type FormEvent } from 'react'
import { AuthLayout, BackToSignIn } from '../features/auth/AuthLayout'
import { useInterfaceLanguage } from '../i18n'
import { neurocropApi } from '../services/api/neurocropApi'

export default function ForgotPasswordPage() {
  const { t } = useInterfaceLanguage()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!email.trim() || submitting) return
    setSubmitting(true)
    setError('')
    try {
      await neurocropApi.requestPasswordReset(email.trim())
      setSubmitted(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Password reset request failed.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Recover access securely."
      description="Request a single-use link to choose a new password without exposing account details."
      panelTitleId="forgotPasswordTitle"
      panelTitle={submitted ? 'Check your email' : 'Forgot your password?'}
      panelDescription={submitted
        ? 'If an active NeuroCrop account uses this address, a reset link will arrive shortly.'
        : 'Enter the email address used for your NeuroCrop account.'}
    >
      {submitted ? (
        <div className="mt-8">
          <div className="rounded-2xl bg-[#e5f3ea] px-5 py-4 text-sm font-semibold leading-6 text-[#245a42]" role="status">
            <i className="fa-solid fa-envelope-circle-check mr-3" />
            {t('The link is valid for 60 minutes and can be used once.')}
          </div>
          <button type="button" className="login-submit mt-5" onClick={() => setSubmitted(false)}>
            {t('Use another email address')}
          </button>
          <BackToSignIn />
        </div>
      ) : (
        <>
          <form className="mt-8 space-y-5" onSubmit={(event) => void submit(event)}>
            <label className="block">
              <span className="text-sm font-bold text-ink/76">{t('Email address')}</span>
              <input
                className="login-field mt-2"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@farm.com"
                required
                autoFocus
              />
            </label>
            {error ? <p className="rounded-2xl bg-[#f9e3df] px-4 py-3 text-sm font-semibold text-[#8f3d2d]" role="alert">{error}</p> : null}
            <button type="submit" className="login-submit" disabled={submitting || !email.trim()}>
              {t(submitting ? 'Sending reset link…' : 'Send reset link')}
              <i className="fa-solid fa-arrow-right ml-2" />
            </button>
          </form>
          <BackToSignIn />
        </>
      )}
    </AuthLayout>
  )
}
