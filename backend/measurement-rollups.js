import { query } from './db.js';

const ROLLUP_METRICS = Object.freeze({
  airTemp: ['temperature_sum', 'temperature_count'],
  humidity: ['humidity_sum', 'humidity_count'],
  co2: ['co2_sum', 'co2_count'],
  lux: ['lux_sum', 'lux_count'],
  soilTemp: ['soil_temperature_sum', 'soil_temperature_count'],
  soilMoisture: ['soil_moisture_sum', 'soil_moisture_count'],
  ec: ['ec_sum', 'ec_count'],
  ph: ['ph_sum', 'ph_count'],
  soilEc: ['soil_ec_sum', 'soil_ec_count'],
  leafTemp: ['leaf_temperature_sum', 'leaf_temperature_count'],
  waterTemp: ['water_temperature_sum', 'water_temperature_count'],
  batteryLevel: ['battery_percent_sum', 'battery_percent_count'],
  vpd: ['vpd_sum', 'vpd_count']
});

export function measurementRollupResolution(stepMinutes) {
  if (stepMinutes === 10) return 10;
  if (stepMinutes >= 60 && stepMinutes % 60 === 0) return 60;
  return null;
}

export function measurementRollupAverageSql(metric, alias = 'rollup') {
  const columns = ROLLUP_METRICS[metric];
  if (!columns) return null;
  return `${alias}.${columns[0]} / NULLIF(${alias}.${columns[1]}, 0)`;
}

export async function getMeasurementRollupSeries(
  devEuis,
  metric,
  from,
  to,
  stepMinutes,
  options = {}
) {
  const resolution = measurementRollupResolution(stepMinutes);
  const columns = ROLLUP_METRICS[metric];
  if (!resolution || !columns || !devEuis.length) return null;

  const bucketSeconds = stepMinutes * 60;
  const sourceSeconds = resolution * 60;
  const bucketExpression = `to_timestamp(
    floor(extract(epoch FROM rollup.bucket_start) / ${bucketSeconds}) * ${bucketSeconds}
  )`;
  const alignedFrom = new Date(Math.floor(from.getTime() / (sourceSeconds * 1000)) * sourceSeconds * 1000);
  const valueExpression = `SUM(rollup.${columns[0]}) / NULLIF(SUM(rollup.${columns[1]}), 0)`;
  const nodeValue = metric === 'lux' && options.luxAggregation !== 'median'
    ? 'peak_value'
    : 'average_value';
  const sectionAggregation = metric === 'lux' && options.luxAggregation !== 'median'
    ? `MAX(${nodeValue})`
    : `percentile_cont(0.5) WITHIN GROUP (ORDER BY ${nodeValue})`;

  const { rows } = await query(
    `WITH node_values AS (
       SELECT ${bucketExpression} AS observed_at,
              rollup.dev_eui,
              ${valueExpression} AS average_value,
              MAX(rollup.lux_max) AS peak_value
       FROM measurement_rollups rollup
       WHERE rollup.bucket_minutes=$1
         AND rollup.dev_eui=ANY($2::text[])
         AND rollup.bucket_start BETWEEN $3 AND $4
       GROUP BY observed_at, rollup.dev_eui
     )
     SELECT observed_at, ${sectionAggregation} AS value
     FROM node_values
     WHERE ${nodeValue} IS NOT NULL
     GROUP BY observed_at
     ORDER BY observed_at ASC`,
    [resolution, devEuis, alignedFrom, to]
  );
  return rows.map((row) => ({ observedAt: row.observed_at, value: Number(row.value) }));
}
