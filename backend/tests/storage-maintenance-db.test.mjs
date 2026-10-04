import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { runMeasurementRetention } from '../measurement-retention.js';

const configured = process.env.RUN_RETENTION_DB_TEST === 'true'
  || (process.env.NODE_ENV === 'test' && Boolean(process.env.PGDATABASE));

test('history captures real transitions, retention preserves tenant baselines and telemetry keeps all event types', { skip: !configured }, async () => {
  const pool = new pg.Pool({ max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Exercise all migrations in an isolated, rolled-back schema, including in CI.
    await client.query(`CREATE SCHEMA maintenance_test_${process.pid}`);
    await client.query(`SET LOCAL search_path TO maintenance_test_${process.pid}`);
    const directory = new URL('../migrations/', import.meta.url);
    for (const file of (await readdir(directory)).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort()) {
      try { await client.query(await readFile(new URL(file, directory), 'utf8')); }
      catch (error) { throw new Error(`${file}: ${error.message}`, { cause: error }); }
    }
    await client.query(`INSERT INTO organizations(id,name) VALUES('maintenance-a','A'),('maintenance-b','B');
      INSERT INTO areas(id,organization_id,name) VALUES('area-a','maintenance-a','A');
      INSERT INTO sections(id,organization_id,area_id,name,crop_profile) VALUES('section-a','maintenance-a','area-a','A','default');
      INSERT INTO nodes(dev_eui,organization_id,area_id,section_id,name) VALUES('0000000000000001','maintenance-a','area-a','section-a','Test');
      INSERT INTO alert_workflows(organization_id,alert_id,status,context) VALUES('maintenance-a','alert','open','{"tone":"warning","direction":"high","targetHigh":25,"currentValue":26}');
      INSERT INTO crop_risk_episodes(organization_id,risk_id,section_id,metric_id,risk_kind) VALUES('maintenance-a','risk','section-a','airTemp','high');`);
    const count = async entity => Number((await client.query('SELECT count(*) FROM diagnostic_metadata_history WHERE entity=$1', [entity])).rows[0].count);
    const initial = await count('alert_workflows');
    await client.query(`UPDATE alert_workflows SET updated_at=now(),last_detected_at=now(),context=context||'{"currentValue":27,"timestamp":"new","detail":"Current 27"}' WHERE alert_id='alert'`);
    assert.equal(await count('alert_workflows'), initial);
    await client.query(`UPDATE alert_workflows SET context=context||'{"tone":"critical"}' WHERE alert_id='alert';
      UPDATE alert_workflows SET context=context||'{"targetHigh":24}' WHERE alert_id='alert';
      UPDATE alert_workflows SET status='acknowledged' WHERE alert_id='alert';`);
    assert.equal(await count('alert_workflows'), initial + 3);
    const riskCount = await count('crop_risk_episodes');
    await client.query(`UPDATE crop_risk_episodes SET last_detected_at=now(),current_deviation=5,previous_deviation=4 WHERE risk_id='risk'`);
    assert.equal(await count('crop_risk_episodes'), riskCount);
    await client.query(`UPDATE crop_risk_episodes SET active=false,resolved_at=now() WHERE risk_id='risk'`);
    assert.equal(await count('crop_risk_episodes'), riskCount + 1);
    const nodeCount = await count('nodes');
    await client.query(`UPDATE nodes SET last_received_at=now(),last_battery_percent=55 WHERE dev_eui='0000000000000001'`);
    assert.equal(await count('nodes'), nodeCount);
    await client.query(`UPDATE nodes SET name='Renamed' WHERE dev_eui='0000000000000001'`);
    assert.equal(await count('nodes'), nodeCount + 1);

    for (const [organization, age] of [['maintenance-a', 500], ['maintenance-a', 400], ['maintenance-a', 10], ['maintenance-b', 500]]) {
      await client.query(`INSERT INTO diagnostic_metadata_history(organization_id,entity,entity_id,recorded_at,operation,snapshot)
        VALUES($1,'fixture','same-id',now()-($2*interval '1 day'),'UPDATE','{}')`, [organization, age]);
    }
    const cleanup = await runMeasurementRetention({ connect: async () => ({ query: client.query.bind(client), release() {} }) }, { batchSize: 2 });
    assert.equal(cleanup.historyDeleted, 1);
    const retained = await client.query(`SELECT organization_id,count(*)::int AS count FROM diagnostic_metadata_history WHERE entity='fixture' GROUP BY organization_id ORDER BY organization_id`);
    assert.deepEqual(retained.rows, [{ organization_id: 'maintenance-a', count: 2 }, { organization_id: 'maintenance-b', count: 1 }]);

    const start = new Date(Date.now() - 3600000);
    const rows = [[0, 'normal', false, 60], [1, 'normal', false, 60], [10, 'fast', true, 60], [11, 'fast', true, 60], [12, 'normal', false, 60]];
    for (const [minute, profile, failed, interval] of rows) {
      await client.query(`INSERT INTO measurements(time,received_at,dev_eui,profile,raw_object) VALUES($1,$1,'0000000000000001',$2,$3)`,
        [new Date(+start + minute * 60000), profile, { expected_uplink_interval_s: interval, error_flags: { last_tx_failed: failed } }]);
    }
    const api = await readFile(new URL('../api.js', import.meta.url), 'utf8');
    const sql = api.slice(api.indexOf('async function getTelemetryEvents')).split('`')[1];
    const events = await client.query(sql, [['0000000000000001'], start, new Date(+start + 20 * 60000)]);
    assert.deepEqual(events.rows.map(r => r.type), ['reporting_mode_changed', 'delivery_gap', 'transmission_failed', 'reporting_mode_changed']);
    assert.equal(events.rows[1].duration_minutes, 9);
    assert.equal(events.rows[0].from_profile, 'normal');
    assert.equal(events.rows[0].to_profile, 'fast');
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    await pool.end();
  }
});
