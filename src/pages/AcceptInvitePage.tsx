import { useEffect, useState, type FormEvent } from 'react'
import { AuthLayout, BackToSignIn } from '../features/auth/AuthLayout'
import { neurocropApi } from '../services/api/neurocropApi'

type Invitation = {
  status: 'loading' | 'pending' | 'revoked' | 'expired' | 'accepted' | 'unavailable' | 'invalid' | 'error'
  email?: string
  role?: string
  organizationName?: string
  expiresAt?: string
  accountExists?: boolean
}

const statusCopy: Record<Exclude<Invitation['status'], 'pending'>, { title: string; description: string; icon: string }> = {
  loading: { title: 'Checking invitation', description: 'Confirming that this invitation is still active.', icon: 'fa-spinner fa-spin' },
  revoked: { title: 'Invitation cancelled', description: 'The organization administrator cancelled this invitation. Contact them if you still need access.', icon: 'fa-ban' },
  expired: { title: 'Invitation expired', description: 'This invitation is no longer active. Ask the organization administrator to send a new one.', icon: 'fa-clock' },
  accepted: { title: 'Invitation already accepted', description: 'This link has already been used. Sign in with the account that accepted the invitation.', icon: 'fa-circle-check' },
  unavailable: { title: 'Organization unavailable', description: 'This organization can no longer accept new members.', icon: 'fa-building-circle-xmark' },
  invalid: { title: 'Invalid invitation', description: 'This invitation link is incomplete or not valid.', icon: 'fa-link-slash' },
  error: { title: 'Invitation could not be checked', description: 'NeuroCrop could not reach the service. Check your connection and try again.', icon: 'fa-cloud-arrow-down' },
}

export default function AcceptInvitePage() {
  const token = new URLSearchParams(window.location.search).get('token') || ''
  const [invitation, setInvitation] = useState<Invitation>({ status: token ? 'loading' : 'invalid' })
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    if (!token) {
      return () => { active = false }
    }

    neurocropApi.getInvitationStatus(token)
      .then((response) => {
        if (!active) return
        const next = (response as { invitation?: Invitation }).invitation
        setInvitation(next?.status ? next : { status: 'invalid' })
      })
      .catch(() => {
        if (active) setInvitation({ status: 'error' })
      })

    return () => { active = false }
  }, [token])

  async function acceptInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || invitation.status !== 'pending') return
    setSubmitting(true)
    setError('')
    try {
      await neurocropApi.acceptInvitation({ token, name, password })
      window.location.assign('/')
    } catch (reason) {
      try {
        const response = await neurocropApi.getInvitationStatus(token) as { invitation?: Invitation }
        if (response.invitation?.status && response.invitation.status !== 'pending') {
          setInvitation(response.invitation)
          return
        }
      } catch {
        // Preserve the actionable acceptance error when the status refresh also fails.
      }
      setError(reason instanceof Error ? reason.message : 'We could not accept this invitation.')
    } finally {
      setSubmitting(false)
    }
  }

  const inactiveCopy = invitation.status === 'pending' ? null : statusCopy[invitation.status]
  const panelTitle = invitation.status === 'pending' ? `Join ${invitation.organizationName || 'organization'}` : inactiveCopy?.title || 'Invitation'
  const panelDescription = invitation.status === 'pending'
    ? invitation.accountExists
      ? `Sign in as ${invitation.email} to add this organization to your NeuroCrop account.`
      : `Create access for ${invitation.email} to join as ${invitation.role || 'member'}.`
    : inactiveCopy?.description || ''

  return (
    <AuthLayout eyebrow="Workspace invitation" title="Join your farm workspace." description="Use a verified invitation to create your account or connect an existing NeuroCrop account." panelTitleId="acceptInviteTitle" panelTitle={panelTitle} panelDescription={panelDescription}>
      {invitation.status === 'pending' ? <form className="mt-8 space-y-5" onSubmit={acceptInvitation} noValidate autoComplete="on">
        {!invitation.accountExists ? <label className="block"><span className="text-sm font-bold text-ink/76">Your name</span><input name="name" className="login-field mt-2" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required placeholder="Full name" /></label> : null}
        <label className="block"><span className="text-sm font-bold text-ink/76">{invitation.accountExists ? 'Your NeuroCrop password' : 'Create a password'}</span><input name="password" className="login-field mt-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={invitation.accountExists ? 'current-password' : 'new-password'} minLength={invitation.accountExists ? undefined : 12} maxLength={1024} required placeholder={invitation.accountExists ? 'Enter your existing password' : 'At least 12 characters'} /></label>
        {error ? <p className="rounded-2xl bg-[#f9e3df] px-4 py-3 text-sm font-semibold text-ember" role="alert">{error}</p> : null}
        <button type="submit" className="login-submit" disabled={submitting}>{submitting ? 'Setting up access...' : 'Accept invitation'}</button>
      </form> : <div className="mt-8 rounded-2xl border border-ink/10 bg-white/70 p-5" role={invitation.status === 'loading' ? 'status' : 'alert'}>
        <i className={`fa-solid ${inactiveCopy?.icon || 'fa-circle-info'} text-xl text-pine`} aria-hidden="true" />
        <p className="mt-3 text-sm leading-6 text-ink/64">{inactiveCopy?.description}</p>
        {invitation.organizationName ? <p className="mt-3 text-xs font-semibold text-ink/48">Organization: {invitation.organizationName}</p> : null}
        {invitation.status === 'error' ? <button type="button" className="mt-4 text-sm font-semibold text-pine underline underline-offset-4" onClick={() => window.location.reload()}>Try again</button> : null}
      </div>}
      <BackToSignIn />
    </AuthLayout>
  )
}
