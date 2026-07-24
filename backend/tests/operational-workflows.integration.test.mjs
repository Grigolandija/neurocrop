import assert from 'node:assert/strict';
import test from 'node:test';

const baseUrl = String(process.env.TENANT_TEST_BASE_URL || '').replace(/\/$/, '');
const email = process.env.TENANT_A_EMAIL || '';
const password = process.env.TENANT_A_PASSWORD || '';
const configured = process.env.RUN_API_INTEGRATION === 'true' && Boolean(baseUrl && email && password);

async function request(cookie, path, method = 'GET', body) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

async function json(cookie, path, method = 'GET', body, expected = 200) {
  const response = await request(cookie, path, method, body);
  const payload = response.status === 204 ? null : await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

test('organization alert and intervention workflows persist across requests', { skip: !configured }, async () => {
  const login = await request('', '/auth/login', 'POST', { email, password });
  assert.equal(login.status, 200);
  const cookie = (login.headers.getSetCookie?.()[0] || login.headers.get('set-cookie')).split(';', 1)[0];
  const dashboard = await json(cookie, '/dashboard');
  const area = dashboard.sites?.find((item) => item.zones?.length);
  const section = area?.zones?.[0];
  assert.ok(area && section, 'Workflow fixture requires one Area and Section');

  const alertId = `metric:${area.id}:${section.id}:airTemp`;
  const context = {
    id: alertId,
    kind: 'metric',
    tone: 'warning',
    siteId: area.id,
    siteName: area.name,
    zoneId: section.id,
    zoneName: section.name,
    metricKey: 'airTemp',
    title: 'Operational workflow smoke test'
  };
  const acknowledged = await json(cookie, `/alerts/${encodeURIComponent(alertId)}/acknowledge`, 'POST', { context });
  assert.equal(acknowledged.alert.status, 'acknowledged');
  assert.equal(acknowledged.alert.context.id, alertId);

  const snoozed = await json(cookie, `/alerts/${encodeURIComponent(alertId)}/snooze`, 'POST', { minutes: 5, context });
  assert.equal(snoozed.alert.status, 'snoozed');
  assert.ok(new Date(snoozed.alert.snoozedUntil) > new Date());

  const resolved = await json(cookie, `/alerts/${encodeURIComponent(alertId)}/resolve`, 'POST', { context });
  assert.equal(resolved.alert.status, 'resolved');
  const alerts = await json(cookie, '/alerts?status=all');
  assert.equal(alerts.alerts.find((item) => item.id === alertId)?.status, 'resolved');

  const intervention = await json(cookie, '/interventions', 'POST', {
    sectionId: section.id,
    alertId,
    metric: 'airTemp',
    actionType: 'WORKFLOW_SMOKE_TEST',
    note: 'Automated operational workflow verification',
    performedAt: new Date().toISOString()
  }, 201);
  assert.equal(intervention.intervention.sectionId, section.id);

  const outcome = await json(cookie, `/interventions/${intervention.intervention.id}/outcome`, 'PATCH', {
    status: 'successful',
    observedAt: new Date().toISOString(),
    beforeValue: 28.4,
    afterValue: 23.2,
    note: 'Workflow persisted'
  });
  assert.equal(outcome.intervention.outcome.status, 'successful');

  const interventions = await json(cookie, `/interventions?sectionId=${encodeURIComponent(section.id)}`);
  assert.equal(
    interventions.interventions.find((item) => item.id === intervention.intervention.id)?.outcome.status,
    'successful'
  );
});
