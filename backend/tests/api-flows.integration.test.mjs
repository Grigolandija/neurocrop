import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
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

test('authenticated CRUD, scoring, Trends and CSV flow', { skip: !configured }, async () => {
  const login = await request('', '/auth/login', 'POST', { email, password });
  assert.equal(login.status, 200);
  const cookie = (login.headers.getSetCookie?.()[0] || login.headers.get('set-cookie')).split(';', 1)[0];
  const suffix = Date.now().toString(36);
  const profileId = `ci-${suffix}`;
  const devEui = randomBytes(8).toString('hex');
  let areaId;
  let sectionId;

  try {
    const area = await json(cookie, '/areas', 'POST', {
      name: `CI Area ${suffix}`, kind: 'Greenhouse', location: 'CI test facility'
    }, 201);
    areaId = area.area.id;
    assert.equal(area.area.kind, 'Greenhouse');
    assert.equal(area.area.location, 'CI test facility');
    const updatedArea = await json(cookie, `/areas/${areaId}`, 'PATCH', {
      name: `CI Area ${suffix}`, kind: 'Trial facility', location: 'Updated CI location'
    });
    assert.equal(updatedArea.area.kind, 'Trial facility');
    assert.equal(updatedArea.area.location, 'Updated CI location');
    const renamedArea = await json(cookie, `/areas/${areaId}`, 'PATCH', { name: `CI Renamed Area ${suffix}` });
    assert.equal(renamedArea.area.kind, 'Trial facility');
    assert.equal(renamedArea.area.location, 'Updated CI location');
    const areaDirectory = await json(cookie, '/areas');
    assert.equal(areaDirectory.areas.find((item) => item.id === areaId)?.location, 'Updated CI location');
    await json(cookie, '/crop-profiles', 'POST', {
      id: profileId, name: `CI Profile ${suffix}`, heroName: 'CI Crop', stage: 'Test',
      metrics: { airTemp: { label: 'Air temperature', unit: 'degC', optimal: [18, 24], warning: [16, 26], critical: [14, 30], decimals: 1 } }
    }, 201);
    const section = await json(cookie, '/sections', 'POST', {
      areaId, name: `CI Section ${suffix}`, cropProfile: profileId
    }, 201);
    sectionId = section.section.id;
    const node = await json(cookie, '/nodes/register', 'POST', { devEui, sectionId, name: `CI Node ${suffix}` }, 201);
    assert.equal(node.node.sectionId, sectionId);
    const renamed = await json(cookie, `/nodes/${devEui}`, 'PATCH', { name: `CI Renamed ${suffix}`, sectionId });
    assert.equal(renamed.node.name, `CI Renamed ${suffix}`);

    const alertId = `metric:${areaId}:${sectionId}:airTemp`;
    const acknowledged = await json(cookie, `/alerts/${encodeURIComponent(alertId)}/acknowledge`, 'POST', {
      context: {
        id: alertId,
        kind: 'metric',
        tone: 'warning',
        siteId: areaId,
        siteName: `CI Renamed Area ${suffix}`,
        zoneId: sectionId,
        zoneName: `CI Section ${suffix}`,
        metricKey: 'airTemp',
        title: 'Air temperature outside target'
      }
    });
    assert.equal(acknowledged.alert.status, 'acknowledged');
    const alertDirectory = await json(cookie, '/alerts?status=all');
    assert.equal(alertDirectory.alerts.find((item) => item.id === alertId)?.context.metricKey, 'airTemp');
    const snoozed = await json(cookie, `/alerts/${encodeURIComponent(alertId)}/snooze`, 'POST', { minutes: 5 });
    assert.equal(snoozed.alert.status, 'snoozed');
    const resolved = await json(cookie, `/alerts/${encodeURIComponent(alertId)}/resolve`, 'POST');
    assert.equal(resolved.alert.status, 'resolved');

    const intervention = await json(cookie, '/interventions', 'POST', {
      sectionId,
      alertId,
      metric: 'airTemp',
      actionType: 'CHECK_VENTILATION',
      note: 'CI operational workflow',
      performedAt: new Date().toISOString()
    }, 201);
    const outcome = await json(cookie, `/interventions/${intervention.intervention.id}/outcome`, 'PATCH', {
      status: 'successful',
      observedAt: new Date().toISOString(),
      beforeValue: 28.4,
      afterValue: 23.2,
      note: 'Returned to target'
    });
    assert.equal(outcome.intervention.outcome.status, 'successful');
    const interventionDirectory = await json(cookie, `/interventions?sectionId=${encodeURIComponent(sectionId)}`);
    assert.equal(interventionDirectory.interventions.find((item) => item.id === intervention.intervention.id)?.outcome.status, 'successful');

    const dashboard = await json(cookie, '/dashboard');
    const fixture = dashboard.sites.flatMap((site) => site.zones).find((zone) => zone.id === 'section-ci-a');
    assert.equal(typeof fixture.score, 'number');
    const history = await json(cookie, '/history?sectionId=section-ci-a&metric=airTemp');
    assert.ok(history.points.length > 0);
    const csv = await request(cookie, '/exports/measurements.csv?sectionId=section-ci-a');
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type') || '', /text\/csv/);
    assert.match(await csv.text(), /^Date;Time;/);
  } finally {
    if (sectionId) {
      await request(cookie, `/nodes/${devEui}`, 'DELETE');
      await request(cookie, `/sections/${sectionId}`, 'DELETE');
    }
    if (areaId) await request(cookie, `/areas/${areaId}`, 'DELETE');
    await request(cookie, `/crop-profiles/${profileId}`, 'DELETE');
  }
});
