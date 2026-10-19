'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config/env');
const db = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1); // behind Render's proxy: correct client IPs for rate limiting

app.use(helmet({
  contentSecurityPolicy: false, // the existing website uses inline scripts/styles and Google Fonts
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // Android and curl send no Origin
    if (!config.isProd || config.corsOrigins.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
}));
app.use(express.json({ limit: '3mb' }));

app.get('/api/v1/health', async (req, res) => {
  try {
    await db.checkConnection();
    res.json({ status: 'ok', database: 'up', time: new Date().toISOString() });
  } catch (err) {
    console.error('Health check database error:', err.message);
    res.status(503).json({ status: 'degraded', database: 'down', time: new Date().toISOString() });
  }
});

app.use('/api/v1', require('./routes'));
app.use('/api', notFound);

// Serve the Mhambi website from the same server (so website and Android share one backend).
const siteDir = path.join(__dirname, '..', '..', 'website');
if (fs.existsSync(siteDir)) {
  app.use(express.static(siteDir, { extensions: ['html'] }));
  app.get('/', (req, res) => res.redirect('/public/index.html'));
}

app.use(notFound);
app.use(errorHandler);

module.exports = app;
