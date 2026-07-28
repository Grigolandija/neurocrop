import { translateInterfaceText as tx } from '../i18n'
import { useAuth } from '@clerk/react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import ClerkLoginScreen from '../components/ClerkLoginScreen'
import { AuthLayout, BackToSignIn } from '../features/auth/AuthLayout'
import { neurocropApi } from '../services/api/neurocropApi'
import { useInterfaceLanguage } from '../i18n'

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

function ClerkAcceptInvitePage() {
  const { language, t } = useInterfaceLanguage()
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token') || ''
  const mode = params.get('mode') === 'sign-in' ? 'sign-in' : 'sign-up'
  const inviteUrl = token ? `/accept-invite?token=${encodeURIComponent(token)}` : '/accept-invite'
  const signInUrl = `${inviteUrl}${inviteUrl.includes('?') ? '&' : '?'}mode=sign-in`
  const { isLoaded, isSignedIn, signOut } = useAuth()
  const [invitation, setInvitation] = useState<Invitation>({ status: token ? 'loading' : 'invalid' })
  const [error, setError] = useState('')
  const acceptanceStarted = useRef(false)

  useEffect(() => {
    let active = true
    if (!token) return () => { active = false }
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

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !token || invitation.status !== 'pending' || acceptanceStarted.current) return
    acceptanceStarted.current = true
    let active = true
    void neurocropApi.acceptInvitation({ token })
      .then(() => {
        if (active) window.location.assign('/')
      })
      .catch((reason) => {
        if (!active) return
        setError(reason instanceof Error ? reason.message : t('We could not accept this invitation.'))
        acceptanceStarted.current = false
      })
    return () => { active = false }
  }, [invitation.status, isLoaded, isSignedIn, t, token])

  if (invitation.status === 'pending' && isLoaded && !isSignedIn) {
    return (
      <ClerkLoginScreen
        mode={mode}
        redirectUrl={inviteUrl}
        signInUrl={signInUrl}
        signUpUrl={inviteUrl}
        initialEmail={invitation.email}
      />
    )
  }

  const inactiveCopy = invitation.status === 'pending' ? null : statusCopy[invitation.status]
  const title = invitation.status === 'pending'
    ? error
      ? t('Invitation could not be accepted')
      : `${t('Join')} ${invitation.organizationName || t('organization')}`
    : t(inactiveCopy?.title || 'Invitation')
  const description = invitation.status === 'pending'
    ? error
      ? error
      : language === 'lt'
        ? `Jungiama patvirtinta ${invitation.email || ''} paskyra prie organizacijos.`
        : `Connecting the verified ${invitation.email || ''} account to the organization.`
    : t(inactiveCopy?.description || '')

  return (
    <AuthLayout eyebrow="Workspace invitation" title={tx("Join your farm workspace.")} description="Use a verified invitation to create your account or connect an existing NeuroCrop account." panelTitleId="acceptInviteTitle" panelTitle={title} panelDescription={description}>
      <div className="mt-8 rounded-2xl border border-ink/10 bg-white/70 p-5" role={error || invitation.status !== 'pending' ? 'alert' : 'status'}>
        <i className={`fa-solid ${error ? 'fa-triangle-exclamation' : inactiveCopy?.icon || 'fa-spinner fa-spin'} text-xl text-pine`} aria-hidden="true" />
        <p className="mt-3 text-sm leading-6 text-ink/64">{description}</p>
        {invitation.organizationName ? <p className="mt-3 text-xs font-semibold text-ink/48">{t('Organization:')} {invitation.organizationName}</p> : null}
        {error ? (
          <button
            type="button"
            className="login-submit mt-5"
            onClick={() => {
              void signOut().then(() => window.location.assign(inviteUrl))
            }}
          >
            {language === 'lt' ? 'Atsijungti ir bandyti kitu el. paštu' : 'Sign out and try another email'}
          </button>
        ) : null}
        {invitation.status === 'accepted' && isSignedIn ? (
          <button type="button" className="login-submit mt-5" onClick={() => window.location.assign('/')}>
            {language === 'lt' ? 'Atidaryti NeuroCrop' : 'Open NeuroCrop'}
          </button>
        ) : null}
      </div>
      {!isSignedIn ? <BackToSignIn /> : null}
    </AuthLayout>
  )
}

function LegacyAcceptInvitePage() {
  const { language, t } = useInterfaceLanguage()
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
      setError(reason instanceof Error ? reason.message : t('We could not accept this invitation.'))
    } finally {
      setSubmitting(false)
    }
  }

  const inactiveCopy = invitation.status === 'pending' ? null : statusCopy[invitation.status]
  const panelTitle = invitation.status === 'pending'
    ? `${t('Join')} ${invitation.organizationName || t('organization')}`
    : t(inactiveCopy?.title || 'Invitation')
  const panelDescription = invitation.status === 'pending'
    ? invitation.accountExists
      ? language === 'lt'
        ? `Prisijunkite kaip ${invitation.email}, kad pridėtumėte šią organizaciją prie savo „NeuroCrop“ paskyros.`
        : `Sign in as ${invitation.email} to add this organization to your NeuroCrop account.`
      : language === 'lt'
        ? `Sukurkite prieigą adresui ${invitation.email}, kad galėtumėte prisijungti kaip ${invitation.role || 'narys'}.`
        : `Create access for ${invitation.email} to join as ${invitation.role || 'member'}.`
    : t(inactiveCopy?.description || '')

  return (
    <AuthLayout eyebrow="Workspace invitation" title={tx("Join your farm workspace.")} description="Use a verified invitation to create your account or connect an existing NeuroCrop account." panelTitleId="acceptInviteTitle" panelTitle={panelTitle} panelDescription={panelDescription}>
      {invitation.status === 'pending' ? <form className="mt-8 space-y-5" onSubmit={acceptInvitation} noValidate autoComplete="on">
        {!invitation.accountExists ? <label className="block"><span className="text-sm font-bold text-ink/76">{t('Your name')}</span><input name="name" className="login-field mt-2" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required placeholder={t('Full name')} /></label> : null}
        <label className="block"><span className="text-sm font-bold text-ink/76">{t(invitation.accountExists ? 'Your NeuroCrop password' : 'Create a password')}</span><input name="password" className="login-field mt-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={invitation.accountExists ? 'current-password' : 'new-password'} minLength={invitation.accountExists ? undefined : 12} maxLength={1024} required placeholder={t(invitation.accountExists ? 'Enter your existing password' : 'At least 12 characters')} /></label>
        {error ? <p className="rounded-2xl bg-[#f9e3df] px-4 py-3 text-sm font-semibold text-ember" role="alert">{error}</p> : null}
        <button type="submit" className="login-submit" disabled={submitting}>{submitting ? t('Setting up access...') : t('Accept invitation')}</button>
      </form> : <div className="mt-8 rounded-2xl border border-ink/10 bg-white/70 p-5" role={invitation.status === 'loading' ? 'status' : 'alert'}>
        <i className={`fa-solid ${inactiveCopy?.icon || 'fa-circle-info'} text-xl text-pine`} aria-hidden="true" />
        <p className="mt-3 text-sm leading-6 text-ink/64">{t(inactiveCopy?.description || '')}</p>
        {invitation.organizationName ? <p className="mt-3 text-xs font-semibold text-ink/48">{t('Organization:')} {invitation.organizationName}</p> : null}
        {invitation.status === 'error' ? <button type="button" className="mt-4 text-sm font-semibold text-pine underline underline-offset-4" onClick={() => window.location.reload()}>{t('Try again')}</button> : null}
      </div>}
      <BackToSignIn />
    </AuthLayout>
  )
}

export default function AcceptInvitePage({ clerkEnabled = false }: { clerkEnabled?: boolean }) {
  return clerkEnabled ? <ClerkAcceptInvitePage /> : <LegacyAcceptInvitePage />
}
