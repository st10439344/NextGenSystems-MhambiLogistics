'use strict';
// Runs inside every test worker before test files load.
process.env.NODE_ENV = 'test';
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to an EMPTY PostgreSQL database whose name contains "test" (the test run drops and rebuilds its schema). See README.md.');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DB_SSL = 'false';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-only-secret-not-used-anywhere-else-0123456789abcdef';
process.env.BCRYPT_ROUNDS = '4';
process.env.GOOGLE_CLIENT_IDS = 'test-client-id.apps.googleusercontent.com';
