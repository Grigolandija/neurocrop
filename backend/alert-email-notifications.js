import { query } from './db.js';
import { emailDeliveryConfigured, sendAlertEmail } from './email.js';
import { requireUserAuth } from './auth-users.js';

const DELIVERY_RETRY_MINUTES = 5;
const MAX_DELIVERY_ATTEMPTS = 5;
const DEFAULT_WARNING_AFTER_MINUTES = 15;

function warningAfterMinutes(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 1_440
    ? number
    : DEFAULT_WARNING_AFTER_MINUTES;
}

export function alertEligibleForEmail(alert, recipient, now = Date.now()) {
  if (alert?.tone === 'critical') return true;
  if (alert?.tone !== 'warning') return false;
  const detectedAt = new Date(alert.occurrenceStartedAt).getTime();
  return Number.isFinite(detectedAt)
    && detectedAt <= now - warningAfterMinutes(recipient?.warningAfterMinutes) * 60_000;
}

function publicPreferences(row) {
  return {
    emailEnabled: Boolean(row?.email_alerts_enabled),
    warningAfterMinutes: warningAfterMinutes(row?.warning_after_minutes),
    emailConfigured: emailDeliveryConfigured()
  };
}

export function registerAlertEmailNotificationRoutes(app) {
  app.get('/notification-preferences', requireUserAuth, async (req, res, next) => {
    try {
      const { rows } = await query(
        `SELECT email_alerts_enabled, warning_after_minutes
         FROM alert_notification_preferences
         WHERE organization_id=$1 AND user_id=$2`,
        [req.user.organizationId, req.user.id]
      );
      res.json({ notifications: publicPreferences(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/notification-preferences', requireUserAuth, async (req, res, next) => {
    const emailEnabled = req.body?.emailEnabled;
    const requestedWarningMinutes = req.body?.warningAfterMinutes;
    const warningMinutes = warningAfterMinutes(requestedWarningMinutes);
    if (typeof emailEnabled !== 'boolean') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'emailEnabled must be a boolean' } });
    }
    if (requestedWarningMinutes !== undefined
      && (!Number.isInteger(Number(requestedWarningMinutes))
        || Number(requestedWarningMinutes) < 0
        || Number(requestedWarningMinutes) > 1_440)) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'warningAfterMinutes must be an integer between 0 and 1440' } });
    }
    if (emailEnabled && !emailDeliveryConfigured()) {
      return res.status(409).json({ error: { code: 'EMAIL_NOT_CONFIGURED', message: 'Email delivery is not configured' } });
    }
    try {
      const { rows } = await query(
        `INSERT INTO alert_notification_preferences (
           organization_id, user_id, email_alerts_enabled, warning_after_minutes, updated_at
         ) VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (organization_id, user_id) DO UPDATE SET
           email_alerts_enabled=EXCLUDED.email_alerts_enabled,
           warning_after_minutes=EXCLUDED.warning_after_minutes,
           updated_at=now()
         RETURNING email_alerts_enabled, warning_after_minutes`,
        [req.user.organizationId, req.user.id, emailEnabled, warningMinutes]
      );
      res.json({ notifications: publicPreferences(rows[0]) });
    } catch (error) {
      next(error);
    }
  });
}

async function reserveDelivery(organizationId, alert, userId) {
  const { rows } = await query(
    `INSERT INTO alert_email_deliveries (
       organization_id, alert_id, occurrence_started_at, user_id, alert_tone, status,
       attempt_count, last_attempt_at, last_error
     ) VALUES ($1, $2, $3, $4, $5, 'sending', 1, now(), '')
     ON CONFLICT (organization_id, alert_id, occurrence_started_at, user_id, alert_tone) DO UPDATE SET
       status='sending',
       attempt_count=alert_email_deliveries.attempt_count + 1,
       last_attempt_at=now(),
       last_error=''
     WHERE (alert_email_deliveries.status='failed'
       OR (alert_email_deliveries.status='sending'
         AND alert_email_deliveries.last_attempt_at < now() - interval '10 minutes'))
       AND alert_email_deliveries.attempt_count < $6
       AND alert_email_deliveries.last_attempt_at < now() - ($7 || ' minutes')::interval
     RETURNING alert_id, occurrence_started_at`,
    [organizationId, alert.id, alert.occurrenceStartedAt, userId, alert.tone, MAX_DELIVERY_ATTEMPTS, String(DELIVERY_RETRY_MINUTES)]
  );
  return Boolean(rows[0]);
}

async function markDeliveries(organizationId, alerts, userId, status, error = '') {
  if (!alerts.length) return;
  for (const alert of alerts) {
    await query(
      `UPDATE alert_email_deliveries
       SET status=$1, sent_at=CASE WHEN $1='sent' THEN now() ELSE sent_at END, last_error=$2
       WHERE organization_id=$3 AND alert_id=$4 AND occurrence_started_at=$5 AND user_id=$6
         AND alert_tone=$7`,
      [status, String(error || '').slice(0, 500), organizationId, alert.id, alert.occurrenceStartedAt, userId, alert.tone]
    );
  }
}

export async function dispatchAlertEmailNotifications(organizationId) {
  if (!emailDeliveryConfigured()) return { configured: false, sent: 0 };
  const [{ rows: organizationRows }, { rows: alertRows }, { rows: recipientRows }] = await Promise.all([
    query(`SELECT name FROM organizations WHERE id=$1 AND status='active'`, [organizationId]),
    query(
      `SELECT alert_id, first_detected_at, context
       FROM alert_workflows
       WHERE organization_id=$1 AND managed=true AND active=true
         AND context->>'tone' IN ('warning', 'critical')
         AND (status='open' OR (status='acknowledged' AND context->>'tone'='critical'))
       ORDER BY CASE context->>'tone' WHEN 'critical' THEN 0 ELSE 1 END, first_detected_at ASC`,
      [organizationId]
    ),
    query(
      `SELECT u.id, u.email, u.display_name, preference.warning_after_minutes
       FROM alert_notification_preferences preference
       JOIN organization_memberships membership
         ON membership.organization_id=preference.organization_id AND membership.user_id=preference.user_id
       JOIN users u ON u.id=preference.user_id AND u.is_active=true
       WHERE preference.organization_id=$1 AND preference.email_alerts_enabled=true`,
      [organizationId]
    )
  ]);
  if (!organizationRows[0] || !alertRows.length || !recipientRows.length) return { configured: true, sent: 0 };

  const alerts = alertRows.map((row) => ({
    id: row.alert_id,
    occurrenceStartedAt: row.first_detected_at,
    tone: row.context?.tone,
    title: row.context?.title,
    detail: row.context?.detail,
    siteName: row.context?.siteName,
    zoneName: row.context?.zoneName
  }));
  let sent = 0;
  for (const recipient of recipientRows) {
    const recipientPreferences = { warningAfterMinutes: recipient.warning_after_minutes };
    const reserved = [];
    for (const alert of alerts) {
      if (!alertEligibleForEmail(alert, recipientPreferences)) continue;
      if (await reserveDelivery(organizationId, alert, recipient.id)) reserved.push(alert);
    }
    if (!reserved.length) continue;
    try {
      const result = await sendAlertEmail({
        to: recipient.email,
        displayName: recipient.display_name,
        organizationName: organizationRows[0].name,
        alerts: reserved
      });
      if (!result.sent) throw new Error(result.reason || 'Email delivery was skipped');
      await markDeliveries(organizationId, reserved, recipient.id, 'sent');
      sent += 1;
    } catch (error) {
      await markDeliveries(organizationId, reserved, recipient.id, 'failed', error?.message || error);
      console.warn('[email] alert delivery failed:', error?.message || error);
    }
  }
  return { configured: true, sent };
}
