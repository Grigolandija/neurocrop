import assert from 'node:assert/strict';
import test from 'node:test';
import { clerkAuthEnabled, clerkAuthInternals } from '../clerk-auth.js';

test('extracts only a Bearer session token', () => {
  assert.equal(
    clerkAuthInternals.bearerToken({ headers: { authorization: 'Bearer session-token' } }),
    'session-token'
  );
  assert.equal(
    clerkAuthInternals.bearerToken({ headers: { authorization: 'Basic credentials' } }),
    ''
  );
});

test('accepts only a Clerk-verified email and prefers the primary address', () => {
  const user = {
    primaryEmailAddressId: 'primary',
    emailAddresses: [
      {
        id: 'secondary',
        emailAddress: 'second@example.com',
        verification: { status: 'verified' }
      },
      {
        id: 'primary',
        emailAddress: ' Owner@Example.com ',
        verification: { status: 'verified' }
      }
    ]
  };
  assert.equal(clerkAuthInternals.verifiedEmailFromClerkUser(user), 'owner@example.com');
  assert.equal(
    clerkAuthInternals.verifiedEmailFromClerkUser({
      primaryEmailAddressId: 'primary',
      emailAddresses: [
        {
          id: 'primary',
          emailAddress: 'unverified@example.com',
          verification: { status: 'unverified' }
        }
      ]
    }),
    ''
  );
});

test('reads Clerk configuration without exposing the secret', () => {
  assert.equal(clerkAuthEnabled({}), false);
  assert.equal(clerkAuthEnabled({ CLERK_SECRET_KEY: 'secret' }), true);
  assert.equal(clerkAuthInternals.clerkSecretKey({ CLERK_SECRET_KEY: ' secret ' }), 'secret');
  assert.deepEqual(
    clerkAuthInternals.configuredAuthorizedParties({
      CLERK_AUTHORIZED_PARTIES: 'https://neurocrop.lt, http://localhost:4173'
    }),
    ['https://neurocrop.lt', 'http://localhost:4173']
  );
});
