import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  factorySequenceFromIdentity,
  formatFactorySerial,
  hashGatewaySecret,
  normalizeFactorySerial,
  normalizeGatewayId,
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

test('gateway factory enforces TLS, one-time activation, and authenticated heartbeat', () => {
  const source = fs.readFileSync(new URL('../gateway-factory-routes.js', import.meta.url), 'utf8');
  assert.match(source, /!config\.server\.startsWith\('ssl:\/\/'\)/);
  assert.match(source, /token_hash=\$1 FOR UPDATE/);
  assert.match(source, /status='consumed'/);
  assert.match(source, /deriveDeviceToken\(activationToken, gatewayId\)/);
  assert.match(source, /device_token_hash=\$2/);
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
