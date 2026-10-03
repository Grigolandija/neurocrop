import { query } from './db.js';

// Callers supply only DevEUIs selected within the authenticated organization.
export async function loadRecentMeasurementsByNode(devEuis, concurrency = 4) {
  const results = new Array(devEuis.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, devEuis.length) }, async () => {
    while (cursor < devEuis.length) {
      const index = cursor;
      cursor += 1;
      const { rows } = await query(
        `SELECT measurement.*
         FROM measurements measurement
         WHERE measurement.dev_eui=$1
         ORDER BY measurement.time DESC
         LIMIT 100`,
        [devEuis[index]]
      );
      results[index] = rows;
    }
  });
  await Promise.all(workers);
  return results.flat();
}

