// Disposable in-memory DB only; never connects to the configured application DB.
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import * as telemetry from '../telemetry-values.js';
import * as health from '../node-health.js';
import * as provenance from '../uplink-provenance.js';
import { REGISTERED_TELEMETRY_DEFINITIONS } from '../metric-registry.js';

const modulePath = process.env.BENCHMARK_PGLITE_MODULE;
if (!modulePath) throw new Error('Set BENCHMARK_PGLITE_MODULE to an isolated @electric-sql/pglite module. No production DB is used.');
const { PGlite } = await import(modulePath);
const db = new PGlite(), results = [];
try {
  const directory = new URL('../migrations/', import.meta.url);
  for (const file of (await readdir(directory)).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort())
    await db.exec(await readFile(new URL(file, directory), 'utf8'));
  await db.exec(`INSERT INTO organizations(id,name) VALUES('burst-test','Disposable burst test');
    INSERT INTO areas(id,organization_id,name) VALUES('bench-area','burst-test','Test greenhouse');
    INSERT INTO sections(id,organization_id,area_id,name,crop_profile) VALUES('bench-zone','burst-test','bench-area','Test zone','default');
    INSERT INTO nodes(dev_eui,organization_id,area_id,section_id,name)
    SELECT lpad(to_hex(i),16,'0'),'burst-test','bench-area','bench-zone','Bench '||i FROM generate_series(1,1000) i;`);
  const pool = { connect: async () => ({ query: db.query.bind(db), release() {} }) };
  const context = vm.createContext({ pool, ...telemetry, ...health, ...provenance, REGISTERED_TELEMETRY_DEFINITIONS,
    console: { log() {}, warn() {} } });
  const source = await readFile(new URL('../ingest.js', import.meta.url), 'utf8');
  vm.runInContext(source.slice(source.indexOf('const registeredColumns'), source.indexOf('function markReady'))
    + source.slice(source.indexOf('async function handleUplink'), source.indexOf('async function shutdown')), context);
  for (const nodes of [100, 500, 1000]) {
    const time = new Date().toISOString(), durations = [], began = performance.now();
    for (let i = 1; i <= nodes; i++) {
      const before = performance.now();
      await context.handleUplink({ deduplicationId: `bench-${nodes}-${i}`, time, fCnt: nodes, fPort: 1, data: 'AQID',
        deviceInfo: { devEui: i.toString(16).padStart(16, '0') },
        rxInfo: [{ gatewayId: 'aabbccddeeff0011', rssi: -85, snr: 7 }],
        object: { firmware_version: '2.1.7', temperature: 22, humidity: 60, expected_uplink_interval_s: 300,
          sensors: { sht45: { present: true, fresh: true } } } });
      durations.push(performance.now() - before);
    }
    const elapsedMs = performance.now() - began;
    durations.sort((a,b) => a-b);
    results.push({ nodes, messages: nodes, elapsedMs: Math.round(elapsedMs),
      messagesPerSec: Math.round(nodes / elapsedMs * 1000),
      p95Ms: Number(durations[Math.ceil(nodes * .95)-1].toFixed(2)) });
  }
  const { rows: [counts] } = await db.query(`SELECT (SELECT count(*)::int FROM measurements) AS measurements,
    (SELECT count(*)::int FROM uplink_events) AS uplinks,
    (SELECT count(*)::int FROM measurements WHERE uplink_event_id IS NOT NULL) AS linked`);
  if (counts.measurements !== 1600 || counts.uplinks !== 1600 || counts.linked !== 1600)
    throw new Error('Burst test lost or failed to link an observation');
  console.log(JSON.stringify({ scope: 'isolated in-memory PostgreSQL-compatible burst, nodes assigned to one zone; excludes radio, MQTT, rule-processing workers, VPS disk/network and API/UI load',
    generatedAt: new Date().toISOString(), results, counts }, null, 2));
} finally { await db.close(); }
