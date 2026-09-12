import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import test from 'node:test';
import { IngestInbox, durableMessageHandler } from '../ingest-inbox.js';
import * as telemetry from '../telemetry-values.js';
import * as health from '../node-health.js';
import { REGISTERED_TELEMETRY_DEFINITIONS } from '../metric-registry.js';
import { withHistoryGaps } from '../history-gaps.js';

function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neurocrop-inbox-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('inbox survives restart and retries failed DB writes before deleting a packet', async (t) => {
  const dir = directory(t);
  const original = new IngestInbox(dir);
  original.put(Buffer.from('{"time":"2026-01-01T00:00:00Z"}'));
  const restarted = new IngestInbox(dir);
  await assert.rejects(restarted.flush(async () => { throw new Error('DB unavailable'); }), /DB unavailable/);
  assert.equal(new IngestInbox(dir).entries.size, 1);
  const consumed = [];
  await restarted.flush(async (message) => { consumed.push(message); });
  assert.equal(consumed.length, 1);
  assert.equal(new IngestInbox(dir).entries.size, 0);
});

test('duplicate enqueue is idempotent and concurrent drains do not double consume', async (t) => {
  const inbox = new IngestInbox(directory(t));
  inbox.put('{"id":1}');
  inbox.put('{"id":1}');
  let count = 0;
  const consume = async () => { count++; await new Promise((resolve) => setImmediate(resolve)); };
  await Promise.all([inbox.flush(consume), inbox.flush(consume)]);
  assert.equal(count, 1);
  assert.equal(inbox.bytes, 0);
});

test('crash after commit but before inbox removal replays the same immutable event', async (t) => {
  const dir = directory(t);
  const inbox = new IngestInbox(dir);
  inbox.put('{"id":"unchanged"}');
  const database = new Set();
  await assert.rejects(inbox.flush(async (message) => {
    database.add(message.id);
    throw new Error('crash after commit');
  }));
  await new IngestInbox(dir).flush(async (message) => database.add(message.id));
  assert.equal(database.size, 1);
});

test('capacity failure refuses acknowledgement and preserves existing backlog', (t) => {
  const inbox = new IngestInbox(directory(t), { maxBytes: 8 });
  inbox.put('{"a":1}');
  let error;
  durableMessageHandler(inbox)({ payload: Buffer.from('{"b":2}') }, (result) => { error = result; });
  assert.match(error.message, /capacity/);
  assert.equal(inbox.entries.size, 1);
});

test('actual MQTT.js QoS1 handler sends PUBACK only after durable storage', (t) => {
  const require = createRequire(import.meta.url);
  const mqttEntry = require.resolve('mqtt');
  const publish = require(path.join(path.dirname(mqttEntry), 'lib/handlers/publish.js')).default;
  const dir = directory(t);
  const inbox = new IngestInbox(dir);
  let acknowledgements = 0;
  const client = {
    log() {}, emit() {},
    options: { protocolVersion: 4, customHandleAcks: (_topic, _message, _packet, cb) => cb(null, 0) },
    handleMessage: durableMessageHandler(inbox),
    _sendPacket: (packet, done) => {
      assert.equal(packet.cmd, 'puback');
      assert.equal(new IngestInbox(dir).entries.size, 1);
      acknowledgements++;
      done();
    },
  };
  publish(client, { topic: 'up', payload: Buffer.from('{"id":1}'), qos: 1, messageId: 1 }, () => {});
  assert.equal(acknowledgements, 1);
  client.handleMessage = durableMessageHandler({ put() { throw new Error('disk unavailable'); } });
  let failure;
  publish(client, { topic: 'up', payload: Buffer.from('{"id":2}'), qos: 1, messageId: 2 }, (err) => { failure = err; });
  assert.match(failure.message, /disk unavailable/);
  assert.equal(acknowledgements, 1);
});

test('cache metadata is preserved but cannot create a new numeric measurement', () => {
  for (const state of ['cached_not_due', 'cached_read_failed']) {
    const packet = { temperature: 25, sensors: { sht45: { present: true, fresh: false, due: true, state } } };
    assert.equal(telemetry.normalizeRegisteredTelemetry(packet).temperature, null);
    assert.deepEqual(telemetry.compactTelemetryMetadata(packet).sensors.sht45, packet.sensors.sht45);
  }
  assert.equal(telemetry.normalizeRegisteredTelemetry({ temperature: 25 }).temperature, 25);
  assert.equal(telemetry.normalizeRegisteredTelemetry({ temperature: 25, sensors: { sht45: { fresh: true, present: true } } }).temperature, 25);
});

test('sensor freshness uses measurement cadence, including slow CO2 sampling', () => {
  assert.equal(telemetry.sensorMeasurementIntervalSec('co2', 'normal', 300), 1800);
  assert.equal(telemetry.sensorMeasurementIntervalSec('co2', 'intensive', 60), 300);
  assert.equal(telemetry.sensorMeasurementIntervalSec('co2', 'power_save', 900), 3600);
});

test('invalid or absent event time is rejected, never replaced with now', () => {
  for (const time of [null, undefined, '', 'garbage', {}, '2099-01-01T00:00:00Z']) {
    assert.equal(telemetry.normalizeTelemetryTimestamp(time), null);
  }
  assert.equal(telemetry.normalizeTelemetryTimestamp('2026-01-01T00:00:00Z').toISOString(), '2026-01-01T00:00:00.000Z');
});

test('actual uplink handler rejects invalid time before touching DB and stores cache as null', async () => {
  const source = fs.readFileSync(new URL('../ingest.js', import.meta.url), 'utf8');
  const calls = [];
  const context = vm.createContext({
    ...telemetry, ...health, REGISTERED_TELEMETRY_DEFINITIONS,
    console: { log() {}, warn() {} },
    pool: { connect: async () => ({ release() {}, query: async (sql, args) => {
      calls.push({ sql, args });
      return { rows: sql.includes('UPDATE nodes') ? [{ dev_eui: args[0] }] : sql.includes('INSERT INTO measurements') ? [{ time: args[0] }] : [] };
    } }) },
  });
  const declarations = source.slice(source.indexOf('const registeredColumns'), source.indexOf('function markReady'));
  vm.runInContext(declarations + source.slice(source.indexOf('async function handleUplink'), source.indexOf('let shuttingDown')), context);
  const message = { deviceInfo: { devEui: '0000000000000001' }, time: 'invalid', object: {} };
  await context.handleUplink(message);
  assert.equal(calls.length, 0);
  message.time = '2026-01-01T00:00:00Z';
  message.object = { temperature: 25, sensors: { sht45: { fresh: false, present: true, state: 'cached_read_failed' } } };
  await context.handleUplink(message);
  const insert = calls.find((call) => call.sql.includes('INSERT INTO measurements'));
  const index = REGISTERED_TELEMETRY_DEFINITIONS.findIndex((item) => item.telemetryKey === 'temperature');
  assert.equal(insert.args[index + 2], null);
  assert.match(insert.sql, /ON CONFLICT \(dev_eui, time\) DO NOTHING/);
  assert.match(calls.find((call) => call.sql.includes('UPDATE nodes')).sql, /last_received_at <= \$4/);
});

test('history marks outages without treating an hourly CO2 schedule as missing data', () => {
  const points = [0, 1, 5].map((hour) => ({ observedAt: new Date(Date.UTC(2026, 0, 1, hour)).toISOString(), value: 500 }));
  const result = withHistoryGaps(points, 'co2', 5);
  assert.equal(result.length, 4);
  assert.equal(result[2].value, null);
  assert.equal(withHistoryGaps(points.slice(0, 2), 'co2', 5).length, 2);
  assert.equal(withHistoryGaps(points, 'airTemp', 240).length, 3);
});
