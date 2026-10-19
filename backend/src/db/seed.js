'use strict';

const bcrypt = require('bcryptjs');
const db = require('../config/db');
const config = require('../config/env');
const { build } = require('../../seeds/data');
const { passwordSchema } = require('../utils/validate');

async function insertRows(client, table, rows) {
  if (!rows.length) return 0;
  const cols = Object.keys(rows[0]);
  const values = [];
  const tuples = rows.map((r, i) => `(${cols.map((c, j) => { values.push(r[c]); return `$${i * cols.length + j + 1}`; }).join(',')})`);
  const res = await client.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${tuples.join(',')} ON CONFLICT DO NOTHING`, values);
  return res.rowCount;
}

async function seed({ password, quiet = false } = {}) {
  const log = (...a) => { if (!quiet) console.log(...a); };
  const parsed = passwordSchema.safeParse(password || '');
  if (!parsed.success) {
    throw new Error('DEMO_SEED_PASSWORD is missing or too weak (min 10 characters with upper case, lower case and a number). Set it in .env.');
  }
  const hash = await bcrypt.hash(password, config.bcryptRounds);
  const plan = build(hash);
  const summary = {};
  await db.tx(async (client) => {
    for (const [table, rows] of plan) {
      summary[table] = await insertRows(client, table, rows);
    }
    // Move identity sequences past the explicit ids we inserted
    const tables = plan.map(([t]) => t).filter((t) => !['role_permissions', 'user_roles'].includes(t));
    for (const t of tables) {
      await client.query(`SELECT setval(pg_get_serial_sequence('${t}','id'), COALESCE((SELECT MAX(id) FROM ${t}), 1), (SELECT COUNT(*) > 0 FROM ${t}))`);
    }
  });
  if (!quiet) {
    log('Seed complete (rows newly inserted per table; 0 means already present):');
    Object.entries(summary).forEach(([t, n]) => log(`  ${t.padEnd(26)} +${n}`));
  }
  return summary;
}

module.exports = { seed };

if (require.main === module) {
  seed({ password: process.env.DEMO_SEED_PASSWORD })
    .catch((err) => { console.error('Seed FAILED:', err.message); process.exitCode = 1; })
    .finally(() => db.close());
}
