'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const config = require('../config/env');
const { E } = require('../utils/errors');
const { validate, z, passwordSchema, emailSchema, idParam, reqText, optionalText } = require('../utils/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { toPublic, getUserById, USER_SELECT } = require('../services/users');
const { revokeAll } = require('../services/sessions');
const { audit } = require('../services/audit');
const { sendCsv } = require('../utils/csv');

const router = express.Router();
router.use(authenticate);

const ROLES = ['admin', 'dispatcher', 'warehouse', 'fleet', 'procurement', 'finance', 'driver', 'client'];
const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number.');
const paging = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50) });

/* ---------------- users (admin only) ---------------- */
router.get('/users', requireRole('admin'), validate(paging.extend({ q: z.string().trim().max(80).optional(), role: z.enum(ROLES).optional(), status: z.enum(['active', 'inactive']).optional() }), 'query'), async (req, res) => {
  const { q, role, status, page, limit } = req.valid.query;
  const where = []; const p = [];
  if (q) { p.push(`%${q.toLowerCase()}%`); where.push(`(lower(u.full_name) LIKE $${p.length} OR lower(u.email) LIKE $${p.length})`); }
  if (role) { p.push(role); where.push(`r.code = $${p.length}`); }
  if (status) { p.push(status); where.push(`u.status = $${p.length}`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db.query(`SELECT COUNT(*)::int AS n FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id ${w}`, p)).rows[0].n;
  p.push(limit, (page - 1) * limit);
  const rows = (await db.query(`${USER_SELECT} ${w} ORDER BY u.id LIMIT $${p.length - 1} OFFSET $${p.length}`, p)).rows;
  res.json({ data: rows.map(toPublic), total, page, limit });
});

router.get('/users/:id', requireRole('admin'), validate(idParam, 'params'), async (req, res) => {
  const u = await getUserById(req.valid.params.id);
  if (!u) throw E.notFound('User not found.');
  res.json({ user: toPublic(u) });
});

const createUserSchema = z.object({
  fullName: reqText(120, 'Full name'), email: emailSchema, phone: phone.optional(), role: z.enum(ROLES),
  companyId: z.coerce.number().int().positive().optional(), password: passwordSchema, licenceNumber: z.string().trim().min(3).max(30).optional(),
});

router.post('/users', requireRole('admin'), validate(createUserSchema), async (req, res) => {
  const d = req.valid.body;
  if (d.role === 'client' && !d.companyId) throw E.validation([{ field: 'companyId', message: 'Choose the company this client belongs to.' }]);
  if (d.role === 'driver' && !d.licenceNumber) throw E.validation([{ field: 'licenceNumber', message: 'A licence number is required for drivers.' }]);
  const hash = await bcrypt.hash(d.password, config.bcryptRounds);
  const id = await db.tx(async (client) => {
    const u = await client.query(
      `INSERT INTO users (email, password_hash, full_name, phone, company_id, must_change_password) VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING id`,
      [d.email, hash, d.fullName, d.phone || null, d.role === 'client' ? d.companyId : null]);
    await client.query('INSERT INTO user_roles (user_id, role_id, assigned_by) SELECT $1, id, $3 FROM roles WHERE code=$2', [u.rows[0].id, d.role, req.user.id]);
    if (d.role === 'driver') await client.query('INSERT INTO drivers (user_id, licence_number, phone) VALUES ($1,$2,$3)', [u.rows[0].id, d.licenceNumber, d.phone || null]);
    return u.rows[0].id;
  }).catch((err) => {
    if (err.code === '23505') {
      throw E.conflict(/licence/.test(err.constraint || '') ? 'That licence number is already registered.' : 'An account with this email address already exists.', 'DUPLICATE');
    }
    throw err;
  });
  await audit(req, 'user.create', 'user', id, { role: d.role });
  res.status(201).json({ user: toPublic(await getUserById(id)) });
});

router.patch('/users/:id', requireRole('admin'), validate(idParam, 'params'), validate(z.object({ fullName: reqText(120).optional(), phone: phone.optional(), companyId: z.coerce.number().int().positive().nullable().optional() })), async (req, res) => {
  const d = req.valid.body; const id = req.valid.params.id;
  const r = await db.query(`UPDATE users SET full_name=COALESCE($2,full_name), phone=COALESCE($3,phone), company_id=CASE WHEN $4::boolean THEN $5 ELSE company_id END, updated_at=now() WHERE id=$1 RETURNING id`,
    [id, d.fullName ?? null, d.phone ?? null, d.companyId !== undefined, d.companyId ?? null]);
  if (!r.rowCount) throw E.notFound('User not found.');
  await audit(req, 'user.update', 'user', id, d);
  res.json({ user: toPublic(await getUserById(id)) });
});

async function activeAdminCount(client) {
  return (await client.query(`SELECT COUNT(*)::int n FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.code='admin' AND u.status='active'`)).rows[0].n;
}

router.put('/users/:id/role', requireRole('admin'), validate(idParam, 'params'), validate(z.object({ role: z.enum(ROLES), licenceNumber: z.string().trim().min(3).max(30).optional(), companyId: z.coerce.number().int().positive().optional() })), async (req, res) => {
  const id = req.valid.params.id; const { role, licenceNumber, companyId } = req.valid.body;
  if (id === req.user.id) throw E.unprocessable('You cannot change your own role.', 'SELF_ROLE_CHANGE');
  await db.tx(async (client) => {
    const cur = await getUserById(id, client);
    if (!cur) throw E.notFound('User not found.');
    if (cur.role === role) return;
    if (cur.role === 'admin' && cur.status === 'active' && (await activeAdminCount(client)) <= 1) throw E.unprocessable('At least one active administrator is required.', 'LAST_ADMIN');
    if (cur.role === 'driver') {
      const busy = await client.query(`SELECT 1 FROM delivery_assignments da JOIN drivers d ON d.id=da.driver_id WHERE d.user_id=$1 AND da.status IN ('assigned','active') LIMIT 1`, [id]);
      if (busy.rowCount) throw E.conflict('This driver has live delivery assignments. Reassign them first.', 'DRIVER_BUSY');
    }
    if (role === 'client') {
      const cid = companyId || cur.company_id;
      if (!cid) throw E.validation([{ field: 'companyId', message: 'Choose a company for this client.' }]);
      await client.query('UPDATE users SET company_id=$2 WHERE id=$1', [id, cid]);
    } else {
      await client.query('UPDATE users SET company_id=NULL WHERE id=$1', [id]);
    }
    if (role === 'driver') {
      const has = await client.query('SELECT 1 FROM drivers WHERE user_id=$1', [id]);
      if (!has.rowCount) {
        if (!licenceNumber) throw E.validation([{ field: 'licenceNumber', message: 'A licence number is required for drivers.' }]);
        await client.query('INSERT INTO drivers (user_id, licence_number, phone) VALUES ($1,$2,$3)', [id, licenceNumber, cur.phone]);
      }
    }
    await client.query('UPDATE user_roles SET role_id=(SELECT id FROM roles WHERE code=$2), assigned_by=$3, assigned_at=now() WHERE user_id=$1', [id, role, req.user.id]);
    await revokeAll(id, client); // force re-login so the new role takes effect everywhere
    await audit(req, 'user.role_change', 'user', id, { from: cur.role, to: role }, client);
  });
  res.json({ user: toPublic(await getUserById(id)) });
});

router.patch('/users/:id/status', requireRole('admin'), validate(idParam, 'params'), validate(z.object({ status: z.enum(['active', 'inactive']) })), async (req, res) => {
  const id = req.valid.params.id; const { status } = req.valid.body;
  if (id === req.user.id) throw E.unprocessable('You cannot deactivate your own account.', 'SELF_DEACTIVATE');
  await db.tx(async (client) => {
    const cur = await getUserById(id, client);
    if (!cur) throw E.notFound('User not found.');
    if (status === 'inactive' && cur.role === 'admin' && (await activeAdminCount(client)) <= 1) throw E.unprocessable('At least one active administrator is required.', 'LAST_ADMIN');
    await client.query('UPDATE users SET status=$2, updated_at=now() WHERE id=$1', [id, status]);
    if (status === 'inactive') await revokeAll(id, client);
    await audit(req, `user.${status === 'active' ? 'activate' : 'deactivate'}`, 'user', id, null, client);
  });
  res.json({ user: toPublic(await getUserById(id)) });
});

router.get('/roles', requireRole('admin'), async (req, res) => {
  const r = await db.query(`SELECT r.id, r.code, r.name, r.description,
      (SELECT COUNT(*)::int FROM user_roles ur WHERE ur.role_id=r.id) AS user_count,
      COALESCE((SELECT json_agg(p.code ORDER BY p.code) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=r.id), '[]') AS permissions
    FROM roles r ORDER BY r.id`);
  res.json({ data: r.rows.map((x) => ({ id: x.id, code: x.code, name: x.name, description: x.description, userCount: x.user_count, permissions: x.permissions })) });
});

/* ---------------- companies ---------------- */
const mapCompany = (c) => ({ id: Number(c.id), clientCode: c.client_code, name: c.name, registrationNumber: c.registration_number, vatNumber: c.vat_number, industry: c.industry,
  address: c.address, city: c.city, province: c.province, postalCode: c.postal_code, phone: c.phone, email: c.email, status: c.status, createdAt: c.created_at });

router.get('/companies', requireRole('admin', 'dispatcher', 'finance', 'procurement'), validate(paging.extend({ q: z.string().trim().max(80).optional(), status: z.enum(['active', 'inactive']).optional() }), 'query'), async (req, res) => {
  const { q, status, page, limit } = req.valid.query; const p = []; const where = [];
  if (q) { p.push(`%${q.toLowerCase()}%`); where.push(`(lower(name) LIKE $${p.length} OR lower(client_code) LIKE $${p.length})`); }
  if (status) { p.push(status); where.push(`status=$${p.length}`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db.query(`SELECT COUNT(*)::int n FROM companies ${w}`, p)).rows[0].n;
  p.push(limit, (page - 1) * limit);
  const rows = (await db.query(`SELECT * FROM companies ${w} ORDER BY id LIMIT $${p.length - 1} OFFSET $${p.length}`, p)).rows;
  res.json({ data: rows.map(mapCompany), total, page, limit });
});

router.get('/companies/me', requireRole('client'), async (req, res) => {
  const r = await db.query('SELECT * FROM companies WHERE id=$1', [req.user.companyId]);
  if (!r.rows[0]) throw E.notFound('No company is linked to your account.');
  res.json({ company: mapCompany(r.rows[0]) });
});

const companyFields = {
  industry: optionalText(80), address: optionalText(255), city: optionalText(80), province: optionalText(60), postalCode: optionalText(10),
  phone: phone.optional(), email: emailSchema.optional(),
};
router.patch('/companies/me', requireRole('client'), validate(z.object(companyFields)), async (req, res) => {
  if (!req.user.companyId) throw E.notFound('No company is linked to your account.');
  const d = req.valid.body;
  const r = await db.query(`UPDATE companies SET industry=COALESCE($2,industry), address=COALESCE($3,address), city=COALESCE($4,city), province=COALESCE($5,province),
      postal_code=COALESCE($6,postal_code), phone=COALESCE($7,phone), email=COALESCE($8,email), updated_at=now() WHERE id=$1 RETURNING *`,
    [req.user.companyId, d.industry ?? null, d.address ?? null, d.city ?? null, d.province ?? null, d.postalCode ?? null, d.phone ?? null, d.email ?? null]);
  await audit(req, 'company.update_own', 'company', req.user.companyId);
  res.json({ company: mapCompany(r.rows[0]) });
});

router.get('/companies/:id', requireRole('admin', 'dispatcher', 'finance', 'procurement'), validate(idParam, 'params'), async (req, res) => {
  const r = await db.query('SELECT * FROM companies WHERE id=$1', [req.valid.params.id]);
  if (!r.rows[0]) throw E.notFound('Company not found.');
  res.json({ company: mapCompany(r.rows[0]) });
});

router.post('/companies', requireRole('admin'), validate(z.object({ name: reqText(160, 'Company name'), registrationNumber: optionalText(40), vatNumber: optionalText(20), ...companyFields })), async (req, res) => {
  const d = req.valid.body;
  const code = 'CL-' + String((await db.query(`SELECT COALESCE(MAX(id),0)+1 AS n FROM companies`)).rows[0].n).padStart(4, '0') + Math.random().toString(36).slice(2, 4).toUpperCase();
  const r = await db.query(`INSERT INTO companies (client_code,name,registration_number,vat_number,industry,address,city,province,postal_code,phone,email)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`, [code, d.name, d.registrationNumber ?? null, d.vatNumber ?? null, d.industry ?? null, d.address ?? null, d.city ?? null, d.province ?? null, d.postalCode ?? null, d.phone ?? null, d.email ?? null]);
  await audit(req, 'company.create', 'company', r.rows[0].id);
  res.status(201).json({ company: mapCompany(r.rows[0]) });
});

router.patch('/companies/:id', requireRole('admin'), validate(idParam, 'params'), validate(z.object({ name: reqText(160).optional(), registrationNumber: optionalText(40), vatNumber: optionalText(20), status: z.enum(['active', 'inactive']).optional(), ...companyFields })), async (req, res) => {
  const d = req.valid.body;
  const r = await db.query(`UPDATE companies SET name=COALESCE($2,name), registration_number=COALESCE($3,registration_number), vat_number=COALESCE($4,vat_number), status=COALESCE($5,status),
      industry=COALESCE($6,industry), address=COALESCE($7,address), city=COALESCE($8,city), province=COALESCE($9,province), postal_code=COALESCE($10,postal_code), phone=COALESCE($11,phone), email=COALESCE($12,email), updated_at=now()
      WHERE id=$1 RETURNING *`, [req.valid.params.id, d.name ?? null, d.registrationNumber ?? null, d.vatNumber ?? null, d.status ?? null, d.industry ?? null, d.address ?? null, d.city ?? null, d.province ?? null, d.postalCode ?? null, d.phone ?? null, d.email ?? null]);
  if (!r.rows[0]) throw E.notFound('Company not found.');
  await audit(req, 'company.update', 'company', r.rows[0].id, d);
  res.json({ company: mapCompany(r.rows[0]) });
});

/* ---------------- audit logs, data management ---------------- */
router.get('/audit-logs', requireRole('admin'), validate(paging.extend({ action: z.string().trim().max(60).optional(), userId: z.coerce.number().int().optional(), format: z.enum(['json', 'csv']).default('json') }), 'query'), async (req, res) => {
  const { action, userId, page, limit, format } = req.valid.query; const p = []; const where = [];
  if (action) { p.push(`%${action}%`); where.push(`a.action ILIKE $${p.length}`); }
  if (userId) { p.push(userId); where.push(`a.user_id=$${p.length}`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db.query(`SELECT COUNT(*)::int n FROM audit_logs a ${w}`, p)).rows[0].n;
  const lim = format === 'csv' ? 5000 : limit;
  p.push(lim, format === 'csv' ? 0 : (page - 1) * limit);
  const rows = (await db.query(`SELECT a.id, a.created_at, a.action, a.entity_type, a.entity_id, a.details, a.ip, a.user_id, u.full_name AS user_name
    FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ${w} ORDER BY a.created_at DESC, a.id DESC LIMIT $${p.length - 1} OFFSET $${p.length}`, p)).rows;
  if (format === 'csv') return sendCsv(res, 'audit-logs.csv', rows);
  return res.json({ data: rows.map((r) => ({ id: Number(r.id), createdAt: r.created_at, action: r.action, entityType: r.entity_type, entityId: r.entity_id ? Number(r.entity_id) : null, details: r.details, ip: r.ip, userId: r.user_id ? Number(r.user_id) : null, userName: r.user_name })), total, page, limit });
});

const EXPORTABLE = {
  users: 'SELECT u.id,u.email,u.full_name,u.phone,u.status,r.code AS role,u.company_id,u.created_at FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id ORDER BY u.id',
  companies: 'SELECT * FROM companies ORDER BY id', quotations: 'SELECT * FROM quotations ORDER BY id', shipments: 'SELECT * FROM shipments ORDER BY id', vehicles: 'SELECT * FROM vehicles ORDER BY id',
  inventory: 'SELECT * FROM inventory ORDER BY id', invoices: 'SELECT * FROM invoices ORDER BY id', payments: 'SELECT * FROM payments ORDER BY id', suppliers: 'SELECT * FROM suppliers ORDER BY id',
};

router.get('/admin/tables', requireRole('admin'), async (req, res) => {
  const out = [];
  for (const t of Object.keys(EXPORTABLE)) out.push({ table: t, rows: (await db.query(`SELECT COUNT(*)::int n FROM ${t}`)).rows[0].n });
  res.json({ data: out });
});

router.get('/admin/export/:table', requireRole('admin'), async (req, res) => {
  const sql = EXPORTABLE[req.params.table];
  if (!sql) throw E.notFound('That table cannot be exported.');
  const rows = (await db.query(sql)).rows;
  await audit(req, 'data.export', 'table', null, { table: req.params.table, rows: rows.length });
  sendCsv(res, `${req.params.table}.csv`, rows);
});

module.exports = router;
