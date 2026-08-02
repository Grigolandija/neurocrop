import { randomUUID } from 'node:crypto';
import { pool, query } from './db.js';
import { requireRole, requireUserAuth } from './auth-users.js';
import { buildCurrentMetricEvaluations } from './score.js';
import { buildCanonicalAlertState, canonicalAlertContext } from './alert-lifecycle.js';
import { dispatchAlertPushNotifications } from './push-notifications.js';
import { createServerTiming } from './server-timing.js';

const workflowRoles = requireRole('owner', 'admin', 'grower', 'technician');
const OUTCOME_STATUSES = new Set(['successful', 'no_change', 'made_worse', 'not_relevant']);
const ALERT_STATUSES = new Set(['all', 'active', 'open', 'acknowledged', 'snoozed', 'resolved']);

function organizationId(req) {
  if (!req.user?.organizationId) throw new Error('Authenticated organization is missing');
  return req.user.organizationId;
}

function text(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function timestamp(value, { required = false } = {}) {
  if (!value && !required) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function publicAlertWorkflow(row) {
  return {
    id: row.alert_id,
    status: row.status,
    managed: Boolean(row.managed),
    active: Boolean(row.active),
    context: row.context || {},
    acknowledgedAt: row.acknowledged_at,
    snoozedAt: row.snoozed_at,
    snoozedUntil: row.snoozed_until,
    resolvedAt: row.resolved_at,
    firstDetectedAt: row.first_detected_at,
    lastDetectedAt: row.last_detected_at,
    recoveredAt: row.recovered_at,
    resolutionReason: row.resolution_reason,
    updatedAt: row.updated_at
  };
}

function publicIntervention(row) {
  return {
    id: row.id,
    sectionId: row.section_id,
    alertId: row.alert_id,
    metric: row.metric,
    actionType: row.action_type,
    note: row.note,
    performedAt: row.performed_at,
    performedBy: row.performed_by,
    outcome: row.outcome_status ? {
      status: row.outcome_status,
      observedAt: row.outcome_observed_at,
      beforeValue: row.before_value,
      afterValue: row.after_value,
      note: row.outcome_note,
      recordedBy: row.outcome_recorded_by,
      recordedAt: row.outcome_recorded_at
    } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function alertContext(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const context = Object.fromEntries([
    ['id', text(source.id, 500)],
    ['kind', text(source.kind, 32)],
    ['tone', text(source.tone, 32)],
    ['siteId', text(source.siteId, 120)],
    ['siteName', text(source.siteName, 160)],
    ['zoneId', text(source.zoneId, 120)],
    ['zoneName', text(source.zoneName, 160)],
    ['nodeId', text(source.nodeId, 120)],
    ['metricKey', text(source.metricKey, 80)],
    ['title', text(source.title, 240)],
    ['detail', text(source.detail, 500)],
    ['timestamp', text(source.timestamp, 64)],
    ['icon', text(source.icon, 64)],
    ['unit', text(source.unit, 24)],
    ['direction', text(source.direction, 16)]
  ].filter(([, item]) => item));
  for (const key of ['currentValue', 'targetLow', 'targetHigh']) {
    const value = finiteNumber(source[key]);
    if (value !== null) context[key] = value;
  }
  return context;
}

function normalizedDevEui(value) {
  return String(value || '').trim().toLowerCase();
}

async function loadCanonicalAlerts(tenantId) {
  const [sectionsResult, nodesResult, profilesResult, measurementsResult] = await Promise.all([
    query(
      `SELECT s.id, s.area_id, s.name, s.crop_profile, a.name AS area_name
       FROM sections s
       JOIN areas a ON a.organization_id=s.organization_id AND a.id=s.area_id
       WHERE s.organization_id=$1
       ORDER BY s.created_at ASC`,
      [tenantId]
    ),
    query(
      `SELECT dev_eui, section_id, name, last_seen, last_received_at, last_sensor_presence
       FROM nodes
       WHERE organization_id=$1 AND archived_at IS NULL
       ORDER BY created_at ASC`,
      [tenantId]
    ),
    query('SELECT id, metrics FROM crop_profiles WHERE organization_id=$1', [tenantId]),
    query(
      `SELECT latest.*
       FROM nodes n
       JOIN LATERAL (
         SELECT m.* FROM measurements m
         WHERE m.dev_eui=n.dev_eui
         ORDER BY m.time DESC
         LIMIT 1
       ) latest ON TRUE
       WHERE n.organization_id=$1 AND n.archived_at IS NULL
       ORDER BY n.created_at ASC`,
      [tenantId]
    )
  ]);

  const nodesBySection = new Map();
  for (const node of nodesResult.rows) {
    if (!nodesBySection.has(node.section_id)) nodesBySection.set(node.section_id, []);
    nodesBySection.get(node.section_id).push(node);
  }
  const profileMetricsById = new Map(profilesResult.rows.map((row) => [row.id, row.metrics || {}]));
  const latestByDevEui = new Map(
    measurementsResult.rows.map((row) => [normalizedDevEui(row.dev_eui), row])
  );
  const snapshots = sectionsResult.rows.map((section) => {
    const nodes = nodesBySection.get(section.id) || [];
    const measurements = nodes.map((node) => latestByDevEui.get(normalizedDevEui(node.dev_eui)) || null);
    const profileMetrics = profileMetricsById.get(section.crop_profile) || {};
    const current = buildCurrentMetricEvaluations(nodes, measurements, profileMetrics);
    const latestReceivedAt = measurements
      .map((measurement) => measurement?.time)
      .filter(Boolean)
      .sort((left, right) => new Date(right) - new Date(left))[0] || null;
    const observedAtByMetric = Object.fromEntries(
      current.evaluations.map((evaluation) => [evaluation.metricId, latestReceivedAt])
    );
    return {
      section,
      nodes,
      measurements,
      nodeStatuses: current.statuses,
      profileMetrics,
      scoreRules: current.scoreRules,
      evaluations: current.evaluations,
      observedAtByMetric,
      latestReceivedAt
    };
  });
  return buildCanonicalAlertState(snapshots);
}

async function synchronizeCanonicalAlerts(tenantId, activeAlerts, clearableIds) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const alert of activeAlerts) {
      await client.query(
      `INSERT INTO alert_workflows AS current (
         organization_id, alert_id, status, context, managed, active,
         first_detected_at, last_detected_at
       ) VALUES ($1, $2, 'open', $3, true, true, now(), now())
       ON CONFLICT (organization_id, alert_id) DO UPDATE SET
         status=CASE
           WHEN current.managed=true AND current.active=true
             AND current.status='snoozed' AND current.snoozed_until > now() THEN 'snoozed'
           WHEN current.managed=true AND current.active=true
             AND current.status='acknowledged' THEN 'acknowledged'
           ELSE 'open'
         END,
         context=EXCLUDED.context,
         managed=true,
         active=true,
         acknowledged_by=CASE WHEN current.managed AND current.active THEN current.acknowledged_by ELSE NULL END,
         acknowledged_at=CASE WHEN current.managed AND current.active THEN current.acknowledged_at ELSE NULL END,
         snoozed_by=CASE
           WHEN current.managed AND current.active AND current.status='snoozed'
             AND current.snoozed_until > now() THEN current.snoozed_by
           ELSE NULL
         END,
         snoozed_at=CASE
           WHEN current.managed AND current.active AND current.status='snoozed'
             AND current.snoozed_until > now() THEN current.snoozed_at
           ELSE NULL
         END,
         snoozed_until=CASE
           WHEN current.managed AND current.active AND current.status='snoozed'
             AND current.snoozed_until > now() THEN current.snoozed_until
           ELSE NULL
         END,
         resolved_by=NULL,
         resolved_at=NULL,
         first_detected_at=CASE
           WHEN current.managed AND current.active THEN current.first_detected_at
           ELSE now()
         END,
         last_detected_at=now(),
         recovered_at=NULL,
         resolution_reason=NULL,
         updated_at=now()`,
        [tenantId, alert.id, canonicalAlertContext(alert)]
      );
    }

    await client.query(
      `UPDATE alert_workflows
       SET status='resolved',
           active=false,
           resolved_by=NULL,
           resolved_at=now(),
           recovered_at=now(),
           resolution_reason='condition_cleared',
           snoozed_by=NULL,
           snoozed_at=NULL,
           snoozed_until=NULL,
           updated_at=now()
       WHERE organization_id=$1
         AND managed=true
         AND active=true
         AND alert_id = ANY($2::text[])`,
      [tenantId, clearableIds]
    );
    // A deleted Section or Node cannot keep a live workflow visible forever.
    // Resolve these orphaned alerts during the same synchronization pass so a
    // later acknowledge/snooze action never targets a scope that no longer exists.
    await client.query(
      `UPDATE alert_workflows AS workflow
       SET status='resolved',
           active=false,
           resolved_by=NULL,
           resolved_at=now(),
           recovered_at=now(),
           resolution_reason='condition_cleared',
           snoozed_by=NULL,
           snoozed_at=NULL,
           snoozed_until=NULL,
           updated_at=now()
       WHERE workflow.organization_id=$1
         AND workflow.managed=true
         AND workflow.active=true
         AND split_part(workflow.alert_id, ':', 1) IN ('metric', 'offline')
         AND (
           NOT EXISTS (
             SELECT 1 FROM sections section_record
             WHERE section_record.organization_id=workflow.organization_id
               AND section_record.area_id=split_part(workflow.alert_id, ':', 2)
               AND section_record.id=split_part(workflow.alert_id, ':', 3)
           )
           OR (
             split_part(workflow.alert_id, ':', 1)='offline'
             AND NOT EXISTS (
               SELECT 1 FROM nodes node_record
               WHERE node_record.organization_id=workflow.organization_id
                 AND node_record.section_id=split_part(workflow.alert_id, ':', 3)
                 AND LOWER(node_record.dev_eui)=LOWER(split_part(workflow.alert_id, ':', 4))
                 AND node_record.archived_at IS NULL
             )
           )
         )`,
      [tenantId]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function resolveAlertScope(alertId, tenantId) {
  const parts = String(alertId || '').split(':');
  if (parts.length !== 4 || !['metric', 'offline'].includes(parts[0])) return null;
  const [kind, areaId, sectionId, discriminator] = parts;
  if (![areaId, sectionId, discriminator].every((part) => part && part.length <= 120)) return null;

  const { rows: sectionRows } = await query(
    `SELECT id FROM sections
     WHERE organization_id=$1 AND id=$2 AND area_id=$3
     LIMIT 1`,
    [tenantId, sectionId, areaId]
  );
  if (!sectionRows[0]) return null;

  if (kind === 'offline') {
    const { rows: nodeRows } = await query(
      `SELECT dev_eui FROM nodes
       WHERE organization_id=$1 AND section_id=$2 AND dev_eui=$3 AND archived_at IS NULL
       LIMIT 1`,
      [tenantId, sectionId, discriminator.toLowerCase()]
    );
    if (!nodeRows[0]) return null;
  }

  return { kind, areaId, sectionId, discriminator };
}

async function requireAlert(req, res) {
  const alertId = text(req.params.alertId, 500);
  const scope = await resolveAlertScope(alertId, organizationId(req));
  if (!scope) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Alert not found' } });
    return null;
  }
  return { alertId, scope };
}

export function registerWorkflowRoutes(app) {
  app.get('/alerts', requireUserAuth, async (req, res, next) => {
    const timing = createServerTiming();
    timing.add('auth', req.authDurationMs, 'session');
    try {
      res.set('Cache-Control', 'no-store');
      const status = String(req.query.status || 'all');
      if (!ALERT_STATUSES.has(status)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Unknown alert status' } });
      }
      const tenantId = organizationId(req);
      const canonicalState = await loadCanonicalAlerts(tenantId);
      timing.mark('load', 'canonical alert state');
      await synchronizeCanonicalAlerts(tenantId, canonicalState.alerts, canonicalState.clearableIds);
      timing.mark('sync', 'alert lifecycle');
      void dispatchAlertPushNotifications(tenantId, canonicalState.alerts)
        .catch((error) => console.warn('[push] dispatch failed:', error?.message || error));
      const parameters = [tenantId];
      const statusClause = status === 'all'
        ? ''
        : status === 'active'
          ? 'AND active=true'
          : status === 'open'
            ? `AND active=true AND status='open'`
            : 'AND status=$2';
      if (!['all', 'active', 'open'].includes(status)) parameters.push(status);
      const { rows } = await query(
        `SELECT * FROM alert_workflows
         WHERE organization_id=$1 ${statusClause}
           AND updated_at > now() - interval '90 days'
         ORDER BY updated_at DESC
         LIMIT 500`,
        parameters
      );
      timing.mark('read', 'workflow rows');
      timing.apply(res);
      res.json({ alerts: rows.map(publicAlertWorkflow) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/alerts/:alertId/acknowledge', requireUserAuth, workflowRoles, async (req, res, next) => {
    try {
      const alert = await requireAlert(req, res);
      if (!alert) return;
      const { rows } = await query(
        `INSERT INTO alert_workflows (
           organization_id, alert_id, status, context, acknowledged_by, acknowledged_at
         ) VALUES ($1, $2, 'acknowledged', $3, $4, now())
         ON CONFLICT (organization_id, alert_id) DO UPDATE SET
           status='acknowledged',
           context=CASE WHEN EXCLUDED.context='{}'::jsonb THEN alert_workflows.context ELSE EXCLUDED.context END,
           acknowledged_by=EXCLUDED.acknowledged_by,
           acknowledged_at=EXCLUDED.acknowledged_at,
           snoozed_by=NULL,
           snoozed_at=NULL,
           snoozed_until=NULL,
           resolved_by=NULL,
           resolved_at=NULL,
           updated_at=now()
         RETURNING *`,
        [organizationId(req), alert.alertId, alertContext(req.body?.context), req.user.id]
      );
      res.json({ alert: publicAlertWorkflow(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/alerts/:alertId/snooze', requireUserAuth, workflowRoles, async (req, res, next) => {
    try {
      const alert = await requireAlert(req, res);
      if (!alert) return;
      const requestedUntil = timestamp(req.body?.until);
      const minutes = Number(req.body?.minutes);
      const until = requestedUntil || (Number.isFinite(minutes) && minutes >= 5
        ? new Date(Date.now() + Math.min(minutes, 30 * 24 * 60) * 60 * 1000)
        : null);
      if (!until || until <= new Date() || until > new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Snooze must end between now and 30 days from now' } });
      }
      const { rows } = await query(
        `INSERT INTO alert_workflows (
           organization_id, alert_id, status, context, snoozed_by, snoozed_at, snoozed_until
         ) VALUES ($1, $2, 'snoozed', $3, $4, now(), $5)
         ON CONFLICT (organization_id, alert_id) DO UPDATE SET
           status='snoozed',
           context=CASE WHEN EXCLUDED.context='{}'::jsonb THEN alert_workflows.context ELSE EXCLUDED.context END,
           snoozed_by=EXCLUDED.snoozed_by,
           snoozed_at=EXCLUDED.snoozed_at,
           snoozed_until=EXCLUDED.snoozed_until,
           resolved_by=NULL,
           resolved_at=NULL,
           updated_at=now()
         RETURNING *`,
        [organizationId(req), alert.alertId, alertContext(req.body?.context), req.user.id, until]
      );
      res.json({ alert: publicAlertWorkflow(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/alerts/:alertId/resolve', requireUserAuth, workflowRoles, async (req, res, next) => {
    try {
      const alert = await requireAlert(req, res);
      if (!alert) return;
      const tenantId = organizationId(req);
      const { rows: existingRows } = await query(
        `SELECT managed, active FROM alert_workflows
         WHERE organization_id=$1 AND alert_id=$2`,
        [tenantId, alert.alertId]
      );
      if (existingRows[0]?.managed && existingRows[0]?.active) {
        return res.status(409).json({
          error: {
            code: 'LIVE_ALERT_CANNOT_BE_RESOLVED',
            message: 'Live alerts close automatically after the monitored condition clears'
          }
        });
      }
      const { rows } = await query(
        `INSERT INTO alert_workflows (
           organization_id, alert_id, status, context, resolved_by, resolved_at,
           active, resolution_reason
         ) VALUES ($1, $2, 'resolved', $3, $4, now(), false, 'manual')
         ON CONFLICT (organization_id, alert_id) DO UPDATE SET
           status='resolved',
           context=CASE WHEN EXCLUDED.context='{}'::jsonb THEN alert_workflows.context ELSE EXCLUDED.context END,
           resolved_by=EXCLUDED.resolved_by,
           resolved_at=EXCLUDED.resolved_at,
           active=false,
           resolution_reason='manual',
           snoozed_by=NULL,
           snoozed_at=NULL,
           snoozed_until=NULL,
           updated_at=now()
         RETURNING *`,
        [tenantId, alert.alertId, alertContext(req.body?.context), req.user.id]
      );
      res.json({ alert: publicAlertWorkflow(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/interventions', requireUserAuth, async (req, res, next) => {
    try {
      const tenantId = organizationId(req);
      const sectionId = text(req.query.sectionId, 120);
      const from = timestamp(req.query.from) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const to = timestamp(req.query.to) || new Date();
      if (!sectionId || from >= to || to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid sectionId and date range up to 366 days are required' } });
      }
      const { rows: sectionRows } = await query(
        'SELECT id FROM sections WHERE organization_id=$1 AND id=$2 LIMIT 1',
        [tenantId, sectionId]
      );
      if (!sectionRows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Section not found' } });
      const { rows } = await query(
        `SELECT * FROM interventions
         WHERE organization_id=$1 AND section_id=$2 AND performed_at BETWEEN $3 AND $4
         ORDER BY performed_at DESC
         LIMIT 500`,
        [tenantId, sectionId, from, to]
      );
      res.json({ interventions: rows.map(publicIntervention) });
    } catch (error) {
      next(error);
    }
  });

  app.post('/interventions', requireUserAuth, workflowRoles, async (req, res, next) => {
    try {
      const tenantId = organizationId(req);
      const sectionId = text(req.body?.sectionId, 120);
      const alertId = text(req.body?.alertId, 500) || null;
      const metric = text(req.body?.metric, 80);
      const actionType = text(req.body?.actionType, 100);
      const note = text(req.body?.note, 2000);
      const performedAt = timestamp(req.body?.performedAt) || new Date();
      if (!sectionId || !actionType || performedAt > new Date(Date.now() + 5 * 60 * 1000)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'sectionId, actionType and a valid performedAt are required' } });
      }
      const { rows: sectionRows } = await query(
        'SELECT id FROM sections WHERE organization_id=$1 AND id=$2 LIMIT 1',
        [tenantId, sectionId]
      );
      if (!sectionRows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Section not found' } });
      if (alertId) {
        const alertScope = await resolveAlertScope(alertId, tenantId);
        if (!alertScope || alertScope.sectionId !== sectionId) {
          return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Alert not found' } });
        }
      }
      const { rows } = await query(
        `INSERT INTO interventions (
           id, organization_id, section_id, alert_id, metric, action_type,
           note, performed_at, performed_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [randomUUID(), tenantId, sectionId, alertId, metric, actionType, note, performedAt, req.user.id]
      );
      res.status(201).json({ intervention: publicIntervention(rows[0]) });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/interventions/:interventionId/outcome', requireUserAuth, workflowRoles, async (req, res, next) => {
    try {
      const status = String(req.body?.status || '');
      const observedAt = timestamp(req.body?.observedAt) || new Date();
      const beforeValue = finiteNumber(req.body?.beforeValue);
      const afterValue = finiteNumber(req.body?.afterValue);
      const note = text(req.body?.note, 2000);
      if (!OUTCOME_STATUSES.has(status) || observedAt > new Date(Date.now() + 5 * 60 * 1000)) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid outcome status and observedAt are required' } });
      }
      const { rows } = await query(
        `UPDATE interventions SET
           outcome_status=$1,
           outcome_observed_at=$2,
           before_value=$3,
           after_value=$4,
           outcome_note=$5,
           outcome_recorded_by=$6,
           outcome_recorded_at=now(),
           updated_at=now()
         WHERE id=$7 AND organization_id=$8
         RETURNING *`,
        [status, observedAt, beforeValue, afterValue, note, req.user.id, req.params.interventionId, organizationId(req)]
      );
      if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Intervention not found' } });
      res.json({ intervention: publicIntervention(rows[0]) });
    } catch (error) {
      next(error);
    }
  });
}
