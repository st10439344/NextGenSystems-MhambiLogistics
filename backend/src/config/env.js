'use strict';

require('dotenv').config({ quiet: true });

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) {
  throw new Error('Missing required environment variable DATABASE_URL. Copy .env.example to .env and fill it in.');
}

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL.trim(),
  dbSsl: process.env.DB_SSL !== 'false',
  jwtSecret: process.env.JWT_ACCESS_SECRET || '',
  accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshDays: Number(process.env.REFRESH_TOKEN_DAYS) || 30,
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 12,
  googleClientIds: list(process.env.GOOGLE_CLIENT_IDS),
  appBaseUrl: (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Mhambi Logistics <no-reply@example.com>',
  },
  corsOrigins: list(process.env.CORS_ORIGINS),
  vatRate: 0.15,
};

config.isProd = config.env === 'production';
config.isTest = config.env === 'test';

module.exports = config;
