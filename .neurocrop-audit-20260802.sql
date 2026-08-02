\pset format aligned
\pset null '∅'
SELECT now() AS database_now;
SELECT count(*) AS raw_rows,
       count(*) FILTER (WHERE time >= now() - interval '24 hours') AS raw_rows_last_24h,
       min(time) AS oldest_raw,
       max(time) AS newest_raw,
       now() - max(time) AS raw_freshness
FROM measurements;
SELECT bucket_minutes,
       count(*) AS rollup_rows,
       count(*) FILTER (WHERE bucket_start >= now() - interval '24 hours') AS rows_last_24h,
       sum(sample_count) FILTER (WHERE bucket_start >= now() - interval '24 hours') AS samples_last_24h,
       min(bucket_start) AS oldest_bucket,
       max(bucket_start) AS newest_bucket,
       max(measured_at) AS newest_measurement,
       now() - max(measured_at) AS freshness
FROM measurement_rollups
GROUP BY bucket_minutes
ORDER BY bucket_minutes;
SELECT relname,
       n_live_tup,
       n_dead_tup,
       last_autovacuum,
       last_autoanalyze,
       pg_size_pretty(pg_relation_size(relid)) AS heap_size,
       pg_size_pretty(pg_indexes_size(relid)) AS index_size,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE relname IN ('measurements', 'measurement_rollups')
ORDER BY relname;
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid='measurements'::regclass AND NOT tgisinternal;
SELECT version, name, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 5;
SHOW log_min_duration_statement;
