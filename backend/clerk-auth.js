import fs from 'fs';
import { randomBytes, randomUUID } from 'crypto';
import { performance } from 'node:perf_hooks';
import { createClerkClient, verifyToken } from '@clerk/express';
import { query } from './db.js';
import { getMemberships, hashUserPassword, normalizeEmail, publicUser } from './auth-users.js';

const SESSION_CONTEXT_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const sessionContextTouchAfter = new Map();

function bearerToken(req) {
  const authorization = String(req.headers?.authorization || '').trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function configuredAuthorizedParties(env = process.env) {
  return String(env.CLERK_AUTHORIZED_PARTIES || '')
    .split(',')
    .map((party) => party.trim())
    .filter(Boolean);
}

function clerkSecretKey(env = process.env) {
  const configured = String(env.CLERK_SECRET_KEY || '').trim();
  if (configured) return configured;
  const path = String(env.CLERK_SECRET_KEY_FILE || '/run/secrets/clerk_secret_key').trim();
  try {
    return fs.readFileSync(path, 'utf8').trim();
  } catch {
    return '';
  }
}

function isClerkNotFound(error) {
  const status = Number(error?.status || error?.statusCode);
  const codes = Array.isArray(error?.errors)
    ? error.errors.map((item) => String(item?.code || ''))
    : [];
  return status === 404 || codes.includes('resource_not_found');
}

function clerkUserHasEmail(clerkUser, email) {
  const normalized = normalizeEmail(email);
  return Array.isArray(clerkUser?.emailAddresses)
    && clerkUser.emailAddresses.some((address) => normalizeEmail(address?.emailAddress) === normalized);
}

export async function deleteClerkUserIdentity(
  { clerkUserId, email },
  { env = process.env, createClient = createClerkClient } = {}
) {
  const linkedUserId = String(clerkUserId || '').trim();
  const normalizedEmail = normalizeEmail(email);
  const secretKey = clerkSecretKey(env);

  if (!secretKey) {
    if (!linkedUserId) return { configured: false, deletedUserIds: [] };
    const error = new Error('Clerk is required to delete this linked user identity');
    error.code = 'CLERK_NOT_CONFIGURED';
    error.status = 503;
    throw error;
  }

  const clerk = createClient({ secretKey });
  const userIds = new Set(linkedUserId ? [linkedUserId] : []);

  if (normalizedEmail) {
    const listed = await clerk.users.getUserList({
      emailAddress: [normalizedEmail],
      limit: 10
    });
    for (const clerkUser of listed.data || []) {
      if (clerkUserHasEmail(clerkUser, normalizedEmail)) userIds.add(clerkUser.id);
    }
  }

  const deletedUserIds = [];
  for (const userId of userIds) {
    try {
      await clerk.users.deleteUser(userId);
      deletedUserIds.push(userId);
    } catch (error) {
      if (!isClerkNotFound(error)) throw error;
    }
  }

  return { configured: true, deletedUserIds };
}

function verifiedEmailFromClerkUser(clerkUser) {
  const addresses = Array.isArray(clerkUser?.emailAddresses) ? clerkUser.emailAddresses : [];
  const primary = addresses.find((address) => address.id === clerkUser.primaryEmailAddressId);
  const verifiedPrimary = primary?.verification?.status === 'verified' ? primary : null;
  const verifiedFallback = addresses.find((address) => address.verification?.status === 'verified');
  return normalizeEmail((verifiedPrimary || verifiedFallback)?.emailAddress);
}

function displayNameFromClerkUser(clerkUser, email) {
  const fullName = String(clerkUser?.fullName || '').trim().replace(/\s+/g, ' ');
  if (fullName) return fullName;
  const parts = [clerkUser?.firstName, clerkUser?.lastName]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return parts.join(' ') || String(email).split('@')[0] || 'NeuroCrop user';
}

function organizationNameFromClerkUser(clerkUser, displayName) {
  const configured = String(clerkUser?.unsafeMetadata?.organizationName || '')
    .trim()
    .replace(/\s+/g, ' ');
  return configured || `${displayName} workspace`;
}

function isInvitationStatusRequest(req) {
  return req.method === 'GET' && /^\/auth\/invitations\/[^/]+$/.test(String(req.path || ''));
}

function isInvitationAcceptanceRequest(req) {
  return req.method === 'POST' && String(req.path || '') === '/auth/accept-invite';
}

function isGatewayMachineRequest(req) {
  const path = String(req.path || '');
  return path.startsWith('/gateway/')
    || path.startsWith('/gateway-factory/')
    || path.startsWith('/node-factory/');
}

async function localUserForClerkIdentity(clerkUserId, secretKey, execute = query) {
  const linked = await execute(
    `SELECT id, email, display_name, is_active, is_platform_admin, is_super_admin
     FROM users
     WHERE clerk_user_id=$1
     LIMIT 1`,
    [clerkUserId]
  );
  if (linked.rows[0]) return linked.rows[0];

  const clerk = createClerkClient({ secretKey });
  const clerkUser = await clerk.users.getUser(clerkUserId);
  const verifiedEmail = verifiedEmailFromClerkUser(clerkUser);
  if (!verifiedEmail) {
    const error = new Error('A verified email address is required');
    error.code = 'CLERK_EMAIL_NOT_VERIFIED';
    error.status = 403;
    throw error;
  }

  const candidate = await execute(
    `SELECT id, email, display_name, is_active, is_platform_admin, is_super_admin, clerk_user_id
     FROM users
     WHERE lower(email)=lower($1)
     LIMIT 1`,
    [verifiedEmail]
  );
  const user = candidate.rows[0];
  if (!user) {
    const userId = randomUUID();
    const requestId = randomUUID();
    const displayName = displayNameFromClerkUser(clerkUser, verifiedEmail);
    const organizationName = organizationNameFromClerkUser(clerkUser, displayName);
    const unusableLegacyPassword = hashUserPassword(randomBytes(48).toString('base64url'));
    const provisioned = await execute(
      `WITH new_user AS (
         INSERT INTO users (
           id, email, display_name, password_hash, clerk_user_id,
           is_active, last_login_at, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, true, now(), now(), now())
         ON CONFLICT DO NOTHING
         RETURNING id, email, display_name, is_active, is_platform_admin, is_super_admin
       ), new_request AS (
         INSERT INTO organization_requests (
           id, user_id, organization_name, status, created_at, updated_at
         )
         SELECT $6, new_user.id, $7, 'pending', now(), now()
         FROM new_user
         RETURNING id
       )
       SELECT id, email, display_name, is_active, is_platform_admin, is_super_admin
       FROM new_user`,
      [
        userId,
        verifiedEmail,
        displayName,
        unusableLegacyPassword,
        clerkUserId,
        requestId,
        organizationName
      ]
    );
    if (provisioned.rows[0]) return provisioned.rows[0];

    const concurrent = await execute(
      `SELECT id, email, display_name, is_active, is_platform_admin, is_super_admin
       FROM users
       WHERE clerk_user_id=$1
       LIMIT 1`,
      [clerkUserId]
    );
    if (concurrent.rows[0]) return concurrent.rows[0];

    const error = new Error('This Clerk account could not be connected to a NeuroCrop workspace');
    error.code = 'ACCOUNT_LINK_CONFLICT';
    error.status = 409;
    throw error;
  }
  if (user.clerk_user_id && user.clerk_user_id !== clerkUserId) {
    const error = new Error('This NeuroCrop account is already linked to another identity');
    error.code = 'ACCOUNT_LINK_CONFLICT';
    error.status = 409;
    throw error;
  }

  const linkedUser = await execute(
    `UPDATE users
     SET clerk_user_id=$1, last_login_at=now(), updated_at=now()
     WHERE id=$2 AND (clerk_user_id IS NULL OR clerk_user_id=$1)
     RETURNING id, email, display_name, is_active, is_platform_admin, is_super_admin`,
    [clerkUserId, user.id]
  );
  if (!linkedUser.rows[0]) {
    const error = new Error('The NeuroCrop account could not be linked');
    error.code = 'ACCOUNT_LINK_CONFLICT';
    error.status = 409;
    throw error;
  }
  return linkedUser.rows[0];
}

async function selectedMembership(userId, sessionId, execute = query) {
  const memberships = await getMemberships(userId, execute);
  if (!memberships.length) return { membership: null, memberships };

  const context = await execute(
    `SELECT organization_id
     FROM clerk_session_contexts
     WHERE session_id=$1 AND user_id=$2
     LIMIT 1`,
    [sessionId, userId]
  );
  const selected = memberships.find(
    (membership) => membership.organization_id === context.rows[0]?.organization_id
  ) || memberships[0];

  await execute(
    `INSERT INTO clerk_session_contexts (session_id, user_id, organization_id, last_seen_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (session_id) DO UPDATE
       SET user_id=EXCLUDED.user_id,
           organization_id=EXCLUDED.organization_id,
           last_seen_at=CASE
             WHEN clerk_session_contexts.last_seen_at < now() - interval '5 minutes' THEN now()
             ELSE clerk_session_contexts.last_seen_at
           END`,
    [sessionId, userId, selected.organization_id]
  );
  return { membership: selected, memberships };
}

async function linkedClerkSessionUser(clerkUserId, sessionId, execute = query) {
  const { rows } = await execute(
    `SELECT u.id, u.email, u.display_name, u.is_active, u.is_platform_admin, u.is_super_admin,
            m.role, m.organization_id, o.name AS organization_name,
            c.organization_id AS context_organization_id,
            c.last_seen_at AS context_last_seen_at
     FROM users u
     JOIN organization_memberships m ON m.user_id=u.id
     JOIN organizations o ON o.id=m.organization_id AND o.status='active'
     LEFT JOIN clerk_session_contexts c ON c.session_id=$2 AND c.user_id=u.id
     WHERE u.clerk_user_id=$1
     ORDER BY CASE WHEN m.organization_id=c.organization_id THEN 0 ELSE 1 END,
              CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
              o.created_at ASC
     LIMIT 1`,
    [clerkUserId, sessionId]
  );
  return rows[0] || null;
}

function scheduleClerkSessionContextTouch(sessionId, user, execute = query) {
  const now = Date.now();
  const lastSeenAt = new Date(user.context_last_seen_at || 0).getTime();
  const contextMatches = user.context_organization_id === user.organization_id;
  if (contextMatches && lastSeenAt >= now - SESSION_CONTEXT_TOUCH_INTERVAL_MS) return;
  if ((sessionContextTouchAfter.get(sessionId) || 0) > now) return;
  sessionContextTouchAfter.set(sessionId, now + SESSION_CONTEXT_TOUCH_INTERVAL_MS);
  if (sessionContextTouchAfter.size > 1_000) {
    for (const [cachedSessionId, touchAfter] of sessionContextTouchAfter) {
      if (touchAfter <= now) sessionContextTouchAfter.delete(cachedSessionId);
    }
  }
  void execute(
    `INSERT INTO clerk_session_contexts (session_id, user_id, organization_id, last_seen_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (session_id) DO UPDATE
       SET user_id=EXCLUDED.user_id,
           organization_id=EXCLUDED.organization_id,
           last_seen_at=now()`,
    [sessionId, user.id, user.organization_id]
  ).catch((error) => {
    sessionContextTouchAfter.delete(sessionId);
    console.warn('[auth] Clerk session touch failed:', error?.message || error);
  });
}

export function clerkAuthEnabled(env = process.env) {
  return Boolean(clerkSecretKey(env));
}

export async function resolveOptionalClerkAuth(req, res, next) {
  // Gateway agents and factory tooling authenticate with their own opaque
  // Bearer credentials. Those tokens must reach the gateway route middleware
  // instead of being interpreted as Clerk user JWTs.
  if (isGatewayMachineRequest(req)) return next();

  const token = bearerToken(req);
  if (!token) return next();
  const startedAt = performance.now();

  const secretKey = clerkSecretKey();
  if (!secretKey) {
    return res.status(503).json({
      error: { code: 'CLERK_NOT_CONFIGURED', message: 'External authentication is not configured' }
    });
  }

  try {
    const authorizedParties = configuredAuthorizedParties();
    const payload = await verifyToken(token, {
      secretKey,
      ...(authorizedParties.length ? { authorizedParties } : {})
    });
    const clerkUserId = String(payload.sub || '').trim();
    const sessionId = String(payload.sid || '').trim();
    if (!clerkUserId || !sessionId) {
      return res.status(401).json({
        error: { code: 'INVALID_CLERK_SESSION', message: 'The Clerk session is incomplete' }
      });
    }

    if (isInvitationStatusRequest(req)) return next();

    if (isInvitationAcceptanceRequest(req)) {
      const clerk = createClerkClient({ secretKey });
      const clerkUser = await clerk.users.getUser(clerkUserId);
      const verifiedEmail = verifiedEmailFromClerkUser(clerkUser);
      if (!verifiedEmail) {
        return res.status(403).json({
          error: { code: 'CLERK_EMAIL_NOT_VERIFIED', message: 'A verified email address is required' }
        });
      }
      req.authProvider = 'clerk';
      req.clerkSessionId = sessionId;
      req.clerkUserId = clerkUserId;
      req.clerkVerifiedEmail = verifiedEmail;
      req.clerkDisplayName = displayNameFromClerkUser(clerkUser, verifiedEmail);
      return next();
    }

    let localUser = await linkedClerkSessionUser(clerkUserId, sessionId);
    let membership = localUser;
    if (!localUser) {
      localUser = await localUserForClerkIdentity(clerkUserId, secretKey);
      ({ membership } = await selectedMembership(localUser.id, sessionId));
    } else {
      scheduleClerkSessionContextTouch(sessionId, localUser);
    }
    if (!localUser.is_active) {
      return res.status(403).json({
        error: { code: 'ACCOUNT_DISABLED', message: 'This account is disabled' }
      });
    }
    if (!membership) {
      const { rows: requestRows } = await query(
        `SELECT status
         FROM organization_requests
         WHERE user_id=$1
         ORDER BY created_at DESC
         LIMIT 1`,
        [localUser.id]
      );
      if (requestRows[0]?.status === 'pending') {
        return res.status(403).json({
          error: { code: 'ORGANIZATION_PENDING', message: 'Your workspace request is awaiting administrator approval.' }
        });
      }
      if (requestRows[0]?.status === 'rejected') {
        return res.status(403).json({
          error: { code: 'ORGANIZATION_REJECTED', message: 'Your workspace request was not approved.' }
        });
      }
      return res.status(403).json({
        error: { code: 'NO_ORGANIZATION', message: 'This account has no active organization' }
      });
    }

    req.user = publicUser({ ...localUser, ...membership });
    req.authProvider = 'clerk';
    req.clerkSessionId = sessionId;
    req.clerkUserId = clerkUserId;
    req.authDurationMs = performance.now() - startedAt;
    next();
  } catch (error) {
    if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
      return res.status(Number(error.status)).json({
        error: { code: error.code || 'CLERK_AUTH_FAILED', message: error.message || 'Authentication failed' }
      });
    }
    console.warn('[auth] Clerk token rejected:', error?.message || error);
    return res.status(401).json({
      error: { code: 'INVALID_CLERK_SESSION', message: 'The Clerk session is invalid or expired' }
    });
  }
}

export async function updateClerkSessionOrganization(sessionId, userId, organizationId, execute = query) {
  if (!sessionId) throw new Error('Clerk session id is required');
  await execute(
    `INSERT INTO clerk_session_contexts (session_id, user_id, organization_id, last_seen_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (session_id) DO UPDATE
       SET user_id=EXCLUDED.user_id,
           organization_id=EXCLUDED.organization_id,
           last_seen_at=now()`,
    [sessionId, userId, organizationId]
  );
}

export const clerkAuthInternals = {
  bearerToken,
  clerkUserHasEmail,
  clerkSecretKey,
  configuredAuthorizedParties,
  displayNameFromClerkUser,
  isClerkNotFound,
  isGatewayMachineRequest,
  isInvitationAcceptanceRequest,
  isInvitationStatusRequest,
  linkedClerkSessionUser,
  organizationNameFromClerkUser,
  verifiedEmailFromClerkUser
};
