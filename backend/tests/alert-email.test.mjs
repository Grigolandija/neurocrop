import assert from 'node:assert/strict';
import test from 'node:test';
import { emailDeliveryConfigured, sendAlertEmail } from '../email.js';

test('alert email groups alerts and escapes customer-controlled content', async () => {
  const previousKey = process.env.RESEND_API_KEY;
  const previousFetch = globalThis.fetch;
  let request;
  process.env.RESEND_API_KEY = 'test-key';
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ id: 'email-1' }), { status: 200 });
  };

  try {
    assert.equal(emailDeliveryConfigured(), true);
    const result = await sendAlertEmail({
      to: 'grower@example.com',
      displayName: 'Grower <One>',
      organizationName: 'Farm & Co',
      alerts: [
        { tone: 'critical', title: 'Temperature <high>', detail: 'Current 31 °C', zoneName: 'Section A' },
        { tone: 'warning', title: 'Humidity low', detail: 'Current 40%', zoneName: 'Section B' }
      ]
    });

    assert.equal(result.sent, true);
    assert.equal(request.url, 'https://api.resend.com/emails');
    const payload = JSON.parse(request.options.body);
    assert.deepEqual(payload.to, ['grower@example.com']);
    assert.equal(payload.subject, 'Critical: 2 NeuroCrop alerts need attention');
    assert.match(payload.html, /Grower &lt;One&gt;/);
    assert.match(payload.html, /Farm &amp; Co/);
    assert.match(payload.html, /Temperature &lt;high&gt;/);
    assert.doesNotMatch(payload.html, /Temperature <high>/);
    assert.match(payload.text, /CRITICAL: Temperature <high>/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
  }
});

test('alert email is skipped when delivery is not configured', async () => {
  const previousKey = process.env.RESEND_API_KEY;
  const previousFile = process.env.RESEND_API_KEY_FILE;
  delete process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY_FILE = '/tmp/neurocrop-missing-resend-key-for-test';
  try {
    const result = await sendAlertEmail({ to: 'grower@example.com', alerts: [{ title: 'Alert' }] });
    assert.equal(result.sent, false);
    assert.equal(result.skipped, true);
  } finally {
    if (previousKey !== undefined) process.env.RESEND_API_KEY = previousKey;
    if (previousFile === undefined) delete process.env.RESEND_API_KEY_FILE;
    else process.env.RESEND_API_KEY_FILE = previousFile;
  }
});
