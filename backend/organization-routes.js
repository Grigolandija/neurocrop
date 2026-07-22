import crypto from 'crypto';
import { randomUUID } from 'crypto';
import fs from 'fs';
import { sendInvitationEmail } from './email.js';
import { query, pool } from './db.js';
import { requirePlatformAdmin, requireSuperAdmin, requireUserAuth } from './auth-users.js';
import { statusFromMeasurementTime } from './score.js';
import { buildNodeHealth, expectedUplinkIntervalSec } from './node-health.js';

const INVITE_TTL_DAYS = 14;
const APP_BASE_URL = process.env.APP_BASE_URL || process.env.APP_URL || 'https://neurocrop.lt';

function configuredValue(envName, secretPath, fallback = '') {
  const environmentValue = String(process.env[envName] || '').trim();
  if (environmentValue) return environmentValue;
  try {
    return fs.readFileSync(secretPath, 'utf8').trim() || fallback;
  } catch {
    return fallback;
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function makeOrganizationId() {
  return `org-${randomUUID().slice(0, 8)}`;
}

function newInviteToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function inviteUrl(token) {
  return `${APP_BASE_URL}/accept-invite?token=${encodeURIComponent(token)}`;
}

function publicInvitation(row, token = null) {
  const invitation = {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    email: row.email,
    role: row.role,
    expiresAt: row.expires_at,
    createdAt: row.created_at
  };

  if (token) invitation.inviteUrl = inviteUrl(token);
  return invitation;
}

function publicOrganizationRequest(row) {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    name: row.display_name,
    organizationName: row.organization_name,
    status: row.status,
    reviewedBy: row.reviewed_by_name || null,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function seedDefaultCropProfile(client, organizationId) {
  await client.query(
    `INSERT INTO crop_profiles (
       id, organization_id, name, hero_name, stage, hint, requires_review, metrics, created_at, updated_at
     ) VALUES (
       'default', $1, 'Default', 'Default', 'Default',
       'Universal starter profile. Review target ranges before assigning it to production sections.',
       false, '{}'::jsonb, now(), now()
     ) ON CONFLICT (organization_id, id) DO NOTHING`,
    [organizationId]
  );
}

export function registerPlatformOrganizationRoutes(app) {
  app.get('/platform/integrations', requireUserAuth, requirePlatformAdmin, async (req, res, next) => {
    try {
      await query('SELECT 1');
      const chirpstackUrl = String(process.env.CHIRPSTACK_API_URL || 'http://chirpstack-rest-api:8090/api').trim();
      const chirpstackTokenConfigured = Boolean(configuredValue('CHIRPSTACK_API_TOKEN', '/run/secrets/chirpstack_api_token'));
      const chirpstackApplicationConfigured = Boolean(configuredValue('CHIRPSTACK_APPLICATION_ID', '/run/secrets/chirpstack_application_id'));
      const chirpstackDeviceProfileConfigured = Boolean(configuredValue('CHIRPSTACK_DEVICE_PROFILE_ID', '/run/secrets/chirpstack_device_profile_id'));
      const chirpstackConfigured = Boolean(
        chirpstackUrl && chirpstackTokenConfigured && chirpstackApplicationConfigured && chirpstackDeviceProfileConfigured
      );
      let chirpstackEndpoint = null;
      try {
        chirpstackEndpoint = chirpstackUrl ? new URL(chirpstackUrl).host : null;
      } catch {
        chirpstackEndpoint = null;
      }
      const emailConfigured = Boolean(configuredValue('RESEND_API_KEY', '/run/secrets/resend_api_key'));
      res.json({
        integrations: [
          {
            id: 'chirpstack',
            name: 'ChirpStack',
            detail: 'LoRaWAN devices and uplink ingestion',
            configured: chirpstackConfigured,
            state: chirpstackConfigured ? 'connected' : 'configuration_required',
            endpoint: chirpstackEndpoint
          },
          {
            id: 'database',
            name: 'PostgreSQL',
            detail: 'Tenant data, measurements, and configuration',
            configured: true,
            state: 'connected',
            endpoint: null
          },
          {
            id: 'email',
            name: 'Email delivery',
            detail: 'Workspace invitations and operational email',
            configured: emailConfigured,
            state: emailConfigured ? 'connected' : 'configuration_required',
            endpoint: emailConfigured ? 'Resend' : null
          },
          {
            id: 'api',
            name: 'NeuroCrop API',
            detail: 'Authenticated application and export API',
            configured: true,
            state: 'connected',
            endpoint: null
          }
        ]
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/platform/users', requireUserAuth, requirePlatformAdmin, async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT u.id, u.email, u.display_name, u.is_active, u.is_platform_admin, u.is_super_admin, u.last_login_at, u.created_at,
                COUNT(DISTINCT m.organization_id)::int AS organization_count,
                COUNT(DISTINCT r.id) FILTER (WHERE r.status='pending')::int AS pending_request_count
         FROM users u
         LEFT JOIN organization_memberships m ON m.user_id=u.id
         LEFT JOIN organization_requests r ON r.user_id=u.id
         GROUP BY u.id
         ORDER BY u.created_at DESC`
      );

      res.json({
        users: rows.map((row) => ({
          id: row.id,
          email: row.email,
          name: row.display_name,
          active: row.is_active,
          isPlatformAdmin: row.is_platform_admin || row.is_super_admin,
          isSuperAdmin: row.is_super_admin,
          organizationCount: row.organization_count,
          pendingRequestCount: row.pending_request_count,
          lastLoginAt: row.last_login_at,
          createdAt: row.created_at
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/platform/organization-requests', requireUserAuth, requirePlatformAdmin, async (req, res, next) => {
    try {
      const status = String(req.query.status || 'pending').trim().toLowerCase();
      const allowedStatuses = new Set(['pending', 'approved', 'rejected', 'cancelled', 'all']);
      if (!allowedStatuses.has(status)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request status' } });
      }

      const params = [];
      const where = status === 'all' ? '' : 'WHERE r.status=$1';
      if (status !== 'all') params.push(status);

      const { rows } = await query(
        `SELECT r.id, r.user_id, r.organization_name, r.status, r.reviewed_at, r.created_at, r.updated_at,
                u.email, u.display_name,
                reviewer.display_name AS reviewed_by_name
         FROM organization_requests r
         JOIN users u ON u.id=r.user_id
         LEFT JOIN users reviewer ON reviewer.id=r.reviewed_by
         ${where}
         ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC`,
        params
      );

      res.json({ requests: rows.map(publicOrganizationRequest) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/platform/organization-requests/:requestId/approve', requireUserAuth, requirePlatformAdmin, async (req, res, next) => {
    const requestId = String(req.params.requestId || '').trim();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows: requestRows } = await client.query(
        `SELECT r.id, r.user_id, r.organization_name, r.status, u.email, u.display_name
         FROM organization_requests r
         JOIN users u ON u.id=r.user_id
         WHERE r.id=$1
         FOR UPDATE`,
        [requestId]
      );
      const request = requestRows[0];

      if (!request) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Organization request not found' } });
      }
      if (request.status !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: { code: 'REQUEST_NOT_PENDING', message: 'Only pending organization requests can be approved' } });
      }

      const organizationId = makeOrganizationId();
      const { rows: organizationRows } = await client.query(
        `INSERT INTO organizations (id, name, status, created_at)
         VALUES ($1, $2, 'active', now())
         RETURNING id, name, status, archived_at, created_at`,
        [organizationId, request.organization_name]
      );

      await client.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role, created_at)
         VALUES ($1, $2, 'owner', now())
         ON CONFLICT (organization_id, user_id)
         DO UPDATE SET role='owner'`,
        [organizationId, request.user_id]
      );
      await seedDefaultCropProfile(client, organizationId);

      const { rows: updatedRequestRows } = await client.query(
        `UPDATE organization_requests
         SET status='approved', reviewed_by=$2, reviewed_at=now(), updated_at=now()
         WHERE id=$1
         RETURNING id, user_id, organization_name, status, reviewed_at, created_at, updated_at`,
        [requestId, req.user.id]
      );

      await client.query('COMMIT');

      res.json({
        organization: {
          id: organizationRows[0].id,
          name: organizationRows[0].name,
          status: organizationRows[0].status,
          archivedAt: organizationRows[0].archived_at,
          createdAt: organizationRows[0].created_at
        },
        request: publicOrganizationRequest({
          ...updatedRequestRows[0],
          email: request.email,
          display_name: request.display_name,
          reviewed_by_name: req.user.name
        })
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  });

  app.post('/platform/organization-requests/:requestId/reject', requireUserAuth, requirePlatformAdmin, async (req, res, next) => {
    const requestId = String(req.params.requestId || '').trim();
    try {
      const { rows } = await query(
        `UPDATE organization_requests r
         SET status='rejected', reviewed_by=$2, reviewed_at=now(), updated_at=now()
         FROM users u
         WHERE r.id=$1
           AND r.user_id=u.id
           AND r.status='pending'
         RETURNING r.id, r.user_id, r.organization_name, r.status, r.reviewed_at, r.created_at, r.updated_at,
                   u.email, u.display_name`,
        [requestId, req.user.id]
      );

      if (!rows[0]) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Pending organization request not found' } });
      }

      res.json({ request: publicOrganizationRequest({ ...rows[0], reviewed_by_name: req.user.name }) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/platform/organizations', requireUserAuth, requirePlatformAdmin, async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT o.id, o.name, o.status, o.archived_at, o.created_at,
                COUNT(DISTINCT m.user_id)::int AS member_count,
                COUNT(DISTINCT a.id)::int AS area_count,
                COUNT(DISTINCT s.id)::int AS section_count,
                COUNT(DISTINCT n.dev_eui)::int AS node_count,
                COUNT(DISTINCT n.dev_eui) FILTER (
                  WHERE EXISTS (
                    SELECT 1
                    FROM jsonb_each(COALESCE(n.last_error_flags, '{}'::jsonb)) AS flag(key, value)
                    WHERE value='true'::jsonb
                  )
                )::int AS fault_node_count
         FROM organizations o
         LEFT JOIN organization_memberships m ON m.organization_id=o.id
         LEFT JOIN areas a ON a.organization_id=o.id
         LEFT JOIN sections s ON s.organization_id=o.id
         LEFT JOIN nodes n ON n.organization_id=o.id
         GROUP BY o.id
         ORDER BY o.created_at DESC`
      );

      res.json({
        organizations: rows.map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status || 'active',
          archivedAt: row.archived_at,
          createdAt: row.created_at,
          memberCount: row.member_count,
          areaCount: row.area_count,
          sectionCount: row.section_count,
          nodeCount: row.node_count,
          faultNodeCount: row.fault_node_count
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/platform/organizations/:organizationId/nodes', requireUserAuth, requirePlatformAdmin, async (req, res, next) => {
    const organizationId = String(req.params.organizationId || '').trim();
    if (!organizationId) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Organization id is required' } });
    }

    try {
      const { rows: organizationRows } = await query(
        `SELECT id FROM organizations WHERE id=$1`,
        [organizationId]
      );
      if (!organizationRows[0]) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
      }

      const { rows } = await query(
        `SELECT n.dev_eui, n.name, n.node_type, n.area_id, n.section_id,
                a.name AS area_name, s.name AS section_name,
                n.last_seen, n.last_received_at, n.last_battery_mv, n.last_battery_percent,
                n.last_firmware_version, n.last_profile, n.last_rssi, n.last_snr,
                n.last_spreading_factor, n.last_sensor_presence, n.last_error_flags,
                n.last_error_counters
         FROM nodes n
         LEFT JOIN areas a ON a.id=n.area_id AND a.organization_id=n.organization_id
         LEFT JOIN sections s ON s.id=n.section_id AND s.organization_id=n.organization_id
         WHERE n.organization_id=$1
         ORDER BY COALESCE(a.created_at, n.created_at) ASC, COALESCE(s.created_at, n.created_at) ASC, n.created_at ASC`,
        [organizationId]
      );
      const now = Date.now();
      res.json({
        nodes: rows.map((row) => {
          const lastSeen = row.last_received_at || row.last_seen || null;
          const transportStatus = statusFromMeasurementTime(lastSeen, now, expectedUplinkIntervalSec(row.last_profile));
          return {
            id: row.name || row.dev_eui,
            devEui: row.dev_eui,
            name: row.name || row.dev_eui,
            nodeType: row.node_type,
            areaId: row.area_id,
            areaName: row.area_name || null,
            sectionId: row.section_id,
            sectionName: row.section_name || null,
            lastSeen,
            transportStatus,
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
    } catch (error) {
      next(error);
    }
  });

  app.post('/platform/organizations', requireUserAuth, requirePlatformAdmin, async (req, res, next) => {
    const organizationName = normalizeName(req.body?.organizationName || req.body?.name);
    const ownerEmail = normalizeEmail(req.body?.ownerEmail || req.body?.email);

    if (!organizationName) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Organization name is required' } });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Valid owner email is required' } });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const organizationId = makeOrganizationId();
      const token = newInviteToken();

      const { rows: organizationRows } = await client.query(
        `INSERT INTO organizations (id, name, created_at)
         VALUES ($1, $2, now())
         RETURNING id, name, created_at`,
        [organizationId, organizationName]
      );

      const { rows: invitationRows } = await client.query(
        `INSERT INTO invitations (
           id, organization_id, email, role, token_hash, invited_by, expires_at, created_at
         ) VALUES ($1, $2, $3, 'owner', $4, $5, now() + ($6 || ' days')::interval, now())
         RETURNING id, organization_id, email, role, expires_at, created_at`,
        [randomUUID(), organizationId, ownerEmail, hashToken(token), req.user.id, String(INVITE_TTL_DAYS)]
      );
      await seedDefaultCropProfile(client, organizationId);

      await client.query('COMMIT');

      let emailDelivery = { sent: false };

      try {
        emailDelivery = await sendInvitationEmail({
          to: invitationRows[0].email,
          organizationName: organizationRows[0].name,
          role: invitationRows[0].role,
          inviteUrl: inviteUrl(token)
        });
      } catch (error) {
        console.error('[email] owner invitation send failed:', error.message);
        emailDelivery = { sent: false, error: error.message };
      }

      res.status(201).json({
        organization: {
          id: organizationRows[0].id,
          name: organizationRows[0].name,
          status: 'active',
          archivedAt: null,
          createdAt: organizationRows[0].created_at
        },
        invitation: {
          ...publicInvitation({
            ...invitationRows[0],
            organization_name: organizationRows[0].name
          }, token),
          emailDelivery
        }
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  });


  app.delete('/platform/organizations/:organizationId', requireUserAuth, requireSuperAdmin, async (req, res, next) => {
    const organizationId = String(req.params.organizationId || '').trim();
    const confirmation = String(req.body?.confirm || req.query.confirm || '').trim();

    if (!organizationId) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Organization id is required' } });
    }

    if (organizationId === req.user.organizationId) {
      return res.status(409).json({ error: { code: 'ACTIVE_ORGANIZATION', message: 'Switch to another organization before deleting this one' } });
    }

    if (confirmation !== 'delete') {
      return res.status(400).json({ error: { code: 'CONFIRMATION_REQUIRED', message: 'Send confirm=delete to permanently delete this organization and its data' } });
    }

    const client = await pool.connect();
    let organization = null;
    let devEuis = [];
    let deletedUserIds = [];
    const summary = {
      measurements: 0,
      sensorConfigs: 0,
      nodes: 0,
      cropProfiles: 0,
      sections: 0,
      areas: 0,
      sessions: 0,
      invitations: 0,
      memberships: 0,
      users: 0,
      chirpstackDevices: 0,
      chirpstackErrors: []
    };

    try {
      await client.query('BEGIN');

      const { rows: organizationRows } = await client.query(
        `SELECT id, name, status, created_at FROM organizations WHERE id=$1 FOR UPDATE`,
        [organizationId]
      );

      organization = organizationRows[0] || null;
      if (!organization) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Organization not found' } });
      }

      const { rows: nodeRows } = await client.query(
        `SELECT dev_eui FROM nodes WHERE organization_id=$1`,
        [organizationId]
      );
      devEuis = nodeRows.map((row) => row.dev_eui).filter(Boolean);

      if (devEuis.length > 0) {
        const measurementResult = await client.query(
          `DELETE FROM measurements WHERE dev_eui = ANY($1::text[])`,
          [devEuis]
        );
        summary.measurements = measurementResult.rowCount;

        const sensorConfigResult = await client.query(
          `DELETE FROM node_sensor_configs WHERE node_dev_eui = ANY($1::text[])`,
          [devEuis]
        );
        summary.sensorConfigs = sensorConfigResult.rowCount;
      }

      summary.nodes = (await client.query(`DELETE FROM nodes WHERE organization_id=$1`, [organizationId])).rowCount;
      summary.cropProfiles = (await client.query(`DELETE FROM crop_profiles WHERE organization_id=$1`, [organizationId])).rowCount;
      summary.sections = (await client.query(`DELETE FROM sections WHERE organization_id=$1`, [organizationId])).rowCount;
      summary.areas = (await client.query(`DELETE FROM areas WHERE organization_id=$1`, [organizationId])).rowCount;
      summary.sessions = (await client.query(`DELETE FROM auth_sessions WHERE organization_id=$1`, [organizationId])).rowCount;
      summary.invitations = (await client.query(`DELETE FROM invitations WHERE organization_id=$1`, [organizationId])).rowCount;

      const { rows: membershipRows, rowCount: membershipCount } = await client.query(
        `DELETE FROM organization_memberships WHERE organization_id=$1 RETURNING user_id`,
        [organizationId]
      );
      summary.memberships = membershipCount;
      deletedUserIds = membershipRows.map((row) => row.user_id).filter(Boolean);

      const { rows: deletedOrganizationRows } = await client.query(
        `DELETE FROM organizations WHERE id=$1 RETURNING id, name, status, created_at`,
        [organizationId]
      );

      if (deletedUserIds.length > 0) {
        summary.users = (await client.query(
          `DELETE FROM users u
           WHERE u.id = ANY($1::text[])
             AND u.is_platform_admin=false
             AND u.is_super_admin=false
             AND NOT EXISTS (
               SELECT 1 FROM organization_memberships m WHERE m.user_id=u.id
             )`,
          [deletedUserIds]
        )).rowCount;
      }

      await client.query('COMMIT');
      organization = deletedOrganizationRows[0] || organization;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      return next(error);
    } finally {
      client.release();
    }

    for (const devEui of devEuis) {
      try {
        await req.app.locals.deleteChirpStackDevice(devEui);
        summary.chirpstackDevices += 1;
      } catch (error) {
        console.error('[api] delete organization ChirpStack cleanup:', devEui, error.message);
        summary.chirpstackErrors.push({ devEui, message: error.message });
      }
    }

    res.json({
      deleted: true,
      organization: {
        id: organization.id,
        name: organization.name,
        status: organization.status || 'deleted',
        createdAt: organization.created_at
      },
      summary
    });
  });

  app.get('/platform/admins', requireUserAuth, requirePlatformAdmin, async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT id, email, display_name, is_active, last_login_at, created_at
         FROM users
         WHERE is_platform_admin=true
         ORDER BY lower(email) ASC`
      );

      res.json({
        admins: rows.map((row) => ({
          id: row.id,
          email: row.email,
          name: row.display_name,
          active: row.is_active,
          lastLoginAt: row.last_login_at,
          createdAt: row.created_at
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/platform/admins', requireUserAuth, requireSuperAdmin, async (req, res, next) => {
    const userId = String(req.body?.userId || '').trim();
    const email = normalizeEmail(req.body?.email);

    if (!userId && !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'User id or valid user email is required' } });
    }

    try {
      const { rows } = await query(
        `UPDATE users
         SET is_platform_admin=true, updated_at=now()
         WHERE (($1 <> '' AND id=$1) OR ($1 = '' AND lower(email)=lower($2)))
           AND is_active=true AND is_super_admin=false
         RETURNING id, email, display_name, is_platform_admin, is_super_admin, is_active, last_login_at, created_at`,
        [userId, email]
      );

      if (!rows[0]) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Active user not found. Invite and accept the account before granting platform admin access.' } });
      }

      res.json({ admin: {
        id: rows[0].id,
        email: rows[0].email,
        name: rows[0].display_name,
        isPlatformAdmin: rows[0].is_platform_admin,
        active: rows[0].is_active,
        lastLoginAt: rows[0].last_login_at,
        createdAt: rows[0].created_at
      } });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/platform/admins/:userId', requireUserAuth, requireSuperAdmin, async (req, res, next) => {
    const userId = String(req.params.userId || '').trim();

    if (!userId) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'User id is required' } });
    }

    if (userId === req.user.id) {
      return res.status(409).json({ error: { code: 'SELF_REVOKE', message: 'You cannot remove your own platform admin access' } });
    }

    try {
      const { rows: countRows } = await query(
        `SELECT COUNT(*)::int AS count FROM users WHERE is_platform_admin=true AND is_active=true`
      );

      if ((countRows[0]?.count || 0) <= 1) {
        return res.status(409).json({ error: { code: 'LAST_PLATFORM_ADMIN', message: 'At least one active platform admin must remain' } });
      }

      const { rows } = await query(
        `UPDATE users
         SET is_platform_admin=false, updated_at=now()
         WHERE id=$1 AND is_platform_admin=true AND is_super_admin=false
         RETURNING id, email, display_name, is_platform_admin, is_super_admin, is_active, last_login_at, created_at`,
        [userId]
      );

      if (!rows[0]) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Platform admin not found' } });
      }

      res.json({ admin: {
        id: rows[0].id,
        email: rows[0].email,
        name: rows[0].display_name,
        isPlatformAdmin: rows[0].is_platform_admin,
        active: rows[0].is_active,
        lastLoginAt: rows[0].last_login_at,
        createdAt: rows[0].created_at
      } });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/platform/users/:userId/status', requireUserAuth, requireSuperAdmin, async (req, res, next) => {
    const userId = String(req.params.userId || '').trim();
    const isActive = req.body?.active;

    if (!userId || typeof isActive !== 'boolean') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'User id and boolean active status are required' } });
    }
    if (userId === req.user.id && isActive === false) {
      return res.status(409).json({ error: { code: 'SELF_DEACTIVATE', message: 'You cannot deactivate your own account' } });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: userRows } = await client.query(
        `SELECT id, email, display_name, is_active, is_platform_admin, is_super_admin
         FROM users WHERE id=$1 FOR UPDATE`,
        [userId]
      );
      const user = userRows[0];
      if (!user) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      }
      if (user.is_super_admin && isActive === false) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: { code: 'PROTECTED_ACCOUNT', message: 'Super administrator account cannot be deactivated' } });
      }

      if (isActive === false) {
        const { rows: soleOwnerRows } = await client.query(
          `SELECT o.id, o.name
           FROM organization_memberships membership
           JOIN organizations o ON o.id=membership.organization_id
           WHERE membership.user_id=$1 AND membership.role='owner'
             AND NOT EXISTS (
               SELECT 1 FROM organization_memberships other
               WHERE other.organization_id=membership.organization_id
                 AND other.user_id<>membership.user_id
                 AND other.role='owner'
             )
           LIMIT 1`,
          [userId]
        );
        if (soleOwnerRows[0]) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            error: {
              code: 'SOLE_ORGANIZATION_OWNER',
              message: `Assign another owner to ${soleOwnerRows[0].name} before deactivating this user`
            }
          });
        }
      }

      const { rows } = await client.query(
        `UPDATE users SET is_active=$2, updated_at=now()
         WHERE id=$1
         RETURNING id, email, display_name, is_active, is_platform_admin, is_super_admin, last_login_at, created_at`,
        [userId, isActive]
      );
      if (!isActive) {
        await client.query(
          `UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at, now())
           WHERE user_id=$1 AND revoked_at IS NULL`,
          [userId]
        );
      }
      await client.query('COMMIT');
      res.json({
        user: {
          id: rows[0].id,
          email: rows[0].email,
          name: rows[0].display_name,
          active: rows[0].is_active,
          isPlatformAdmin: rows[0].is_platform_admin || rows[0].is_super_admin,
          isSuperAdmin: rows[0].is_super_admin,
          lastLoginAt: rows[0].last_login_at,
          createdAt: rows[0].created_at
        }
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  });

  app.delete('/platform/users/:userId', requireUserAuth, requireSuperAdmin, async (req, res, next) => {
    const userId = String(req.params.userId || '').trim();
    const confirmation = String(req.body?.confirm || req.query.confirm || '').trim();

    if (!userId) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'User id is required' } });
    }
    if (confirmation !== 'delete') {
      return res.status(400).json({ error: { code: 'CONFIRMATION_REQUIRED', message: 'Send confirm=delete to permanently delete this user' } });
    }
    if (userId === req.user.id) {
      return res.status(409).json({ error: { code: 'SELF_DELETE', message: 'You cannot delete your own account' } });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: userRows } = await client.query(
        `SELECT id, email, display_name, is_super_admin FROM users WHERE id=$1 FOR UPDATE`,
        [userId]
      );
      const user = userRows[0];
      if (!user) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
      }
      if (user.is_super_admin) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: { code: 'PROTECTED_ACCOUNT', message: 'Super administrator account cannot be deleted' } });
      }

      const { rows: soleOwnerRows } = await client.query(
        `SELECT o.id, o.name
         FROM organization_memberships membership
         JOIN organizations o ON o.id=membership.organization_id
         WHERE membership.user_id=$1 AND membership.role='owner'
           AND NOT EXISTS (
             SELECT 1 FROM organization_memberships other
             WHERE other.organization_id=membership.organization_id
               AND other.user_id<>membership.user_id
               AND other.role='owner'
           )
         LIMIT 1`,
        [userId]
      );
      if (soleOwnerRows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: {
            code: 'SOLE_ORGANIZATION_OWNER',
            message: `Assign another owner to ${soleOwnerRows[0].name} before deleting this user`
          }
        });
      }

      const summary = {
        sessions: (await client.query(`DELETE FROM auth_sessions WHERE user_id=$1`, [userId])).rowCount,
        invitations: (await client.query(`DELETE FROM invitations WHERE lower(email)=lower($1)`, [user.email])).rowCount,
        requests: (await client.query(`DELETE FROM organization_requests WHERE user_id=$1`, [userId])).rowCount,
        memberships: (await client.query(`DELETE FROM organization_memberships WHERE user_id=$1`, [userId])).rowCount
      };
      const { rows } = await client.query(
        `DELETE FROM users WHERE id=$1 RETURNING id, email, display_name`,
        [userId]
      );
      await client.query('COMMIT');
      res.json({
        deleted: true,
        user: { id: rows[0].id, email: rows[0].email, name: rows[0].display_name },
        summary
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  });

  app.patch('/platform/organizations/:organizationId/archive', requireUserAuth, requirePlatformAdmin, async (req, res, next) => {
    const organizationId = String(req.params.organizationId || '').trim();

    if (!organizationId) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Organization id is required' } });
    }

    if (organizationId === req.user.organizationId) {
      return res.status(409).json({ error: { code: 'ACTIVE_ORGANIZATION', message: 'Switch to another organization before archiving this one' } });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `UPDATE organizations
         SET status='archived', archived_at=now(), archived_by=$2
         WHERE id=$1 AND status <> 'archived'
         RETURNING id, name, status, archived_at, created_at`,
        [organizationId, req.user.id]
      );

      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Active organization not found' } });
      }

      await client.query(
        `UPDATE auth_sessions
         SET revoked_at=COALESCE(revoked_at, now())
         WHERE organization_id=$1 AND revoked_at IS NULL`,
        [organizationId]
      );

      await client.query('COMMIT');

      res.json({ organization: {
        id: rows[0].id,
        name: rows[0].name,
        status: rows[0].status,
        archivedAt: rows[0].archived_at,
        createdAt: rows[0].created_at
      } });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  });

  app.patch('/platform/organizations/:organizationId/restore', requireUserAuth, requirePlatformAdmin, async (req, res, next) => {
    const organizationId = String(req.params.organizationId || '').trim();

    if (!organizationId) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Organization id is required' } });
    }

    try {
      const { rows } = await query(
        `UPDATE organizations
         SET status='active', archived_at=NULL, archived_by=NULL
         WHERE id=$1 AND status='archived'
         RETURNING id, name, status, archived_at, created_at`,
        [organizationId]
      );

      if (!rows[0]) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Archived organization not found' } });
      }

      res.json({ organization: {
        id: rows[0].id,
        name: rows[0].name,
        status: rows[0].status,
        archivedAt: rows[0].archived_at,
        createdAt: rows[0].created_at
      } });
    } catch (error) {
      next(error);
    }
  });

}
