'use strict';

const db = require('../config/db');

const USER_SELECT = `
  SELECT u.id, u.email, u.full_name, u.phone, u.status, u.company_id, u.must_change_password,
         (u.google_sub IS NOT NULL) AS google_linked, (u.password_hash IS NOT NULL) AS has_password,
         u.last_login_at, u.created_at, r.code AS role, c.name AS company_name, d.id AS driver_id
  FROM users u
  JOIN user_roles ur ON ur.user_id = u.id
  JOIN roles r ON r.id = ur.role_id
  LEFT JOIN companies c ON c.id = u.company_id
  LEFT JOIN drivers d ON d.user_id = u.id`;

const toPublic = (r) => ({
  id: Number(r.id),
  email: r.email,
  fullName: r.full_name,
  phone: r.phone,
  role: r.role,
  status: r.status,
  companyId: r.company_id ? Number(r.company_id) : null,
  companyName: r.company_name || null,
  driverId: r.driver_id ? Number(r.driver_id) : null,
  mustChangePassword: r.must_change_password,
  googleLinked: r.google_linked,
  hasPassword: r.has_password,
  lastLoginAt: r.last_login_at,
  createdAt: r.created_at,
});

async function getUserById(id, client = db) {
  const r = await client.query(`${USER_SELECT} WHERE u.id = $1`, [id]);
  return r.rows[0] || null;
}

async function getUserByEmail(email, client = db) {
  const r = await client.query(`${USER_SELECT} WHERE lower(u.email) = lower($1)`, [email]);
  return r.rows[0] || null;
}

async function getUserByGoogleSub(sub, client = db) {
  const r = await client.query(`${USER_SELECT} WHERE u.google_sub = $1`, [sub]);
  return r.rows[0] || null;
}

const getPasswordHash = async (id) => (await db.query('SELECT password_hash FROM users WHERE id=$1', [id])).rows[0]?.password_hash || null;

module.exports = { USER_SELECT, toPublic, getUserById, getUserByEmail, getUserByGoogleSub, getPasswordHash };
