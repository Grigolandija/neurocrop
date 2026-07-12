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
    const area = await json(cookie, '/areas', 'POST', { name: `CI Area ${suffix}` }, 201);
    areaId = area.area.id;
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
