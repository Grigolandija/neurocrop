import fs from 'fs';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'NeuroCrop <noreply@neurocrop.lt>';

function readSecretFile(path) {
  try {
    return fs.readFileSync(path, 'utf8').trim();
  } catch {
    return '';
  }
}

function resendApiKey() {
  return process.env.RESEND_API_KEY || readSecretFile(process.env.RESEND_API_KEY_FILE || '/run/secrets/resend_api_key');
}

export function emailDeliveryConfigured() {
  return Boolean(resendApiKey());
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function sendInvitationEmail({ to, organizationName, role, inviteUrl }) {
  const apiKey = resendApiKey();
  if (!apiKey) return { sent: false, skipped: true, reason: 'RESEND_API_KEY is not configured' };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: `You have been invited to ${organizationName} on NeuroCrop`,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#14231d">
          <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#2d6a4f;font-weight:700">NeuroCrop invitation</p>
          <h1 style="font-size:28px;line-height:1.15;margin:12px 0 16px">Join ${escapeHtml(organizationName)}</h1>
          <p style="font-size:16px;line-height:1.6;color:#58625d">You have been invited as <strong>${escapeHtml(role)}</strong>. Use the button below to create your password and access the workspace.</p>
          <p style="margin:28px 0"><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:#1f5a46;color:white;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700">Accept invitation</a></p>
          <p style="font-size:13px;line-height:1.6;color:#6c746f">If the button does not work, open this link:<br><a href="${escapeHtml(inviteUrl)}">${escapeHtml(inviteUrl)}</a></p>
        </div>
      `,
      text: `You have been invited to ${organizationName} on NeuroCrop as ${role}. Accept invitation: ${inviteUrl}`
    })
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(body || `Resend email failed with ${response.status}`);
  }

  let responseBody = null;
  if (body) {
    try {
      responseBody = JSON.parse(body);
    } catch {
      responseBody = body;
    }
  }

  return { sent: true, response: responseBody };
}

export async function sendPasswordResetEmail({ to, displayName, resetUrl, expiresInMinutes }) {
  const apiKey = resendApiKey();
  if (!apiKey) return { sent: false, skipped: true, reason: 'RESEND_API_KEY is not configured' };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: 'NeuroCrop slaptažodžio atkūrimas / Password reset',
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#14231d">
          <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#2d6a4f;font-weight:700">NeuroCrop paskyros apsauga</p>
          <h1 style="font-size:28px;line-height:1.15;margin:12px 0 16px">Atkurkite slaptažodį</h1>
          <p style="font-size:16px;line-height:1.6;color:#58625d">Sveiki, ${escapeHtml(displayName || '')}. Paspauskite žemiau ir pasirinkite naują „NeuroCrop“ slaptažodį.</p>
          <p style="margin:28px 0"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#1f5a46;color:white;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:700">Pasirinkti naują slaptažodį</a></p>
          <p style="font-size:13px;line-height:1.6;color:#6c746f">Ši vienkartinė nuoroda galioja ${escapeHtml(expiresInMinutes)} minučių. Jei slaptažodžio atkūrimo neprašėte, šį laišką ignoruokite.</p>
          <hr style="border:0;border-top:1px solid #e4e9e6;margin:28px 0">
          <p style="font-size:14px;line-height:1.6;color:#58625d"><strong>English:</strong> Use the button above to choose a new NeuroCrop password. This single-use link expires in ${escapeHtml(expiresInMinutes)} minutes. If you did not request it, ignore this email.</p>
          <p style="font-size:13px;line-height:1.6;color:#6c746f">If the button does not work, open this link:<br><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p>
        </div>
      `,
      text: `Atkurkite NeuroCrop slaptažodį: ${resetUrl}. Vienkartinė nuoroda galioja ${expiresInMinutes} minučių. Jei to neprašėte, laišką ignoruokite.\n\nReset your NeuroCrop password: ${resetUrl}. This single-use link expires in ${expiresInMinutes} minutes.`
    })
  });

  const body = await response.text();
  if (!response.ok) throw new Error(body || `Resend email failed with ${response.status}`);

  let responseBody = null;
  if (body) {
    try {
      responseBody = JSON.parse(body);
    } catch {
      responseBody = body;
    }
  }
  return { sent: true, response: responseBody };
}

export async function sendAlertEmail({ to, displayName, organizationName, alerts }) {
  const apiKey = resendApiKey();
  if (!apiKey) return { sent: false, skipped: true, reason: 'RESEND_API_KEY is not configured' };
  const items = Array.isArray(alerts) ? alerts : [];
  if (!items.length) return { sent: false, skipped: true, reason: 'No alerts supplied' };

  const criticalCount = items.filter((alert) => alert.tone === 'critical').length;
  const subjectPrefix = criticalCount ? 'Critical' : 'Warning';
  const subject = items.length === 1
    ? `${subjectPrefix}: ${String(items[0].title || 'growing condition alert')}`
    : `${subjectPrefix}: ${items.length} NeuroCrop alerts need attention`;
  const alertsUrl = `${String(process.env.APP_URL || process.env.APP_BASE_URL || 'https://neurocrop.lt').replace(/\/+$/, '')}/alerts`;
  const htmlItems = items.map((alert) => `
    <div style="margin-top:14px;border:1px solid ${alert.tone === 'critical' ? '#efc8c0' : '#ead8ae'};border-radius:12px;padding:16px;background:${alert.tone === 'critical' ? '#fff3f1' : '#fff9eb'}">
      <p style="margin:0 0 5px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${alert.tone === 'critical' ? '#a43e2f' : '#8a6322'}">${escapeHtml(alert.tone)}</p>
      <h2 style="margin:0;font-size:17px;line-height:1.35;color:#14231d">${escapeHtml(alert.title)}</h2>
      <p style="margin:7px 0 0;font-size:14px;line-height:1.55;color:#58625d">${escapeHtml(alert.zoneName || alert.siteName || organizationName)} · ${escapeHtml(alert.detail)}</p>
    </div>`).join('');
  const textItems = items.map((alert) => `${String(alert.tone || 'warning').toUpperCase()}: ${alert.title}\n${alert.zoneName || alert.siteName || organizationName}: ${alert.detail}`).join('\n\n');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#14231d">
          <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#2d6a4f;font-weight:700">NeuroCrop alert</p>
          <h1 style="font-size:26px;line-height:1.2;margin:12px 0 10px">Growing conditions need attention</h1>
          <p style="font-size:15px;line-height:1.6;color:#58625d">Hello ${escapeHtml(displayName || '')}. ${escapeHtml(organizationName)} reported ${items.length === 1 ? 'a new condition' : `${items.length} new conditions`}.</p>
          ${htmlItems}
          <p style="margin:26px 0 12px"><a href="${escapeHtml(alertsUrl)}" style="display:inline-block;background:#1f5a46;color:white;text-decoration:none;padding:13px 18px;border-radius:10px;font-weight:700">Open alerts</a></p>
          <p style="font-size:12px;line-height:1.5;color:#77817c">You received this because email alerts are enabled in your NeuroCrop notification settings.</p>
        </div>`,
      text: `Hello ${displayName || ''}. ${organizationName} has new alerts.\n\n${textItems}\n\nOpen alerts: ${alertsUrl}`
    })
  });

  const body = await response.text();
  if (!response.ok) throw new Error(body || `Resend email failed with ${response.status}`);
  return { sent: true };
}
