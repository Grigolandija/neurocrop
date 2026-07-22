import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const apiSource = fs.readFileSync(new URL('../api.js', import.meta.url), 'utf8');
const teamSource = fs.readFileSync(new URL('../team-routes.js', import.meta.url), 'utf8');

function routeBlock(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Missing route ${signature}`);
  const next = source.indexOf('\napp.', start + signature.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function helperBlock(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Missing helper ${signature}`);
  const nextFunction = source.indexOf('\nasync function ', start + signature.length);
  const nextRoute = source.indexOf('\napp.', start + signature.length);
  const candidates = [nextFunction, nextRoute].filter((value) => value !== -1);
  return source.slice(start, candidates.length ? Math.min(...candidates) : source.length);
}

const tenantRoutes = [
  "app.get('/crop-profiles'",
  "app.post('/crop-profiles'",
  "app.patch('/crop-profiles/:id'",
  "app.post('/crop-profiles/:id/duplicate'",
  "app.delete('/crop-profiles/:id'",
  "app.get('/dashboard'",
  "app.get('/areas'",
  "app.post('/areas'",
  "app.patch('/areas/:areaId'",
  "app.delete('/areas/:areaId'",
  "app.get('/sections'",
  "app.post('/sections'",
  "app.patch('/sections/:sectionId'",
  "app.delete('/sections/:sectionId'",
  "app.get('/readings/latest'",
  "app.get('/history'",
  "app.get('/analytics/section'",
  "app.get('/analytics/site-comparison'",
  "app.get('/exports/measurements.csv'",
  "app.get('/nodes'",
  "app.get('/nodes/:devEui/sensors'",
  "app.patch('/nodes/:devEui/sensors/:port'",
  "app.post('/nodes/register'",
  "app.patch('/nodes/:devEui'",
  "app.delete('/nodes/:devEui'"
];

test('all tenant data routes derive organization scope from the authenticated request', () => {
  for (const signature of tenantRoutes) {
    const block = routeBlock(apiSource, signature);
    assert.match(block, /getOrganizationId\(req\)/, `${signature} has no request-scoped organization guard`);
  }
});

test('tenant ownership helpers require and apply organizationId', () => {
  for (const signature of [
    'async function getSectionById(sectionId, organizationId)',
    'async function getSectionDevEuis(sectionId, organizationId, { includeArchived = false } = {})',
    'async function cropProfileExists(profileId, organizationId)',
    'async function getNodeSensorPayload(devEui, organizationId)'
  ]) {
    const block = helperBlock(apiSource, signature);
    assert.match(block, /organization_id\s*=\s*\$\d/, `${signature} does not filter by organization_id`);
  }
});

test('legacy global tenant constants cannot return', () => {
  assert.equal(apiSource.includes('DEFAULT_ORG_ID'), false);
  assert.equal(apiSource.includes('DEV_USER'), false);
});

test('crop profile deletion reassigns sections atomically within the tenant', () => {
  const block = routeBlock(apiSource, "app.delete('/crop-profiles/:id'");
  assert.match(block, /client\.query\('BEGIN'\)/);
  assert.match(block, /replacementProfileId/);
  assert.match(block, /UPDATE sections SET crop_profile=\$3/);
  assert.match(block, /WHERE organization_id=\$1 AND crop_profile=\$2/);
  assert.match(block, /client\.query\('COMMIT'\)/);
  assert.match(block, /PROFILE_REPLACEMENT_REQUIRED/);
});

test('workspace settings mutations are role protected and organization scoped', () => {
  const memberRoleRoute = routeBlock(teamSource, "app.patch('/team/:userId/role'");
  assert.match(memberRoleRoute, /requireRole\('owner', 'admin'\)/);
  assert.match(memberRoleRoute, /organizationId\(req\)/);
  assert.match(memberRoleRoute, /organization_id=\$\d/);

  const organizationRoute = routeBlock(teamSource, "app.patch('/organization'");
  assert.match(organizationRoute, /requireRole\('owner', 'admin'\)/);
  assert.match(organizationRoute, /organizationId\(req\)/);
});

test('node deletion supports explicit history retention and permanent purge', () => {
  const block = routeBlock(apiSource, "app.delete('/nodes/:devEui'");
  assert.match(block, /historyPolicy/);
  assert.match(block, /UPDATE nodes SET archived_at=now\(\)/);
  assert.match(block, /DELETE FROM measurements WHERE lower\(dev_eui\)=\$1/);
  assert.match(block, /await client\.query\('BEGIN'\)/);
  assert.match(block, /await client\.query\('COMMIT'\)/);
  assert.doesNotMatch(block, /NODE_HAS_HISTORY/);
});

test('active node surfaces exclude archived inventory while history can retain it', () => {
  assert.match(apiSource, /FROM nodes WHERE organization_id=\$1 AND archived_at IS NULL ORDER BY created_at ASC/);
  assert.match(apiSource, /getSectionDevEuis\(section\.id, getOrganizationId\(req\), \{ includeArchived: true \}\)/);
});

test('team and invitation queries are scoped to the active session organization', () => {
  for (const signature of [
    "app.get('/team'",
    "app.get('/invitations'",
    "app.post('/invitations'",
    "app.delete('/invitations/:invitationId'"
  ]) {
    const block = routeBlock(teamSource, signature);
    assert.match(block, /organizationId\(req\)/, `${signature} has no active-organization scope`);
  }
});
