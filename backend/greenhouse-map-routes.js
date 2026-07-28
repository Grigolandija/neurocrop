import { pool, query } from './db.js';
import { requireRole, requireUserAuth } from './auth-users.js';
import { calcVPD } from './calculations.js';
import { statusFromMeasurementTime } from './score.js';
import { expectedUplinkIntervalSec } from './node-health.js';
import { measurementRollupAverageSql } from './measurement-rollups.js';

const MAX_OBJECTS = 2000;
const MAX_LAYERS = 50;
const MAX_MAP_BYTES = 900_000;
const writableRoles = ['owner', 'admin', 'grower', 'technician'];
const wallMountedTypes = new Set(['door', 'window', 'ventilation-opening']);
const perimeterWalls = new Set(['south', 'north', 'west', 'east']);
const MAP_HISTORY_STEP_MINUTES = 10;
const MAP_HISTORY_MAX_RANGE_MS = 24 * 60 * 60 * 1000;
const GREENHOUSE_WALL_THICKNESS_M = 0.01;
const HEATMAP_METRICS = new Set([
  'air-temperature',
  'relative-humidity',
  'co2',
  'vpd',
  'root-temperature',
  'illuminance',
  'soil-moisture',
  'ec',
  'ph',
  'soil-ec',
  'leaf-temperature',
  'water-temperature'
]);

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validationError(message) {
  return { valid: false, message };
}

export function validateGreenhouseMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return validationError('Map must be a JSON object');
  if (value.schemaVersion !== 1) return validationError('Unsupported greenhouse map schemaVersion');
  if (value.shape?.type !== 'rectangle') return validationError('Only rectangular greenhouse maps are supported');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 160) return validationError('Map name is required and must not exceed 160 characters');
  if (!value.dimensions || !finite(value.dimensions.widthM) || !finite(value.dimensions.lengthM)) return validationError('Map dimensions must be finite numbers');
  if (value.dimensions.widthM <= 0 || value.dimensions.lengthM <= 0 || value.dimensions.widthM > 10000 || value.dimensions.lengthM > 10000) return validationError('Map dimensions are outside supported limits');
  if (value.dimensions.heightM !== undefined && (!finite(value.dimensions.heightM) || value.dimensions.heightM < 0 || value.dimensions.heightM > 1000)) return validationError('Map height is invalid');
  if (!finite(value.gridSizeM) || value.gridSizeM <= 0 || value.gridSizeM > 100) return validationError('Grid size is invalid');
  if (!finite(value.orientationDeg) || !finite(value.wallThicknessM) || value.wallThicknessM <= 0) return validationError('Orientation or wall thickness is invalid');
  if (!Array.isArray(value.layers) || value.layers.length > MAX_LAYERS) return validationError(`Map must contain at most ${MAX_LAYERS} layers`);
  if (!Array.isArray(value.objects) || value.objects.length > MAX_OBJECTS) return validationError(`Map must contain at most ${MAX_OBJECTS} objects`);

  const layerIds = new Set();
  for (const layer of value.layers) {
    if (!layer || typeof layer.id !== 'string' || !layer.id || layerIds.has(layer.id)) return validationError('Every layer must have a unique id');
    if (typeof layer.name !== 'string' || typeof layer.visible !== 'boolean' || typeof layer.locked !== 'boolean' || !finite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) return validationError(`Layer ${layer.id} is invalid`);
    layerIds.add(layer.id);
  }

  const objectIds = new Set();
  for (const object of value.objects) {
    if (!object || typeof object.id !== 'string' || !object.id || objectIds.has(object.id)) return validationError('Every map object must have a unique id');
    objectIds.add(object.id);
    if (typeof object.type !== 'string' || typeof object.name !== 'string' || object.name.length > 200) return validationError(`Object ${object.id} has invalid identity fields`);
    if (![object.xM, object.yM, object.widthM, object.lengthM, object.rotationDeg].every(finite)) return validationError(`Object ${object.id} contains an invalid number`);
    if (object.xM < 0 || object.yM < 0 || object.widthM <= 0 || object.lengthM <= 0) return validationError(`Object ${object.id} has negative coordinates or dimensions`);
    if (object.xM + object.widthM > value.dimensions.widthM + 1e-6 || object.yM + object.lengthM > value.dimensions.lengthM + 1e-6) return validationError(`Object ${object.id} is outside the greenhouse`);
    if (!layerIds.has(object.layerId) || typeof object.visible !== 'boolean' || typeof object.locked !== 'boolean') return validationError(`Object ${object.id} has invalid layer or visibility state`);
    if (object.metadata !== undefined && (!object.metadata || typeof object.metadata !== 'object' || Array.isArray(object.metadata))) return validationError(`Object ${object.id} metadata must be an object`);
    const wallMount = object.metadata?.wallMount;
    if (wallMount !== undefined) {
      if (!wallMountedTypes.has(object.type) || !wallMount || typeof wallMount !== 'object' || Array.isArray(wallMount) || !perimeterWalls.has(wallMount.wall) || !finite(wallMount.offsetM) || wallMount.offsetM < 0) {
        return validationError(`Object ${object.id} has an invalid wall mount`);
      }
      const touchesWall = wallMount.wall === 'south' ? Math.abs(object.yM) <= 1e-6
        : wallMount.wall === 'north' ? Math.abs(object.yM + object.lengthM - value.dimensions.lengthM) <= 1e-6
          : wallMount.wall === 'west' ? Math.abs(object.xM) <= 1e-6
            : Math.abs(object.xM + object.widthM - value.dimensions.widthM) <= 1e-6;
      if (!touchesWall) return validationError(`Object ${object.id} is detached from its perimeter wall`);
    }
  }

  if (!value.heatmapSettings || typeof value.heatmapSettings !== 'object') return validationError('Heatmap settings are required');
  if (typeof value.heatmapSettings.enabled !== 'boolean' || value.heatmapSettings.interpolationMethod !== 'idw') return validationError('Heatmap method or enabled state is invalid');
  if (!HEATMAP_METRICS.has(value.heatmapSettings.metric)) return validationError('Heatmap metric is invalid');
  if (!['auto', 'manual'].includes(value.heatmapSettings.scaleMode) || typeof value.heatmapSettings.showConfidence !== 'boolean') return validationError('Heatmap scale or confidence setting is invalid');
  if (!finite(value.heatmapSettings.idwPower) || value.heatmapSettings.idwPower <= 0 || value.heatmapSettings.idwPower > 20) return validationError('IDW power is invalid');
  if (!finite(value.heatmapSettings.opacity) || value.heatmapSettings.opacity < 0 || value.heatmapSettings.opacity > 1) return validationError('Heatmap opacity is invalid');
  if (value.heatmapSettings.scaleMode === 'manual' && (!finite(value.heatmapSettings.manualMin) || !finite(value.heatmapSettings.manualMax) || value.heatmapSettings.manualMin >= value.heatmapSettings.manualMax)) return validationError('Manual heatmap scale is invalid');

  const serializedSize = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (serializedSize > MAX_MAP_BYTES) return validationError('Map exceeds the supported storage size');
  return { valid: true };
}

function liveNodeStatus(node, measurement) {
  const lastSeen = node.last_received_at || node.last_seen || measurement?.time || null;
  const transportStatus = statusFromMeasurementTime(lastSeen, Date.now(), expectedUplinkIntervalSec(node.last_profile || measurement?.profile));
  const battery = node.last_battery_percent ?? measurement?.battery_percent ?? null;
  if (transportStatus === 'offline') return 'offline';
  if (transportStatus === 'delayed') return 'stale';
  if (battery !== null && Number(battery) < 20) return 'low-battery';
  return transportStatus === 'live' ? 'online' : 'warning';
}

function publicMapNode(row) {
  const measurement = row.measurement || null;
  const lastSeenAt = row.last_received_at || row.last_seen || measurement?.time || null;
  const temperature = measurement?.temperature ?? null;
  const humidity = measurement?.humidity ?? null;
  return {
    nodeId: row.name || row.dev_eui,
    devEui: row.dev_eui,
    displayName: row.name || row.dev_eui,
    areaId: row.area_id,
    sectionId: row.section_id,
    sectionName: row.section_name || null,
    model: row.node_type || 'NeuroSense',
    status: liveNodeStatus(row, measurement),
    batteryPercent: row.last_battery_percent ?? measurement?.battery_percent ?? null,
    lastSeenAt,
    rssi: row.last_rssi ?? measurement?.rssi ?? null,
    snr: row.last_snr ?? measurement?.snr ?? null,
    sensors: Object.entries(row.last_sensor_presence || {}).filter(([, present]) => present === true).map(([sensor]) => sensor),
    measurements: {
      airTemperatureC: temperature,
      relativeHumidityPercent: humidity,
      co2Ppm: measurement?.co2 ?? null,
      vpdKpa: finite(temperature) && finite(humidity) ? calcVPD(temperature, humidity) : null,
      rootTemperatureC: measurement?.soil_temperature ?? measurement?.water_temperature ?? null,
      illuminanceLux: measurement?.lux ?? null,
      soilMoisturePercent: measurement?.soil_moisture ?? null,
      ecMsCm: measurement?.ec ?? null,
      ph: measurement?.ph ?? null,
      soilEcMsCm: measurement?.soil_ec ?? null,
      leafTemperatureC: measurement?.leaf_temperature ?? null,
      waterTemperatureC: measurement?.water_temperature ?? null,
      measuredAt: measurement?.time ?? null
    }
  };
}

function sanitizeMapForStorage(map, areaId) {
  return {
    ...map,
    areaId,
    wallThicknessM: GREENHOUSE_WALL_THICKNESS_M,
    objects: map.objects.map((object) => {
      const sensor = object.metadata?.sensor;
      if (!sensor) return object;
      const {
        measurements: _measurements,
        batteryPercent: _batteryPercent,
        lastSeenAt: _lastSeenAt,
        rssi: _rssi,
        snr: _snr,
        status: _status,
        ...configuration
      } = sensor;
      return {
        ...object,
        metadata: {
          ...object.metadata,
          sensor: { ...configuration, areaId }
        }
      };
    })
  };
}

async function getArea(organizationId, areaId) {
  const { rows } = await query(
    `SELECT id, name, kind, location, map_enabled
     FROM areas
     WHERE organization_id=$1 AND id=$2`,
    [organizationId, areaId]
  );
  return rows[0] || null;
}

async function getAreaNodes(organizationId, areaId) {
  const { rows } = await query(
    `SELECT n.dev_eui, n.name, n.node_type, n.area_id, n.section_id,
            n.last_seen, n.last_received_at, n.last_battery_percent,
            n.last_rssi, n.last_snr, n.last_profile, n.last_sensor_presence,
            s.name AS section_name,
            to_jsonb(m.*) AS measurement
     FROM nodes n
     LEFT JOIN sections s
       ON s.organization_id=n.organization_id AND s.id=n.section_id
     LEFT JOIN LATERAL (
       SELECT latest.*
       FROM measurements latest
       WHERE lower(latest.dev_eui)=lower(n.dev_eui)
       ORDER BY latest.time DESC
       LIMIT 1
     ) m ON true
     WHERE n.organization_id=$1
       AND n.area_id=$2
       AND n.archived_at IS NULL
     ORDER BY n.created_at ASC`,
    [organizationId, areaId]
  );
  return rows.map(publicMapNode);
}

function historicalNumber(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getAreaMapHistory(devEuis, from, to) {
  const bucketSeconds = MAP_HISTORY_STEP_MINUTES * 60;
  const alignedQueryFrom = new Date(Math.floor(from.getTime() / (bucketSeconds * 1000)) * bucketSeconds * 1000);
  const rows = devEuis.length ? (await query(
    `SELECT rollup.bucket_start AS observed_at,
            rollup.dev_eui,
            rollup.measured_at,
            ${measurementRollupAverageSql('airTemp')} AS air_temperature_c,
            ${measurementRollupAverageSql('humidity')} AS relative_humidity_percent,
            ${measurementRollupAverageSql('co2')} AS co2_ppm,
            ${measurementRollupAverageSql('vpd')} AS vpd_kpa,
            ${measurementRollupAverageSql('soilTemp')} AS root_temperature_c,
            ${measurementRollupAverageSql('lux')} AS illuminance_lux,
            ${measurementRollupAverageSql('soilMoisture')} AS soil_moisture_percent,
            ${measurementRollupAverageSql('ec')} AS ec_ms_cm,
            ${measurementRollupAverageSql('ph')} AS ph,
            ${measurementRollupAverageSql('soilEc')} AS soil_ec_ms_cm,
            ${measurementRollupAverageSql('leafTemp')} AS leaf_temperature_c,
            ${measurementRollupAverageSql('waterTemp')} AS water_temperature_c
     FROM measurement_rollups rollup
     WHERE rollup.bucket_minutes=$1
       AND rollup.dev_eui=ANY($2::text[])
       AND rollup.bucket_start BETWEEN $3 AND $4
     ORDER BY rollup.bucket_start ASC, rollup.dev_eui ASC`,
    [MAP_HISTORY_STEP_MINUTES, devEuis, alignedQueryFrom, to]
  )).rows : [];

  const alignedFrom = Math.floor(from.getTime() / (bucketSeconds * 1000)) * bucketSeconds * 1000;
  const alignedTo = Math.floor(to.getTime() / (bucketSeconds * 1000)) * bucketSeconds * 1000;
  const frames = new Map();
  for (let timestamp = alignedFrom; timestamp <= alignedTo; timestamp += bucketSeconds * 1000) {
    frames.set(timestamp, { observedAt: new Date(timestamp).toISOString(), nodes: [] });
  }
  rows.forEach((row) => {
    const timestamp = new Date(row.observed_at).getTime();
    const frame = frames.get(timestamp);
    if (!frame) return;
    frame.nodes.push({
      devEui: row.dev_eui,
      measuredAt: row.measured_at,
      measurements: {
        airTemperatureC: historicalNumber(row.air_temperature_c),
        relativeHumidityPercent: historicalNumber(row.relative_humidity_percent),
        co2Ppm: historicalNumber(row.co2_ppm),
        vpdKpa: historicalNumber(row.vpd_kpa),
        rootTemperatureC: historicalNumber(row.root_temperature_c),
        illuminanceLux: historicalNumber(row.illuminance_lux),
        soilMoisturePercent: historicalNumber(row.soil_moisture_percent),
        ecMsCm: historicalNumber(row.ec_ms_cm),
        ph: historicalNumber(row.ph),
        soilEcMsCm: historicalNumber(row.soil_ec_ms_cm),
        leafTemperatureC: historicalNumber(row.leaf_temperature_c),
        waterTemperatureC: historicalNumber(row.water_temperature_c)
      }
    });
  });
  return [...frames.values()];
}

async function getAreaMapLayouts(organizationId, areaId, from, to) {
  const { rows } = await query(
    `SELECT revision, map_data, valid_from, valid_to, source
     FROM greenhouse_map_layout_history
     WHERE organization_id=$1
       AND area_id=$2
       AND valid_from <= $4
       AND (valid_to IS NULL OR valid_to > $3)
     ORDER BY valid_from ASC`,
    [organizationId, areaId, from, to]
  );
  return rows.map((row) => ({
    revision: Number(row.revision),
    map: { ...row.map_data, wallThicknessM: GREENHOUSE_WALL_THICKNESS_M },
    validFrom: row.valid_from,
    validTo: row.valid_to,
    source: row.source
  }));
}

export function registerGreenhouseMapRoutes(app) {
  app.patch('/areas/:areaId/map/nodes/:devEui/section', requireUserAuth, requireRole(...writableRoles), async (req, res, next) => {
    const organizationId = req.user.organizationId;
    const areaId = String(req.params.areaId || '').trim();
    const devEui = String(req.params.devEui || '').trim().toLowerCase();
    const sectionId = String(req.body?.sectionId || '').trim();
    if (!/^[0-9a-f]{16}$/.test(devEui) || !sectionId) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid DevEUI and sectionId are required' } });
    }
    try {
      const area = await getArea(organizationId, areaId);
      if (!area) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Area not found' } });
      if (!area.map_enabled) return res.status(409).json({ error: { code: 'AREA_MAP_DISABLED', message: 'Area Map is not enabled for this Area' } });
      const { rows } = await query(
        `UPDATE nodes n
         SET section_id=s.id, area_id=s.area_id
         FROM sections s
         WHERE lower(n.dev_eui)=$1
           AND n.organization_id=$2
           AND n.area_id=$3
           AND n.archived_at IS NULL
           AND s.id=$4
           AND s.organization_id=$2
           AND s.area_id=$3
         RETURNING n.dev_eui, n.section_id, n.area_id`,
        [devEui, organizationId, areaId, sectionId]
      );
      if (!rows[0]) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Node or target Section was not found in this Area' } });
      }
      res.json({ node: { devEui: rows[0].dev_eui, sectionId: rows[0].section_id, areaId: rows[0].area_id } });
    } catch (error) {
      next(error);
    }
  });

  app.get('/areas/:areaId/map', requireUserAuth, async (req, res, next) => {
    const organizationId = req.user.organizationId;
    const areaId = String(req.params.areaId || '').trim();
    try {
      const area = await getArea(organizationId, areaId);
      if (!area) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Area not found' } });
      const [mapResult, nodes] = await Promise.all([
        query(
          `SELECT map_data, revision, updated_at
           FROM greenhouse_maps
           WHERE organization_id=$1 AND area_id=$2`,
          [organizationId, areaId]
        ),
        getAreaNodes(organizationId, areaId)
      ]);
      const stored = mapResult.rows[0] || null;
      res.json({
        area: { id: area.id, name: area.name, kind: area.kind, location: area.location },
        mapEnabled: Boolean(area.map_enabled),
        map: stored?.map_data ? { ...stored.map_data, wallThicknessM: GREENHOUSE_WALL_THICKNESS_M } : null,
        revision: stored?.revision || 0,
        updatedAt: stored?.updated_at || null,
        nodes,
        permissions: { canEdit: writableRoles.includes(req.user.role) }
      });
    } catch (error) {
      next(error);
    }
  });

  app.get('/areas/:areaId/map/history', requireUserAuth, async (req, res, next) => {
    const organizationId = req.user.organizationId;
    const areaId = String(req.params.areaId || '').trim();
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const from = req.query.from ? new Date(req.query.from) : new Date(to.getTime() - MAP_HISTORY_MAX_RANGE_MS);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid map history date range' } });
    }
    if (to.getTime() - from.getTime() > MAP_HISTORY_MAX_RANGE_MS) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Map history is limited to 24 hours' } });
    }
    try {
      const area = await getArea(organizationId, areaId);
      if (!area) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Area not found' } });
      if (!area.map_enabled) return res.status(409).json({ error: { code: 'AREA_MAP_DISABLED', message: 'Area Map is not enabled for this Area' } });
      const [{ rows: nodeRows }, layouts] = await Promise.all([
        query(
          `SELECT lower(dev_eui) AS dev_eui
           FROM nodes
           WHERE organization_id=$1 AND area_id=$2 AND archived_at IS NULL
           ORDER BY created_at ASC`,
          [organizationId, areaId]
        ),
        getAreaMapLayouts(organizationId, areaId, from, to)
      ]);
      const historicalDevEuis = layouts.flatMap((layout) =>
        Array.isArray(layout.map?.objects)
          ? layout.map.objects.map((object) =>
              String(object?.metadata?.sensor?.devEui || '').trim().toLowerCase())
          : []);
      const devEuis = [...new Set([
        ...nodeRows.map((row) => row.dev_eui),
        ...historicalDevEuis
      ].filter((devEui) => /^[0-9a-f]{16}$/.test(devEui)))];
      const frames = await getAreaMapHistory(devEuis, from, to);
      res.set('Cache-Control', 'private, max-age=30');
      res.json({
        areaId,
        from: from.toISOString(),
        to: to.toISOString(),
        stepMinutes: MAP_HISTORY_STEP_MINUTES,
        expectedNodes: nodeRows.map((row) => row.dev_eui),
        frames,
        layouts
      });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/areas/:areaId/map', requireUserAuth, requireRole(...writableRoles), async (req, res, next) => {
    const organizationId = req.user.organizationId;
    const areaId = String(req.params.areaId || '').trim();
    const expectedRevision = Number(req.body?.expectedRevision);
    const validation = validateGreenhouseMap(req.body?.map);
    if (!validation.valid) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: validation.message } });
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'expectedRevision must be a non-negative integer' } });

    let client;
    try {
      const area = await getArea(organizationId, areaId);
      if (!area) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Area not found' } });
      if (!area.map_enabled) return res.status(409).json({ error: { code: 'AREA_MAP_DISABLED', message: 'Enable Area Map before saving a plan' } });
      const sanitizedMap = sanitizeMapForStorage(req.body.map, areaId);
      const sensorDevEuis = [...new Set(sanitizedMap.objects
        .map((object) => String(object.metadata?.sensor?.devEui || '').trim().toLowerCase())
        .filter(Boolean))];
      if (sensorDevEuis.some((devEui) => !/^[0-9a-f]{16}$/.test(devEui))) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Sensor DevEUI values must contain 16 hexadecimal characters' } });
      }
      if (sensorDevEuis.length) {
        const { rows } = await query(
          `SELECT lower(dev_eui) AS dev_eui
           FROM nodes
           WHERE organization_id=$1 AND area_id=$2 AND lower(dev_eui)=ANY($3::text[]) AND archived_at IS NULL`,
          [organizationId, areaId, sensorDevEuis]
        );
        if (rows.length !== sensorDevEuis.length) return res.status(400).json({ error: { code: 'NODE_AREA_MISMATCH', message: 'One or more sensor nodes do not belong to this Area' } });
      }

      client = await pool.connect();
      await client.query('BEGIN');
      let result;
      if (expectedRevision === 0) {
        result = await client.query(
          `INSERT INTO greenhouse_maps (organization_id, area_id, map_data, revision, updated_by)
           VALUES ($1, $2, $3::jsonb, 1, $4)
           ON CONFLICT (organization_id, area_id) DO NOTHING
           RETURNING map_data, revision, updated_at`,
          [organizationId, areaId, JSON.stringify(sanitizedMap), req.user.id]
        );
      } else {
        result = await client.query(
          `UPDATE greenhouse_maps
           SET map_data=$3::jsonb, revision=revision+1, updated_by=$4, updated_at=now()
           WHERE organization_id=$1 AND area_id=$2 AND revision=$5
           RETURNING map_data, revision, updated_at`,
          [organizationId, areaId, JSON.stringify(sanitizedMap), req.user.id, expectedRevision]
        );
      }
      if (!result.rows[0]) {
        const current = await client.query(
          `SELECT revision, updated_at FROM greenhouse_maps
           WHERE organization_id=$1 AND area_id=$2`,
          [organizationId, areaId]
        );
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: { code: 'MAP_REVISION_CONFLICT', message: 'This Area map was changed in another session. Reload it before saving again.' },
          revision: current.rows[0]?.revision || 0,
          updatedAt: current.rows[0]?.updated_at || null
        });
      }
      const saved = result.rows[0];
      await client.query(
        `UPDATE greenhouse_map_layout_history
         SET valid_to=$3
         WHERE organization_id=$1 AND area_id=$2 AND valid_to IS NULL`,
        [organizationId, areaId, saved.updated_at]
      );
      await client.query(
        `INSERT INTO greenhouse_map_layout_history (
           organization_id, area_id, revision, map_data, valid_from, source, recorded_by
         )
         VALUES ($1, $2, $3, $4::jsonb, $5, 'recorded', $6)`,
        [
          organizationId,
          areaId,
          saved.revision,
          JSON.stringify(saved.map_data),
          saved.updated_at,
          req.user.id
        ]
      );
      await client.query('COMMIT');
      res.json({
        map: saved.map_data,
        revision: saved.revision,
        updatedAt: saved.updated_at
      });
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      next(error);
    } finally {
      client?.release();
    }
  });
}
