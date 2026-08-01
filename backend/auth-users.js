import crypto from 'crypto';
import { randomUUID } from 'crypto';
import { performance } from 'node:perf_hooks';
import { query } from './db.js';
import { getSessionCookieOptions } from './config.js';

export const MEMBER_ROLES = ['owner', 'admin', 'grower', 'technician', 'viewer'];
const SESSION_TTL_DAYS = 30;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const sessionTouchAfter = new Map();
export const MAX_PASSWORD_LENGTH = 1024;

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    role: row.role,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    isPlatformAdmin: Boolean(row.is_platform_admin || row.is_super_admin),
    isSuperAdmin: Boolean(row.is_super_admin)
  };
}

export function verifyUserPassword(password, storedHash) {
  const value = String(password || '');
  if (value.length > MAX_PASSWORD_LENGTH) return false;
  const [salt, hash] = String(storedHash || '').split(':');
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(value, salt, 64).toString('hex');
  const expectedBuffer = Buffer.from(hash, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function hashUserPassword(password) {
  const value = String(password || '');
  if (value.length < 12) throw new Error('Password must be at least 12 characters');
  if (value.length > MAX_PASSWORD_LENGTH) throw new Error(`Password must be at most ${MAX_PASSWORD_LENGTH} characters`);
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(value, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function newSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function sessionCookieOptions() {
  return {
    ...getSessionCookieOptions(),
    maxAge: SESSION_TTL_DAYS * 24 * 3600 * 1000
  };
}

export function sessionCookieClearOptions() {
  return getSessionCookieOptions();
}

export async function findUserForLogin(email, execute = query) {
  const { rows } = await execute(
    `SELECT id, email, display_name, password_hash, is_active, is_platform_admin, is_super_admin
     FROM users
     WHERE lower(email)=lower($1)
     LIMIT 1`,
    [normalizeEmail(email)]
  );
  return rows[0] || null;
}

export async function getMemberships(userId, execute = query) {
  const { rows } = await execute(
    `SELECT m.organization_id, m.role, o.name AS organization_name
     FROM organization_memberships m
     JOIN organizations o ON o.id=m.organization_id
     WHERE m.user_id=$1 AND o.status='active'
     ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, o.created_at ASC`,
    [userId]
  );
  return rows;
}

export async function createUserSession(userId, organizationId, execute = query) {
  const token = newSessionToken();
  const { rows } = await execute(
    `INSERT INTO auth_sessions (id, user_id, organization_id, token_hash, expires_at, last_seen_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval, now())
     RETURNING expires_at`,
    [randomUUID(), userId, organizationId, hashSessionToken(token), String(SESSION_TTL_DAYS)]
  );
  return { token, expiresAt: rows[0].expires_at };
}

export async function revokeUserSession(token, execute = query) {
  if (!token) return;
  await execute(
    `UPDATE auth_sessions SET revoked_at=now()
     WHERE token_hash=$1 AND revoked_at IS NULL`,
    [hashSessionToken(token)]
  );
}

export async function getSessionUser(token) {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const { rows } = await query(
    `SELECT u.id, u.email, u.display_name, u.is_platform_admin, u.is_super_admin,
            m.role, m.organization_id, o.name AS organization_name, s.last_seen_at
     FROM auth_sessions s
     JOIN users u ON u.id=s.user_id
     JOIN organization_memberships m ON m.user_id=u.id AND m.organization_id=s.organization_id
     JOIN organizations o ON o.id=m.organization_id AND o.status='active'
     WHERE s.token_hash=$1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND u.is_active=true
     LIMIT 1`,
    [tokenHash]
  );
  const user = rows[0] || null;
  if (user && new Date(user.last_seen_at || 0).getTime() < Date.now() - SESSION_TOUCH_INTERVAL_MS
      && (sessionTouchAfter.get(tokenHash) || 0) <= Date.now()) {
    const now = Date.now();
    sessionTouchAfter.set(tokenHash, now + SESSION_TOUCH_INTERVAL_MS);
    if (sessionTouchAfter.size > 1_000) {
      for (const [cachedHash, touchAfter] of sessionTouchAfter) {
        if (touchAfter <= now) sessionTouchAfter.delete(cachedHash);
      }
    }
    void query(
      `UPDATE auth_sessions SET last_seen_at=now()
       WHERE token_hash=$1
         AND (last_seen_at IS NULL OR last_seen_at < now() - interval '5 minutes')`,
      [tokenHash]
    ).catch((error) => {
      sessionTouchAfter.delete(tokenHash);
      console.warn('[auth] session touch failed:', error?.message || error);
    });
  }
  return user;
}

export async function requireUserAuth(req, res, next) {
  const startedAt = performance.now();
  try {
    if (req.user) {
      if (!Number.isFinite(req.authDurationMs)) req.authDurationMs = performance.now() - startedAt;
      return next();
    }
    const user = await getSessionUser(req.cookies?.neurocrop_session);
    if (!user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Login required' } });
    }
    req.user = publicUser(user);
    req.authDurationMs = performance.now() - startedAt;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Insufficient permission' } });
    }
    next();
  };
}


export function requirePlatformAdmin(req, res, next) {
  if (!req.user?.isPlatformAdmin) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Platform administrator access required' } });
  }
  next();
}

export function requireSuperAdmin(req, res, next) {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Super administrator access required' } });
  }
  next();
}
