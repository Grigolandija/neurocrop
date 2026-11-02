import { ApiError } from '../../services/api/client'

export function sessionFailure(reason: unknown) {
  const error = reason instanceof ApiError ? reason : null
  if (error?.code === 'ORGANIZATION_PENDING') return {
    title: 'Workspace request pending', message: 'Your workspace request is awaiting administrator approval.', action: 'sign-out', pending: true,
  } as const
  if (error?.code === 'ORGANIZATION_REJECTED') return {
    title: 'Workspace request declined', message: 'Your workspace request was not approved.', action: 'sign-out',
  } as const
  if (error?.status === 401) return {
    title: 'Please sign in again', message: 'Your session has ended. Sign in again to continue to your workspace.', action: 'sign-in',
  } as const
  if (error?.code === 'ACCOUNT_LINK_CONFLICT') return {
    title: 'Account connection required', message: 'Use the same verified email address as your existing NeuroCrop account.', action: 'sign-out',
  } as const
  if (error?.code === 'CLERK_EMAIL_NOT_VERIFIED') return {
    title: 'Email verification required', message: 'Verify your email address before opening your workspace.', action: 'sign-out',
  } as const
  if (error?.code === 'ACCOUNT_DISABLED') return {
    title: 'Account disabled', message: 'This account is disabled. Contact your workspace administrator.', action: 'sign-out',
  } as const
  if (error?.code === 'NO_ORGANIZATION') return {
    title: 'Workspace access required', message: 'This account has no active workspace. Contact your workspace administrator.', action: 'sign-out',
  } as const
  return {
    title: 'Could not open your workspace', message: 'We could not verify your access right now. Check your connection and try again.', action: 'retry',
  } as const
}
