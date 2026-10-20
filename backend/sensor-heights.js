import { METRIC_DEFINITIONS } from './metric-registry.js';

const ports = {
  airTemp: ['sht45','internal'], humidity: ['sht45','internal'], vpd: ['sht45','internal'],
  co2: ['scd4x','i2c'], lux: ['bh1750'], soilTemp: ['ds18b20','onewire'],
  leafTemp: ['leaf_temperature_probe'], soilMoisture: ['soil_moisture_probe'],
  soilEc: ['soil_ec_probe'], ec: ['ec_probe'], ph: ['ph_probe'], waterTemp: ['water_temperature_probe']
};
export const heightPorts = [...new Set(Object.values(ports).flat())];
export function measurementHeights(contexts = {}, node = {}) {
  const output = {};
  const nodeHeight = node.installation_height_cm;
  const nodeRecorded = node.installation_height_recorded_at;
  for (const definition of Object.values(METRIC_DEFINITIONS)) {
    if (!definition.heatmap) continue;
    if (typeof nodeHeight === 'number' && Number.isFinite(nodeHeight) && nodeHeight >= 0 && nodeHeight <= 10000) output[definition.heatmap.key] = nodeHeight / 100;
    else if (nodeRecorded) output[definition.heatmap.key] = null;
  }
  for (const [metric, channels] of Object.entries(ports)) {
    // The integrated air sensor is physically on the Node enclosure.
    if (['airTemp','humidity','vpd'].includes(metric) && (nodeRecorded || typeof nodeHeight === 'number')) continue;
    const context = channels.map(p=>contexts[p]).find(Boolean);
    if (!context) continue;
    const height = context.heightCm ?? context.height_cm;
    const recorded = context.heightRecordedAt ?? context.height_recorded_at;
    if (typeof height === 'number' && Number.isFinite(height) && height >= 0 && height <= 10000) {
      output[METRIC_DEFINITIONS[metric].heatmap.key] = height / 100;
    } else if (recorded) output[METRIC_DEFINITIONS[metric].heatmap.key] = null;
  }
  return output;
}

export function historicalMeasurementHeights(events, devEui, start, end) {
  const contexts = {}, known = new Set();
  let node = {};
  const relevant = events.filter(e => String(e.snapshot?.node_dev_eui ?? e.snapshot?.dev_eui).toLowerCase() === devEui.toLowerCase());
  const apply = e => {
    if (e.snapshot.port) {
      known.add(e.snapshot.port);
      if (e.operation === 'DELETE') delete contexts[e.snapshot.port];
      else contexts[e.snapshot.port] = e.snapshot;
    } else node = e.operation === 'DELETE' ? {} : e.snapshot;
  };
  for (const e of relevant) if (+new Date(e.recorded_at) <= start) apply(e);
  const before = measurementHeights(contexts, node), result = {};
  for (const [metric, channels] of Object.entries(ports)) {
    const key = METRIC_DEFINITIONS[metric].heatmap.key;
    if (Object.hasOwn(before, key)) result[key] = before[key];
    else if (!channels.some(p => known.has(p))) result[key] = null;
  }
  for (const e of relevant) if (+new Date(e.recorded_at) > start && +new Date(e.recorded_at) < end) {
    const previous = measurementHeights(contexts, node);
    apply(e);
    const next = measurementHeights(contexts, node);
    for (const metric of Object.keys(ports)) {
      const key = METRIC_DEFINITIONS[metric].heatmap.key;
      if (previous[key] !== next[key]) result[key] = null; // Rollup spans a relocation.
    }
  }
  return result;
}

export async function saveSensorHeight(db, organizationId, devEui, sensor, heightCm) {
  if(heightCm!==null && (typeof heightCm!=='number' || !Number.isFinite(heightCm) || heightCm<0 || heightCm>10000))throw new Error('Invalid sensor height');
  const scope=sensor.spatialScope==='representative' ? 'representative' : 'point';
  await db.query(`INSERT INTO node_sensor_configs
    (node_dev_eui,organization_id,port,role,label,medium,target_type,target_name,spatial_scope,
     depth_cm,height_cm,height_recorded_at,use_for_section_score,allow_spatial_interpolation)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),$12,$13)
    ON CONFLICT(node_dev_eui,port) DO UPDATE
    SET height_cm=EXCLUDED.height_cm,height_recorded_at=now(),updated_at=now()`,
  [devEui,organizationId,sensor.port,sensor.role || null,sensor.label || 'Sensor',sensor.medium || 'air',
    sensor.targetType || 'custom',sensor.targetName || null,scope,sensor.depthCm ?? null,heightCm,
    sensor.useForSectionScore===true,sensor.allowSpatialInterpolation===true]);
}

export async function loadHeightEvents(db, organizationId, devEuis, from, to) {
  if(!devEuis.length)return [];
  const ids=devEuis.flatMap(id=>[id.toLowerCase(),...heightPorts.map(port=>`${id.toLowerCase()}:${port}`)]);
  const {rows}=await db.query(`
    SELECT * FROM (
      (SELECT DISTINCT ON(entity,entity_id) id,recorded_at,operation,snapshot
       FROM diagnostic_metadata_history
       WHERE organization_id=$1 AND entity IN ('nodes','node_sensor_configs') AND entity_id=ANY($2::text[]) AND recorded_at<=$3
       ORDER BY entity,entity_id,recorded_at DESC,id DESC)
      UNION ALL
      (SELECT id,recorded_at,operation,snapshot FROM diagnostic_metadata_history
       WHERE organization_id=$1 AND entity IN ('nodes','node_sensor_configs') AND entity_id=ANY($2::text[]) AND recorded_at>$3 AND recorded_at<=$4)
    ) changes ORDER BY recorded_at,id`,[organizationId,ids,from,to]);
  return rows;
}
