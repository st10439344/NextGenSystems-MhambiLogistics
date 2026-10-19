'use strict';

const config = require('./config/env');
const db = require('./config/db');

if (!config.jwtSecret || config.jwtSecret.length < 32) {
  console.error('JWT_ACCESS_SECRET must be set (at least 32 characters). See .env.example.');
  process.exit(1);
}

const app = require('./app');

const server = app.listen(config.port, async () => {
  console.log(`Mhambi Logistics API listening on port ${config.port} (${config.env})`);
  try {
    const info = await db.checkConnection();
    console.log(`Database connected: ${info.database_name}`);
  } catch (err) {
    console.error(`Database connection FAILED: ${err.message}`);
  }
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(async () => { await db.close(); process.exit(0); });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
