import { useState, type FormEvent } from 'react'
import { AuthLayout, BackToSignIn } from '../features/auth/AuthLayout'
import { neurocropApi } from '../services/api/neurocropApi'

function validate(email: string, name: string, organizationName: string, password: string) {
  if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) return 'Enter a valid email address.'
  if (!name.trim()) return 'Enter your name.'
  if (!organizationName.trim()) return 'Enter an organization name.'
  if (password.length < 12) return 'Use a password with at least 12 characters.'
  return ''
}

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validate(email, name, organizationName, password)
    if (validationError) return setError(validationError)
    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const payload = await neurocropApi.register({ email, name, organizationName, password }) as { message?: string }
      setSuccess(payload?.message || 'Account created. NeuroCrop will review your workspace request.')
      setPassword('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not create this account.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout eyebrow="New account" title="Request your workspace." description="Create your user account first. NeuroCrop will approve the organization before sensor data is connected." panelTitleId="registerTitle" panelTitle="Create NeuroCrop access" panelDescription="Enter your details and the organization name you want to manage.">
      <form className="mt-8 space-y-5" onSubmit={register} noValidate>
        <label className="block"><span className="text-sm font-bold text-ink/76">Email address</span><input className="login-field mt-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@farm.com" /></label>
        <label className="block"><span className="text-sm font-bold text-ink/76">Your name</span><input className="login-field mt-2" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required placeholder="Full name" /></label>
        <label className="block"><span className="text-sm font-bold text-ink/76">Organization name</span><input className="login-field mt-2" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} autoComplete="organization" required placeholder="Farm or company name" /></label>
        <label className="block"><span className="text-sm font-bold text-ink/76">Password</span><input className="login-field mt-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={1024} required placeholder="At least 12 characters" /></label>
        {error ? <p className="rounded-2xl bg-[#f9e3df] px-4 py-3 text-sm font-semibold text-ember" role="alert">{error}</p> : null}
        {success ? <p className="rounded-2xl bg-[#e5f1ea] px-4 py-3 text-sm font-semibold text-pine" role="status">{success}</p> : null}
        <button type="submit" className="login-submit" disabled={submitting}>{submitting ? 'Creating account...' : 'Create account'}</button>
      </form>
      <BackToSignIn />
    </AuthLayout>
  )
}
