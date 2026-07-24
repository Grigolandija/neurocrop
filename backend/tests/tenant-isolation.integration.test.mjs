import assert from 'node:assert/strict';
import test from 'node:test';

const baseUrl = String(process.env.TENANT_TEST_BASE_URL || '').replace(/\/$/, '');
const tenantA = {
  email: process.env.TENANT_A_EMAIL || '',
  password: process.env.TENANT_A_PASSWORD || ''
};
const tenantB = {
  email: process.env.TENANT_B_EMAIL || '',
  password: process.env.TENANT_B_PASSWORD || ''
};
const configured = process.env.RUN_API_INTEGRATION === 'true'
  && Boolean(baseUrl && tenantA.email && tenantA.password && tenantB.email && tenantB.password);

async function login(credentials) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(credentials)
  });
  assert.equal(response.status, 200, `Login failed for ${credentials.email}`);
  const cookie = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie');
  assert.ok(cookie, `No session cookie returned for ${credentials.email}`);
  return cookie.split(';', 1)[0];
}

async function api(cookie, path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Cookie: cookie,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
}

async function json(cookie, path) {
  const response = await api(cookie, path);
  assert.equal(response.status, 200, `${path} returned ${response.status}`);
  return response.json();
}

function collectDashboardIds(payload) {
  const areas = payload.sites || [];
  return {
    areaIds: new Set(areas.map((area) => area.id)),
    sectionIds: new Set(areas.flatMap((area) => (area.zones || []).map((section) => section.id))),
    nodeIds: new Set(areas.flatMap((area) => (area.zones || []).flatMap((section) => (section.batteryNodes || []).map((node) => node.devEui))))
  };
}

test('tenant A cannot discover or access tenant B resources', { skip: !configured }, async () => {
  const [cookieA, cookieB] = await Promise.all([login(tenantA), login(tenantB)]);
  const [dashboardA, dashboardB, profilesA, profilesB] = await Promise.all([
    json(cookieA, '/dashboard'),
    json(cookieB, '/dashboard'),
    json(cookieA, '/crop-profiles'),
    json(cookieB, '/crop-profiles')
  ]);
  const idsA = collectDashboardIds(dashboardA);
  const idsB = collectDashboardIds(dashboardB);

  for (const id of idsB.areaIds) assert.equal(idsA.areaIds.has(id), false, `Tenant B area leaked into tenant A dashboard: ${id}`);
  for (const id of idsB.sectionIds) assert.equal(idsA.sectionIds.has(id), false, `Tenant B section leaked into tenant A dashboard: ${id}`);
  for (const id of idsB.nodeIds) assert.equal(idsA.nodeIds.has(id), false, `Tenant B node leaked into tenant A dashboard: ${id}`);

  const areaB = dashboardB.sites?.[0];
  const sectionB = areaB?.zones?.[0];
  assert.ok(areaB && sectionB, 'Tenant B fixture must contain at least one Area and Section');

  const foreignSections = await json(cookieA, `/sections?areaId=${encodeURIComponent(areaB.id)}`);
  assert.deepEqual(foreignSections.sections, [], 'Tenant A discovered sections through tenant B areaId');

  const foreignNodes = await json(cookieA, `/nodes?sectionId=${encodeURIComponent(sectionB.id)}`);
  assert.deepEqual(foreignNodes.nodes, [], 'Tenant A discovered nodes through tenant B sectionId');

  for (const path of [
    `/readings/latest?sectionId=${encodeURIComponent(sectionB.id)}`,
    `/history?sectionId=${encodeURIComponent(sectionB.id)}&metric=airTemp`,
    `/analytics/section?sectionId=${encodeURIComponent(sectionB.id)}&metric=airTemp&range=24h`,
    `/exports/measurements.csv?sectionId=${encodeURIComponent(sectionB.id)}`
  ]) {
    const response = await api(cookieA, path);
    assert.equal(response.status, 404, `Cross-tenant read was not hidden for ${path}`);
  }

  const areaPatch = await api(cookieA, `/areas/${encodeURIComponent(areaB.id)}`, {
    method: 'PATCH', body: JSON.stringify({ name: areaB.name })
  });
  assert.equal(areaPatch.status, 404, 'Tenant A could update tenant B Area');

  const sectionPatch = await api(cookieA, `/sections/${encodeURIComponent(sectionB.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ areaId: areaB.id, name: sectionB.name, cropProfile: sectionB.profile })
  });
  assert.ok([400, 404].includes(sectionPatch.status), 'Tenant A could update tenant B Section');

  const foreignAlertId = `metric:${areaB.id}:${sectionB.id}:airTemp`;
  const foreignAlert = await api(cookieA, `/alerts/${encodeURIComponent(foreignAlertId)}/acknowledge`, {
    method: 'POST',
    body: JSON.stringify({})
  });
  assert.equal(foreignAlert.status, 404, 'Tenant A could acknowledge tenant B alert');

  const foreignIntervention = await api(cookieA, '/interventions', {
    method: 'POST',
    body: JSON.stringify({
      sectionId: sectionB.id,
      actionType: 'CROSS_TENANT_TEST',
      performedAt: new Date().toISOString()
    })
  });
  assert.equal(foreignIntervention.status, 404, 'Tenant A could create an intervention in tenant B Section');

  const profileIdsA = new Set((profilesA.profiles || []).map((profile) => profile.id));
  const foreignProfile = (profilesB.profiles || []).find((profile) => !profileIdsA.has(profile.id));
  if (foreignProfile) {
    const profilePatch = await api(cookieA, `/crop-profiles/${encodeURIComponent(foreignProfile.id)}`, {
      method: 'PATCH',
      body: JSON.stringify(foreignProfile)
    });
    assert.equal(profilePatch.status, 404, 'Tenant A could update tenant B crop profile');
  }

  const nodeB = sectionB.batteryNodes?.find((node) => node.devEui);
  if (nodeB) {
    const sensorResponse = await api(cookieA, `/nodes/${encodeURIComponent(nodeB.devEui)}/sensors`);
    assert.equal(sensorResponse.status, 404, 'Tenant A could read tenant B node sensors');

    const nodePatch = await api(cookieA, `/nodes/${encodeURIComponent(nodeB.devEui)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: nodeB.name || nodeB.devEui, sectionId: sectionB.id })
    });
    assert.equal(nodePatch.status, 404, 'Tenant A could update tenant B node');
  }
});
