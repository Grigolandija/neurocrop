import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { clerkAuthEnabled, clerkAuthInternals, deleteClerkUserIdentity } from '../clerk-auth.js';

const teamRoutesSource = fs.readFileSync(new URL('../team-routes.js', import.meta.url), 'utf8');
const clerkAuthSource = fs.readFileSync(new URL('../clerk-auth.js', import.meta.url), 'utf8');

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

test('keeps gateway machine credentials out of Clerk authentication', () => {
  assert.equal(
    clerkAuthInternals.isGatewayMachineRequest({ path: '/gateway/heartbeat' }),
    true
  );
  assert.equal(
    clerkAuthInternals.isGatewayMachineRequest({ path: '/gateway/update/check' }),
    true
  );
  assert.equal(
    clerkAuthInternals.isGatewayMachineRequest({ path: '/gateway-factory/health' }),
    true
  );
  assert.equal(
    clerkAuthInternals.isGatewayMachineRequest({ path: '/node-factory/registrations' }),
    true
  );
  assert.equal(
    clerkAuthInternals.isGatewayMachineRequest({ path: '/node-factory/firmware/latest' }),
    true
  );
  assert.equal(
    clerkAuthInternals.isGatewayMachineRequest({ path: '/platform/gateways/example/update' }),
    false
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

test('deletes linked and exact-email Clerk identities without matching partial emails', async () => {
  const deleted = [];
  const createClient = ({ secretKey }) => {
    assert.equal(secretKey, 'secret');
    return {
      users: {
        getUserList: async ({ emailAddress, limit }) => {
          assert.deepEqual(emailAddress, ['owner@example.com']);
          assert.equal(limit, 10);
          return {
            data: [
              { id: 'clerk-exact', emailAddresses: [{ emailAddress: 'OWNER@example.com' }] },
              { id: 'clerk-partial', emailAddresses: [{ emailAddress: 'owner@example.com.invalid' }] }
            ]
          };
        },
        deleteUser: async (userId) => { deleted.push(userId); }
      }
    };
  };

  const result = await deleteClerkUserIdentity(
    { clerkUserId: 'clerk-linked', email: ' Owner@Example.com ' },
    { env: { CLERK_SECRET_KEY: 'secret' }, createClient }
  );

  assert.deepEqual(deleted, ['clerk-linked', 'clerk-exact']);
  assert.deepEqual(result, {
    configured: true,
    deletedUserIds: ['clerk-linked', 'clerk-exact']
  });
});

test('treats an already deleted Clerk identity as an idempotent cleanup', async () => {
  const result = await deleteClerkUserIdentity(
    { clerkUserId: 'clerk-missing', email: '' },
    {
      env: { CLERK_SECRET_KEY: 'secret' },
      createClient: () => ({
        users: {
          getUserList: async () => ({ data: [] }),
          deleteUser: async () => {
            const error = new Error('Not found');
            error.status = 404;
            throw error;
          }
        }
      })
    }
  );

  assert.deepEqual(result, { configured: true, deletedUserIds: [] });
});

test('allows legacy local-only users to be deleted when Clerk is not configured', async () => {
  assert.deepEqual(
    await deleteClerkUserIdentity({ clerkUserId: '', email: 'legacy@example.com' }, { env: {} }),
    { configured: false, deletedUserIds: [] }
  );
});

test('derives safe onboarding names for a new Clerk identity', () => {
  assert.equal(
    clerkAuthInternals.displayNameFromClerkUser(
      { firstName: ' Andrius ', lastName: ' Grigas ' },
      'agrigas@example.com'
    ),
    'Andrius Grigas'
  );
  assert.equal(
    clerkAuthInternals.displayNameFromClerkUser({}, 'new.grower@example.com'),
    'new.grower'
  );
  assert.equal(
    clerkAuthInternals.organizationNameFromClerkUser(
      { unsafeMetadata: { organizationName: '  Green Farm  ' } },
      'New grower'
    ),
    'Green Farm'
  );
  assert.equal(
    clerkAuthInternals.organizationNameFromClerkUser({}, 'New grower'),
    'New grower workspace'
  );
});

test('new Clerk workspaces receive the crop profile required to create sections', () => {
  const provisioningStart = clerkAuthSource.indexOf('WITH new_user AS');
  const provisioningEnd = clerkAuthSource.indexOf('if (provisioned.rows[0])');
  const provisioning = clerkAuthSource.slice(provisioningStart, provisioningEnd);

  assert.match(provisioning, /new_profile AS/);
  assert.match(provisioning, /INSERT INTO crop_profiles/);
  assert.match(provisioning, /'default', new_organization\.id/);
  assert.match(provisioning, /ON CONFLICT \(organization_id, id\) DO NOTHING/);
});

test('keeps invitation lookup public and reserves Clerk identity for acceptance', () => {
  assert.equal(
    clerkAuthInternals.isInvitationStatusRequest({
      method: 'GET',
      path: '/auth/invitations/invite-token'
    }),
    true
  );
  assert.equal(
    clerkAuthInternals.isInvitationAcceptanceRequest({
      method: 'POST',
      path: '/auth/accept-invite'
    }),
    true
  );
  assert.equal(
    clerkAuthInternals.isInvitationAcceptanceRequest({
      method: 'GET',
      path: '/auth/accept-invite'
    }),
    false
  );
});

test('Clerk invitation acceptance verifies email and selects the invited organization', () => {
  const routeStart = teamRoutesSource.indexOf("app.post('/auth/accept-invite'");
  const route = teamRoutesSource.slice(routeStart);
  assert.match(route, /!token \|\| \(req\.authProvider !== 'clerk' && !password\)/);
  assert.match(route, /req\.authProvider === 'clerk'/);
  assert.match(route, /INVITATION_EMAIL_MISMATCH/);
  assert.match(route, /INSERT INTO organization_memberships/);
  assert.match(route, /updateClerkSessionOrganization/);
  assert.ok(
    route.indexOf('updateClerkSessionOrganization') < route.indexOf("client.query('COMMIT')"),
    'The invited organization must be selected atomically before committing acceptance'
  );
});
