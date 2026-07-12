import pg from 'pg';
const { Pool } = pg;
export const pool = new Pool({
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
pool.on('error', (err) => console.error('[db] pool klaida:', err.message));
export async function query(text, params) { return pool.query(text, params); }
export async function closePool() { await pool.end(); }
