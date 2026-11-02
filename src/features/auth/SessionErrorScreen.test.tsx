import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SessionErrorScreen from '../../components/SessionErrorScreen'
import { ApiError } from '../../services/api/client'

test('expired session screen offers sign-in and retry without misleading email instructions', () => {
  const html = renderToStaticMarkup(<SessionErrorScreen reason={new ApiError('Expired', 401, 'INVALID_CLERK_SESSION')} onRetry={() => {}} onSignOut={async () => {}} />)
  expect(html).toContain('Please sign in again')
  expect(html).toContain('Sign in again</button>')
  expect(html).toContain('Try again</button>')
  expect(html).not.toContain('Account connection required')
  expect(html).not.toContain('same verified email')
})

test('temporary service failure offers retry without presenting internal details as an identity problem', () => {
  const html = renderToStaticMarkup(<SessionErrorScreen reason={new ApiError('Internal server detail', 503)} onRetry={() => {}} onSignOut={async () => {}} />)
  expect(html).toContain('Could not open your workspace')
  expect(html).toContain('Try again</button>')
  expect(html).not.toContain('Internal server detail')
  expect(html).not.toContain('Account connection required')
})

test('pending workspace approval retains its own message without a session retry', () => {
  const html = renderToStaticMarkup(<SessionErrorScreen reason={new ApiError('Pending', 403, 'ORGANIZATION_PENDING')} onRetry={() => {}} onSignOut={async () => {}} />)
  expect(html).toContain('Workspace request pending')
  expect(html).toContain('Sign out</button>')
  expect(html).not.toContain('Try again</button>')
})
