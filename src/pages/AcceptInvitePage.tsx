import { useState, type FormEvent } from 'react'
import { AuthLayout, BackToSignIn } from '../features/auth/AuthLayout'
import { neurocropApi } from '../services/api/neurocropApi'

export default function AcceptInvitePage() {
  const token = new URLSearchParams(window.location.search).get('token') || ''
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function acceptInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return setError('This invitation link is incomplete.')
    setSubmitting(true)
    setError('')
    try {
      await neurocropApi.acceptInvitation({ token, name, password })
      window.location.assign('/')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not accept this invitation.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout eyebrow="Workspace invitation" title="Join your farm workspace." description="Use this invitation to create your account or connect an existing NeuroCrop account." panelTitleId="acceptInviteTitle" panelTitle="Set up access" panelDescription="If you already have a NeuroCrop account, enter its password. New users must also provide their name.">
      <form className="mt-8 space-y-5" onSubmit={acceptInvitation} noValidate>
        <label className="block"><span className="text-sm font-bold text-ink/76">Your name</span><input className="login-field mt-2" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Name for a new account" /></label>
        <label className="block"><span className="text-sm font-bold text-ink/76">Password</span><input className="login-field mt-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required placeholder="At least 12 characters for a new account" /></label>
        {error ? <p className="rounded-2xl bg-[#f9e3df] px-4 py-3 text-sm font-semibold text-ember" role="alert">{error}</p> : null}
        <button type="submit" className="login-submit" disabled={submitting || !token}>{submitting ? 'Setting up access...' : 'Accept invitation'}</button>
      </form>
      <BackToSignIn />
    </AuthLayout>
  )
}
