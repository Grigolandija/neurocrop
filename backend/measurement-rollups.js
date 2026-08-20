import { query } from './db.js';
import { METRIC_DEFINITIONS } from './metric-registry.js';

export const ROLLUP_METRICS = Object.freeze(Object.fromEntries(
  Object.entries(METRIC_DEFINITIONS)
    .filter(([metricId, definition]) => definition.column || metricId === 'vpd')
    .map(([metricId, definition]) => {
      const column = definition.column || metricId;
      return [metricId, [`${column}_sum`, `${column}_count`]];
    })
));

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
  const nodeValue = metric === 'lux' && options.luxAggregation !== 'average'
    ? 'peak_value'
    : 'average_value';
  const sectionAggregation = metric === 'lux' && options.luxAggregation !== 'average'
    ? `MAX(${nodeValue})`
    : `AVG(${nodeValue})`;

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
