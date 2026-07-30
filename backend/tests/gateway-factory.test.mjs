import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  factorySequenceFromIdentity,
  formatFactorySerial,
  gatewayConnectivityStatus,
  hashGatewaySecret,
  normalizeFactorySerial,
  normalizeGatewayId,
  publicAdminGateway,
  validFactorySerial
} from '../gateway-factory-routes.js';

test('gateway factory formats automatic NSG identities', () => {
  assert.equal(formatFactorySerial(1), 'NSG-000001');
  assert.equal(formatFactorySerial(42), 'NSG-000042');
  assert.equal(formatFactorySerial(999999), 'NSG-999999');
  assert.throws(() => formatFactorySerial(1000000));
  assert.equal(factorySequenceFromIdentity('NSG-000001'), 1);
  assert.equal(factorySequenceFromIdentity('nsg-000042'), 42);
  assert.equal(factorySequenceFromIdentity('NeuroCrop Gateway 001'), 0);
});

test('gateway factory normalizes identifiers without accepting malformed serials', () => {
  assert.equal(normalizeGatewayId('B8:27:EB:FF:FE:9C:1C:57'), 'b827ebfffe9c1c57');
  assert.equal(normalizeFactorySerial(' ncgw 000012 '), 'NCGW-000012');
  assert.equal(validFactorySerial('NCGW-000012'), true);
  assert.equal(validFactorySerial('../gateway'), false);
  assert.equal(validFactorySerial('ab'), false);
});

test('gateway credentials are stored as one-way hashes', () => {
  const first = hashGatewaySecret('activation-one');
  const second = hashGatewaySecret('activation-two');
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.equal(first.includes('activation-one'), false);
});

test('gateway connectivity follows fresh authenticated heartbeats', () => {
  const now = Date.parse('2026-07-30T12:00:00Z');
  assert.equal(gatewayConnectivityStatus({
    status: 'online',
    last_seen_at: '2026-07-30T11:58:30Z'
  }, now), 'online');
  assert.equal(gatewayConnectivityStatus({
    status: 'online',
    last_seen_at: '2026-07-30T11:50:00Z'
  }, now), 'offline');
  assert.equal(gatewayConnectivityStatus({
    status: 'configuration_error',
    last_seen_at: '2026-07-30T11:59:59Z'
  }, now), 'configuration_error');
});

test('admin gateway connectivity is sourced from ChirpStack, not the management agent', () => {
  const row = {
    gateway_id: 'b827ebfffe9c1c57',
    serial_number: 'NSG-000001',
    display_name: 'NSG-000001',
    status: 'online',
    last_seen_at: '2026-07-28T21:04:00Z'
  };
  const live = publicAdminGateway(row, {
    gatewayId: row.gateway_id,
    name: row.display_name,
    lastSeenAt: new Date().toISOString()
  }, true);
  assert.equal(live.status, 'online');
  assert.equal(live.agentStatus, 'offline');
  assert.equal(live.connectivitySource, 'chirpstack');
  assert.equal(publicAdminGateway(row, null, true).status, 'not_registered');
  assert.equal(publicAdminGateway(row, null, false).status, 'unknown');
  const discovered = publicAdminGateway(null, {
    gatewayId: row.gateway_id,
    name: row.display_name,
    lastSeenAt: new Date().toISOString()
  }, true);
  assert.equal(discovered.status, 'online');
  assert.equal(discovered.agentEnrolled, false);
  assert.equal(discovered.agentStatus, 'not_enrolled');
  assert.equal(discovered.serialNumber, 'CS-B827EBFFFE9C1C57');
});

test('gateway factory enforces TLS, one-time activation, and authenticated heartbeat', () => {
  const source = fs.readFileSync(new URL('../gateway-factory-routes.js', import.meta.url), 'utf8');
  assert.match(source, /!config\.server\.startsWith\('ssl:\/\/'\)/);
  assert.match(source, /token_hash=\$1 FOR UPDATE/);
  assert.match(source, /status='consumed'/);
  assert.match(source, /deriveDeviceToken\(activationToken, gatewayId\)/);
  assert.match(source, /device_token_hash=\$2/);
  assert.match(source, /'Grpc-Metadata-Authorization': `Bearer \$\{config\.token\}`/);
  assert.match(source, /app\.patch\('\/platform\/gateways\/:gatewayId\/organization', requireUserAuth, requireSuperAdmin/);
  assert.match(source, /UPDATE gateways SET organization_id=\$2/);
  assert.match(source, /INSERT INTO gateways \([\s\S]*?CS-\$\{gatewayId\.toUpperCase\(\)\}/);
  assert.match(source, /Restore the organization before assigning a gateway/);
  assert.match(source, /app\.get\('\/gateway-factory\/health', factoryAuth/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /gateways\?limit=1000&tenantId=/);
  assert.match(source, /\^NSG-\(\[0-9\]\{6\}\)\$/);
  assert.doesNotMatch(source, /activation_token\s+TEXT/);
});

test('gateway migration keeps activation secrets hashed and identities unique', () => {
  const sql = fs.readFileSync(new URL('../migrations/0008_gateway_factory.sql', import.meta.url), 'utf8');
  assert.match(sql, /token_hash\s+TEXT NOT NULL UNIQUE/);
  assert.match(sql, /gateway_id\s+TEXT NOT NULL UNIQUE/);
  assert.match(sql, /serial_number\s+TEXT NOT NULL UNIQUE/);
  assert.match(sql, /device_token_hash\s+TEXT NOT NULL/);
  assert.doesNotMatch(sql, /activation_token/);
});
