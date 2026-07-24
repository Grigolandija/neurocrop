const DEFAULT_RETENTION_DAYS = 35;
const MIN_RETENTION_DAYS = 31;
const DEFAULT_BATCH_SIZE = 10_000;
const DEFAULT_MAX_BATCHES = 100;
const RETENTION_LOCK_NAME = 'neurocrop-measurement-retention-v1';

export function getMeasurementRetentionDays(env = process.env) {
  const configured = env.MEASUREMENT_RETENTION_DAYS;
  if (configured === undefined || configured === '') return DEFAULT_RETENTION_DAYS;
  const days = Number(configured);
  if (!Number.isInteger(days) || days < MIN_RETENTION_DAYS || days > 365) {
    throw new Error(`MEASUREMENT_RETENTION_DAYS must be an integer between ${MIN_RETENTION_DAYS} and 365`);
  }
  return days;
}

export async function runMeasurementRetention(pool, options = {}) {
  const retentionDays = options.retentionDays ?? getMeasurementRetentionDays(options.env);
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxBatches = options.maxBatches ?? DEFAULT_MAX_BATCHES;
  const now = options.now ? new Date(options.now) : new Date();
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const client = await pool.connect();
  let locked = false;
  let deleted = 0;

  try {
    const lockResult = await client.query(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS locked',
      [RETENTION_LOCK_NAME]
    );
    locked = lockResult.rows[0]?.locked === true;
    if (!locked) return { deleted: 0, skipped: true, cutoff };

    for (let batch = 0; batch < maxBatches; batch += 1) {
      const result = await client.query(
        `DELETE FROM measurements
         WHERE id IN (
           SELECT id
           FROM measurements
           WHERE time < $1
           ORDER BY time ASC
           LIMIT $2
         )`,
        [cutoff, batchSize]
      );
      deleted += result.rowCount;
      if (result.rowCount < batchSize) break;
    }

    if (deleted > 0) await client.query('ANALYZE measurements');
    return { deleted, skipped: false, cutoff };
  } finally {
    if (locked) {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [RETENTION_LOCK_NAME]).catch(() => {});
    }
    client.release();
  }
}

export function startMeasurementRetention(pool, options = {}) {
  const intervalMs = options.intervalMs ?? 6 * 60 * 60 * 1000;
  const initialDelayMs = options.initialDelayMs ?? 30_000;
  let running = false;
  let stopped = false;

  const execute = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const result = await runMeasurementRetention(pool, options);
      if (result.deleted > 0) {
        console.log(`[retention] deleted ${result.deleted} measurements older than ${result.cutoff.toISOString()}`);
      }
    } catch (error) {
      console.error('[retention] measurement cleanup failed:', error.message);
    } finally {
      running = false;
    }
  };

  const initialTimer = setTimeout(() => void execute(), initialDelayMs);
  const intervalTimer = setInterval(() => void execute(), intervalMs);
  initialTimer.unref?.();
  intervalTimer.unref?.();

  return () => {
    stopped = true;
    clearTimeout(initialTimer);
    clearInterval(intervalTimer);
  };
}
