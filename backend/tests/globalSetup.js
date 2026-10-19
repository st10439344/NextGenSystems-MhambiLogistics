'use strict';
const crypto = require('crypto');

module.exports = async () => {
  process.env.NODE_ENV = 'test';
  if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to an EMPTY PostgreSQL database whose name contains "test" (the test run drops and rebuilds its schema). See README.md.');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DB_SSL = 'false';
  process.env.BCRYPT_ROUNDS = '4';
  const dbName = new URL(process.env.DATABASE_URL).pathname.replace('/', '');
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to run tests: database "${dbName}" does not contain "test" and the test run drops the public schema.`);
  }
  // A random password is generated for every run and shared with the test workers; nothing is stored in the repository.
  process.env.TEST_SEED_PASSWORD = `Aa1-${crypto.randomBytes(9).toString('hex')}`;

  const db = require('../src/config/db');
  const { migrate } = require('../src/db/migrate');
  const { seed } = require('../src/db/seed');
  await db.query('DROP SCHEMA public CASCADE');
  await db.query('CREATE SCHEMA public');
  await migrate({ quiet: true });
  await seed({ password: process.env.TEST_SEED_PASSWORD, quiet: true });
  await db.close();
};
