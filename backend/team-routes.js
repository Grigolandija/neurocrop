import { createHash, randomBytes, randomUUID } from 'crypto';
import { sendInvitationEmail } from './email.js';
import { pool, query } from './db.js';
import {
  createUserSession,
  findUserForLogin,
  getMemberships,
  hashUserPassword,
  normalizeEmail,
  requireRole,
  requireUserAuth,
  revokeUserSession,
  sessionCookieOptions,
  verifyUserPassword
} from './auth-users.js';
import { createMemoryRateLimiter } from './rate-limit.js';

const INVITE_TTL_DAYS = 7;
const INVITABLE_ROLES = new Set(['admin', 'grower', 'technician', 'viewer']);
const registrationLimiter = createMemoryRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function newInvitationToken() {
  return randomBytes(32).toString('base64url');
}

function publicMembership(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.display_name,
    role: row.role,
    joinedAt: row.created_at
  };
}

function organizationId(req) {
  return req.user.organizationId;
}

function appUrl() {
  return String(process.env.APP_URL || 'https://neurocrop.lt').replace(/\/+$/, '');
}

function invitationResponse(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    invitedBy: row.invited_by_name || null
  };
}

export function registerTeamRoutes(app) {
  app.post('/auth/register', async (req, res, next) => {
    try {
      const registrationKey = String(req.ip || 'unknown');
      if (registrationLimiter.isLimited(registrationKey)) {
        return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many registration attempts. Try again later.' } });
      }
      registrationLimiter.record(registrationKey);
      const email = normalizeEmail(req.body?.email);
      const displayName = String(req.body?.name || '').trim().replace(/\s+/g, ' ');
      const password = String(req.body?.password || '');
      const organizationName = String(req.body?.organizationName || '').trim().replace(/\s+/g, ' ');

      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid email is required' } });
      }
      if (!displayName) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Your name is required' } });
      }
      if (!organizationName) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Organization name is required' } });
      }

      let passwordHash;
      try {
        passwordHash = hashUserPassword(password);
      } catch (error) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: error.message } });
      }

      const { rows: existingRows } = await query(
        `SELECT id FROM users WHERE lower(email)=lower($1) LIMIT 1`,
        [email]
      );
      if (existingRows[0]) {
        return res.status(409).json({ error: { code: 'ACCOUNT_EXISTS', message: 'An account with this email already exists' } });
      }

      const userId = randomUUID();
      const requestId = randomUUID();

      await query(
        `WITH new_user AS (
           INSERT INTO users (id, email, display_name, password_hash, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, true, now(), now())
           RETURNING id, email, display_name, created_at
         ), new_request AS (
           INSERT INTO organization_requests (id, user_id, organization_name, status, created_at, updated_at)
           VALUES ($5, $1, $6, 'pending', now(), now())
           RETURNING id
         )
         SELECT 1`,
        [userId, email, displayName, passwordHash, requestId, organizationName]
      );

      res.status(201).json({
        user: {
          id: userId,
          email,
          name: displayName,
          hasOrganization: false
        },
        organizationRequest: {
          id: requestId,
          organizationName,
          status: 'pending'
        },
        message: 'Account created. NeuroCrop will review the organization request before workspace access is enabled.'
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/auth/organizations', requireUserAuth, async (req, res, next) => {
    try {
      const organizations = await getMemberships(req.user.id);
      res.json({
        organizations: organizations.map((item) => ({
          id: item.organization_id,
          name: item.organization_name,
          role: item.role
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/auth/switch-organization', requireUserAuth, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const nextOrganizationId = String(req.body?.organizationId || '').trim();
      const memberships = await getMemberships(req.user.id);
      const membership = memberships.find((item) => item.organization_id === nextOrganizationId);

      if (!membership) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'You are not a member of this organization' }
        });
      }

      await client.query('BEGIN');
      const execute = client.query.bind(client);
      await revokeUserSession(req.cookies?.neurocrop_session, execute);
      const session = await createUserSession(req.user.id, membership.organization_id, execute);
      await client.query('COMMIT');
      res.cookie('neurocrop_session', session.token, sessionCookieOptions());

      res.json({
        user: {
          id: req.user.id,
          email: req.user.email,
          name: req.user.name,
          role: membership.role,
          organizationId: membership.organization_id,
          organizationName: membership.organization_name,
          isPlatformAdmin: Boolean(req.user.isPlatformAdmin),
          isSuperAdmin: Boolean(req.user.isSuperAdmin)
        },
        organizations: memberships.map((item) => ({
          id: item.organization_id,
          name: item.organization_name,
          role: item.role
        }))
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  });

  app.get('/team', requireUserAuth, async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT u.id, u.email, u.display_name, m.role, m.created_at
         FROM organization_memberships m
         JOIN users u ON u.id=m.user_id
         WHERE m.organization_id=$1
         ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
                  u.display_name ASC, u.email ASC`,
        [organizationId(req)]
      );
      res.json({ members: rows.map(publicMembership) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/invitations', requireUserAuth, requireRole('owner', 'admin'), async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT i.id, i.email, i.role, i.expires_at, i.created_at,
                inviter.display_name AS invited_by_name
         FROM invitations i
         LEFT JOIN users inviter ON inviter.id=i.invited_by
         WHERE i.organization_id=$1
           AND i.accepted_at IS NULL
           AND i.revoked_at IS NULL
           AND i.expires_at > now()
         ORDER BY i.created_at DESC`,
        [organizationId(req)]
      );
      res.json({ invitations: rows.map(invitationResponse) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/invitations', requireUserAuth, requireRole('owner', 'admin'), async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const role = String(req.body?.role || 'grower').trim().toLowerCase();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'A valid email is required' }
        });
      }
      if (!INVITABLE_ROLES.has(role)) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid invitation role' }
        });
      }
      if (role === 'admin' && req.user.role !== 'owner') {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Only an owner can invite an admin' }
        });
      }

      const { rows: memberRows } = await query(
        `SELECT 1
         FROM users u
         JOIN organization_memberships m ON m.user_id=u.id
         WHERE lower(u.email)=lower($1) AND m.organization_id=$2
         LIMIT 1`,
        [email, organizationId(req)]
      );
      if (memberRows[0]) {
        return res.status(409).json({
          error: { code: 'ALREADY_MEMBER', message: 'This email already belongs to the organization' }
        });
      }

      const { rows: activeInvitationRows } = await query(
        `SELECT id FROM invitations
         WHERE organization_id=$1
           AND lower(email)=lower($2)
           AND accepted_at IS NULL
           AND revoked_at IS NULL
           AND expires_at > now()
         LIMIT 1`,
        [organizationId(req), email]
      );
      if (activeInvitationRows[0]) {
        return res.status(409).json({
          error: { code: 'INVITATION_EXISTS', message: 'An active invitation already exists for this email' }
        });
      }

      const token = newInvitationToken();
      const { rows } = await query(
        `INSERT INTO invitations (
           id, organization_id, email, role, token_hash, invited_by, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 || ' days')::interval)
         RETURNING id, email, role, expires_at, created_at`,
        [
          randomUUID(),
          organizationId(req),
          email,
          role,
          hashToken(token),
          req.user.id,
          String(INVITE_TTL_DAYS)
        ]
      );

      const inviteUrlValue = `${appUrl()}/accept-invite?token=${encodeURIComponent(token)}`;
      let emailDelivery = { sent: false };

      try {
        emailDelivery = await sendInvitationEmail({
          to: rows[0].email,
          organizationName: req.user.organizationName,
          role: rows[0].role,
          inviteUrl: inviteUrlValue
        });
      } catch (error) {
        console.error('[email] invitation send failed:', error.message);
        emailDelivery = { sent: false, error: error.message };
      }

      res.status(201).json({
        invitation: {
          ...invitationResponse(rows[0]),
          inviteUrl: inviteUrlValue,
          emailDelivery
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/invitations/:invitationId', requireUserAuth, requireRole('owner', 'admin'), async (req, res, next) => {
    try {
      const { rows } = await query(
        `UPDATE invitations
         SET revoked_at=now()
         WHERE id=$1
           AND organization_id=$2
           AND accepted_at IS NULL
           AND revoked_at IS NULL
         RETURNING id`,
        [req.params.invitationId, organizationId(req)]
      );
      if (!rows[0]) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Active invitation not found' }
        });
      }
      res.sendStatus(204);
    } catch (error) {
      next(error);
    }
  });

  app.post('/auth/accept-invite', async (req, res, next) => {
    const client = await pool.connect();
    try {
      const token = String(req.body?.token || '').trim();
      const password = String(req.body?.password || '');
      const displayName = String(req.body?.name || '').trim();

      if (!token || !password) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Invitation token and password are required' }
        });
      }

      await client.query('BEGIN');
      const execute = client.query.bind(client);
      const { rows: inviteRows } = await client.query(
        `SELECT i.id, i.organization_id, i.email, i.role, o.name AS organization_name
         FROM invitations i
         JOIN organizations o ON o.id=i.organization_id AND o.status='active'
         WHERE i.token_hash=$1
           AND i.accepted_at IS NULL
           AND i.revoked_at IS NULL
           AND i.expires_at > now()
         LIMIT 1
         FOR UPDATE`,
        [hashToken(token)]
      );
      const invitation = inviteRows[0];
      if (!invitation) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: { code: 'INVITATION_INVALID', message: 'This invitation is invalid, expired, or has already been used' }
        });
      }

      let account = await findUserForLogin(invitation.email, execute);
      if (account) {
        if (!account.is_active || !verifyUserPassword(password, account.password_hash)) {
          await client.query('ROLLBACK');
          return res.status(401).json({
            error: { code: 'INVALID_CREDENTIALS', message: 'Use the password for this existing account' }
          });
        }
      } else {
        if (!displayName) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: 'Your name is required for a new account' }
          });
        }

        let passwordHash;
        try {
          passwordHash = hashUserPassword(password);
        } catch (error) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: error.message }
          });
        }

        const { rows } = await client.query(
          `INSERT INTO users (id, email, display_name, password_hash)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email, display_name, is_active`,
          [randomUUID(), invitation.email, displayName, passwordHash]
        );
        account = rows[0];
      }

      await client.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id, user_id)
         DO UPDATE SET role=EXCLUDED.role`,
        [invitation.organization_id, account.id, invitation.role]
      );
      const acceptedInvitation = await client.query(
        `UPDATE invitations SET accepted_at=now()
         WHERE id=$1 AND accepted_at IS NULL AND revoked_at IS NULL
         RETURNING id`,
        [invitation.id]
      );
      if (!acceptedInvitation.rows[0]) throw new Error('Invitation was already accepted');

      const session = await createUserSession(account.id, invitation.organization_id, execute);
      await client.query('UPDATE users SET last_login_at=now(), updated_at=now() WHERE id=$1', [account.id]);
      await client.query('COMMIT');
      res.cookie('neurocrop_session', session.token, sessionCookieOptions());

      res.status(201).json({
        user: {
          id: account.id,
          email: account.email,
          name: account.display_name,
          role: invitation.role,
          organizationId: invitation.organization_id,
          organizationName: invitation.organization_name
        }
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  });
}
