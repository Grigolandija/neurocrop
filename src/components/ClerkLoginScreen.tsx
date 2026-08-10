import { SignUp, useSignIn } from '@clerk/react'
import { useState, type FormEvent } from 'react'
import { useInterfaceLanguage } from '../i18n'

type ClerkLoginScreenProps = {
  mode?: 'sign-in' | 'sign-up' | 'recovery'
  redirectUrl?: string
  signInUrl?: string
  signUpUrl?: string
  initialEmail?: string
  onChangeProduct?: () => void
}

function clerkErrorMessage(reason: unknown, fallback: string) {
  if (!reason || typeof reason !== 'object') return fallback
  const value = reason as {
    message?: unknown
    longMessage?: unknown
    errors?: Array<{ message?: unknown; longMessage?: unknown }>
  }
  const first = value.errors?.[0]
  return String(first?.longMessage || first?.message || value.longMessage || value.message || fallback)
}

function PasswordSignInForm({
  redirectUrl,
  signUpUrl,
  initialEmail = '',
}: {
  redirectUrl: string
  signUpUrl: string
  initialEmail?: string
}) {
  const { language, t } = useInterfaceLanguage()
  const { signIn, errors, fetchStatus } = useSignIn()
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [needsCode, setNeedsCode] = useState(false)
  const [error, setError] = useState('')
  const busy = fetchStatus === 'fetching'

  async function finalizeSignIn() {
    await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          setError(language === 'lt' ? 'Paskyrai reikia papildomo patvirtinimo.' : 'This account requires an additional verification step.')
          return
        }
        window.location.assign(decorateUrl(redirectUrl))
      },
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim() || !password || busy) return
    setError('')
    try {
      const result = await signIn.password({
        emailAddress: email.trim(),
        password,
      })
      if (result.error) {
        setError(clerkErrorMessage(result.error, t('Sign in failed.')))
        return
      }
      if (signIn.status === 'complete') {
        await finalizeSignIn()
        return
      }
      if (signIn.status === 'needs_client_trust' || signIn.status === 'needs_second_factor') {
        const supportsEmailCode = signIn.supportedSecondFactors.some((factor) => factor.strategy === 'email_code')
        if (!supportsEmailCode) {
          setError(language === 'lt' ? 'Šiai paskyrai reikia kito dviejų žingsnių patvirtinimo būdo.' : 'This account requires another two-factor verification method.')
          return
        }
        await signIn.mfa.sendEmailCode()
        setNeedsCode(true)
        return
      }
      setError(language === 'lt' ? 'Prisijungimui reikia papildomo patvirtinimo.' : 'Additional verification is required to sign in.')
    } catch (reason) {
      setError(clerkErrorMessage(reason, t('Sign in failed.')))
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!code.trim() || busy) return
    setError('')
    try {
      const result = await signIn.mfa.verifyEmailCode({ code: code.trim() })
      if (result.error) {
        setError(clerkErrorMessage(result.error, language === 'lt' ? 'Patvirtinimo kodas netinkamas.' : 'The verification code is invalid.'))
        return
      }
      if (signIn.status === 'complete') {
        await finalizeSignIn()
        return
      }
      setError(language === 'lt' ? 'Patvirtinimas dar neužbaigtas.' : 'Verification is not complete.')
    } catch (reason) {
      setError(clerkErrorMessage(reason, language === 'lt' ? 'Patvirtinti nepavyko.' : 'Verification failed.'))
    }
  }

  if (needsCode) {
    return (
      <div className="clerk-custom-login">
        <p className="text-xs font-bold uppercase tracking-[0.26em] text-pine/52">{t('Workspace access')}</p>
        <h2 className="mt-3 font-display text-3xl font-bold text-ink">{language === 'lt' ? 'Patvirtinkite prisijungimą' : 'Verify your sign-in'}</h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-ink/60">
          {language === 'lt' ? `Patvirtinimo kodas išsiųstas adresu ${email}.` : `A verification code was sent to ${email}.`}
        </p>
        <form className="mt-8 space-y-5" onSubmit={(event) => void verifyCode(event)}>
          <label className="block">
            <span className="text-sm font-bold text-ink/76">{language === 'lt' ? 'Patvirtinimo kodas' : 'Verification code'}</span>
            <input className="login-field mt-2" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required />
          </label>
          {error || errors.fields.code?.message ? <p className="rounded-2xl bg-[#f9e3df] px-4 py-3 text-sm font-semibold text-[#8f3d2d]" role="alert">{error || errors.fields.code?.message}</p> : null}
          <button type="submit" className="login-submit" disabled={busy || !code.trim()}>{busy ? (language === 'lt' ? 'Tikrinama…' : 'Verifying…') : (language === 'lt' ? 'Patvirtinti' : 'Verify')}</button>
          <button type="button" className="text-sm font-semibold text-pine underline underline-offset-4" onClick={() => { signIn.reset(); setNeedsCode(false); setCode(''); setError('') }}>
            {language === 'lt' ? 'Pradėti iš naujo' : 'Start over'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="clerk-custom-login">
      <p className="text-xs font-bold uppercase tracking-[0.26em] text-pine/52">{t('Workspace access')}</p>
      <h2 className="mt-3 font-display text-3xl font-bold text-ink">{t('Sign in to NeuroCrop')}</h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-ink/60">{t('Use the email address assigned to your farm workspace.')}</p>
      <form className="mt-8 space-y-5" autoComplete="on" noValidate onSubmit={(event) => void submit(event)}>
        <label className="block">
          <span className="text-sm font-bold text-ink/76">{t('Email address')}</span>
          <input className="login-field mt-2" name="username" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@farm.com" required />
        </label>
        <label className="block">
          <span className="flex items-center justify-between gap-4 text-sm font-bold text-ink/76">
            <span>{t('Password')}</span>
            <a className="text-xs text-pine underline underline-offset-4" href="/forgot-password">{t('Forgot password?')}</a>
          </span>
          <input className="login-field mt-2" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t('Enter your password')} required />
        </label>
        {error || errors.fields.identifier?.message || errors.fields.password?.message ? (
          <p className="rounded-2xl bg-[#f9e3df] px-4 py-3 text-sm font-semibold text-[#8f3d2d]" role="alert">
            {error || errors.fields.identifier?.message || errors.fields.password?.message}
          </p>
        ) : null}
        <button type="submit" className="login-submit" disabled={busy || !email.trim() || !password}>
          {t(busy ? 'Signing in…' : 'Sign in')} <i className="fa-solid fa-arrow-right ml-2" />
        </button>
      </form>
      <p className="mt-7 text-xs leading-5 text-ink/46">
        {t('Need access?')} <a className="font-bold text-pine underline underline-offset-4" href={signUpUrl}>{t('Create account and request workspace')}</a>.
      </p>
    </div>
  )
}

function PasswordRecoveryForm({
  redirectUrl,
  initialEmail = '',
}: {
  redirectUrl: string
  initialEmail?: string
}) {
  const { language } = useInterfaceLanguage()
  const { signIn, fetchStatus } = useSignIn()
  const [step, setStep] = useState<'email' | 'code' | 'password'>('email')
  const [email, setEmail] = useState(initialEmail)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const busy = fetchStatus === 'fetching'

  async function sendResetCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim() || busy) return
    setError('')
    try {
      const resetResult = await signIn.reset()
      if (resetResult.error) {
        setError(clerkErrorMessage(resetResult.error, language === 'lt' ? 'Nepavyko pradėti slaptažodžio atkūrimo.' : 'Could not start password recovery.'))
        return
      }
      const createResult = await signIn.create({ identifier: email.trim() })
      if (createResult.error) {
        setError(clerkErrorMessage(createResult.error, language === 'lt' ? 'Nepavyko rasti paskyros.' : 'Could not find the account.'))
        return
      }
      const sendResult = await signIn.resetPasswordEmailCode.sendCode()
      if (sendResult.error) {
        setError(clerkErrorMessage(sendResult.error, language === 'lt' ? 'Nepavyko išsiųsti atkūrimo kodo.' : 'Could not send the recovery code.'))
        return
      }
      setStep('code')
    } catch (reason) {
      setError(clerkErrorMessage(reason, language === 'lt' ? 'Nepavyko išsiųsti atkūrimo kodo.' : 'Could not send the recovery code.'))
    }
  }

  async function verifyResetCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!code.trim() || busy) return
    setError('')
    try {
      const result = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() })
      if (result.error) {
        setError(clerkErrorMessage(result.error, language === 'lt' ? 'Atkūrimo kodas netinkamas.' : 'The recovery code is invalid.'))
        return
      }
      if (signIn.status !== 'needs_new_password') {
        setError(language === 'lt' ? 'Kodo patvirtinimas neužbaigtas. Bandykite dar kartą.' : 'Code verification is incomplete. Please try again.')
        return
      }
      setStep('password')
    } catch (reason) {
      setError(clerkErrorMessage(reason, language === 'lt' ? 'Kodo patvirtinti nepavyko.' : 'Could not verify the code.'))
    }
  }

  async function saveNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!password || !confirmation || busy) return
    setError('')
    if (password.length < 12) {
      setError(language === 'lt' ? 'Naudokite bent 12 simbolių slaptažodį.' : 'Use a password with at least 12 characters.')
      return
    }
    if (password !== confirmation) {
      setError(language === 'lt' ? 'Slaptažodžiai nesutampa.' : 'The passwords do not match.')
      return
    }
    try {
      const result = await signIn.resetPasswordEmailCode.submitPassword({
        password,
        signOutOfOtherSessions: true,
      })
      if (result.error) {
        setError(clerkErrorMessage(result.error, language === 'lt' ? 'Nepavyko pakeisti slaptažodžio.' : 'Could not change the password.'))
        return
      }
      if (signIn.status !== 'complete') {
        setError(language === 'lt' ? 'Slaptažodis pakeistas, bet prisijungimas neužbaigtas.' : 'The password changed, but sign-in is incomplete.')
        return
      }
      const finalizeResult = await signIn.finalize({
        navigate: ({ decorateUrl }) => window.location.assign(decorateUrl(redirectUrl)),
      })
      if (finalizeResult.error) {
        setError(clerkErrorMessage(finalizeResult.error, language === 'lt' ? 'Slaptažodis pakeistas. Prisijunkite iš naujo.' : 'Password changed. Please sign in again.'))
      }
    } catch (reason) {
      setError(clerkErrorMessage(reason, language === 'lt' ? 'Nepavyko pakeisti slaptažodžio.' : 'Could not change the password.'))
    }
  }

  const title = step === 'email'
    ? (language === 'lt' ? 'Atkurkite slaptažodį' : 'Reset your password')
    : step === 'code'
      ? (language === 'lt' ? 'Įveskite atkūrimo kodą' : 'Enter the recovery code')
      : (language === 'lt' ? 'Sukurkite naują slaptažodį' : 'Create a new password')
  const description = step === 'email'
    ? (language === 'lt' ? 'Įveskite paskyros el. paštą. Atsiųsime vienkartinį atkūrimo kodą.' : 'Enter your account email. We will send a one-time recovery code.')
    : step === 'code'
      ? (language === 'lt' ? `Kodą išsiuntėme adresu ${email}.` : `We sent a code to ${email}.`)
      : (language === 'lt' ? 'Seno slaptažodžio nereikia. Pasirinkite naują.' : 'You do not need your old password. Choose a new one.')

  return (
    <div className="clerk-custom-login">
      <p className="text-xs font-bold uppercase tracking-[0.26em] text-pine/52">
        {language === 'lt' ? 'Paskyros atkūrimas' : 'Account recovery'}
      </p>
      <h2 className="mt-3 font-display text-3xl font-bold text-ink">{title}</h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-ink/60">{description}</p>

      {step === 'email' ? (
        <form className="mt-8 space-y-5" onSubmit={(event) => void sendResetCode(event)}>
          <label className="block">
            <span className="text-sm font-bold text-ink/76">{language === 'lt' ? 'El. pašto adresas' : 'Email address'}</span>
            <input className="login-field mt-2" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@farm.com" required autoFocus />
          </label>
          {error ? <p className="rounded-2xl bg-[#f9e3df] px-4 py-3 text-sm font-semibold text-[#8f3d2d]" role="alert">{error}</p> : null}
          <button type="submit" className="login-submit" disabled={busy || !email.trim()}>
            {busy ? (language === 'lt' ? 'Siunčiama…' : 'Sending…') : (language === 'lt' ? 'Siųsti atkūrimo kodą' : 'Send recovery code')}
          </button>
          <a className="inline-block text-sm font-semibold text-pine underline underline-offset-4" href="/">
            {language === 'lt' ? 'Grįžti į prisijungimą' : 'Back to sign in'}
          </a>
        </form>
      ) : null}

      {step === 'code' ? (
        <form className="mt-8 space-y-5" onSubmit={(event) => void verifyResetCode(event)}>
          <label className="block">
            <span className="text-sm font-bold text-ink/76">{language === 'lt' ? 'Atkūrimo kodas' : 'Recovery code'}</span>
            <input className="login-field mt-2" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} required autoFocus />
          </label>
          {error ? <p className="rounded-2xl bg-[#f9e3df] px-4 py-3 text-sm font-semibold text-[#8f3d2d]" role="alert">{error}</p> : null}
          <button type="submit" className="login-submit" disabled={busy || !code.trim()}>
            {busy ? (language === 'lt' ? 'Tikrinama…' : 'Verifying…') : (language === 'lt' ? 'Patvirtinti kodą' : 'Verify code')}
          </button>
          <button type="button" className="text-sm font-semibold text-pine underline underline-offset-4" onClick={() => { setStep('email'); setCode(''); setError('') }}>
            {language === 'lt' ? 'Naudoti kitą el. paštą' : 'Use another email'}
          </button>
        </form>
      ) : null}

      {step === 'password' ? (
        <form className="mt-8 space-y-5" onSubmit={(event) => void saveNewPassword(event)}>
          <label className="block">
            <span className="text-sm font-bold text-ink/76">{language === 'lt' ? 'Naujas slaptažodis' : 'New password'}</span>
            <input className="login-field mt-2" type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={language === 'lt' ? 'Bent 12 simbolių' : 'At least 12 characters'} required autoFocus />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-ink/76">{language === 'lt' ? 'Pakartokite naują slaptažodį' : 'Confirm new password'}</span>
            <input className="login-field mt-2" type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
          </label>
          {error ? <p className="rounded-2xl bg-[#f9e3df] px-4 py-3 text-sm font-semibold text-[#8f3d2d]" role="alert">{error}</p> : null}
          <button type="submit" className="login-submit" disabled={busy || !password || !confirmation}>
            {busy ? (language === 'lt' ? 'Keičiama…' : 'Changing…') : (language === 'lt' ? 'Pakeisti slaptažodį' : 'Change password')}
          </button>
        </form>
      ) : null}
    </div>
  )
}

export default function ClerkLoginScreen({
  mode = 'sign-in',
  redirectUrl = '/',
  signInUrl = '/',
  signUpUrl = '/sign-up',
  initialEmail,
  onChangeProduct,
}: ClerkLoginScreenProps) {
  const { language, setLanguage, t } = useInterfaceLanguage()
  const isSignUp = mode === 'sign-up'
  const isRecovery = mode === 'recovery'
  const appearance = {
    variables: {
      colorPrimary: '#1f6b54',
      borderRadius: '0.9rem',
      fontFamily: 'inherit',
    },
    elements: {
      rootBox: 'clerk-login-root',
      cardBox: 'clerk-login-card-box',
      card: 'clerk-login-card',
      footer: 'clerk-login-footer',
      formButtonPrimary: 'clerk-login-primary-button',
    },
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
        <section className="login-form-panel clerk-login-panel" aria-label={t(isSignUp ? 'Create your NeuroCrop account' : 'Sign in to NeuroCrop')}>
          <div className="language-switch login-language-switch" role="group" aria-label={t('Language')}>
            <button type="button" data-language-option="lt" data-active={language === 'lt'} aria-pressed={language === 'lt'} onClick={() => setLanguage('lt')}>LT</button>
            <button type="button" data-language-option="en" data-active={language === 'en'} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
          </div>
          {!isSignUp && !isRecovery && onChangeProduct ? <button className="login-product-switch" type="button" onClick={onChangeProduct}><i className="fa-solid fa-arrow-left" /> {t('Change product')}</button> : null}
          {!isSignUp && !isRecovery ? <div className="login-product-badge"><i className="fa-solid fa-house-chimney-window" /> NeuroCrop Greenhouse</div> : null}
          {isSignUp
            ? <SignUp
                routing="hash"
                signInUrl={signInUrl}
                forceRedirectUrl={redirectUrl}
                fallbackRedirectUrl={redirectUrl}
                initialValues={initialEmail ? { emailAddress: initialEmail } : undefined}
                appearance={appearance}
              />
            : isRecovery
              ? <PasswordRecoveryForm redirectUrl={redirectUrl} initialEmail={initialEmail} />
              : <PasswordSignInForm redirectUrl={redirectUrl} signUpUrl={signUpUrl} initialEmail={initialEmail} />}
        </section>
      </div>
    </main>
  )
}
