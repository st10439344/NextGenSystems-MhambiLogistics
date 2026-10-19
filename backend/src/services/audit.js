'use strict';

const db = require('../config/db');

/** Best-effort audit record; never breaks the request if logging fails. */
async function audit(req, action, entityType = null, entityId = null, details = null, client = db) {
  try {
    await client.query(
      'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip) VALUES ($1,$2,$3,$4,$5,$6)',
      [req && req.user ? req.user.id : null, action, entityType, entityId, details ? JSON.stringify(details) : null, req ? req.ip : null]
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

module.exports = { audit };
