import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  formatNodeFactorySerial,
  isMissingChirpstackResource,
  nodeSequenceFromIdentity,
  normalizeNodeDevEui
} from '../gateway-factory-routes.js';

test('node factory formats automatic NSN identities', () => {
  assert.equal(formatNodeFactorySerial(1), 'NSN-000001');
  assert.equal(formatNodeFactorySerial(42), 'NSN-000042');
  assert.equal(nodeSequenceFromIdentity('NSN-000123'), 123);
  assert.equal(nodeSequenceFromIdentity('node-123'), 0);
  assert.throws(() => formatNodeFactorySerial(0));
});

test('node factory recognizes ChirpStack v4 missing-resource responses', () => {
  assert.equal(isMissingChirpstackResource({ status: 404, message: 'not found' }), true);
  assert.equal(isMissingChirpstackResource({
    status: 401,
    message: JSON.stringify({ code: 16, message: '', details: [] })
  }), true);
  assert.equal(isMissingChirpstackResource({ status: 401, message: 'invalid token' }), false);
  assert.equal(isMissingChirpstackResource({ status: 500, message: 'failure' }), false);
});

test('node factory normalizes DevEUI and keeps AppKey server generated', () => {
  assert.equal(normalizeNodeDevEui('82:0C:97:E5:93:A9:CA:75'), '820c97e593a9ca75');
  const source = fs.readFileSync(new URL('../gateway-factory-routes.js', import.meta.url), 'utf8');
  assert.match(source, /crypto\.randomBytes\(16\)\.toString\('hex'\)/);
  assert.match(source, /app\.post\('\/node-factory\/registrations', factoryAuth/);
  assert.match(source, /getChirpstackDeviceKeys\(devEui\)/);
  assert.doesNotMatch(source, /DEFAULT_OTAA_APP_KEY/);
});

test('node factory restores an archived factory node deleted from ChirpStack', () => {
  const source = fs.readFileSync(new URL('../gateway-factory-routes.js', import.meta.url), 'utf8');
  assert.match(source, /organization_id, archived_at/);
  assert.match(source, /archivedFactoryNode/);
  assert.match(source, /existingAppKeyIsValid && !archivedFactoryNode/);
  assert.match(source, /existingAppKeyIsValid \? appKey : crypto\.randomBytes/);
  assert.match(source, /getChirpstackDevice\(devEui\)/);
  assert.match(source, /createFactoryNodeKeysInChirpstack/);
  assert.match(source, /factory_provisioned_at=now\(\)/);
  assert.match(source, /factory_status=CASE WHEN archived_at IS NOT NULL THEN 'unassigned'/);
  assert.match(source, /archived_at=NULL/);
  assert.match(source, /last_received_at=NULL/);
  assert.doesNotMatch(
    source.slice(
      source.indexOf("app.post('/node-factory/registrations'"),
      source.indexOf("app.get('/node-factory/nodes/:devEui'")
    ),
    /DELETE FROM measurements/
  );
});

test('node firmware delivery is authenticated and checksum verified', () => {
  const source = fs.readFileSync(new URL('../gateway-factory-routes.js', import.meta.url), 'utf8');
  assert.match(source, /app\.get\('\/node-factory\/firmware\/latest', factoryAuth/);
  assert.match(source, /app\.get\('\/node-factory\/firmware\/download', factoryAuth/);
  assert.match(source, /crypto\.createHash\('sha256'\)\.update\(contents\)/);
  assert.match(source, /actualSha256 !== expectedSha256/);
  assert.match(source, /path\.basename/);
});

test('gateway software updates require device authentication, signatures and staged rollout', () => {
  const source = fs.readFileSync(new URL('../gateway-factory-routes.js', import.meta.url), 'utf8');
  assert.match(source, /app\.get\('\/gateway\/update\/check'/);
  assert.match(source, /app\.get\('\/gateway\/update\/download'/);
  assert.match(source, /app\.post\('\/gateway\/update\/status'/);
  assert.match(source, /authenticatedGateway/);
  assert.match(source, /requireUserAuth, requireSuperAdmin/);
  assert.match(source, /target_agent_version/);
  assert.match(source, /rollout_percent/);
});

test('API registers node factory routes', () => {
  const source = fs.readFileSync(new URL('../api.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ registerGatewayFactoryRoutes \} from '\.\/gateway-factory-routes\.js';/);
  assert.match(source, /registerGatewayFactoryRoutes\(app\);/);
});

test('node inventory migration stores no LoRaWAN secret', () => {
  const sql = fs.readFileSync(new URL('../migrations/0009_node_factory.sql', import.meta.url), 'utf8');
  assert.match(sql, /factory_serial TEXT/);
  assert.match(sql, /factory_status TEXT/);
  assert.doesNotMatch(sql, /app_key|nwk_key/i);
});
