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

test('confirmed Area heat persists work, rejects invented warnings and verifies new cohort readings through HTTP and PostgreSQL', { skip: !configured }, async () => {
  const { randomUUID, randomBytes } = await import('node:crypto');
  const { query, closePool } = await import('../db.js');
  const suffix = randomUUID(), areaId = `heat-area-${suffix}`, sectionId = `heat-scope-${suffix}`, profileId = `heat-profile-${suffix}`;
  const devEuis = [randomBytes(8).toString('hex'), randomBytes(8).toString('hex')];
  const login = await request('', '/auth/login', 'POST', { email, password });
  assert.equal(login.status, 200);
  const cookie = (login.headers.getSetCookie?.()[0] || login.headers.get('set-cookie')).split(';', 1)[0];
  const me = await json(cookie, '/auth/me');
  const org = me.user.organizationId;
  const raw = { sensors: { sht4x: { present: true, fresh: true } } };
  const actionPath = `/actions/today/${encodeURIComponent(`${sectionId}:airTemp:high`)}/feedback`;
  try {
    await query('INSERT INTO areas (id,organization_id,name) VALUES ($1,$2,$3)', [areaId, org, 'Heat workflow fixture']);
    await query(`INSERT INTO crop_profiles (id,organization_id,name,hero_name,metrics) VALUES ($1,$2,'Heat profile','Tomato',$3)`, [profileId, org, JSON.stringify({ airTemp: { optimal: [18, 24] } })]);
    await query(`INSERT INTO sections (id,organization_id,area_id,name,crop_profile) VALUES ($1,$2,$3,'Heat workflow fixture',$4)`, [sectionId, org, areaId, profileId]);
    for (const devEui of devEuis) {
      await query(`INSERT INTO nodes (dev_eui,organization_id,area_id,section_id,name,last_received_at,last_seen) VALUES ($1,$2,$3,$4,'Heat test node',now(),now())`, [devEui, org, areaId, sectionId]);
      for (const minutes of [19, 10, 1]) await query(`INSERT INTO measurements (time,received_at,dev_eui,temperature,raw_object) VALUES (now()-$1*INTERVAL '1 minute',now(),$2,31,$3)`, [minutes, devEui, JSON.stringify(raw)]);
    }
    const directory = await json(cookie, '/actions/temperature');
    const pending = directory.items.find(item => item.action.areaId === areaId);
    assert.equal(pending.status, 'open');
    assert.equal(pending.action.value, 31);
    assert.equal(directory.canRecord, true);
    assert.equal((await request('', '/actions/temperature')).status, 401);
    const invented = { ...pending.action, sectionId, id: `${sectionId}:airTemp:low` };
    await json(cookie, `/actions/today/${encodeURIComponent(invented.id)}/feedback`, 'POST', { status: 'in_progress', action: invented }, 409);
    await json(cookie, actionPath, 'POST', { status: 'completed', action: pending.action, executionDetails: { type: 'vents_opened', adjustment: 'Opened side vents' } }, 409);
    await json(cookie, actionPath, 'POST', { status: 'in_progress', action: pending.action }, 201);
    const started = (await json(cookie, '/actions/temperature')).items.find(item => item.action.areaId === areaId);
    assert.equal(started.status, 'in_progress');
    await json(cookie, actionPath, 'POST', {
      status: 'completed', action: { ...started.action, value: 99, target: [0, 100], verificationNodeIds: ['invented'] },
      executionDetails: { type: 'vents_opened', adjustment: 'Opened side vents' }
    }, 201);
    let result = (await json(cookie, '/actions/temperature')).items.find(item => item.action.areaId === areaId);
    assert.equal(result.status, 'completed');
    assert.equal(result.outcome.state, 'awaiting_data');
    assert.equal(result.action.value, 31);
    assert.deepEqual(result.action.target, [18, 24]);
    assert.deepEqual(result.action.verificationNodeIds.sort(), devEuis.sort());
    // Advance the recorded work relative to the database clock, without real
    // sleeps or a fake browser clock. All rows belong only to this fixture.
    await query(`UPDATE action_feedback SET created_at=created_at-INTERVAL '31 minutes' WHERE organization_id=$1 AND action_id=$2`, [org, pending.action.id]);
    await query('DELETE FROM measurements WHERE dev_eui=ANY($1::text[])', [devEuis]);
    for (const devEui of devEuis) {
      for (const minutes of [15, 9, 3]) await query(`INSERT INTO measurements (time,received_at,dev_eui,temperature,raw_object) VALUES (now()-$1*INTERVAL '1 minute',now(),$2,23,$3)`, [minutes, devEui, JSON.stringify(raw)]);
    }
    result = (await json(cookie, '/actions/temperature')).items.find(item => item.action.areaId === areaId);
    assert.equal(result.current, null);
    assert.equal(result.outcome.state, 'target_reached');
    assert.equal(result.outcome.currentValue, 23);
    assert.equal(result.executionDetails.adjustment, 'Opened side vents');
    const history = await json(cookie, '/actions/history?limit=100');
    assert.equal(history.items.find(item => item.id === result.id).outcome.state, 'target_reached');
    const otherLogin = await request('', '/auth/login', 'POST', { email: process.env.TENANT_B_EMAIL || 'tenant-b@ci.neurocrop.test', password: process.env.TENANT_B_PASSWORD || password });
    assert.equal(otherLogin.status, 200);
    const otherCookie = (otherLogin.headers.getSetCookie?.()[0] || otherLogin.headers.get('set-cookie')).split(';', 1)[0];
    assert.equal((await json(otherCookie, '/actions/temperature')).items.some(item => item.action.areaId === areaId), false);
    // Missing original-sensor evidence cannot keep reporting a successful result.
    await query('DELETE FROM measurements WHERE dev_eui=$1', [devEuis[1]]);
    await query(`UPDATE action_feedback SET created_at=created_at-INTERVAL '30 minutes' WHERE organization_id=$1 AND action_id=$2`, [org, pending.action.id]);
    result = (await json(cookie, '/actions/temperature')).items.find(item => item.action.areaId === areaId);
    assert.equal(result.outcome.state, 'insufficient_data');
  } finally {
    await query('DELETE FROM measurements WHERE dev_eui=ANY($1::text[])', [devEuis]);
    await query('DELETE FROM nodes WHERE dev_eui=ANY($1::text[])', [devEuis]);
    await query('DELETE FROM sections WHERE organization_id=$1 AND id=$2', [org, sectionId]);
    await query('DELETE FROM areas WHERE organization_id=$1 AND id=$2', [org, areaId]);
    await query('DELETE FROM crop_profiles WHERE organization_id=$1 AND id=$2', [org, profileId]);
    await closePool();
  }
});
