'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const DIR = path.join(__dirname, '..', '..', 'migrations');

async function migrate({ quiet = false } = {}) {
  const log = (...a) => { if (!quiet) console.log(...a); };
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const applied = new Set((await db.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename));
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) { log(`  skip   ${file} (already applied)`); continue; }
    const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
    await db.tx(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    });
    log(`  apply  ${file}`);
    count += 1;
  }
  log(`Migrations complete. ${count} applied, ${files.length - count} already up to date.`);
  return count;
}

module.exports = { migrate };

if (require.main === module) {
  migrate()
    .catch((err) => { console.error('Migration FAILED:', err.message); process.exitCode = 1; })
    .finally(() => db.close());
}
