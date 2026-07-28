import { createHash, randomBytes, randomUUID } from 'crypto';
import { pool } from './db.js';
import { hashUserPassword, MAX_PASSWORD_LENGTH, normalizeEmail, sessionCookieClearOptions, verifyUserPassword } from './auth-users.js';
import { sendPasswordResetEmail } from './email.js';
import { createMemoryRateLimiter } from './rate-limit.js';

const RESET_TOKEN_TTL_MINUTES = 60;
const GENERIC_REQUEST_MESSAGE = 'If an active account uses this email address, a password reset link has been sent.';
const INVALID_TOKEN_MESSAGE = 'This password reset link is invalid, expired, or has already been used.';
const requestIpLimiter = createMemoryRateLimiter({
  limit: Number(process.env.AUTH_PASSWORD_RESET_IP_RATE_LIMIT || 20),
  windowMs: 60 * 60 * 1000
});
const requestEmailLimiter = createMemoryRateLimiter({
  limit: Number(process.env.AUTH_PASSWORD_RESET_EMAIL_RATE_LIMIT || 4),
  windowMs: 60 * 60 * 1000
});
const resetAttemptLimiter = createMemoryRateLimiter({
  limit: Number(process.env.AUTH_PASSWORD_RESET_ATTEMPT_RATE_LIMIT || 12),
  windowMs: 15 * 60 * 1000
});

export function hashPasswordResetToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

export function passwordResetUrl(token, environment = process.env) {
  const baseUrl = String(environment.APP_URL || environment.APP_BASE_URL || 'https://neurocrop.lt').replace(/\/+$/, '');
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

function newPasswordResetToken() {
  return randomBytes(32).toString('base64url');
}

async function createPasswordReset(account) {
  const token = newPasswordResetToken();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`password-reset:${account.id}`]);
    await client.query(
      'UPDATE password_reset_tokens SET used_at=COALESCE(used_at, now()) WHERE user_id=$1 AND used_at IS NULL',
      [account.id]
    );
    await client.query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
      [randomUUID(), account.id, hashPasswordResetToken(token), String(RESET_TOKEN_TTL_MINUTES)]
    );
    await client.query('COMMIT');
    return token;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function registerPasswordResetRoutes(app) {
  app.post('/auth/forgot-password', async (req, res, next) => {
    try {
      const ipKey = String(req.ip || 'unknown');
      if (requestIpLimiter.isLimited(ipKey)) {
        return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many password reset requests. Try again later.' } });
      }
      requestIpLimiter.record(ipKey);

      const email = normalizeEmail(req.body?.email);
      if (!/^\S+@\S+\.\S+$/.test(email) || requestEmailLimiter.isLimited(email)) {
        return res.status(202).json({ accepted: true, message: GENERIC_REQUEST_MESSAGE });
      }
      requestEmailLimiter.record(email);

      const client = await pool.connect();
      let account;
      try {
        const { rows } = await client.query(
          'SELECT id, email, display_name FROM users WHERE lower(email)=lower($1) AND is_active=true LIMIT 1',
          [email]
        );
        account = rows[0];
      } finally {
        client.release();
      }

      if (!account) {
        return res.status(202).json({ accepted: true, message: GENERIC_REQUEST_MESSAGE });
      }

      const token = await createPasswordReset(account);
      res.status(202).json({ accepted: true, message: GENERIC_REQUEST_MESSAGE });
      void sendPasswordResetEmail({
        to: account.email,
        displayName: account.display_name,
        resetUrl: passwordResetUrl(token),
        expiresInMinutes: RESET_TOKEN_TTL_MINUTES
      }).then((result) => {
        if (!result.sent) console.error('[auth] Password reset email skipped:', result.reason);
      }).catch((error) => {
        console.error('[auth] Password reset email delivery failed:', error?.message || error);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/auth/reset-password', async (req, res, next) => {
    const attemptKey = String(req.ip || 'unknown');
    if (resetAttemptLimiter.isLimited(attemptKey)) {
      return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many password reset attempts. Try again later.' } });
    }
    resetAttemptLimiter.record(attemptKey);

    const token = String(req.body?.token || '');
    const newPassword = String(req.body?.newPassword || '');
    if (token.length < 32 || token.length > 256) {
      return res.status(400).json({ error: { code: 'PASSWORD_RESET_INVALID', message: INVALID_TOKEN_MESSAGE } });
    }
    if (newPassword.length < 12) {
      return res.status(400).json({ error: { code: 'WEAK_PASSWORD', message: 'New password must be at least 12 characters.' } });
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.` } });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT p.id, p.user_id, u.password_hash
         FROM password_reset_tokens p
         JOIN users u ON u.id=p.user_id
         WHERE p.token_hash=$1
           AND p.used_at IS NULL
           AND p.expires_at > now()
           AND u.is_active=true
         FOR UPDATE OF p, u`,
        [hashPasswordResetToken(token)]
      );
      const reset = rows[0];
      if (!reset) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: { code: 'PASSWORD_RESET_INVALID', message: INVALID_TOKEN_MESSAGE } });
      }
      if (verifyUserPassword(newPassword, reset.password_hash)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: { code: 'PASSWORD_UNCHANGED', message: 'Choose a password different from your current password.' } });
      }

      await client.query('UPDATE users SET password_hash=$1, updated_at=now() WHERE id=$2', [
        hashUserPassword(newPassword),
        reset.user_id
      ]);
      await client.query(
        'UPDATE password_reset_tokens SET used_at=COALESCE(used_at, now()) WHERE user_id=$1 AND used_at IS NULL',
        [reset.user_id]
      );
      await client.query(
        'UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at, now()) WHERE user_id=$1',
        [reset.user_id]
      );
      await client.query('COMMIT');
      res.clearCookie('neurocrop_session', sessionCookieClearOptions());
      res.json({ changed: true, sessionsRevoked: true });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client.release();
    }
  });
}
