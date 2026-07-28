import { createHash } from 'node:crypto';
import fs from 'node:fs';
import webpush from 'web-push';
import { query } from './db.js';
import { requireUserAuth } from './auth-users.js';

function configuredValue(envName, fileName) {
  const direct = String(process.env[envName] || '').trim();
  if (direct) return direct;
  try {
    return fs.readFileSync(String(process.env[`${envName}_FILE`] || `/run/secrets/${fileName}`), 'utf8').trim();
  } catch {
    return '';
  }
}

export function pushConfiguration() {
  const publicKey = configuredValue('VAPID_PUBLIC_KEY', 'vapid_public_key');
  const privateKey = configuredValue('VAPID_PRIVATE_KEY', 'vapid_private_key');
  const subject = String(process.env.VAPID_SUBJECT || 'mailto:alerts@neurocrop.lt').trim();
  return {
    enabled: Boolean(publicKey && privateKey && /^(mailto:|https:)/.test(subject)),
    publicKey,
    privateKey,
    subject
  };
}

function normalizedSubscription(value) {
  const endpoint = String(value?.endpoint || '').trim();
  const p256dh = String(value?.keys?.p256dh || '').trim();
  const auth = String(value?.keys?.auth || '').trim();
  if (!endpoint.startsWith('https://') || endpoint.length > 2048 || !p256dh || p256dh.length > 512 || !auth || auth.length > 512) {
    return null;
  }
  return { endpoint, p256dh, auth };
}

function subscriptionId(endpoint) {
  return createHash('sha256').update(endpoint).digest('hex');
}

function pushPayload(alert) {
  const context = alert?.context && typeof alert.context === 'object' ? alert.context : {};
  const title = String(context.title || (context.tone === 'critical' ? 'Critical NeuroCrop alert' : 'NeuroCrop alert')).slice(0, 120);
  const section = String(context.zoneName || context.sectionName || '').trim();
  const body = String(context.detail || 'A growing condition needs attention.').slice(0, 240);
  return JSON.stringify({
    title,
    body: section ? `${section}: ${body}` : body,
    tag: `neurocrop-${alert.id}`,
    url: '/alerts'
  });
}

function expiredSubscription(error) {
  return [404, 410].includes(Number(error?.statusCode || error?.status));
}

export async function dispatchAlertPushNotifications(organizationId, alerts) {
  const configuration = pushConfiguration();
  if (!configuration.enabled || !Array.isArray(alerts) || !alerts.length) return { sent: 0, configured: configuration.enabled };

  webpush.setVapidDetails(configuration.subject, configuration.publicKey, configuration.privateKey);
  const { rows: subscriptions } = await query(
    `SELECT subscription.id, subscription.endpoint, subscription.p256dh, subscription.auth_secret
     FROM push_subscriptions subscription
     JOIN users ON users.id=subscription.user_id AND users.is_active=true
     WHERE subscription.organization_id=$1`,
    [organizationId]
  );

  let sent = 0;
  for (const alert of alerts) {
    for (const subscription of subscriptions) {
      const reserved = await query(
        `INSERT INTO push_deliveries (organization_id, alert_id, subscription_id)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING subscription_id`,
        [organizationId, alert.id, subscription.id]
      );
      if (!reserved.rows[0]) continue;
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret }
        }, pushPayload(alert), { TTL: 300, urgency: 'high', timeout: 5000 });
        sent += 1;
      } catch (error) {
        if (expiredSubscription(error)) {
          await query(`DELETE FROM push_subscriptions WHERE id=$1`, [subscription.id]);
        } else {
          await query(
            `DELETE FROM push_deliveries
             WHERE organization_id=$1 AND alert_id=$2 AND subscription_id=$3`,
            [organizationId, alert.id, subscription.id]
          );
          console.warn('[push] delivery failed:', error?.message || error);
        }
      }
    }
  }
  return { sent, configured: true };
}

export function registerPushNotificationRoutes(app) {
  app.get('/push/config', requireUserAuth, (req, res) => {
    const configuration = pushConfiguration();
    res.set('Cache-Control', 'no-store');
    res.json({ enabled: configuration.enabled, publicKey: configuration.enabled ? configuration.publicKey : '' });
  });

  app.post('/push/subscriptions', requireUserAuth, async (req, res, next) => {
    const subscription = normalizedSubscription(req.body);
    if (!subscription) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid push subscription is required' } });
    }
    try {
      await query(
        `INSERT INTO push_subscriptions (
           id, organization_id, user_id, endpoint, p256dh, auth_secret, user_agent, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (endpoint) DO UPDATE SET
           organization_id=EXCLUDED.organization_id,
           user_id=EXCLUDED.user_id,
           p256dh=EXCLUDED.p256dh,
           auth_secret=EXCLUDED.auth_secret,
           user_agent=EXCLUDED.user_agent,
           updated_at=now()`,
        [
          subscriptionId(subscription.endpoint),
          req.user.organizationId,
          req.user.id,
          subscription.endpoint,
          subscription.p256dh,
          subscription.auth,
          String(req.get('user-agent') || '').slice(0, 500)
        ]
      );
      res.status(201).json({ saved: true });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/push/subscriptions', requireUserAuth, async (req, res, next) => {
    const endpoint = String(req.body?.endpoint || '').trim();
    if (!endpoint) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Push endpoint is required' } });
    }
    try {
      const result = await query(
        `DELETE FROM push_subscriptions
         WHERE endpoint=$1 AND user_id=$2 AND organization_id=$3`,
        [endpoint, req.user.id, req.user.organizationId]
      );
      res.json({ deleted: result.rowCount > 0 });
    } catch (error) {
      next(error);
    }
  });
}
