import { expect, test } from 'vitest'
import { ApiError } from '../../services/api/client'
import { sessionFailure } from './sessionFailure'

test('an expired session requests sign-in, never account linking or a different email', () => {
  const failure = sessionFailure(new ApiError('The Clerk session is invalid or expired', 401, 'INVALID_CLERK_SESSION'))
  expect(failure.action).toBe('sign-in')
  expect(failure.title).toBe('Please sign in again')
  expect(failure.message).not.toMatch(/email|connect/i)
})

test('network, server and refresh failures offer retry instead of account linking', () => {
  for (const reason of [new TypeError('Failed to fetch'), new ApiError('Offline', 503, 'AUTH_REFRESH_FAILED'), new ApiError('Unavailable', 500)]) {
    expect(sessionFailure(reason).action).toBe('retry')
  }
})

test('only an actual identity conflict asks for the existing verified email', () => {
  expect(sessionFailure(new ApiError('Conflict', 409, 'ACCOUNT_LINK_CONFLICT')).message).toMatch(/same verified email/)
  expect(sessionFailure(new ApiError('Disabled', 403, 'ACCOUNT_DISABLED')).title).toBe('Account disabled')
  expect(sessionFailure(new ApiError('Missing membership', 403, 'NO_ORGANIZATION')).title).toBe('Workspace access required')
})

test('approval state is selected by code instead of matching server wording', () => {
  expect(sessionFailure(new ApiError('Different server wording', 403, 'ORGANIZATION_PENDING')).title).toBe('Workspace request pending')
  expect(sessionFailure(new ApiError('Different server wording', 403, 'ORGANIZATION_REJECTED')).title).toBe('Workspace request declined')
})
