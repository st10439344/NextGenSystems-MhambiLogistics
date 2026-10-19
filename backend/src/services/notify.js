'use strict';

const db = require('../config/db');

/** Inserts in-app notifications. Users who switched off in-app notifications in Settings are skipped. */
async function notifyUsers(userIds, { title, message, type = 'info', entityType = null, entityId = null }, client = db) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return 0;
  const r = await client.query(
    `INSERT INTO notifications (user_id, title, message, type, entity_type, entity_id)
     SELECT u.id, $2, $3, $4, $5, $6 FROM users u
     WHERE u.id = ANY($1::bigint[]) AND u.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM settings s WHERE s.user_id = u.id AND s.key = 'inAppNotifications' AND s.value = 'false'::jsonb)`,
    [ids, title, message, type, entityType, entityId]
  );
  return r.rowCount;
}

async function notifyRoles(roleCodes, payload, client = db) {
  const r = await client.query(
    `SELECT ur.user_id FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.code = ANY($1::text[])`, [roleCodes]);
  return notifyUsers(r.rows.map((x) => x.user_id), payload, client);
}

async function notifyCompany(companyId, payload, client = db) {
  if (!companyId) return 0;
  const r = await client.query(
    `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id
     WHERE u.company_id = $1 AND r.code = 'client'`, [companyId]);
  return notifyUsers(r.rows.map((x) => x.id), payload, client);
}

module.exports = { notifyUsers, notifyRoles, notifyCompany };
