import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import pg from 'pg';
import * as telemetry from '../telemetry-values.js';
import * as health from '../node-health.js';
import * as provenance from '../uplink-provenance.js';
import { REGISTERED_TELEMETRY_DEFINITIONS } from '../metric-registry.js';
import { registerTelemetrySupportRoutes } from '../telemetry-support-routes.js';
import { registerNodeAcceptanceRoutes } from '../node-acceptance.js';
import { runMeasurementRetention } from '../measurement-retention.js';

const pglite = process.env.DIAGNOSTIC_PGLITE_MODULE;
const configuredPg = process.env.NODE_ENV === 'test' && Boolean(process.env.PGDATABASE);

test('real DB: atomic reception, replay, ownership, factory acceptance and bounded cleanup', { skip: !pglite && !configuredPg }, async () => {
  let db, close;
  if (pglite) { const { PGlite } = await import(pglite); db = new PGlite(); close = () => db.close(); }
  else { const pool = new pg.Pool({ max: 1 }); db = await pool.connect(); close = async () => { db.release(); await pool.end(); }; }
  const query = db.query.bind(db), schema = `trace_test_${process.pid}`;
  const pool = { connect: async () => ({ query, release() {} }) };
  try {
    await query(`CREATE SCHEMA ${schema}`); await query(`SET search_path TO ${schema}`);
    const dir = new URL('../migrations/', import.meta.url);
    for (const file of (await readdir(dir)).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort()) {
      // pg accepts scripts, PGlite's query uses the extended protocol.
      const sql = await readFile(new URL(file, dir), 'utf8');
      if (db.exec) await db.exec(sql); else await query(sql);
    }
    await query("INSERT INTO organizations(id,name) VALUES('a','A'),('b','B')");
    const devEui = '0000000000000001';
    await query("INSERT INTO nodes(dev_eui,organization_id,name,factory_serial) VALUES($1,'a','Node','NSN-000001')", [devEui]);
    const context = vm.createContext({ ...telemetry, ...health, ...provenance, REGISTERED_TELEMETRY_DEFINITIONS,
      console: { log() {}, warn() {} }, pool });
    const source = await readFile(new URL('../ingest.js', import.meta.url), 'utf8');
    vm.runInContext(source.slice(source.indexOf('const registeredColumns'), source.indexOf('function markReady'))
      + source.slice(source.indexOf('async function handleUplink'), source.indexOf('async function shutdown')), context);
    const msg = { deduplicationId: 'first', deviceInfo: { devEui }, time: new Date().toISOString(), fCnt: 1, fPort: 1, data: 'AQID',
      object: { firmware_version: '2.1.7', temperature: 23, humidity: 60, sensors: { sht45: { present: true, fresh: true } } } };
    await context.handleUplink(msg); await context.handleUplink(msg);
    const count = async table => Number((await query(`SELECT count(*) FROM ${table}`)).rows[0].count);
    assert.equal(await count('measurements'), 1); assert.equal(await count('uplink_events'), 1);
    assert.equal(Number((await query('SELECT count(*) FROM measurements m JOIN uplink_events e ON e.id=m.uplink_event_id')).rows[0].count), 1);
    await context.handleUplink({ ...msg, deduplicationId: 'different-reception' });
    assert.equal(await count('measurements'), 1); assert.equal(await count('uplink_events'), 2);
    assert.equal((await query("SELECT outcome FROM uplink_events WHERE source_event_id='different-reception'")).rows[0].outcome, 'measurement_duplicate');

    // A provenance write failure rolls back inventory and measurements together.
    await query(`CREATE FUNCTION fail_trace() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'disk test'; END $$`);
    await query('CREATE TRIGGER fail_trace BEFORE INSERT ON uplink_events FOR EACH ROW EXECUTE FUNCTION fail_trace()');
    await assert.rejects(context.handleUplink({ ...msg, deduplicationId: 'retry-me', time: new Date(Date.now() + 1000).toISOString() }), /disk test/);
    assert.equal(await count('measurements'), 1);
    await query('DROP TRIGGER fail_trace ON uplink_events');
    const retry = { ...msg, deduplicationId: 'retry-me', time: new Date(Date.now() + 2000).toISOString() };
    await context.handleUplink(retry); assert.equal(await count('measurements'), 2);

    const routes = new Map(), app = Object.fromEntries(['get','post'].map(method => [method, (path, ...handlers) => routes.set(`${method}:${path}`, handlers.at(-1))]));
    const call = async (method, path, params, body = {}, org = 'a') => {
      let value, status = 200;
      const res = { status(s) { status = s; return this; }, json(v) { value = v; return this; } };
      await routes.get(`${method}:${path}`)({ params, body, user: { organizationId: org } }, res, err => { throw err; });
      return { status, value };
    };
    registerTelemetrySupportRoutes(app, { query, requireAuth() {}, getOrganizationId: req => req.user.organizationId });
    const listPath = '/nodes/:devEui/uplinks', detailPath = '/nodes/:devEui/uplinks/:eventId';
    const own = await call('get', listPath, { devEui }); assert.equal(own.value.uplinks.length, 3);
    assert.equal((await call('get', listPath, { devEui }, {}, 'b')).status, 404);
    const eventId = own.value.uplinks[0].id;
    assert.equal((await call('get', detailPath, { devEui, eventId }, {}, 'b')).status, 404);
    assert.equal((await call('get', detailPath, { devEui, eventId })).value.uplink.raw_payload, 'AQID');
    await query("UPDATE nodes SET organization_id='b' WHERE dev_eui=$1", [devEui]);
    assert.equal((await call('get', listPath, { devEui }, {}, 'b')).value.uplinks.length, 0);
    assert.equal((await call('get', detailPath, { devEui, eventId }, {}, 'b')).status, 404);

    const sha = 'a'.repeat(64);
    registerNodeAcceptanceRoutes(app, { query, pool, factoryAuth() {}, readFirmware: () => ({ version: '2.1.7-factory', sha256: sha }) });
    const body = { firmwareVersion: '2.1.7-factory', firmwareSha256: sha, usbVerified: true, expectedSensors: ['sht45'] };
    const startPath = '/node-factory/nodes/:devEui/acceptance', checkPath = '/node-factory/nodes/:devEui/acceptance/:id';
    assert.equal((await call('post', startPath, { devEui }, { ...body, firmwareSha256: 'wrong' })).status, 400);
    const started = await call('post', startPath, { devEui }, body); assert.equal(started.status, 201);
    const id = started.value.acceptance.id;
    assert.equal((await call('get', checkPath, { devEui, id })).value.acceptance.status, 'pending');
    await context.handleUplink({ ...msg, time: new Date().toISOString(), deduplicationId: 'acceptance-proof' });
    assert.equal((await call('get', checkPath, { devEui, id })).value.acceptance.status, 'passed');
    assert.equal((await call('get', checkPath, { devEui, id })).value.acceptance.result.uplinkId.length, 64);
    const timed = (await call('post', startPath, { devEui }, body)).value.acceptance.id;
    await query("UPDATE node_acceptance_runs SET started_at=now()-interval '20 minutes', deadline_at=now()-interval '10 minutes' WHERE id=$1", [timed]);
    assert.equal((await call('get', checkPath, { devEui, id: timed })).value.acceptance.status, 'failed');
    await query("UPDATE uplink_events SET recorded_at=now()-interval '40 days'");
    const cleanup = await runMeasurementRetention(pool, { batchSize: 2 });
    assert.equal(cleanup.uplinksDeleted, 4); assert.equal(await count('uplink_events'), 0);
    assert.equal(Number((await query('SELECT count(*) FROM measurements WHERE uplink_event_id IS NOT NULL')).rows[0].count), 0);
    assert.equal((await call('get', checkPath, { devEui, id })).value.acceptance.status, 'passed');
  } finally {
    await query('SET search_path TO public').catch(() => {});
    await query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await close();
  }
});
