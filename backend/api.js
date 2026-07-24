import fs from 'fs';
import { randomUUID } from 'crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import { query, pool } from './db.js';
import { calcVPD, calcDewPoint, calcAbsoluteHumidity } from './calculations.js';
import { METRIC_MAP, METRIC_UNITS, METRIC_TO_COLUMN, METRIC_INTERVAL_SEC } from './metrics.js';
import {
  createUserSession,
  findUserForLogin,
  getMemberships,
  hashSessionToken,
  hashUserPassword,
  MAX_PASSWORD_LENGTH,
  publicUser,
  requireUserAuth as requireAuth,
  requireRole,
  revokeUserSession,
  sessionCookieClearOptions,
  sessionCookieOptions,
  verifyUserPassword
} from './auth-users.js';
import { registerTeamRoutes } from './team-routes.js';
import { registerPlatformOrganizationRoutes } from './organization-routes.js';
import { SCORE_MODEL_VERSION, buildCurrentMetricEvaluations, buildScoreFromMetricValues, buildScoreRules, buildSectionDashboardState, statusFromMeasurementTime } from './score.js';
import { getAllowedOrigins, getTrustProxyHops, publicError } from './config.js';
import { validateCropProfileMetrics } from './validation.js';
import { createMemoryRateLimiter } from './rate-limit.js';
import { runMigrations } from './migrate.js';
import { buildNodeHealth, expectedUplinkIntervalSec } from './node-health.js';
import { buildTodayActions, evaluateActionOutcome } from './today-actions.js';
import { normalizeTelemetryBoolean, normalizeTelemetryNumber } from './telemetry-values.js';
import { startMeasurementRetention } from './measurement-retention.js';

const app = express();
app.disable('x-powered-by');
const trustProxyHops = getTrustProxyHops();
if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);
app.use(express.json());
app.use(cookieParser());
const PORT = parseInt(process.env.API_PORT || '3000', 10);
const HOST = '0.0.0.0';
const ALLOWED_ORIGINS = getAllowedOrigins();
const authLimiter = createMemoryRateLimiter({
  limit: Number(process.env.AUTH_LOGIN_RATE_LIMIT || 8),
  windowMs: 15 * 60 * 1000
});
const authIpLimiter = createMemoryRateLimiter({
  limit: Number(process.env.AUTH_LOGIN_IP_RATE_LIMIT || 40),
  windowMs: 15 * 60 * 1000
});
const dummyLoginPasswordHash = hashUserPassword(randomUUID());

function authAttemptKey(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return `${String(req.ip || 'unknown')}|${email}`;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const originAllowed = !origin || ALLOWED_ORIGINS.includes(origin);
  res.vary('Origin');
  if (originAllowed && origin) res.header('Access-Control-Allow-Origin', origin);
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  if (!originAllowed && !['GET', 'HEAD'].includes(req.method)) {
    return res.status(403).json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Request origin is not allowed' } });
  }
  next();
});

// Keep operational details in server logs, never in 5xx API responses.
app.use((req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500 && body?.error) {
      return sendJson({ error: { code: body.error.code || 'INTERNAL_ERROR', message: 'Internal server error' } });
    }
    return sendJson(body);
  };
  next();
});

registerTeamRoutes(app);
registerPlatformOrganizationRoutes(app);

function getOrganizationId(req) {
  if (!req.user?.organizationId) throw new Error('Authenticated organization is missing');
  return req.user.organizationId;
}

function sendInternalError(res, code = 'INTERNAL_ERROR') {
  return res.status(500).json({ error: { code, message: 'Internal server error' } });
}

app.post('/auth/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const attemptKey = authAttemptKey(req);
    const ipAttemptKey = String(req.ip || 'unknown');
    if (authLimiter.isLimited(attemptKey) || authIpLimiter.isLimited(ipAttemptKey)) {
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' } });
    }
    const account = await findUserForLogin(email);
    const passwordValid = verifyUserPassword(password, account?.password_hash || dummyLoginPasswordHash);

    if (!account || !account.is_active || !passwordValid) {
      authLimiter.record(attemptKey);
      authIpLimiter.record(ipAttemptKey);
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Wrong email or password' } });
    }

    const memberships = await getMemberships(account.id);
    if (!memberships[0]) {
      return res.status(403).json({ error: { code: 'NO_ORGANIZATION', message: 'This account has no active organization' } });
    }

    const membership = memberships[0];
    const session = await createUserSession(account.id, membership.organization_id);
    authLimiter.reset(attemptKey);
    await query('UPDATE users SET last_login_at=now(), updated_at=now() WHERE id=$1', [account.id]);

    res.cookie('neurocrop_session', session.token, sessionCookieOptions());
    res.json({
      user: publicUser({ ...account, ...membership }),
      organizations: memberships.map((item) => ({
        id: item.organization_id,
        name: item.organization_name,
        role: item.role
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.post('/auth/logout', async (req, res, next) => {
  try {
    await revokeUserSession(req.cookies?.neurocrop_session);
    res.clearCookie('neurocrop_session', sessionCookieClearOptions());
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

app.get('/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

app.post('/auth/change-password', requireAuth, async (req, res, next) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Current and new passwords are required' } });
  }
  if (newPassword.length < 12) {
    return res.status(400).json({ error: { code: 'WEAK_PASSWORD', message: 'New password must be at least 12 characters' } });
  }
  if (newPassword.length > MAX_PASSWORD_LENGTH || currentPassword.length > MAX_PASSWORD_LENGTH) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Passwords must be at most ${MAX_PASSWORD_LENGTH} characters` } });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT password_hash FROM users WHERE id=$1 AND is_active=true FOR UPDATE',
      [req.user.id]
    );
    const account = rows[0];
    if (!account) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Account not found' } });
    }
    if (!verifyUserPassword(currentPassword, account.password_hash)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: { code: 'CURRENT_PASSWORD_INVALID', message: 'Current password is incorrect' } });
    }
    if (verifyUserPassword(newPassword, account.password_hash)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: { code: 'PASSWORD_UNCHANGED', message: 'New password must be different from the current password' } });
    }

    await client.query(
      'UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2',
      [hashUserPassword(newPassword), req.user.id]
    );
    await client.query(
      `UPDATE auth_sessions SET revoked_at=now()
       WHERE user_id=$1 AND token_hash<>$2 AND revoked_at IS NULL`,
      [req.user.id, hashSessionToken(req.cookies.neurocrop_session)]
    );
    await client.query('COMMIT');
    res.json({ changed: true, otherSessionsRevoked: true });
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    next(error);
  } finally {
    client?.release();
  }
});

app.get('/auth/sessions', requireAuth, async (req, res, next) => {
  try {
    const currentTokenHash = hashSessionToken(req.cookies?.neurocrop_session || '');
    const { rows } = await query(
      `SELECT id, organization_id, created_at, last_seen_at, expires_at, token_hash=$2 AS is_current
       FROM auth_sessions
       WHERE user_id=$1 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY is_current DESC, last_seen_at DESC NULLS LAST, created_at DESC`,
      [req.user.id, currentTokenHash]
    );
    res.json({ sessions: rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
      current: row.is_current
    })) });
  } catch (error) {
    next(error);
  }
});

app.delete('/auth/sessions/:sessionId', requireAuth, async (req, res, next) => {
  try {
    const currentTokenHash = hashSessionToken(req.cookies?.neurocrop_session || '');
    const { rows } = await query(
      `UPDATE auth_sessions SET revoked_at=now()
       WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND token_hash<>$3
       RETURNING id`,
      [req.params.sessionId, req.user.id, currentTokenHash]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Revocable session not found' } });
    }
    res.sendStatus(204);
  } catch (error) {
    next(error);
  }
});

async function latestForNode(devEui) {
  const { rows } = await query(`SELECT * FROM measurements WHERE dev_eui=$1 ORDER BY time DESC LIMIT 1`, [devEui]);
  return rows[0] || null;
}

function readSecretFile(path) {
  try {
    return fs.readFileSync(path, 'utf8').trim();
  } catch {
    return '';
  }
}

function chirpstackConfig() {
  return {
    apiUrl: process.env.CHIRPSTACK_API_URL || 'http://chirpstack-rest-api:8090/api',
    token: process.env.CHIRPSTACK_API_TOKEN || readSecretFile('/run/secrets/chirpstack_api_token'),
    applicationId: process.env.CHIRPSTACK_APPLICATION_ID || readSecretFile('/run/secrets/chirpstack_application_id'),
    deviceProfileId: process.env.CHIRPSTACK_DEVICE_PROFILE_ID || readSecretFile('/run/secrets/chirpstack_device_profile_id'),
  };
}

async function chirpstackRequest(path, options = {}) {
  const cfg = chirpstackConfig();
  if (!cfg.token) throw new Error('CHIRPSTACK_API_TOKEN is not configured');

  const response = await fetch(`${cfg.apiUrl}${path}`, {
    ...options,
    signal: options.signal || AbortSignal.timeout(10_000),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.token}`,
      ...(options.headers || {}),
    },
  });

  const body = await response.text();
  if (!response.ok) {
    const err = new Error(body || `ChirpStack API failed with ${response.status}`);
    err.status = response.status;
    err.body = body;
    throw err;
  }

  if (!body) return null;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

async function getChirpStackDevice(devEui) {
  try {
    return await chirpstackRequest(`/devices/${devEui}`);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function createChirpStackDevice({ devEui, name }) {
  const cfg = chirpstackConfig();
  if (!cfg.applicationId || !cfg.deviceProfileId) {
    throw new Error('ChirpStack applicationId or deviceProfileId is not configured');
  }

  const existing = await getChirpStackDevice(devEui);
  if (existing) return { device: existing, created: false };

  try {
    const device = await chirpstackRequest('/devices', {
      method: 'POST',
      body: JSON.stringify({
        device: {
          applicationId: cfg.applicationId,
          deviceProfileId: cfg.deviceProfileId,
          devEui,
          name,
          description: '',
          isDisabled: false,
          skipFcntCheck: false,
          tags: {},
          variables: {},
        },
      }),
    });
    return { device, created: true };
  } catch (e) {
    const body = String(e.body || e.message || '').toLowerCase();
    if (e.status === 409 || body.includes('already exists') || body.includes('duplicate')) {
      return { device: await getChirpStackDevice(devEui), created: false };
    }
    throw e;
  }
}

async function getChirpStackDeviceKeys(devEui) {
  try {
    return await chirpstackRequest(`/devices/${devEui}/keys`);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

function normalizeOtaaKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^0-9a-f]/g, '');
}

function getDefaultOtaaKeys() {
  const appKey = normalizeOtaaKey(
    process.env.DEFAULT_OTAA_APP_KEY || readSecretFile('/run/secrets/default_otaa_app_key')
  );

  if (!/^[0-9a-f]{32}$/.test(appKey)) {
    throw new Error('DEFAULT_OTAA_APP_KEY is not configured');
  }

  return {
    nwkKey: appKey,
    appKey,
    genAppKey: '00000000000000000000000000000000',
  };
}

async function ensureChirpStackDeviceKeys(devEui) {
  const existing = await getChirpStackDeviceKeys(devEui);
  if (existing?.deviceKeys) return existing;

  const keys = getDefaultOtaaKeys();
  return chirpstackRequest(`/devices/${devEui}/keys`, {
    method: 'POST',
    body: JSON.stringify({
      deviceKeys: {
        devEui,
        ...keys,
      },
    }),
  });
}

async function deleteChirpStackDevice(devEui) {
  try {
    return await chirpstackRequest(`/devices/${devEui}`, { method: 'DELETE' });
  } catch (e) {
    const body = String(e.body || e.message || '').toLowerCase();
    if (e.status === 404 || body.includes('not found') || body.includes('does not exist')) {
      return null;
    }
    throw e;
  }
}

app.locals.deleteChirpStackDevice = deleteChirpStackDevice;

function normalizeDevEui(devEui) {
  return String(devEui || '').trim().toLowerCase().replace(/[^0-9a-f]/g, '');
}

function createEntityId(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

async function getSectionById(sectionId, organizationId) {
  const { rows } = await query(
    `SELECT s.id, s.organization_id, s.area_id, s.name, s.crop_profile, a.name AS area_name
     FROM sections s
     LEFT JOIN areas a ON a.id=s.area_id
     WHERE s.id=$1 AND s.organization_id=$2`,
    [sectionId, organizationId]
  );
  return rows[0] || null;
}

async function getSectionDevEuis(sectionId, organizationId, { includeArchived = false } = {}) {
  const { rows } = await query(
    `SELECT dev_eui FROM nodes
     WHERE organization_id=$1 AND section_id=$2
       ${includeArchived ? '' : 'AND archived_at IS NULL'}
     ORDER BY created_at ASC`,
    [organizationId, sectionId]
  );
  return rows.map((row) => normalizeDevEui(row.dev_eui)).filter(Boolean);
}

async function cropProfileExists(profileId, organizationId) {
  const { rows } = await query(
    `SELECT 1 FROM crop_profiles WHERE id=$1 AND organization_id=$2`,
    [profileId, organizationId]
  );
  return Boolean(rows[0]);
}


app.get('/crop-profiles', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, hero_name, stage, hint, requires_review, metrics, created_at, updated_at
       FROM crop_profiles
       WHERE organization_id=$1
       ORDER BY created_at ASC`,
      [getOrganizationId(req)]
    );

    res.json({
      profiles: rows.map((row) => ({
        id: row.id,
        name: row.name,
        heroName: row.hero_name,
        stage: row.stage || '',
        hint: row.hint || '',
        requiresReview: Boolean(row.requires_review),
        metrics: row.metrics || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    });
  } catch (e) {
    console.error('[api] /crop-profiles GET:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});


app.post('/crop-profiles', requireAuth, requireRole('owner', 'admin', 'grower'), async (req, res) => {
  try {
    const body = req.body || {};
    const id = String(body.id || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const heroName = String(body.heroName || '').trim();
    const stage = String(body.stage || '').trim();
    const hint = String(body.hint || '').trim();
    const requiresReview = Boolean(body.requiresReview);
    const metrics = body.metrics && typeof body.metrics === 'object' ? body.metrics : {};

    if (!id) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Profile id is required' } });
    }

    if (!/^[a-z0-9-]+$/.test(id)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Profile id must contain only lowercase letters, numbers, and hyphens' } });
    }
    if (id === 'default' && name !== 'Default') {
      return res.status(400).json({ error: { code: 'DEFAULT_PROFILE_NAME_PROTECTED', message: 'The Default crop profile must use the name Default' } });
    }

    if (!name || !heroName) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Profile name and heroName are required' } });
    }
    const metricsError = validateCropProfileMetrics(metrics);
    if (metricsError) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: metricsError } });
    }

    const { rows } = await query(
      `INSERT INTO crop_profiles (
         id, organization_id, name, hero_name, stage, hint, requires_review, metrics, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now(), now())
       RETURNING id, name, hero_name, stage, hint, requires_review, metrics, created_at, updated_at`,
      [id, getOrganizationId(req), name, heroName, stage, hint, requiresReview, JSON.stringify(metrics)]
    );

    const row = rows[0];
    res.status(201).json({
      profile: {
        id: row.id,
        name: row.name,
        heroName: row.hero_name,
        stage: row.stage || '',
        hint: row.hint || '',
        requiresReview: Boolean(row.requires_review),
        metrics: row.metrics || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (e) {
    console.error('[api] /crop-profiles POST:', e.message);
    if (e.code === '23505') {
      return res.status(409).json({ error: { code: 'PROFILE_EXISTS', message: 'A crop profile with this id already exists' } });
    }
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});


app.patch('/crop-profiles/:id', requireAuth, requireRole('owner', 'admin', 'grower'), async (req, res) => {
  try {
    const profileId = String(req.params.id || '').trim().toLowerCase();
    const body = req.body || {};
    const name = body.name === undefined ? null : String(body.name || '').trim();
    const heroName = body.heroName === undefined ? null : String(body.heroName || '').trim();
    const stage = body.stage === undefined ? null : String(body.stage || '').trim();
    const hint = body.hint === undefined ? null : String(body.hint || '').trim();
    const requiresReview = body.requiresReview === undefined ? null : Boolean(body.requiresReview);
    const metrics = body.metrics === undefined ? null : body.metrics;

    if (!profileId) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Profile id is required' } });
    }
    if (profileId === 'default' && name !== null && name !== 'Default') {
      return res.status(400).json({ error: { code: 'DEFAULT_PROFILE_NAME_PROTECTED', message: 'The Default crop profile name cannot be changed' } });
    }

    if (name === '' || heroName === '') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Profile name and heroName cannot be empty' } });
    }
    if (metrics !== null) {
      const metricsError = validateCropProfileMetrics(metrics);
      if (metricsError) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: metricsError } });
      }
    }

    const { rows } = await query(
      `UPDATE crop_profiles
       SET name=COALESCE($3, name),
           hero_name=COALESCE($4, hero_name),
           stage=COALESCE($5, stage),
           hint=COALESCE($6, hint),
           requires_review=COALESCE($7, requires_review),
           metrics=CASE WHEN $8::jsonb IS NULL THEN metrics ELSE metrics || $8::jsonb END,
           updated_at=now()
       WHERE organization_id=$1 AND id=$2
       RETURNING id, name, hero_name, stage, hint, requires_review, metrics, created_at, updated_at`,
      [getOrganizationId(req), profileId, name, heroName, stage, hint, requiresReview, metrics === null ? null : JSON.stringify(metrics)]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Crop profile not found' } });
    }

    const row = rows[0];
    res.json({
      profile: {
        id: row.id,
        name: row.name,
        heroName: row.hero_name,
        stage: row.stage || '',
        hint: row.hint || '',
        requiresReview: Boolean(row.requires_review),
        metrics: row.metrics || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (e) {
    console.error('[api] /crop-profiles PATCH:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});


app.post('/crop-profiles/:id/duplicate', requireAuth, requireRole('owner', 'admin', 'grower'), async (req, res) => {
  try {
    const sourceId = String(req.params.id || '').trim().toLowerCase();
    const newId = String(req.body?.id || '').trim().toLowerCase();
    const newName = String(req.body?.name || '').trim();

    if (!sourceId || !newId || !newName) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Source id, new id, and new name are required' } });
    }

    if (!/^[a-z0-9-]+$/.test(newId)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'New profile id must contain only lowercase letters, numbers, and hyphens' } });
    }

    const { rows: sourceRows } = await query(
      `SELECT id, hero_name, stage, hint, requires_review, metrics
       FROM crop_profiles
       WHERE organization_id=$1 AND id=$2
       LIMIT 1`,
      [getOrganizationId(req), sourceId]
    );

    const source = sourceRows[0];
    if (!source) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Source crop profile not found' } });
    }

    const { rows } = await query(
      `INSERT INTO crop_profiles (
         id, organization_id, name, hero_name, stage, hint, requires_review, metrics, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now(), now())
       RETURNING id, name, hero_name, stage, hint, requires_review, metrics, created_at, updated_at`,
      [
        newId,
        getOrganizationId(req),
        newName,
        source.hero_name,
        source.stage || '',
        source.hint || '',
        Boolean(source.requires_review),
        JSON.stringify(source.metrics || {})
      ]
    );

    const row = rows[0];
    res.status(201).json({
      profile: {
        id: row.id,
        name: row.name,
        heroName: row.hero_name,
        stage: row.stage || '',
        hint: row.hint || '',
        requiresReview: Boolean(row.requires_review),
        metrics: row.metrics || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (e) {
    console.error('[api] /crop-profiles duplicate:', e.message);
    if (e.code === '23505') {
      return res.status(409).json({ error: { code: 'PROFILE_EXISTS', message: 'A crop profile with this id already exists' } });
    }
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});


app.delete('/crop-profiles/:id', requireAuth, requireRole('owner', 'admin', 'grower'), async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const profileId = String(req.params.id || '').trim().toLowerCase();
    const replacementProfileId = String(req.body?.replacementProfileId || '').trim().toLowerCase();
    const organizationId = getOrganizationId(req);

    if (!profileId) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Profile id is required' } });
    }
    if (profileId === 'default') {
      return res.status(409).json({ error: { code: 'DEFAULT_PROFILE_PROTECTED', message: 'The Default crop profile cannot be deleted' } });
    }
    if (replacementProfileId === profileId) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Replacement profile must be different from the deleted profile' } });
    }

    await client.query('BEGIN');
    const sourceResult = await client.query(
      `SELECT id, name, hero_name, stage, hint, requires_review, metrics, created_at, updated_at
       FROM crop_profiles
       WHERE organization_id=$1 AND id=$2
       FOR UPDATE`,
      [organizationId, profileId]
    );
    if (!sourceResult.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Crop profile not found' } });
    }

    const assignedSections = await client.query(
      `SELECT id FROM sections
       WHERE organization_id=$1 AND crop_profile=$2
       FOR UPDATE`,
      [organizationId, profileId]
    );
    const assignedSectionCount = assignedSections.rowCount || 0;

    if (assignedSectionCount > 0 && !replacementProfileId) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: {
          code: 'PROFILE_REPLACEMENT_REQUIRED',
          message: 'Choose a replacement crop profile for the assigned sections',
          assignedSectionCount
        }
      });
    }

    if (replacementProfileId) {
      const replacementResult = await client.query(
        `SELECT 1 FROM crop_profiles
         WHERE organization_id=$1 AND id=$2
         FOR UPDATE`,
        [organizationId, replacementProfileId]
      );
      if (!replacementResult.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: { code: 'INVALID_REPLACEMENT_PROFILE', message: 'Replacement crop profile was not found in this organization' } });
      }
      if (assignedSectionCount > 0) {
        await client.query(
          `UPDATE sections SET crop_profile=$3
           WHERE organization_id=$1 AND crop_profile=$2`,
          [organizationId, profileId, replacementProfileId]
        );
      }
    }

    const { rows } = await client.query(
      `DELETE FROM crop_profiles
       WHERE organization_id=$1 AND id=$2
       RETURNING id, name, hero_name, stage, hint, requires_review, metrics, created_at, updated_at`,
      [organizationId, profileId]
    );
    await client.query('COMMIT');

    const row = rows[0];
    res.json({
      deleted: true,
      reassignedSections: assignedSectionCount,
      replacementProfileId: replacementProfileId || null,
      profile: {
        id: row.id,
        name: row.name,
        heroName: row.hero_name,
        stage: row.stage || '',
        hint: row.hint || '',
        requiresReview: Boolean(row.requires_review),
        metrics: row.metrics || {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (e) {
    await client?.query('ROLLBACK').catch(() => {});
    console.error('[api] /crop-profiles DELETE:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  } finally {
    client?.release();
  }
});

app.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const organizationId = getOrganizationId(req);
    const [areasResult, sectionsResult, nodesResult, profilesResult, measurementsResult] = await Promise.all([
      query(`SELECT id, name FROM areas WHERE organization_id=$1 ORDER BY created_at ASC`, [organizationId]),
      query(
        `SELECT id, area_id, name, crop_profile FROM sections
         WHERE organization_id=$1 ORDER BY created_at ASC`,
        [organizationId]
      ),
      query(
        `SELECT dev_eui, section_id, name, node_type, created_at, last_seen,
                last_received_at, last_battery_mv, last_battery_percent,
                last_firmware_version, last_profile, last_rssi, last_snr,
                last_spreading_factor, last_sensor_presence,
                last_error_flags, last_error_counters
         FROM nodes WHERE organization_id=$1 AND archived_at IS NULL ORDER BY created_at ASC`,
        [organizationId]
      ),
      query(`SELECT id, metrics FROM crop_profiles WHERE organization_id=$1`, [organizationId]),
      query(
        `SELECT DISTINCT ON (m.dev_eui) m.*
         FROM measurements m
         JOIN nodes n ON n.dev_eui=m.dev_eui
         WHERE n.organization_id=$1 AND n.archived_at IS NULL
         ORDER BY m.dev_eui, m.time DESC`,
        [organizationId]
      )
    ]);

    const sectionsByArea = new Map();
    for (const section of sectionsResult.rows) {
      if (!section.area_id) continue;
      if (!sectionsByArea.has(section.area_id)) sectionsByArea.set(section.area_id, []);
      sectionsByArea.get(section.area_id).push(section);
    }
    const nodesBySection = new Map();
    for (const node of nodesResult.rows) {
      if (!node.section_id) continue;
      if (!nodesBySection.has(node.section_id)) nodesBySection.set(node.section_id, []);
      nodesBySection.get(node.section_id).push(node);
    }
    const metricsByProfile = new Map(profilesResult.rows.map((row) => [row.id, row.metrics || {}]));
    const latestByDevEui = new Map(
      measurementsResult.rows.map((row) => [normalizeDevEui(row.dev_eui), row])
    );

    const sites = areasResult.rows.map((area) => {
      const zones = (sectionsByArea.get(area.id) || []).map((section) => {
        const nodeRows = nodesBySection.get(section.id) || [];
        const latestMeasurements = nodeRows.map((node) => latestByDevEui.get(normalizeDevEui(node.dev_eui)) || null);
        const batteryNodes = nodeRows.map((node, index) => {
          const devEui = normalizeDevEui(node.dev_eui);
          const m = latestMeasurements[index];
          const lastSeen = node.last_received_at || node.last_seen || m?.time || null;
          const profile = node.last_profile || m?.profile || null;
          const transportStatus = statusFromMeasurementTime(lastSeen, Date.now(), expectedUplinkIntervalSec(profile));
          return {
            id: node.name || devEui,
            name: node.name || devEui,
            devEui,
            level: node.last_battery_percent ?? m?.battery_percent ?? null,
            active: transportStatus !== 'offline',
            lastSeen,
            batteryMv: node.last_battery_mv ?? m?.battery_mv ?? null,
            firmwareVersion: node.last_firmware_version || m?.raw_object?.firmware_version || null,
            profile,
            rssi: node.last_rssi ?? m?.rssi ?? null,
            snr: node.last_snr ?? m?.snr ?? null,
            spreadingFactor: node.last_spreading_factor ?? m?.spreading_factor ?? null,
            sensorPresence: node.last_sensor_presence || null,
            errorFlags: node.last_error_flags || null,
            errorCounters: node.last_error_counters || null,
            health: buildNodeHealth({
              transportStatus,
              errorFlags: node.last_error_flags,
              errorCounters: node.last_error_counters
            })
          };
        });
        const profileMetrics = metricsByProfile.get(section.crop_profile) || {};
        const sectionState = buildSectionDashboardState(nodeRows, latestMeasurements, profileMetrics);
        return {
          id: section.id,
          name: section.name,
          profile: section.crop_profile || 'tomatoes-vegetative',
          score: sectionState.score,
          conditionStatus: sectionState.conditionStatus,
          mainDriver: sectionState.mainDriver,
          scoreGroups: sectionState.scoreGroups,
          scoreModelVersion: sectionState.scoreModelVersion,
          coverage: sectionState.coverage,
          nodeSummary: sectionState.nodeSummary,
          computedAt: sectionState.computedAt,
          sensorCount: nodeRows.length,
          batteryNodes,
          availableMetrics: sectionState.availableMetrics,
          configuredMetrics: sectionState.configuredMetrics
        };
      });
      return { id: area.id, name: area.name, zones };
    });

    res.json({ sites });
  } catch (e) {
    console.error('[api] /dashboard:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

app.get('/areas', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.id, a.name, a.created_at,
        COUNT(DISTINCT s.id)::int AS sections,
        COUNT(DISTINCT n.dev_eui)::int AS nodes
       FROM areas a
       LEFT JOIN sections s ON s.area_id=a.id
       LEFT JOIN nodes n ON n.area_id=a.id AND n.archived_at IS NULL
       WHERE a.organization_id=$1
       GROUP BY a.id
       ORDER BY a.created_at ASC`,
      [getOrganizationId(req)]
    );
    res.json({ areas: rows });
  } catch (e) {
    console.error('[api] /areas:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

app.post('/areas', requireAuth, requireRole('owner', 'admin', 'grower'), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Area name is required' } });

  try {
    const id = createEntityId('area');
    const { rows } = await query(
      `INSERT INTO areas (id, organization_id, name)
       VALUES ($1, $2, $3)
       RETURNING id, organization_id, name, created_at`,
      [id, getOrganizationId(req), name]
    );
    res.status(201).json({ area: rows[0] });
  } catch (e) {
    console.error('[api] POST /areas:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

app.patch('/areas/:areaId', requireAuth, requireRole('owner', 'admin', 'grower'), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Area name is required' } });

  try {
    const { rows } = await query(
      `UPDATE areas SET name=$1
       WHERE id=$2 AND organization_id=$3
       RETURNING id, organization_id, name, created_at`,
      [name, req.params.areaId, getOrganizationId(req)]
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Area not found' } });
    res.json({ area: rows[0] });
  } catch (e) {
    console.error('[api] PATCH /areas/:areaId:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

app.delete('/areas/:areaId', requireAuth, requireRole('owner', 'admin', 'grower'), async (req, res) => {
  const organizationId = getOrganizationId(req);
  const keepSections = String(req.query.keepSections || '').toLowerCase() === 'true';
  let client;

  try {
    client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: areaRows } = await client.query(
      `SELECT id, name FROM areas WHERE id=$1 AND organization_id=$2`,
      [req.params.areaId, organizationId]
      );
      if (!areaRows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Area not found' } });
      }

      const { rows: childRows } = await client.query(
      `SELECT COUNT(*)::int AS count FROM sections WHERE organization_id=$1 AND area_id=$2`,
      [organizationId, req.params.areaId]
      );
      const sectionCount = childRows[0]?.count || 0;

      if (keepSections) {
        await client.query(
        `UPDATE nodes
         SET area_id=NULL
         WHERE organization_id=$1 AND archived_at IS NULL
           AND section_id IN (
             SELECT id FROM sections WHERE organization_id=$1 AND area_id=$2
           )`,
        [organizationId, req.params.areaId]
        );
        await client.query(
        `UPDATE sections SET area_id=NULL WHERE organization_id=$1 AND area_id=$2`,
        [organizationId, req.params.areaId]
        );
      } else {
        await client.query(
        `DELETE FROM sections WHERE organization_id=$1 AND area_id=$2`,
        [organizationId, req.params.areaId]
        );
      }

      const { rows } = await client.query(
      `DELETE FROM areas WHERE id=$1 AND organization_id=$2 RETURNING id, name`,
      [req.params.areaId, organizationId]
      );
      await client.query('COMMIT');
      res.json({
        deleted: Boolean(rows[0]),
        area: rows[0] || null,
        sections: { affected: sectionCount, keptUnassigned: keepSections }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client?.release();
    }
  } catch (e) {
    console.error('[api] DELETE /areas/:areaId:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

app.get('/sections', requireAuth, async (req, res) => {
  try {
    const params = [getOrganizationId(req)];
    let where = 's.organization_id=$1';
    if (req.query.areaId) {
      params.push(String(req.query.areaId));
      where += ` AND s.area_id=$${params.length}`;
    }

    const { rows } = await query(
      `SELECT s.id, s.name, s.area_id, a.name AS area_name, s.crop_profile, s.created_at,
        COUNT(n.dev_eui)::int AS nodes
       FROM sections s
       LEFT JOIN areas a ON a.id=s.area_id AND a.organization_id=s.organization_id
       LEFT JOIN nodes n ON n.section_id=s.id AND n.organization_id=s.organization_id AND n.archived_at IS NULL
       WHERE ${where}
       GROUP BY s.id, a.name
       ORDER BY s.created_at ASC`,
      params
    );
    res.json({ sections: rows });
  } catch (e) {
    console.error('[api] /sections:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

app.post('/sections', requireAuth, requireRole('owner', 'admin', 'grower'), async (req, res) => {
  const areaId = String(req.body?.areaId || '').trim();
  const name = String(req.body?.name || '').trim();
  const cropProfile = String(req.body?.cropProfile || 'default').trim();

  if (!areaId || !name) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Area and section name are required' } });

  try {
    const { rows: areaRows } = await query(
      `SELECT id FROM areas WHERE id=$1 AND organization_id=$2`,
      [areaId, getOrganizationId(req)]
    );
    if (!areaRows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Area not found' } });
    if (!await cropProfileExists(cropProfile, getOrganizationId(req))) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Unknown crop profile' } });
    }

    const id = createEntityId('section');
    const { rows } = await query(
      `INSERT INTO sections (id, organization_id, area_id, name, crop_profile)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, organization_id, area_id, name, crop_profile, created_at`,
      [id, getOrganizationId(req), areaId, name, cropProfile]
    );
    res.status(201).json({ section: rows[0] });
  } catch (e) {
    console.error('[api] POST /sections:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

app.patch('/sections/:sectionId', requireAuth, requireRole('owner', 'admin', 'grower'), async (req, res) => {
  const areaId = String(req.body?.areaId || '').trim();
  const name = String(req.body?.name || '').trim();
  const cropProfile = String(req.body?.cropProfile || req.body?.profile || '').trim();

  if (!areaId || !name) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Area and section name are required' } });

  const organizationId = getOrganizationId(req);
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows: areaRows } = await client.query(
      `SELECT id FROM areas WHERE id=$1 AND organization_id=$2`,
      [areaId, organizationId]
    );
    if (!areaRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Area not found' } });
    }
    if (cropProfile) {
      const { rows: profileRows } = await client.query(
        `SELECT 1 FROM crop_profiles WHERE id=$1 AND organization_id=$2`,
        [cropProfile, organizationId]
      );
      if (!profileRows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Unknown crop profile' } });
      }
    }

    const { rows } = await client.query(
      `UPDATE sections
       SET area_id=$1, name=$2, crop_profile=COALESCE(NULLIF($3, ''), crop_profile)
       WHERE id=$4 AND organization_id=$5
       RETURNING id, organization_id, area_id, name, crop_profile, created_at`,
      [areaId, name, cropProfile, req.params.sectionId, organizationId]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Section not found' } });
    }
    await client.query(
      `UPDATE nodes SET area_id=$1 WHERE organization_id=$2 AND section_id=$3 AND archived_at IS NULL`,
      [areaId, organizationId, req.params.sectionId]
    );
    await client.query('COMMIT');
    res.json({ section: rows[0] });
  } catch (e) {
    await client?.query('ROLLBACK').catch(() => {});
    console.error('[api] PATCH /sections/:sectionId:', e.message);
    sendInternalError(res, 'DB_ERROR');
  } finally {
    client?.release();
  }
});

app.delete('/sections/:sectionId', requireAuth, requireRole('owner', 'admin', 'grower'), async (req, res) => {
  try {
    const { rows: nodeRows } = await query(
      `SELECT COUNT(*)::int AS count FROM nodes WHERE organization_id=$1 AND section_id=$2 AND archived_at IS NULL`,
      [getOrganizationId(req), req.params.sectionId]
    );
    if (nodeRows[0]?.count > 0) {
      return res.status(409).json({ error: { code: 'SECTION_NOT_EMPTY', message: 'Move or delete nodes before deleting this section' } });
    }

    const { rows } = await query(
      `DELETE FROM sections WHERE id=$1 AND organization_id=$2 RETURNING id, name`,
      [req.params.sectionId, getOrganizationId(req)]
    );
    res.json({ deleted: Boolean(rows[0]), section: rows[0] || null });
  } catch (e) {
    console.error('[api] DELETE /sections/:sectionId:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

function medianValue(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const METRIC_SENSOR_KEYS = {
  airTemp: 'sht45',
  humidity: 'sht45',
  vpd: 'sht45',
  co2: 'scd41',
  lux: 'bh1750',
  soilTemp: 'ds18b20',
  soilMoisture: 'soil_moisture_probe',
  ec: 'ec_probe',
  ph: 'ph_probe',
  soilEc: 'soil_ec_probe',
  leafTemp: 'leaf_temperature_probe',
  waterTemp: 'water_temperature_probe'
};

function measurementMetricValue(measurement, metric) {
  if (metric === 'vpd') return calcVPD(measurement?.temperature, measurement?.humidity);
  return measurement?.[METRIC_TO_COLUMN[metric]];
}

function measurementReportsMetric(measurement, metric) {
  if (metric === 'batteryLevel') return true;
  const sensorKey = METRIC_SENSOR_KEYS[metric];
  if (!sensorKey) return false;

  const presence = normalizeTelemetryBoolean(measurement?.raw_object?.sensors?.[sensorKey]?.present);
  if (presence !== null) return presence;

  // Firmware predating sensor-presence metadata is still valid when its
  // persisted measurement is numeric. Explicit present=false always wins.
  return normalizeTelemetryNumber(measurementMetricValue(measurement, metric)) !== null;
}

function publicActionFeedback(row) {
  if (!row) return null;
  return {
    id: row.id,
    actionId: row.action_id,
    status: row.status,
    note: row.note || '',
    executionDetails: row.execution_details || null,
    createdBy: row.created_by || null,
    createdAt: row.created_at
  };
}

function metricSeriesSnapshot(measurements, metricId) {
  const buckets = new Map();
  for (const measurement of measurements) {
    if (!measurementReportsMetric(measurement, metricId)) continue;
    const value = metricId === 'vpd'
      ? calcVPD(measurement.temperature, measurement.humidity)
      : measurement[METRIC_TO_COLUMN[metricId]];
    const observedAtMs = new Date(measurement.time || 0).getTime();
    const numericValue = normalizeTelemetryNumber(value);
    if (numericValue === null || !Number.isFinite(observedAtMs)) continue;
    const bucket = Math.floor(observedAtMs / (5 * 60_000));
    if (!buckets.has(bucket)) buckets.set(bucket, { values: [], observedAt: measurement.time });
    const entry = buckets.get(bucket);
    entry.values.push(numericValue);
    if (new Date(measurement.time) > new Date(entry.observedAt)) entry.observedAt = measurement.time;
  }
  return {
    samples: [...buckets.values()]
      .map((entry) => ({ value: medianValue(entry.values), observedAt: entry.observedAt }))
      .filter((sample) => sample.value !== null)
      .sort((left, right) => new Date(left.observedAt) - new Date(right.observedAt))
  };
}

app.get('/actions/today', requireAuth, async (req, res) => {
  try {
    const organizationId = getOrganizationId(req);
    const requestedSectionId = String(req.query.sectionId || '').trim();
    const [sectionsResult, nodesResult, profilesResult, measurementsResult] = await Promise.all([
      query(
        `SELECT s.id, s.area_id, s.name, s.crop_profile, a.name AS area_name
         FROM sections s
         LEFT JOIN areas a ON a.id=s.area_id
         WHERE s.organization_id=$1
         ORDER BY s.created_at ASC`,
        [organizationId]
      ),
      query(
        `SELECT dev_eui, section_id, last_seen, last_received_at, last_sensor_presence
         FROM nodes WHERE organization_id=$1 AND archived_at IS NULL ORDER BY created_at ASC`,
        [organizationId]
      ),
      query(`SELECT id, metrics FROM crop_profiles WHERE organization_id=$1`, [organizationId]),
      query(
        `SELECT DISTINCT ON (m.dev_eui) m.*
         FROM measurements m
         JOIN nodes n ON n.dev_eui=m.dev_eui
         WHERE n.organization_id=$1 AND n.archived_at IS NULL
         ORDER BY m.dev_eui, m.time DESC`,
        [organizationId]
      )
    ]);

    const sections = requestedSectionId
      ? sectionsResult.rows.filter((section) => section.id === requestedSectionId)
      : sectionsResult.rows;
    if (requestedSectionId && sections.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown sectionId' } });
    }

    const nodesBySection = new Map();
    for (const node of nodesResult.rows) {
      if (!node.section_id) continue;
      if (!nodesBySection.has(node.section_id)) nodesBySection.set(node.section_id, []);
      nodesBySection.get(node.section_id).push(node);
    }
    const profileMetricsById = new Map(profilesResult.rows.map((row) => [row.id, row.metrics || {}]));
    const latestByDevEui = new Map(
      measurementsResult.rows.map((row) => [normalizeDevEui(row.dev_eui), row])
    );

    const snapshots = sections.map((section) => {
      const nodeRows = nodesBySection.get(section.id) || [];
      const measurements = nodeRows.map((node) => latestByDevEui.get(normalizeDevEui(node.dev_eui)) || null);
      const profileMetrics = profileMetricsById.get(section.crop_profile) || {};
      const current = buildCurrentMetricEvaluations(nodeRows, measurements, profileMetrics);
      const observedAtByMetric = Object.fromEntries(current.evaluations.map((evaluation) => {
        const times = current.currentMeasurements
          .filter((measurement) => measurementReportsMetric(measurement, evaluation.metricId))
          .map((measurement) => measurement.time)
          .filter(Boolean)
          .sort((left, right) => new Date(right) - new Date(left));
        return [evaluation.metricId, times[0] || null];
      }));

      return {
        section,
        profileMetrics,
        scoreRules: current.scoreRules,
        evaluations: current.evaluations,
        observedAtByMetric,
        latestReceivedAt: measurements.map((measurement) => measurement?.time).filter(Boolean)
          .sort((left, right) => new Date(right) - new Date(left))[0] || null,
        reportingNodes: current.statuses.filter((status) => status === 'live' || status === 'delayed').length,
        registeredNodes: nodeRows.length
      };
    });

    const actions = buildTodayActions(snapshots);
    const actionIds = actions.map((action) => action.id);
    let feedbackByActionId = new Map();
    if (actionIds.length > 0) {
      const { rows } = await query(
        `SELECT DISTINCT ON (action_id)
                id, action_id, status, note, execution_details, created_by, created_at
         FROM action_feedback
         WHERE organization_id=$1 AND action_id=ANY($2::text[])
         ORDER BY action_id, created_at DESC`,
        [organizationId, actionIds]
      );
      feedbackByActionId = new Map(rows.map((row) => [row.action_id, row]));
    }

    res.json({
      generatedAt: new Date().toISOString(),
      sectionId: requestedSectionId || null,
      actions: actions.map((action) => {
        const feedback = feedbackByActionId.get(action.id);
        const feedbackMatchesReading = feedback
          && (!action.observedAt || new Date(feedback.created_at) >= new Date(action.observedAt));
        return { ...action, feedback: feedbackMatchesReading ? publicActionFeedback(feedback) : null };
      })
    });
  } catch (e) {
    console.error('[api] /actions/today:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

app.post(
  '/actions/today/:actionId/feedback',
  requireAuth,
  requireRole('owner', 'admin', 'grower', 'technician'),
  async (req, res) => {
    let client;
    try {
      const organizationId = getOrganizationId(req);
      const actionId = String(req.params.actionId || '').trim();
      const status = String(req.body?.status || '').trim();
      const note = String(req.body?.note || '').trim();
      const action = req.body?.action;
      const requestedExecutionDetails = req.body?.executionDetails;

      if (!['completed', 'deferred', 'failed'].includes(status)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Unknown action feedback status' } });
      }
      if (!action || action.id !== actionId || !action.sectionId || !action.metricId) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A matching action snapshot is required' } });
      }
      if (actionId.length > 240 || note.length > 500) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Action feedback is too long' } });
      }

      const allowedExecutionTypes = new Set([
        'ventilation_increased', 'ventilation_reduced', 'vents_opened',
        'heating_increased', 'heating_reduced', 'cooling_increased', 'cooling_reduced',
        'humidification_increased', 'humidification_reduced', 'irrigation_adjusted',
        'shading_adjusted', 'equipment_checked', 'other'
      ]);
      let executionDetails = null;
      if (status === 'completed' && requestedExecutionDetails !== undefined && requestedExecutionDetails !== null) {
        const type = String(requestedExecutionDetails?.type || '').trim();
        const adjustment = String(requestedExecutionDetails?.adjustment || '').trim();
        const durationValue = requestedExecutionDetails?.durationMinutes;
        const durationMinutes = durationValue === '' || durationValue === null || durationValue === undefined
          ? null
          : Number(durationValue);
        if (!allowedExecutionTypes.has(type)) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Select the action that was actually performed' } });
        }
        if (adjustment.length > 160 || (type === 'other' && !adjustment)) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Describe the performed action in 160 characters or less' } });
        }
        if (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440)) {
          return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Action duration must be between 1 and 1440 minutes' } });
        }
        executionDetails = { type, adjustment, durationMinutes };
      } else if (status !== 'completed' && requestedExecutionDetails !== undefined && requestedExecutionDetails !== null) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Execution details are only accepted for completed actions' } });
      }

      const section = await getSectionById(action.sectionId, organizationId);
      if (!section) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Section not found' } });
      }
      const expectedPrefix = `${section.id}:${action.metricId}:`;
      if (!actionId.startsWith(expectedPrefix)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Action identity does not match its section' } });
      }

      const observedAt = String(action.observedAt || 'unknown');
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        [organizationId, `${actionId}|${observedAt}|${req.user.id}`]
      );
      const { rows: existingRows } = await client.query(
        `SELECT id, action_id, status, note, execution_details, created_by, created_at
         FROM action_feedback
         WHERE organization_id=$1 AND action_id=$2 AND status=$3 AND created_by=$4
           AND COALESCE(action_payload->>'observedAt', 'unknown')=$5
         ORDER BY created_at DESC
         LIMIT 1`,
        [organizationId, actionId, status, req.user.id, observedAt]
      );
      if (existingRows[0]) {
        await client.query('COMMIT');
        return res.json({ feedback: publicActionFeedback(existingRows[0]), deduplicated: true });
      }

      const { rows } = await client.query(
        `INSERT INTO action_feedback (
           id, organization_id, action_id, section_id, metric_id,
           status, note, execution_details, action_payload, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)
         RETURNING id, action_id, status, note, execution_details, created_by, created_at`,
        [
          randomUUID(), organizationId, actionId, section.id, action.metricId,
          status, note, executionDetails ? JSON.stringify(executionDetails) : null, JSON.stringify(action), req.user.id
        ]
      );
      await client.query('COMMIT');

      res.status(201).json({ feedback: publicActionFeedback(rows[0]), deduplicated: false });
    } catch (e) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error('[api] POST /actions/today/:actionId/feedback:', e.message);
      res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
    } finally {
      client?.release();
    }
  }
);

app.get('/actions/history', requireAuth, async (req, res) => {
  try {
    const organizationId = getOrganizationId(req);
    const limit = Math.max(1, Math.min(Math.floor(Number(req.query.limit) || 20), 50));
    const { rows: feedbackRows } = await query(
      `WITH latest_feedback AS (
         SELECT DISTINCT ON (action_id, COALESCE(action_payload->>'observedAt', 'unknown')) *
         FROM action_feedback
         WHERE organization_id=$1
         ORDER BY action_id, COALESCE(action_payload->>'observedAt', 'unknown'), created_at DESC
       )
       SELECT af.id, af.action_id, af.section_id, af.metric_id, af.status, af.note, af.execution_details,
              af.action_payload, af.created_by, af.created_at,
              s.name AS section_name, a.name AS area_name, u.display_name AS created_by_name
       FROM latest_feedback af
       JOIN sections s ON s.id=af.section_id AND s.organization_id=af.organization_id
       LEFT JOIN areas a ON a.id=s.area_id AND a.organization_id=af.organization_id
       LEFT JOIN users u ON u.id=af.created_by
       ORDER BY af.created_at DESC
       LIMIT $2`,
      [organizationId, limit]
    );

    const feedbackIds = feedbackRows.map((row) => row.id);
    const measurementsByFeedback = new Map();
    if (feedbackIds.length > 0) {
      const { rows } = await query(
        `SELECT af.id AS feedback_id, sample.*
         FROM action_feedback af
         JOIN LATERAL (
           SELECT m.*
           FROM measurements m
           JOIN nodes n ON n.dev_eui=m.dev_eui
           WHERE n.organization_id=af.organization_id
             AND n.section_id=af.section_id
             AND m.time>af.created_at
             AND m.time<=af.created_at + INTERVAL '4 hours'
           ORDER BY m.time ASC
           LIMIT 500
         ) sample ON TRUE
         WHERE af.organization_id=$1 AND af.id=ANY($2::text[])
         ORDER BY af.id, sample.time ASC`,
        [organizationId, feedbackIds]
      );
      for (const measurement of rows) {
        if (!measurementsByFeedback.has(measurement.feedback_id)) measurementsByFeedback.set(measurement.feedback_id, []);
        measurementsByFeedback.get(measurement.feedback_id).push(measurement);
      }
    }

    res.json({
      items: feedbackRows.map((row) => {
        const feedback = publicActionFeedback(row);
        const action = row.action_payload || {};
        const evidence = metricSeriesSnapshot(measurementsByFeedback.get(row.id) || [], row.metric_id);
        return {
          ...feedback,
          sectionId: row.section_id,
          sectionName: row.section_name,
          areaName: row.area_name || '',
          metricId: row.metric_id,
          metricLabel: action.metricLabel || row.metric_id,
          title: action.title || 'Recommended action',
          unit: action.unit || METRIC_UNITS[row.metric_id] || '',
          createdByName: row.created_by_name || null,
          outcome: evaluateActionOutcome(action, feedback, evidence)
        };
      })
    });
  } catch (e) {
    console.error('[api] GET /actions/history:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

app.get('/readings/latest', requireAuth, async (req, res) => {
  try {
    const section = await getSectionById(req.query.sectionId, getOrganizationId(req));
    if (!section) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown sectionId' } });

    const { rows: nodeRows } = await query(
      `SELECT dev_eui, name, last_profile
       FROM nodes
       WHERE organization_id=$1 AND section_id=$2 AND archived_at IS NULL
       ORDER BY created_at ASC`,
      [getOrganizationId(req), section.id]
    );
    if (!nodeRows.length) {
      return res.status(404).json({ error: { code: 'NO_NODES', message: 'No nodes registered in this section' } });
    }

    const devEuis = nodeRows.map((node) => normalizeDevEui(node.dev_eui));
    const { rows: latestRows } = await query(
      `SELECT DISTINCT ON (dev_eui) *
       FROM measurements
       WHERE dev_eui = ANY($1::text[])
       ORDER BY dev_eui, time DESC`,
      [devEuis]
    );
    const latestByDevEui = new Map(latestRows.map((row) => [normalizeDevEui(row.dev_eui), row]));
    const samples = nodeRows.map((node) => ({
      node,
      measurement: latestByDevEui.get(normalizeDevEui(node.dev_eui)) || null
    }));
    const reportingSamples = samples.filter((sample) => sample.measurement);
    if (!reportingSamples.length) {
      return res.status(404).json({ error: { code: 'NO_DATA', message: 'No readings' } });
    }

    const expectedIntervalForSample = (sample) => {
      const reported = Number(sample.measurement?.raw_object?.expected_uplink_interval_s);
      return Number.isFinite(reported) && reported >= 30
        ? reported
        : Math.max(600, expectedUplinkIntervalSec(sample.node.last_profile));
    };
    const currentSamples = reportingSamples.filter((sample) => {
      const status = statusFromMeasurementTime(
        sample.measurement.time,
        Date.now(),
        expectedIntervalForSample(sample)
      );
      return status === 'live' || status === 'delayed';
    });

    const currentDevEuis = currentSamples.map((sample) => normalizeDevEui(sample.node.dev_eui));
    const { rows: oneHourBaselineRows } = currentDevEuis.length
      ? await query(
        `WITH latest AS (
           SELECT DISTINCT ON (dev_eui) dev_eui, time
           FROM measurements
           WHERE dev_eui = ANY($1::text[])
           ORDER BY dev_eui, time DESC
         )
         SELECT baseline.*
         FROM latest
         JOIN LATERAL (
           SELECT measurement.*
           FROM measurements measurement
           WHERE measurement.dev_eui=latest.dev_eui
             AND measurement.time BETWEEN latest.time - INTERVAL '80 minutes'
                                      AND latest.time - INTERVAL '40 minutes'
           ORDER BY ABS(EXTRACT(EPOCH FROM (measurement.time - (latest.time - INTERVAL '1 hour'))))
           LIMIT 1
         ) baseline ON TRUE`,
        [currentDevEuis]
      )
      : { rows: [] };
    const oneHourBaselineByDevEui = new Map(
      oneHourBaselineRows.map((row) => [normalizeDevEui(row.dev_eui), row])
    );
    const oneHourBaselineSamples = currentSamples
      .map((sample) => ({
        node: sample.node,
        measurement: oneHourBaselineByDevEui.get(normalizeDevEui(sample.node.dev_eui)) || null
      }))
      .filter((sample) => sample.measurement);

    const collectSourcesByMetric = (metricSamples) => {
      const collected = {};
      const addSource = (metric, sample, value) => {
        const numericValue = normalizeTelemetryNumber(value);
        if (numericValue === null) return;
        if (!collected[metric]) collected[metric] = [];
        collected[metric].push({
          value: numericValue,
          observedAt: sample.measurement.time,
          expectedIntervalSec: metric === 'batteryLevel'
            ? Math.max(METRIC_INTERVAL_SEC[metric] || 600, expectedIntervalForSample(sample))
            : expectedIntervalForSample(sample),
          devEui: normalizeDevEui(sample.node.dev_eui),
          nodeName: sample.node.name || sample.node.dev_eui
        });
      };

      metricSamples.forEach((sample) => {
        for (const [column, metric] of Object.entries(METRIC_MAP)) {
          if (measurementReportsMetric(sample.measurement, metric)) {
            addSource(metric, sample, sample.measurement[column]);
          }
        }
        if (measurementReportsMetric(sample.measurement, 'airTemp') && measurementReportsMetric(sample.measurement, 'humidity')) {
          addSource('vpd', sample, calcVPD(sample.measurement.temperature, sample.measurement.humidity));
        }
      });
      return collected;
    };

    const sourcesByMetric = collectSourcesByMetric(currentSamples);
    const oneHourBaselineSourcesByMetric = collectSourcesByMetric(oneHourBaselineSamples);

    const observations = Object.fromEntries(
      Object.entries(sourcesByMetric).map(([metric, sources]) => {
        const values = sources.map((source) => source.value);
        const value = medianValue(values);
        const oneHourBaselineSources = oneHourBaselineSourcesByMetric[metric] || [];
        const oneHourBaselineByNode = new Map(
          oneHourBaselineSources.map((source) => [source.devEui, source.value])
        );
        const oneHourChange = medianValue(sources.flatMap((source) => {
          const baseline = oneHourBaselineByNode.get(source.devEui);
          return Number.isFinite(baseline) ? [source.value - baseline] : [];
        }));
        const leastFreshSource = [...sources].sort((a, b) => {
          const aAgeRatio = (Date.now() - new Date(a.observedAt).getTime()) / (a.expectedIntervalSec * 1000);
          const bAgeRatio = (Date.now() - new Date(b.observedAt).getTime()) / (b.expectedIntervalSec * 1000);
          return bAgeRatio - aAgeRatio;
        })[0];
        return [metric, {
          value,
          change1h: oneHourChange === null ? null : Number(oneHourChange.toFixed(6)),
          lastObservedAt: leastFreshSource.observedAt,
          expectedIntervalSec: leastFreshSource.expectedIntervalSec,
          unit: METRIC_UNITS[metric] || '',
          reportingSensors: sources.length,
          range: { min: Math.min(...values), max: Math.max(...values) },
          nodes: sources
        }];
      })
    );

    const latestReceivedAt = reportingSamples
      .map((sample) => sample.measurement.time)
      .sort((a, b) => new Date(b) - new Date(a))[0];
    const intervalSamples = currentSamples.length ? currentSamples : reportingSamples;
    const sectionExpectedUplinkIntervalSec = Math.max(
      ...intervalSamples.map(expectedIntervalForSample)
    );
    const airTemp = observations.airTemp?.value;
    const humidity = observations.humidity?.value;

    res.json({
      sectionId: section.id,
      lastReceivedAt: latestReceivedAt,
      expectedUplinkIntervalSec: sectionExpectedUplinkIntervalSec,
      reportingNodes: currentSamples.length,
      registeredNodes: nodeRows.length,
      observations,
      derived: {
        dew_point: Number.isFinite(airTemp) && Number.isFinite(humidity) ? calcDewPoint(airTemp, humidity) : null,
        absolute_humidity: Number.isFinite(airTemp) && Number.isFinite(humidity) ? calcAbsoluteHumidity(airTemp, humidity) : null
      }
    });
  } catch (e) {
    console.error('[api] /readings/latest:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

function historicalSensorPresenceCondition(sensorPath) {
  const value = `raw_object->'sensors'->'${sensorPath}'->>'present'`;
  return `(${value} IS NULL OR lower(${value}) IN ('true', '1'))`;
}

function historyPresenceCondition(metric) {
  const sensorPath = METRIC_SENSOR_KEYS[metric];
  return sensorPath
    ? historicalSensorPresenceCondition(sensorPath)
    : 'TRUE';
}

const VPD_SQL_EXPRESSION = `ROUND((
  0.6108::double precision
  * exp((17.27 * temperature::double precision) / (temperature::double precision + 237.3))
  * (1.0 - humidity::double precision / 100.0)
)::numeric, 3)`;

function validVpdSqlCondition() {
  return `temperature BETWEEN -80 AND 80 AND humidity BETWEEN 0 AND 100`;
}

app.get('/history', requireAuth, async (req, res) => {
  try {
    const { sectionId, metric } = req.query;
    const section = await getSectionById(sectionId, getOrganizationId(req));
    if (!section) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown sectionId' } });

    const column = METRIC_TO_COLUMN[metric] || (metric === 'vpd' ? 'vpd' : null);
    if (!column) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Unknown metric' } });

    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 86400000);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const maxRangeMs = 31 * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid history date range' } });
    }
    if (to.getTime() - from.getTime() > maxRangeMs) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'History is limited to 31 days per request' } });
    }
    const requestedStepMinutes = Number(req.query.stepMinutes || 5);
    const allowedStepMinutes = new Set([5, 10, 60, 240]);
    const stepMinutes = allowedStepMinutes.has(requestedStepMinutes) ? requestedStepMinutes : 5;
    const bucketSeconds = stepMinutes * 60;

    const devEuis = await getSectionDevEuis(section.id, getOrganizationId(req), { includeArchived: true });
    if (!devEuis.length) {
      return res.status(404).json({ error: { code: 'NO_NODES', message: 'No nodes registered in this section' } });
    }

    const bucketExpression = `to_timestamp(floor(extract(epoch FROM time) / ${bucketSeconds}) * ${bucketSeconds})`;
    let points;

    if (metric === 'vpd') {
      const { rows } = await query(
        `SELECT ${bucketExpression} AS observed_at,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY ${VPD_SQL_EXPRESSION}) AS value
         FROM measurements
         WHERE dev_eui = ANY($1)
           AND time BETWEEN $2 AND $3
           AND temperature IS NOT NULL
           AND humidity IS NOT NULL
           AND ${historicalSensorPresenceCondition('sht45')}
           AND ${validVpdSqlCondition()}
         GROUP BY observed_at
         ORDER BY observed_at ASC`,
        [devEuis, from, to]
      );
      points = rows.map((row) => ({
        observedAt: row.observed_at,
        receivedAt: row.observed_at,
        value: Number(row.value),
        detectedLate: false
      }));
    } else {
      const presence = historyPresenceCondition(metric);
      // A median is correct for climate signals, but it hides the short light
      // peaks that growers need to assess a photoperiod and lamp output.
      const aggregation = metric === 'lux'
        ? `MAX(${column})`
        : `percentile_cont(0.5) WITHIN GROUP (ORDER BY ${column})`;
      const { rows } = await query(
        `SELECT ${bucketExpression} AS observed_at,
                ${aggregation} AS value
         FROM measurements
         WHERE dev_eui = ANY($1)
           AND time BETWEEN $2 AND $3
           AND ${column} IS NOT NULL
           AND ${presence}
         GROUP BY observed_at
         ORDER BY observed_at ASC`,
        [devEuis, from, to]
      );
      points = rows.map((row) => ({
        observedAt: row.observed_at,
        receivedAt: row.observed_at,
        value: Number(row.value),
        detectedLate: false
      }));
    }

    res.json({
      sectionId,
      metric,
      unit: METRIC_UNITS[metric] || '',
      aggregation: `${metric === 'lux' ? 'section_peak' : 'section_median'}_${stepMinutes}m`,
      stepMinutes,
      points,
      revision: `history-${Date.now()}`
    });
  } catch (e) {
    console.error('[api] /history:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

const ANALYTICS_STEP_MINUTES = new Set([10, 60, 240]);

function parseAnalyticsWindow(req) {
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const maxRangeMs = 31 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) {
    const error = new Error('Invalid analytics date range');
    error.status = 400;
    throw error;
  }
  if (to.getTime() - from.getTime() > maxRangeMs) {
    const error = new Error('Analytics are limited to 31 days per request');
    error.status = 400;
    throw error;
  }
  const requestedStep = Number(req.query.stepMinutes || 60);
  const stepMinutes = ANALYTICS_STEP_MINUTES.has(requestedStep) ? requestedStep : 60;
  return { from, to, stepMinutes };
}

function metricAnalyticsRule(metric, profileMetrics) {
  const scoreRule = buildScoreRules(profileMetrics)[metric];
  if (scoreRule) return scoreRule;
  const profileMetric = profileMetrics?.[metric];
  if (!profileMetric || !Array.isArray(profileMetric.optimal) || !Array.isArray(profileMetric.critical)) return null;
  return {
    optimal: profileMetric.optimal.map(Number),
    warning: Array.isArray(profileMetric.warning) ? profileMetric.warning.map(Number) : profileMetric.optimal.map(Number),
    critical: profileMetric.critical.map(Number)
  };
}

function analyticsStateForValue(value, rule) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !rule) return 'unavailable';
  if (numeric < rule.critical[0] || numeric > rule.critical[1]) return 'critical';
  if (numeric < rule.optimal[0] || numeric > rule.optimal[1]) return 'warning';
  return 'optimal';
}

async function getMetricHistoryBuckets(devEuis, metric, from, to, stepMinutes, options = {}) {
  const column = METRIC_TO_COLUMN[metric] || (metric === 'vpd' ? 'vpd' : null);
  if (!column) return [];
  const bucketSeconds = stepMinutes * 60;
  const bucketExpression = `to_timestamp(floor(extract(epoch FROM time) / ${bucketSeconds}) * ${bucketSeconds})`;

  if (metric === 'vpd') {
    const { rows } = await query(
      `SELECT ${bucketExpression} AS observed_at,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY ${VPD_SQL_EXPRESSION}) AS value
       FROM measurements
       WHERE dev_eui = ANY($1)
         AND time BETWEEN $2 AND $3
         AND temperature IS NOT NULL AND humidity IS NOT NULL
         AND ${historicalSensorPresenceCondition('sht45')}
         AND ${validVpdSqlCondition()}
       GROUP BY observed_at
       ORDER BY observed_at ASC`,
      [devEuis, from, to]
    );
    return rows.map((row) => ({ observedAt: row.observed_at, value: Number(row.value) }));
  }

  const presence = historyPresenceCondition(metric);
  const aggregation = metric === 'lux' && options.luxAggregation !== 'median'
    ? `MAX(${column})`
    : `percentile_cont(0.5) WITHIN GROUP (ORDER BY ${column})`;
  const { rows } = await query(
    `SELECT ${bucketExpression} AS observed_at, ${aggregation} AS value
     FROM measurements
     WHERE dev_eui = ANY($1)
       AND time BETWEEN $2 AND $3
       AND ${column} IS NOT NULL
       AND ${presence}
     GROUP BY observed_at
     ORDER BY observed_at ASC`,
    [devEuis, from, to]
  );
  return rows.map((row) => ({ observedAt: row.observed_at, value: Number(row.value) }));
}

async function getTelemetryEvents(devEuis, from, to) {
  const { rows } = await query(
    `SELECT time, dev_eui, profile, raw_object
     FROM measurements
     WHERE dev_eui = ANY($1) AND time BETWEEN $2 AND $3
     ORDER BY dev_eui ASC, time ASC`,
    [devEuis, from, to]
  );
  const events = [];
  const previousByNode = new Map();
  rows.forEach((row) => {
    const devEui = normalizeDevEui(row.dev_eui);
    const previous = previousByNode.get(devEui);
    const observedAt = new Date(row.time);
    const intervalSec = Number(row.raw_object?.expected_uplink_interval_s) || 300;
    if (previous?.profile && row.profile && previous.profile !== row.profile) {
      events.push({
        occurredAt: row.time,
        type: 'reporting_mode_changed',
        severity: 'info',
        devEui,
        from: previous.profile,
        to: row.profile
      });
    }
    if (previous?.time && observedAt.getTime() - previous.time.getTime() > intervalSec * 3 * 1000) {
      events.push({
        occurredAt: row.time,
        type: 'delivery_gap',
        severity: 'warning',
        devEui,
        durationMinutes: Math.round((observedAt.getTime() - previous.time.getTime()) / 60000)
      });
    }
    const txFailed = normalizeTelemetryBoolean(row.raw_object?.error_flags?.last_tx_failed) === true;
    if (txFailed && !previous?.txFailed) {
      events.push({ occurredAt: row.time, type: 'transmission_failed', severity: 'warning', devEui });
    }
    previousByNode.set(devEui, { time: observedAt, profile: row.profile || '', txFailed });
  });
  return events.sort((left, right) => new Date(left.occurredAt) - new Date(right.occurredAt)).slice(-80);
}

app.get('/analytics/section', requireAuth, async (req, res) => {
  try {
    const organizationId = getOrganizationId(req);
    const section = await getSectionById(req.query.sectionId, organizationId);
    const metric = String(req.query.metric || '');
    if (!section) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown sectionId' } });
    if (!(METRIC_TO_COLUMN[metric] || metric === 'vpd')) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Unknown analytics metric' } });
    }
    const { from, to, stepMinutes } = parseAnalyticsWindow(req);
    const { rows: profileRows } = await query(
      `SELECT metrics FROM crop_profiles WHERE organization_id=$1 AND id=$2 LIMIT 1`,
      [organizationId, section.crop_profile]
    );
    const rule = metricAnalyticsRule(metric, profileRows[0]?.metrics || {});
    if (!rule) return res.status(400).json({ error: { code: 'UNCONFIGURED_METRIC', message: 'This metric has no profile ranges' } });
    const devEuis = await getSectionDevEuis(section.id, organizationId, { includeArchived: true });
    if (!devEuis.length) return res.status(404).json({ error: { code: 'NO_NODES', message: 'No nodes registered in this section' } });

    const [points, heatmapPoints, events] = await Promise.all([
      getMetricHistoryBuckets(devEuis, metric, from, to, stepMinutes),
      getMetricHistoryBuckets(devEuis, metric, from, to, 60),
      getTelemetryEvents(devEuis, from, to)
    ]);
    const minutesByState = { optimal: 0, warning: 0, critical: 0 };
    points.forEach((point) => {
      const state = analyticsStateForValue(point.value, rule);
      if (state in minutesByState) minutesByState[state] += stepMinutes;
    });
    const expectedMinutes = Math.ceil((to.getTime() - from.getTime()) / 60000 / stepMinutes) * stepMinutes;
    const coveredMinutes = Object.values(minutesByState).reduce((total, value) => total + value, 0);

    res.json({
      sectionId: section.id,
      metric,
      unit: METRIC_UNITS[metric] || '',
      from: from.toISOString(),
      to: to.toISOString(),
      stepMinutes,
      ranges: { optimal: rule.optimal, warning: rule.warning, critical: rule.critical },
      timeInTarget: {
        ...minutesByState,
        unavailable: Math.max(0, expectedMinutes - coveredMinutes),
        coveredMinutes,
        expectedMinutes
      },
      heatmap: heatmapPoints.map((point) => ({ ...point, state: analyticsStateForValue(point.value, rule) })),
      events
    });
  } catch (e) {
    console.error('[api] /analytics/section:', e.message);
    res.status(e.status || 500).json({ error: { code: e.status ? 'VALIDATION_ERROR' : 'DB_ERROR', message: e.message } });
  }
});

function parseClockMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

function localClockMinutes(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function isScheduledLightMinute(minute, start, end) {
  if (start === end) return true;
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

function summarizeDynamics(points, definition) {
  const clean = points.filter((point) => normalizeTelemetryNumber(point.value) !== null);
  if (!clean.length) return null;
  const start = Number(clean[0].value);
  const end = Number(clean[clean.length - 1].value);
  const values = clean.map((point) => Number(point.value));
  return {
    start,
    end,
    delta: end - start,
    min: Math.min(...values),
    max: Math.max(...values),
    direction: Math.abs(end - start) <= Math.max(10 ** -(Number(definition?.decimals) || 0), 0.01)
      ? 'stable'
      : end > start ? 'rising' : 'falling'
  };
}

app.get('/analytics/dynamics', requireAuth, async (req, res) => {
  try {
    const organizationId = getOrganizationId(req);
    const section = await getSectionById(req.query.sectionId, organizationId);
    if (!section) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown sectionId' } });
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);
    const stepMinutes = 10;
    const { rows: profileRows } = await query(
      `SELECT metrics FROM crop_profiles WHERE organization_id=$1 AND id=$2 LIMIT 1`,
      [organizationId, section.crop_profile]
    );
    const profileMetrics = profileRows[0]?.metrics || {};
    const devEuis = await getSectionDevEuis(section.id, organizationId);
    if (!devEuis.length) return res.status(404).json({ error: { code: 'NO_NODES', message: 'No nodes registered in this section' } });

    const metricIds = Object.keys(profileMetrics)
      .filter((metricId) => metricId !== 'batteryLevel' && (METRIC_TO_COLUMN[metricId] || metricId === 'vpd'));
    const histories = Object.fromEntries(await Promise.all(metricIds.map(async (metricId) => [
      metricId,
      await getMetricHistoryBuckets(devEuis, metricId, from, to, stepMinutes, { luxAggregation: 'median' })
    ])));
    const metrics = Object.fromEntries(metricIds.map((metricId) => [
      metricId,
      summarizeDynamics(histories[metricId], profileMetrics[metricId])
    ]).filter(([, summary]) => summary));

    const valuesByBucket = new Map();
    Object.entries(histories).forEach(([metricId, points]) => {
      if (metricId === 'lux') return;
      points.forEach((point) => {
        const key = new Date(point.observedAt).toISOString();
        if (!valuesByBucket.has(key)) valuesByBucket.set(key, {});
        valuesByBucket.get(key)[metricId] = Number(point.value);
      });
    });
    const scorePoints = [...valuesByBucket.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([observedAt, values]) => ({
      observedAt,
      ...buildScoreFromMetricValues(values, profileMetrics)
    })).filter((point) => Number.isFinite(point.score));
    const scoreValues = scorePoints.map((point) => point.score);
    const score = scorePoints.length ? {
      start: scorePoints[0].score,
      end: scorePoints[scorePoints.length - 1].score,
      delta: scorePoints[scorePoints.length - 1].score - scorePoints[0].score,
      min: Math.min(...scoreValues),
      max: Math.max(...scoreValues),
      direction: scorePoints[scorePoints.length - 1].score === scorePoints[0].score
        ? 'stable'
        : scorePoints[scorePoints.length - 1].score > scorePoints[0].score ? 'improving' : 'declining'
    } : null;

    const luxDefinition = profileMetrics.lux || {};
    const schedule = luxDefinition.lightingSchedule || {};
    const scheduleStart = parseClockMinutes(schedule.start);
    const scheduleEnd = parseClockMinutes(schedule.end);
    const scheduleEnabled = schedule.enabled === true && scheduleStart !== null && scheduleEnd !== null;
    const timeZone = String(schedule.timeZone || 'Europe/Vilnius');
    const darkThresholdLux = Math.max(0, Number(schedule.darkThresholdLux) || 100);
    let lighting = { configured: false };
    if (scheduleEnabled && histories.lux?.length) {
      let expectedLightBuckets = 0;
      let observedExpectedLightBuckets = 0;
      let achievedLightBuckets = 0;
      let targetBuckets = 0;
      let unexpectedDarkBuckets = 0;
      let nightLightBuckets = 0;
      let luxSeconds = 0;
      for (let cursor = new Date(Math.floor(from.getTime() / (stepMinutes * 60000)) * stepMinutes * 60000); cursor < to; cursor = new Date(cursor.getTime() + stepMinutes * 60000)) {
        if (isScheduledLightMinute(localClockMinutes(cursor, timeZone), scheduleStart, scheduleEnd)) expectedLightBuckets += 1;
      }
      histories.lux.forEach((point) => {
        const expectedLight = isScheduledLightMinute(localClockMinutes(new Date(point.observedAt), timeZone), scheduleStart, scheduleEnd);
        const value = Number(point.value);
        if (expectedLight) {
          observedExpectedLightBuckets += 1;
          if (value > darkThresholdLux) achievedLightBuckets += 1;
          else unexpectedDarkBuckets += 1;
          if (value >= Number(luxDefinition.optimal?.[0]) && value <= Number(luxDefinition.optimal?.[1])) targetBuckets += 1;
        } else if (value > darkThresholdLux) {
          nightLightBuckets += 1;
        }
        luxSeconds += Math.max(0, value) * stepMinutes * 60;
      });
      const nowMinute = localClockMinutes(to, timeZone);
      const currentPhase = isScheduledLightMinute(nowMinute, scheduleStart, scheduleEnd) ? 'light' : 'dark';
      const latestLux = Number(histories.lux[histories.lux.length - 1]?.value);
      lighting = {
        configured: true,
        schedule: { start: schedule.start, end: schedule.end, timeZone, darkThresholdLux },
        currentPhase,
        currentState: currentPhase === 'dark'
          ? latestLux <= darkThresholdLux ? 'expected_darkness' : 'unexpected_light'
          : latestLux <= darkThresholdLux ? 'critical_darkness' : analyticsStateForValue(latestLux, metricAnalyticsRule('lux', profileMetrics)),
        expectedLightHours: expectedLightBuckets * stepMinutes / 60,
        achievedLightHours: achievedLightBuckets * stepMinutes / 60,
        photoperiodAchievedPct: observedExpectedLightBuckets ? Math.round(achievedLightBuckets / observedExpectedLightBuckets * 100) : null,
        timeInLightTargetPct: observedExpectedLightBuckets ? Math.round(targetBuckets / observedExpectedLightBuckets * 100) : null,
        expectedLightDataCoveragePct: expectedLightBuckets ? Math.round(observedExpectedLightBuckets / expectedLightBuckets * 100) : null,
        unexpectedDarkMinutes: unexpectedDarkBuckets * stepMinutes,
        nightLightMinutes: nightLightBuckets * stepMinutes,
        approximateDli: Number((luxSeconds * 0.0185 / 1e6).toFixed(2)),
        dliIsApproximate: true
      };
    }

    res.json({ sectionId: section.id, from: from.toISOString(), to: to.toISOString(), stepMinutes, scoreModelVersion: SCORE_MODEL_VERSION, score, metrics, lighting });
  } catch (e) {
    console.error('[api] /analytics/dynamics:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

app.get('/analytics/site-comparison', requireAuth, async (req, res) => {
  try {
    const organizationId = getOrganizationId(req);
    const areaId = String(req.query.areaId || '');
    const metric = String(req.query.metric || '');
    if (!(METRIC_TO_COLUMN[metric] || metric === 'vpd')) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Unknown comparison metric' } });
    }
    const { from, to, stepMinutes } = parseAnalyticsWindow(req);
    const requestedSectionIds = String(req.query.sectionIds || '').split(',').map((id) => id.trim()).filter(Boolean);
    if (!areaId || !requestedSectionIds.length || requestedSectionIds.length > 6) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Choose between one and six zones to compare' } });
    }
    const { rows: sectionRows } = await query(
      `SELECT id, name FROM sections
       WHERE organization_id=$1 AND area_id=$2 AND id = ANY($3)
       ORDER BY created_at ASC`,
      [organizationId, areaId, requestedSectionIds]
    );
    if (!sectionRows.length) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No matching zones found' } });
    const devEuisBySection = await Promise.all(sectionRows.map(async (section) => ({
      section,
      devEuis: await getSectionDevEuis(section.id, organizationId, { includeArchived: true })
    })));
    const series = await Promise.all(devEuisBySection.filter((item) => item.devEuis.length).map(async ({ section, devEuis }) => ({
      sectionId: section.id,
      sectionName: section.name,
      points: await getMetricHistoryBuckets(devEuis, metric, from, to, stepMinutes)
    })));
    res.json({ areaId, metric, unit: METRIC_UNITS[metric] || '', from: from.toISOString(), to: to.toISOString(), stepMinutes, series });
  } catch (e) {
    console.error('[api] /analytics/site-comparison:', e.message);
    res.status(e.status || 500).json({ error: { code: e.status ? 'VALIDATION_ERROR' : 'DB_ERROR', message: e.message } });
  }
});




function csvEscape(value) {
  let text = String(value ?? '');
  // Prevent spreadsheet applications from interpreting customer-supplied text as formulas.
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatExportDateTime(value) {
  const formatted = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(value)).replace(',', '');
  const [date = '', time = ''] = formatted.split(' ');
  return { date, time };
}

function formatExportValue(value) {
  return Number(value).toLocaleString('lt-LT', {
    useGrouping: false,
    maximumFractionDigits: 3
  });
}

const EXPORT_METRIC_LABELS = {
  airTemp: 'Air temperature',
  humidity: 'Relative humidity',
  co2: 'CO2',
  lux: 'Light',
  soilTemp: 'Soil temperature',
  soilMoisture: 'Soil moisture',
  ec: 'Nutrient solution EC',
  ph: 'Nutrient solution pH',
  soilEc: 'Substrate EC',
  leafTemp: 'Leaf temperature',
  waterTemp: 'Water temperature',
  vpd: 'VPD',
  batteryLevel: 'Battery level'
};

const EXPORT_METRIC_UNITS = {
  ...METRIC_UNITS,
  lux: 'lx'
};

function getExportMetricValue(row, metric) {
  if (metric === 'vpd') return calcVPD(row.temperature, row.humidity);
  return row[METRIC_TO_COLUMN[metric]];
}

function rowReportsExportMetric(row, metric) {
  return measurementReportsMetric(row, metric)
    && normalizeTelemetryNumber(getExportMetricValue(row, metric)) !== null;
}

app.get('/exports/measurements.csv', requireAuth, async (req, res) => {
  try {
    const sectionId = String(req.query.sectionId || '').trim();
    const section = await getSectionById(sectionId, getOrganizationId(req));
    if (!section) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown sectionId' } });
    }

    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 86400000);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const maxRangeMs = 31 * 24 * 60 * 60 * 1000;

    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid export date range' } });
    }
    if (to.getTime() - from.getTime() > maxRangeMs) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'CSV export is limited to 31 days' } });
    }

    const exportMetrics = [...Object.keys(METRIC_TO_COLUMN), 'vpd'];
    const columns = [...new Set(Object.values(METRIC_TO_COLUMN))];

    const { rows: latestNodeStates } = await query(
      `SELECT DISTINCT ON (m.dev_eui) m.dev_eui, m.raw_object,
              ${columns.map((column) => `m.${column}`).join(', ')}
       FROM measurements m
       JOIN nodes n ON n.dev_eui=m.dev_eui
       WHERE n.organization_id=$1 AND n.section_id=$2
       ORDER BY m.dev_eui, m.time DESC`,
      [getOrganizationId(req), section.id]
    );

    const { rows } = await query(
      `SELECT m.time, m.raw_object, ${columns.map((column) => `m.${column}`).join(', ')}
       FROM measurements m
       JOIN nodes n ON n.dev_eui=m.dev_eui
       WHERE n.organization_id=$1
         AND n.section_id=$2
         AND m.time >= $3
         AND m.time <= $4
       ORDER BY m.time ASC, m.dev_eui ASC
       LIMIT 100001`,
      [getOrganizationId(req), section.id, from, to]
    );

    if (rows.length > 100000) {
      return res.status(413).json({
        error: {
          code: 'EXPORT_TOO_LARGE',
          message: 'This export contains more than 100,000 readings. Choose a shorter date range.'
        }
      });
    }

    const installedMetrics = exportMetrics.filter((metric) => {
      if (metric === 'batteryLevel') return true;
      return latestNodeStates.some((node) => measurementReportsMetric(node, metric));
    });

    const metricsWithData = installedMetrics.filter((metric) =>
      rows.some((row) => rowReportsExportMetric(row, metric))
    );
    const headers = [
      'Date',
      'Time',
      'Area',
      'Section',
      ...metricsWithData.map((metric) =>
        `${EXPORT_METRIC_LABELS[metric] || metric} (${EXPORT_METRIC_UNITS[metric] || ''})`
      )
    ];
    const lines = [headers.map(csvEscape).join(';')];

    for (const row of rows) {
      const { date, time } = formatExportDateTime(row.time);
      const values = metricsWithData.map((metric) => {
        const value = getExportMetricValue(row, metric);
        return rowReportsExportMetric(row, metric) ? formatExportValue(value) : '';
      });

      lines.push([
        date,
        time,
        section.area_name || '',
        section.name,
        ...values
      ].map(csvEscape).join(';'));
    }

    const safeSectionName = section.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || section.id;
    const filename = `neurocrop-${safeSectionName}-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(`\ufeff${lines.join('\n')}\n`);
  } catch (e) {
    console.error('[api] /exports/measurements.csv:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});


function buildDetectedNodeSensors(measurement, configsByPort = {}) {
  const configuredOneWire = configsByPort.onewire || {};
  const configuredI2c = configsByPort.i2c || {};
  const hasSht45 = measurementReportsMetric(measurement, 'airTemp')
    || measurementReportsMetric(measurement, 'humidity');
  const hasScd41 = measurementReportsMetric(measurement, 'co2');
  const hasBh1750 = measurementReportsMetric(measurement, 'lux');
  const hasDs18b20 = measurementReportsMetric(measurement, 'soilTemp');

  const auxiliaryDefinitions = [
    ['leaf_temperature_probe', 'Leaf temperature sensor', ['leafTemp']],
    ['soil_moisture_probe', 'Soil moisture sensor', ['soilMoisture']],
    ['soil_ec_probe', 'Substrate EC sensor', ['soilEc']],
    ['ec_probe', 'Nutrient EC sensor', ['ec']],
    ['ph_probe', 'Nutrient pH sensor', ['ph']],
    ['water_temperature_probe', 'Water temperature sensor', ['waterTemp']]
  ];

  return [
    {
      port: 'internal',
      sensorModel: 'SHT45',
      detected: hasSht45,
      metrics: ['airTemp', 'humidity', 'vpd'],
      role: 'air_climate',
      label: 'Air climate',
      configurable: false
    },
    {
      port: 'i2c',
      sensorModel: hasScd41 ? 'SCD41' : hasBh1750 ? 'BH1750' : null,
      detected: hasScd41 || hasBh1750,
      metrics: hasScd41 ? ['co2'] : hasBh1750 ? ['lux'] : [],
      role: configuredI2c.role || null,
      label: configuredI2c.label || null,
      configurable: false
    },
    {
      port: 'onewire',
      sensorModel: 'DS18B20',
      detected: hasDs18b20,
      metrics: hasDs18b20 ? ['temperature'] : [],
      role: configuredOneWire.role || 'unassigned_temperature',
      label: configuredOneWire.label || 'Temperature probe',
      configurable: true
    },
    ...auxiliaryDefinitions.map(([, label, metrics]) => ({
      port: 'aux', sensorModel: null, detected: metrics.some((metric) => measurementReportsMetric(measurement, metric)),
      metrics, role: null, label, configurable: false
    }))
  ];
}

async function getNodeSensorPayload(devEui, organizationId) {
  const { rows: nodeRows } = await query(
    `SELECT dev_eui, name, organization_id, area_id, section_id, last_received_at
     FROM nodes
     WHERE lower(dev_eui)=$1 AND organization_id=$2 AND archived_at IS NULL`,
    [devEui, organizationId]
  );
  const node = nodeRows[0];
  if (!node) return null;

  const { rows: configRows } = await query(
    `SELECT port, role, label, is_enabled
     FROM node_sensor_configs
     WHERE lower(node_dev_eui)=$1 AND organization_id=$2`,
    [devEui, organizationId]
  );
  const configsByPort = Object.fromEntries(configRows.map((row) => [row.port, row]));
  const measurement = await latestForNode(devEui);

  return {
    node: {
      devEui: node.dev_eui,
      name: node.name || node.dev_eui,
      areaId: node.area_id,
      sectionId: node.section_id
    },
    lastReceivedAt: node.last_received_at || measurement?.time || null,
    sensors: buildDetectedNodeSensors(measurement, configsByPort)
  };
}


app.get('/nodes', requireAuth, async (req, res) => {
  try {
    const params = [getOrganizationId(req)];
    const where = ['n.organization_id=$1', 'n.archived_at IS NULL'];

    const areaId = String(req.query.areaId || '').trim();
    const sectionId = String(req.query.sectionId || '').trim();

    if (areaId) {
      params.push(areaId);
      where.push(`n.area_id=$${params.length}`);
    }
    if (sectionId) {
      params.push(sectionId);
      where.push(`n.section_id=$${params.length}`);
    }

    const { rows } = await query(
      `SELECT
         n.dev_eui, n.name, n.node_type, n.organization_id, n.area_id, n.section_id,
         a.name AS area_name, s.name AS section_name,
         n.created_at, n.last_seen, n.last_received_at,
         n.last_battery_mv, n.last_battery_percent, n.last_firmware_version,
         n.last_profile, n.last_rssi, n.last_snr, n.last_spreading_factor,
         n.last_sensor_presence, n.last_error_flags, n.last_error_counters
       FROM nodes n
       LEFT JOIN areas a ON a.id=n.area_id AND a.organization_id=n.organization_id
       LEFT JOIN sections s ON s.id=n.section_id AND s.organization_id=n.organization_id
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(a.created_at, n.created_at) ASC, COALESCE(s.created_at, n.created_at) ASC, n.created_at ASC`,
      params
    );

    res.json({
      nodes: rows.map((row) => {
        const devEui = normalizeDevEui(row.dev_eui);
        const lastSeen = row.last_received_at || row.last_seen || null;
        const transportStatus = statusFromMeasurementTime(lastSeen, Date.now(), expectedUplinkIntervalSec(row.last_profile));
        return {
          id: row.name || devEui,
          devEui,
          name: row.name || devEui,
          nodeType: row.node_type,
          organizationId: row.organization_id,
          areaId: row.area_id,
          areaName: row.area_name || null,
          sectionId: row.section_id,
          sectionName: row.section_name || null,
          active: transportStatus !== 'offline',
          transportStatus,
          lastSeen,
          createdAt: row.created_at,
          level: row.last_battery_percent ?? null,
          batteryMv: row.last_battery_mv ?? null,
          firmwareVersion: row.last_firmware_version || null,
          profile: row.last_profile || null,
          rssi: row.last_rssi ?? null,
          snr: row.last_snr ?? null,
          spreadingFactor: row.last_spreading_factor ?? null,
          sensorPresence: row.last_sensor_presence || null,
          errorFlags: row.last_error_flags || null,
          errorCounters: row.last_error_counters || null,
          health: buildNodeHealth({
            transportStatus,
            errorFlags: row.last_error_flags,
            errorCounters: row.last_error_counters
          })
        };
      })
    });
  } catch (e) {
    console.error('[api] /nodes:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

app.get('/nodes/:devEui/sensors', requireAuth, async (req, res) => {
  const devEui = normalizeDevEui(req.params.devEui);
  if (!/^[0-9a-f]{16}$/.test(devEui)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'DevEUI must be 16 hexadecimal characters' } });
  }

  try {
    const payload = await getNodeSensorPayload(devEui, getOrganizationId(req));
    if (!payload) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Node not found' } });
    res.json(payload);
  } catch (e) {
    console.error('[api] GET /nodes/:devEui/sensors:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

app.patch('/nodes/:devEui/sensors/:port', requireAuth, requireRole('owner', 'admin', 'technician'), async (req, res) => {
  const devEui = normalizeDevEui(req.params.devEui);
  const port = String(req.params.port || '').trim();
  const role = String(req.body?.role || '').trim();
  const label = String(req.body?.label || '').trim();

  if (!/^[0-9a-f]{16}$/.test(devEui)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'DevEUI must be 16 hexadecimal characters' } });
  }
  if (port !== 'onewire') {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Only the DS18B20 probe purpose can be configured' } });
  }

  const roles = new Set([
    'unassigned_temperature',
    'substrate_temperature',
    'water_temperature',
    'pipe_temperature',
    'custom_temperature'
  ]);
  if (!roles.has(role)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid temperature probe purpose' } });
  }
  if (label.length > 80) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Sensor label must be 80 characters or fewer' } });
  }

  try {
    const payload = await getNodeSensorPayload(devEui, getOrganizationId(req));
    if (!payload) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Node not found' } });

    await query(
      `INSERT INTO node_sensor_configs (
         node_dev_eui, organization_id, port, role, label, is_enabled, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, true, now(), now())
       ON CONFLICT (node_dev_eui, port)
       DO UPDATE SET role=EXCLUDED.role, label=EXCLUDED.label, updated_at=now()`,
      [devEui, getOrganizationId(req), port, role, label || 'Temperature probe']
    );

    const updated = await getNodeSensorPayload(devEui, getOrganizationId(req));
    res.json(updated);
  } catch (e) {
    console.error('[api] PATCH /nodes/:devEui/sensors/:port:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

app.post('/nodes/register', requireAuth, requireRole('owner', 'admin', 'technician'), async (req, res) => {
  const devEui = normalizeDevEui(req.body?.devEui);
  const name = String(req.body?.name || devEui).trim();

  if (!/^[0-9a-f]{16}$/.test(devEui)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'DevEUI must be 16 hexadecimal characters' } });
  }

  let createdChirpStackDevice = false;
  try {
    const organizationId = getOrganizationId(req);
    const section = await getSectionById(req.body?.sectionId, organizationId);
    if (!section) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown sectionId' } });

    const { rows: existingRows } = await query(
      `SELECT organization_id FROM nodes WHERE lower(dev_eui)=lower($1) LIMIT 1`,
      [devEui]
    );
    if (existingRows[0] && existingRows[0].organization_id !== organizationId) {
      return res.status(409).json({ error: {
        code: 'DEVICE_ALREADY_ASSIGNED',
        message: 'This DevEUI is already assigned to another organization.'
      } });
    }

    const chirpStackResult = await createChirpStackDevice({ devEui, name: name || devEui });
    createdChirpStackDevice = chirpStackResult.created;
    await ensureChirpStackDeviceKeys(devEui);

    const { rows } = await query(
      `INSERT INTO nodes (dev_eui, organization_id, area_id, section_id, name, node_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (dev_eui)
       DO UPDATE SET area_id=EXCLUDED.area_id, section_id=EXCLUDED.section_id, name=EXCLUDED.name, archived_at=NULL
       WHERE nodes.organization_id=EXCLUDED.organization_id
       RETURNING dev_eui, organization_id, area_id, section_id, name, node_type, created_at, last_seen`,
      [devEui, organizationId, section.area_id, section.id, name || devEui, 'air']
    );

    if (!rows[0]) {
      if (createdChirpStackDevice) await deleteChirpStackDevice(devEui).catch(() => {});
      return res.status(409).json({ error: { code: 'DEVICE_ALREADY_ASSIGNED', message: 'This DevEUI is already assigned to another organization.' } });
    }

    res.status(201).json({
      node: {
        id: rows[0].name || rows[0].dev_eui,
        devEui: rows[0].dev_eui,
        name: rows[0].name,
        nodeType: rows[0].node_type,
        areaId: rows[0].area_id,
        sectionId: rows[0].section_id,
        createdAt: rows[0].created_at,
        lastSeen: rows[0].last_seen
      }
    });
  } catch (e) {
    if (createdChirpStackDevice) await deleteChirpStackDevice(devEui).catch(() => {});
    console.error('[api] /nodes/register:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

app.post('/nodes/claim', requireAuth, requireRole('owner', 'admin', 'technician'), async (req, res) => {
  const devEui = normalizeDevEui(req.body?.devEui);
  if (!/^[0-9a-f]{16}$/.test(devEui)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'DevEUI must be 16 hexadecimal characters' } });
  }

  let client;
  try {
    const organizationId = getOrganizationId(req);
    const section = await getSectionById(req.body?.sectionId, organizationId);
    if (!section) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown sectionId' } });

    client = await pool.connect();
    await client.query('BEGIN');
    // Share the ingest stream lock so no factory packet can land between cleanup and assignment.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [devEui]);
    const { rows: availableRows } = await client.query(
      `SELECT dev_eui
       FROM nodes
       WHERE dev_eui=$1
         AND organization_id IS NULL
         AND factory_status='unassigned'
         AND factory_serial IS NOT NULL
       FOR UPDATE`,
      [devEui]
    );
    if (!availableRows[0]) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: {
        code: 'NODE_NOT_AVAILABLE',
        message: 'Node was not factory-prepared or is already assigned.'
      } });
    }

    const deletedMeasurements = await client.query(
      'DELETE FROM measurements WHERE dev_eui=$1',
      [devEui]
    );
    const { rows } = await client.query(
      `UPDATE nodes SET
         organization_id=$2,
         area_id=$3,
         section_id=$4,
         factory_status='assigned',
         archived_at=NULL,
         firmware_build=NULL,
         last_seen=NULL,
         last_received_at=NULL,
         last_battery_mv=NULL,
         last_battery_percent=NULL,
         last_firmware_version=NULL,
         last_profile=NULL,
         last_rssi=NULL,
         last_snr=NULL,
         last_spreading_factor=NULL,
         last_sensor_presence=NULL,
         last_error_flags=NULL,
         last_error_counters=NULL
       WHERE dev_eui=$1
       RETURNING dev_eui, name, node_type, area_id, section_id, factory_serial, created_at, last_seen`,
      [devEui, organizationId, section.area_id, section.id]
    );
    await client.query('COMMIT');
    res.json({
      clearedMeasurements: deletedMeasurements.rowCount || 0,
      node: {
        id: rows[0].name,
        devEui: rows[0].dev_eui,
        name: rows[0].name,
        serialNumber: rows[0].factory_serial,
        nodeType: rows[0].node_type,
        areaId: rows[0].area_id,
        sectionId: rows[0].section_id,
        createdAt: rows[0].created_at,
        lastSeen: rows[0].last_seen
      }
    });
  } catch (error) {
    await client?.query('ROLLBACK').catch(() => {});
    console.error('[api] /nodes/claim:', error.message);
    sendInternalError(res, 'NODE_CLAIM_FAILED');
  } finally {
    client?.release();
  }
});

app.patch('/nodes/:devEui', requireAuth, requireRole('owner', 'admin', 'technician'), async (req, res) => {
  const devEui = normalizeDevEui(req.params.devEui);
  const nextDevEui = normalizeDevEui(req.body?.devEui || devEui);
  const name = String(req.body?.name || '').trim();
  const sectionId = String(req.body?.sectionId || '').trim();
  const organizationId = getOrganizationId(req);
  const identityChanged = nextDevEui !== devEui;

  if (!/^[0-9a-f]{16}$/.test(devEui) || !/^[0-9a-f]{16}$/.test(nextDevEui)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'DevEUI must be 16 hexadecimal characters' } });
  }
  if (!name && !sectionId && !identityChanged) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Nothing to update' } });
  }

  let createdChirpStackDevice = false;
  try {
    const { rows: currentRows } = await query(
      `SELECT dev_eui FROM nodes WHERE lower(dev_eui)=$1 AND organization_id=$2 AND archived_at IS NULL`,
      [devEui, organizationId]
    );
    if (!currentRows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Node not found' } });

    let section = null;
    if (sectionId) {
      section = await getSectionById(sectionId, organizationId);
      if (!section) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown sectionId' } });
    }

    if (identityChanged) {
      const { rows: conflictingRows } = await query(
        `SELECT dev_eui FROM nodes WHERE lower(dev_eui)=$1 LIMIT 1`,
        [nextDevEui]
      );
      if (conflictingRows[0]) {
        return res.status(409).json({ error: {
          code: 'DEVICE_ALREADY_ASSIGNED',
          message: 'This DevEUI is already assigned to a node.'
        } });
      }

      const chirpStackResult = await createChirpStackDevice({ devEui: nextDevEui, name: name || nextDevEui });
      createdChirpStackDevice = chirpStackResult.created;
      await ensureChirpStackDeviceKeys(nextDevEui);
    }

    const { rows } = await query(
      `UPDATE nodes
       SET dev_eui=$1,
           name=COALESCE(NULLIF($2, ''), name),
           section_id=COALESCE($3, section_id),
           area_id=COALESCE($4, area_id),
           organization_id=$5
       WHERE lower(dev_eui)=$6 AND organization_id=$5 AND archived_at IS NULL
       RETURNING dev_eui, name, node_type, area_id, section_id, created_at, last_seen`,
      [nextDevEui, name, section?.id || null, section?.area_id || null, organizationId, devEui]
    );

    if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Node not found' } });
    if (identityChanged) {
      deleteChirpStackDevice(devEui).catch((error) => {
        console.error('[api] old ChirpStack device cleanup:', devEui, error.message);
      });
    }
    res.json({ node: {
      devEui: rows[0].dev_eui,
      name: rows[0].name,
      nodeType: rows[0].node_type,
      areaId: rows[0].area_id,
      sectionId: rows[0].section_id,
      createdAt: rows[0].created_at,
      lastSeen: rows[0].last_seen,
    } });
  } catch (e) {
    if (identityChanged && createdChirpStackDevice) {
      await deleteChirpStackDevice(nextDevEui).catch(() => {});
    }
    console.error('[api] PATCH /nodes/:devEui:', e.message);
    if (e.code === '23505') {
      return res.status(409).json({ error: { code: 'DEVICE_ALREADY_ASSIGNED', message: 'This DevEUI is already assigned to a node.' } });
    }
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
});

app.delete('/nodes/:devEui', requireAuth, requireRole('owner', 'admin', 'technician'), async (req, res) => {
  const devEui = normalizeDevEui(req.params.devEui);
  const historyPolicy = String(req.query.history || 'keep').trim().toLowerCase();

  if (!/^[0-9a-f]{16}$/.test(devEui)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'DevEUI must be 16 hexadecimal characters' } });
  }
  if (!['keep', 'delete'].includes(historyPolicy)) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'history must be either keep or delete' } });
  }

  let client;
  try {
    client = await pool.connect();
    const organizationId = getOrganizationId(req);
    await client.query('BEGIN');
    const { rows: ownedRows } = await client.query(
      `SELECT dev_eui, name, node_type, created_at, last_seen
       FROM nodes
       WHERE lower(dev_eui)=$1 AND organization_id=$2 AND archived_at IS NULL
       FOR UPDATE`,
      [devEui, organizationId]
    );
    if (!ownedRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Node not found' } });
    }

    const { rows: historyRows } = await client.query(
      `SELECT COUNT(*)::int AS count FROM measurements WHERE lower(dev_eui)=$1`,
      [devEui]
    );
    const measurementCount = Number(historyRows[0]?.count || 0);
    let measurementsDeleted = 0;

    if (historyPolicy === 'delete') {
      const measurementResult = await client.query(
        `DELETE FROM measurements WHERE lower(dev_eui)=$1`,
        [devEui]
      );
      measurementsDeleted = measurementResult.rowCount;
      await client.query(
        `DELETE FROM nodes WHERE lower(dev_eui)=$1 AND organization_id=$2`,
        [devEui, organizationId]
      );
    } else {
      await client.query(
        `UPDATE nodes SET archived_at=now()
         WHERE lower(dev_eui)=$1 AND organization_id=$2`,
        [devEui, organizationId]
      );
    }

    await client.query('COMMIT');

    let chirpStackDeleted = true;
    try {
      await deleteChirpStackDevice(devEui);
    } catch (chirpStackError) {
      chirpStackDeleted = false;
      console.error('[api] ChirpStack node cleanup:', devEui, chirpStackError.message);
    }

    const node = ownedRows[0];
    res.json({
      deleted: true,
      historyPolicy,
      measurementsRetained: historyPolicy === 'keep' ? measurementCount : 0,
      measurementsDeleted,
      chirpStackDeleted,
      node: {
        devEui: node.dev_eui,
        name: node.name,
        nodeType: node.node_type,
        createdAt: node.created_at,
        lastSeen: node.last_seen,
      },
    });
  } catch (e) {
    await client?.query('ROLLBACK').catch(() => {});
    console.error('[api] DELETE /nodes/:devEui:', e.message);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  } finally {
    client?.release();
  }
});

app.get('/health', async (req, res) => {
  try { await query('SELECT 1'); res.json({ status: 'ok' }); } catch { res.status(503).json({ status: 'degraded' }); }
});

app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
});

app.use((err, req, res, next) => {
  console.error('[api] unhandled:', err?.message || err);
  if (res.headersSent) return next(err);
  const safeError = publicError(err);
  res.status(safeError.status).json({
    error: {
      code: safeError.code,
      message: safeError.message
    }
  });
});

await runMigrations();
const server = app.listen(PORT, HOST, () => console.log(`[api] klausomasi :${PORT} (auth aktyvus)`));
const stopMeasurementRetention = startMeasurementRetention(pool);
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${signal}: shutting down`);
  stopMeasurementRetention();
  server.closeIdleConnections?.();
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
}
process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
