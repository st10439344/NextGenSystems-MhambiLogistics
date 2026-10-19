'use strict';

const { Pool } = require('pg');
const config = require('./env');

const poolConfig = {
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000, // Neon free tier can take a few seconds to wake up
};
if (config.dbSsl && !/sslmode=/i.test(config.databaseUrl) && !/(localhost|127\.0\.0\.1)/.test(config.databaseUrl)) {
  poolConfig.ssl = { rejectUnauthorized: true };
}

const pool = new Pool(poolConfig);
pool.on('error', (err) => console.error('Unexpected PostgreSQL pool error:', err.message));

const query = (text, params) => pool.query(text, params);

/** Run fn(client) inside a transaction; commits on success, rolls back on any error. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

async function checkConnection() {
  const r = await pool.query('SELECT NOW() AS server_time, current_database() AS database_name, version() AS version');
  return r.rows[0];
}

const close = () => pool.end();

module.exports = { pool, query, tx, checkConnection, close };
