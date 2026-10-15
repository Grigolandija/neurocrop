import { randomUUID } from 'node:crypto';
import { METRIC_DEFINITIONS } from './metric-registry.js';

const sensorMetrics = Object.fromEntries(Object.values(METRIC_DEFINITIONS).filter(m => m.sensorKey && m.telemetryKey)
  .map(m => [m.sensorKey, Object.values(METRIC_DEFINITIONS).filter(x => x.sensorKey === m.sensorKey && x.telemetryKey).map(x => x.telemetryKey)]));
const errorResponse = (res, status, message) => res.status(status).json({ error: { code: status === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR', message } });

export function evaluateNodeAcceptance(run, event, now = new Date()) {
  if (run.status !== 'pending') return { ...run.result, status: run.status };
  const checks = [{ code: 'fresh_uplink', passed: Boolean(event && +new Date(event.received_at) >= +new Date(run.started_at)
    && +new Date(event.received_at) <= +new Date(run.deadline_at)
    && +new Date(event.recorded_at) >= +new Date(run.started_at)
    && +new Date(event.recorded_at) <= +new Date(run.deadline_at)
    && +new Date(event.measured_at) >= +new Date(run.started_at) && event.outcome === 'stored') }];
  if (checks[0].passed) {
    checks.push({ code: 'firmware_matches', passed: event.firmware_version === run.expected_firmware });
    checks.push({ code: 'device_faults_clear', passed: !Object.values(event.evidence.errorFlags || {}).some(v => v === true) });
    for (const sensor of run.expected_sensors) {
      const presence = event.evidence.sensors?.[sensor];
      checks.push({ code: `sensor:${sensor}`, passed: presence?.present === true
        && (sensorMetrics[sensor] || []).length > 0
        && sensorMetrics[sensor].every(key => event.evidence.metrics?.[key]?.reason === 'accepted') });
    }
  }
  const passed = checks.every(c => c.passed);
  return { status: passed ? 'passed' : +now >= +new Date(run.deadline_at) ? 'failed' : 'pending', checks,
    uplinkId: event?.id || null, evaluatedAt: now.toISOString(),
    evidence: event ? { receivedAt: event.received_at, measuredAt: event.measured_at, firmwareVersion: event.firmware_version,
      sensors: event.evidence.sensors, metrics: event.evidence.metrics, errorFlags: event.evidence.errorFlags } : null,
    reason: passed ? 'verified_new_measurements' : +now >= +new Date(run.deadline_at) ? 'deadline_exceeded' : 'awaiting_valid_uplink' };
}

export function registerNodeAcceptanceRoutes(app, { query, pool, factoryAuth, readFirmware }) {
  app.post('/node-factory/nodes/:devEui/acceptance', factoryAuth, async (req, res, next) => {
    const devEui = String(req.params.devEui).toLowerCase(), body = req.body || {};
    const sensors = [...new Set(['sht45', ...(Array.isArray(body.expectedSensors) ? body.expectedSensors : [])])];
    if (!/^[0-9a-f]{16}$/.test(devEui) || body.usbVerified !== true || sensors.length > 16 || sensors.some(s => !sensorMetrics[s]))
      return errorResponse(res, 400, 'USB verification and supported expected sensors are required');
    let client;
    try {
      const release = readFirmware();
      if (body.firmwareVersion !== release.version || body.firmwareSha256 !== release.sha256)
        return errorResponse(res, 400, 'Firmware must match the verified server release');
      client = await pool.connect();
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT dev_eui FROM nodes WHERE dev_eui=$1 AND factory_serial IS NOT NULL AND archived_at IS NULL FOR UPDATE', [devEui]);
      if (!rows.length) { await client.query('ROLLBACK'); return errorResponse(res, 404, 'Factory node not found'); }
      // A new explicit attempt supersedes abandoned checks, preserving the audit trail.
      await client.query(`UPDATE node_acceptance_runs SET status='failed',completed_at=now(),result='{"reason":"superseded"}'::jsonb WHERE dev_eui=$1 AND status='pending'`, [devEui]);
      const id = randomUUID();
      // '-factory' is the USB/package label; the deployed codec reports the semantic version.
      const telemetryVersion = release.telemetryVersion || release.version.replace(/-factory$/, '');
      const { rows: runs } = await client.query(`INSERT INTO node_acceptance_runs(id,dev_eui,deadline_at,expected_firmware,firmware_sha256,expected_sensors)
        VALUES($1,$2,now()+interval '10 minutes',$3,$4,$5) RETURNING *`, [id, devEui, telemetryVersion, release.sha256, JSON.stringify(sensors)]);
      await client.query('COMMIT');
      res.status(201).json({ acceptance: runs[0] });
    } catch (error) { await client?.query('ROLLBACK').catch(() => {}); next(error); }
    finally { client?.release(); }
  });

  app.get('/node-factory/nodes/:devEui/acceptance/:id', factoryAuth, async (req, res, next) => {
    const devEui = String(req.params.devEui).toLowerCase(), id = String(req.params.id);
    if (!/^[0-9a-f]{16}$/.test(devEui) || !/^[0-9a-f-]{36}$/.test(id)) return errorResponse(res, 400, 'Invalid acceptance identifier');
    try {
      const { rows: runs } = await query(`SELECT r.* FROM node_acceptance_runs r JOIN nodes n ON n.dev_eui=r.dev_eui
        WHERE r.id=$1 AND r.dev_eui=$2 AND n.archived_at IS NULL AND n.factory_serial IS NOT NULL`, [id, devEui]);
      const run = runs[0];
      if (!run) return errorResponse(res, 404, 'Acceptance attempt not found');
      if (run.status !== 'pending') return res.json({ acceptance: run });
      // Delayed polling must never accept measurements received after the deadline.
      const { rows: events } = await query(`SELECT * FROM uplink_events WHERE dev_eui=$1
        AND received_at >= $2 AND received_at <= $3 AND recorded_at >= $2 AND recorded_at <= $3 AND outcome='stored'
        ORDER BY received_at DESC LIMIT 50`, [devEui, run.started_at, run.deadline_at]);
      let result = evaluateNodeAcceptance(run, null);
      for (const event of events) {
        const candidate = evaluateNodeAcceptance(run, event);
        result = candidate;
        if (candidate.status === 'passed') break;
      }
      if (result.status !== 'pending') {
        const { rows: completed } = await query(`UPDATE node_acceptance_runs SET status=$3,result=$4,completed_at=now()
          WHERE id=$1 AND dev_eui=$2 AND status='pending' RETURNING *`, [id, devEui, result.status, JSON.stringify(result)]);
        // A concurrent completed attempt is authoritative.
        if (!completed.length) {
          const { rows } = await query('SELECT * FROM node_acceptance_runs WHERE id=$1 AND dev_eui=$2', [id, devEui]);
          return res.json({ acceptance: rows[0] });
        }
        return res.json({ acceptance: completed[0] });
      }
      res.json({ acceptance: { ...run, result } });
    } catch (error) { next(error); }
  });
}
