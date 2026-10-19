'use strict';
const db = require('../config/db');
(async () => {
  try {
    const info = await db.checkConnection();
    console.log('Connected to PostgreSQL successfully.');
    console.log('Database   :', info.database_name);
    console.log('Server time:', info.server_time.toISOString());
    console.log('Version    :', info.version.split(',')[0]);
  } catch (err) {
    console.error('Database connection FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})();
