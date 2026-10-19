'use strict';

const express = require('express');
const db = require('../config/db');
const { E } = require('../utils/errors');
const { validate, z, idParam, reqText, optionalText, emailSchema } = require('../utils/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { notifyUsers, notifyRoles } = require('../services/notify');
const { sendCsv } = require('../utils/csv');

const router = express.Router();
router.use(authenticate);
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const many = async (sql, p = []) => (await db.query(sql, p)).rows;

/* ================= Notifications ================= */
const mapNote = (n) => ({ id: Number(n.id), title: n.title, message: n.message, type: n.type, entityType: n.entity_type, entityId: n.entity_id ? Number(n.entity_id) : null, read: !!n.read_at, readAt: n.read_at, createdAt: n.created_at });

router.get('/notifications', validate(z.object({ unread: z.enum(['true', 'false']).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }), 'query'), async (req, res) => {
  const rows = await many(`SELECT * FROM notifications WHERE user_id=$1 ${req.valid.query.unread === 'true' ? 'AND read_at IS NULL' : ''} ORDER BY created_at DESC, id DESC LIMIT $2`, [req.user.id, req.valid.query.limit]);
  const unread = (await one('SELECT COUNT(*)::int n FROM notifications WHERE user_id=$1 AND read_at IS NULL', [req.user.id])).n;
  res.json({ data: rows.map(mapNote), unreadCount: unread });
});

router.get('/notifications/unread-count', async (req, res) => res.json({ unreadCount: (await one('SELECT COUNT(*)::int n FROM notifications WHERE user_id=$1 AND read_at IS NULL', [req.user.id])).n }));

router.post('/notifications/read-all', async (req, res) => {
  const r = await db.query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
  res.json({ updated: r.rowCount, unreadCount: 0 });
});

router.post('/notifications', requireRole('admin'), validate(z.object({ userId: z.coerce.number().int().positive().optional(), role: z.enum(['admin', 'dispatcher', 'warehouse', 'fleet', 'procurement', 'finance', 'driver', 'client']).optional(),
  title: reqText(160, 'Title'), message: reqText(1000, 'Message'), type: z.enum(['info', 'success', 'warning', 'error']).default('info') })), async (req, res) => {
  const d = req.valid.body;
  if (!d.userId && !d.role) throw E.validation([{ field: 'role', message: 'Choose a user or a role to notify.' }]);
  const payload = { title: d.title, message: d.message, type: d.type };
  const sent = d.userId ? await notifyUsers([d.userId], payload) : await notifyRoles([d.role], payload);
  await audit(req, 'notification.broadcast', null, null, { role: d.role, userId: d.userId, sent });
  res.status(201).json({ sent });
});

router.get('/notifications/:id', validate(idParam, 'params'), async (req, res) => {
  const n = await one('SELECT * FROM notifications WHERE id=$1 AND user_id=$2', [req.valid.params.id, req.user.id]);
  if (!n) throw E.notFound('Notification not found.');
  res.json({ notification: mapNote(n) });
});

router.patch('/notifications/:id/read', validate(idParam, 'params'), async (req, res) => {
  const r = await db.query('UPDATE notifications SET read_at=COALESCE(read_at, now()) WHERE id=$1 AND user_id=$2 RETURNING *', [req.valid.params.id, req.user.id]);
  if (!r.rows[0]) throw E.notFound('Notification not found.');
  const unread = (await one('SELECT COUNT(*)::int n FROM notifications WHERE user_id=$1 AND read_at IS NULL', [req.user.id])).n;
  res.json({ notification: mapNote(r.rows[0]), unreadCount: unread });
});

router.delete('/notifications/:id', validate(idParam, 'params'), async (req, res) => {
  const r = await db.query('DELETE FROM notifications WHERE id=$1 AND user_id=$2', [req.valid.params.id, req.user.id]);
  if (!r.rowCount) throw E.notFound('Notification not found.');
  res.json({ message: 'Notification deleted.' });
});

/* ================= Settings ================= */
const USER_DEFAULTS = { theme: 'light', inAppNotifications: true, emailNotifications: false, language: 'en' };
const userSettingsSchema = z.object({ theme: z.enum(['light', 'dark', 'system']).optional(), inAppNotifications: z.boolean().optional(), emailNotifications: z.boolean().optional(), language: z.enum(['en', 'af', 'zu']).optional() });

async function userSettings(userId) {
  const rows = await many('SELECT key, value FROM settings WHERE user_id=$1', [userId]);
  return { ...USER_DEFAULTS, ...Object.fromEntries(rows.filter((r) => r.key in USER_DEFAULTS).map((r) => [r.key, r.value])) };
}

router.get('/settings/me', async (req, res) => res.json({ settings: await userSettings(req.user.id) }));

router.put('/settings/me', validate(userSettingsSchema), async (req, res) => {
  const entries = Object.entries(req.valid.body);
  if (!entries.length) throw E.validation([{ field: '(root)', message: 'Send at least one setting to change.' }]);
  await db.tx(async (client) => {
    for (const [key, value] of entries) {
      await client.query(`INSERT INTO settings (user_id, key, value) VALUES ($1,$2,$3::jsonb) ON CONFLICT (user_id, key) WHERE user_id IS NOT NULL DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [req.user.id, key, JSON.stringify(value)]);
    }
  });
  res.json({ settings: await userSettings(req.user.id) });
});

const SYSTEM_KEYS = { companyName: z.string().trim().min(1).max(120), supportEmail: emailSchema, tradingHours: z.string().trim().min(1).max(80), vatRate: z.coerce.number().min(0).max(0.5) };
const systemSettings = async () => Object.fromEntries((await many('SELECT key, value FROM settings WHERE user_id IS NULL')).filter((r) => r.key in SYSTEM_KEYS).map((r) => [r.key, r.value]));

router.get('/settings/system', requireRole('admin'), async (req, res) => res.json({ settings: await systemSettings() }));
router.put('/settings/system', requireRole('admin'), validate(z.object(Object.fromEntries(Object.entries(SYSTEM_KEYS).map(([k, v]) => [k, v.optional()])))), async (req, res) => {
  const entries = Object.entries(req.valid.body).filter(([, v]) => v !== undefined);
  if (!entries.length) throw E.validation([{ field: '(root)', message: 'Send at least one setting to change.' }]);
  await db.tx(async (client) => {
    for (const [key, value] of entries) {
      await client.query(`INSERT INTO settings (user_id, key, value) VALUES (NULL,$1,$2::jsonb) ON CONFLICT (key) WHERE user_id IS NULL DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [key, JSON.stringify(value)]);
    }
    await audit(req, 'settings.system_update', 'setting', null, Object.fromEntries(entries), client);
  });
  res.json({ settings: await systemSettings() });
});

/* ================= Documents ================= */
const UPLOAD_MIME = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'text/plain': 'txt', 'text/csv': 'csv' };
const mapDoc = (d) => ({ id: Number(d.id), companyId: d.company_id ? Number(d.company_id) : null, companyName: d.company_name, shipmentId: d.shipment_id ? Number(d.shipment_id) : null, invoiceId: d.invoice_id ? Number(d.invoice_id) : null,
  type: d.type, title: d.title, fileName: d.file_name, mimeType: d.mime_type, uploaded: d.is_base64, createdAt: d.created_at });
const DOC_COLS = 'd.id, d.company_id, d.shipment_id, d.invoice_id, d.type, d.title, d.file_name, d.mime_type, d.is_base64, d.created_at, c.name AS company_name';
const DOC_STAFF = ['admin', 'finance', 'dispatcher'];

router.get('/documents', validate(z.object({ type: z.enum(['invoice', 'receipt', 'pod', 'quotation', 'contract', 'other']).optional(), q: z.string().trim().max(80).optional(), companyId: z.coerce.number().int().optional(), shipmentId: z.coerce.number().int().optional() }), 'query'), async (req, res) => {
  if (req.user.role !== 'client' && !DOC_STAFF.includes(req.user.role)) throw E.forbidden();
  const p = []; const where = [];
  if (req.user.role === 'client') { p.push(req.user.companyId || 0); where.push(`d.company_id=$${p.length}`); }
  else if (req.valid.query.companyId) { p.push(req.valid.query.companyId); where.push(`d.company_id=$${p.length}`); }
  if (req.valid.query.type) { p.push(req.valid.query.type); where.push(`d.type=$${p.length}`); }
  if (req.valid.query.shipmentId) { p.push(req.valid.query.shipmentId); where.push(`d.shipment_id=$${p.length}`); }
  if (req.valid.query.q) { p.push(`%${req.valid.query.q.toLowerCase()}%`); where.push(`lower(d.title) LIKE $${p.length}`); }
  const rows = await many(`SELECT ${DOC_COLS} FROM documents d LEFT JOIN companies c ON c.id=d.company_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d.created_at DESC, d.id DESC LIMIT 300`, p);
  res.json({ data: rows.map(mapDoc) });
});

async function docWithAccess(req, id) {
  const d = await one('SELECT * FROM documents WHERE id=$1', [id]);
  if (!d) throw E.notFound('Document not found.');
  if (req.user.role === 'client') { if (Number(d.company_id) !== req.user.companyId) throw E.notFound('Document not found.'); }
  else if (!DOC_STAFF.includes(req.user.role)) throw E.forbidden();
  return d;
}

router.get('/documents/:id/download', validate(idParam, 'params'), async (req, res) => {
  const d = await docWithAccess(req, req.valid.params.id);
  res.setHeader('Content-Type', d.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${d.file_name.replace(/[^\w.\- ]/g, '_')}"`);
  res.setHeader('Content-Security-Policy', 'sandbox');
  res.send(d.is_base64 ? Buffer.from(d.content, 'base64') : d.content);
});

router.post('/documents', validate(z.object({ title: reqText(160, 'Title'), type: z.enum(['contract', 'other']).default('other'), fileName: reqText(160, 'File name'), mimeType: z.string(),
  contentBase64: z.string({ error: 'File content is required.' }).min(1), companyId: z.coerce.number().int().positive().optional(), shipmentId: z.coerce.number().int().positive().optional() })), async (req, res) => {
  if (req.user.role !== 'client' && !DOC_STAFF.includes(req.user.role)) throw E.forbidden();
  const d = req.valid.body;
  if (!UPLOAD_MIME[d.mimeType]) throw E.unprocessable('Only PDF, PNG, JPEG, TXT and CSV files can be uploaded.', 'UNSUPPORTED_FILE_TYPE');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(d.contentBase64)) throw E.unprocessable('File content is not valid base64.', 'INVALID_FILE');
  const size = Buffer.from(d.contentBase64, 'base64').length;
  if (size === 0 || size > 2 * 1024 * 1024) throw E.unprocessable('Files must be between 1 byte and 2 MB.', 'FILE_TOO_LARGE');
  const companyId = req.user.role === 'client' ? req.user.companyId : (d.companyId || null);
  if (req.user.role !== 'client' && !companyId) throw E.validation([{ field: 'companyId', message: 'Choose which company this document belongs to.' }]);
  const r = await one(`INSERT INTO documents (company_id, shipment_id, type, title, file_name, mime_type, content, is_base64, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8) RETURNING id`,
    [companyId, req.user.role === 'client' ? null : (d.shipmentId || null), d.type, d.title, d.fileName, d.mimeType, d.contentBase64.replace(/\s/g, ''), req.user.id]);
  await audit(req, 'document.upload', 'document', r.id);
  res.status(201).json({ id: Number(r.id), message: 'Document uploaded.' });
});

router.delete('/documents/:id', validate(idParam, 'params'), async (req, res) => {
  const d = await docWithAccess(req, req.valid.params.id);
  const own = req.user.role === 'client' && d.is_base64 && Number(d.uploaded_by) === req.user.id;
  if (!(own || ['admin'].includes(req.user.role))) throw E.forbidden('You can only delete documents you uploaded.');
  await db.query('DELETE FROM documents WHERE id=$1', [d.id]);
  await audit(req, 'document.delete', 'document', d.id);
  res.json({ message: 'Document deleted.' });
});

/* ================= Support ================= */
const mapSupport = (s) => ({ id: Number(s.id), reference: s.reference, category: s.category, subject: s.subject, message: s.message, status: s.status, response: s.response, companyName: s.company_name, userName: s.user_name, createdAt: s.created_at, updatedAt: s.updated_at });
const SUP_SELECT = 'SELECT s.*, c.name AS company_name, u.full_name AS user_name FROM support_requests s LEFT JOIN companies c ON c.id=s.company_id LEFT JOIN users u ON u.id=s.user_id';

router.post('/support', requireRole('client'), validate(z.object({ category: z.enum(['general', 'shipment', 'billing', 'technical', 'account']).default('general'), subject: reqText(160, 'Subject'), message: reqText(3000, 'Message') })), async (req, res) => {
  const d = req.valid.body;
  const dup = await one(`SELECT 1 FROM support_requests WHERE user_id=$1 AND subject=$2 AND message=$3 AND created_at > now() - interval '60 seconds'`, [req.user.id, d.subject, d.message]);
  if (dup) throw E.conflict('This request was already submitted a moment ago.', 'DUPLICATE_SUBMISSION');
  const r = await one(`INSERT INTO support_requests (reference, user_id, company_id, category, subject, message) VALUES ('SR-' || nextval('support_ref_seq'),$1,$2,$3,$4,$5) RETURNING id`, [req.user.id, req.user.companyId, d.category, d.subject, d.message]);
  await notifyRoles(['admin', 'dispatcher'], { title: 'New support request', message: `${req.user.fullName}: ${d.subject}`, type: 'info', entityType: 'support', entityId: r.id });
  res.status(201).json({ request: mapSupport(await one(`${SUP_SELECT} WHERE s.id=$1`, [r.id])) });
});

router.get('/support', validate(z.object({ status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional() }), 'query'), async (req, res) => {
  if (!['client', 'admin', 'dispatcher'].includes(req.user.role)) throw E.forbidden();
  const p = []; const where = [];
  if (req.user.role === 'client') { p.push(req.user.id); where.push(`s.user_id=$${p.length}`); }
  if (req.valid.query.status) { p.push(req.valid.query.status); where.push(`s.status=$${p.length}`); }
  res.json({ data: (await many(`${SUP_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.created_at DESC, s.id DESC LIMIT 200`, p)).map(mapSupport) });
});

router.get('/support/:id', validate(idParam, 'params'), async (req, res) => {
  if (!['client', 'admin', 'dispatcher'].includes(req.user.role)) throw E.forbidden();
  const s = await one(`${SUP_SELECT} WHERE s.id=$1`, [req.valid.params.id]);
  if (!s || (req.user.role === 'client' && Number(s.user_id) !== req.user.id)) throw E.notFound('Support request not found.');
  res.json({ request: mapSupport(s) });
});

router.patch('/support/:id', requireRole('admin', 'dispatcher'), validate(idParam, 'params'), validate(z.object({ status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(), response: optionalText(3000) })), async (req, res) => {
  const d = req.valid.body;
  if (!d.status && !d.response) throw E.validation([{ field: 'status', message: 'Change the status or write a response.' }]);
  const r = await one(`UPDATE support_requests SET status=COALESCE($2,status), response=COALESCE($3,response), responded_by=$4, updated_at=now() WHERE id=$1 RETURNING *`, [req.valid.params.id, d.status ?? null, d.response ?? null, req.user.id]);
  if (!r) throw E.notFound('Support request not found.');
  await notifyUsers([r.user_id], { title: 'Support request updated', message: `${r.reference}: status is now ${r.status}.`, type: 'info', entityType: 'support', entityId: r.id });
  await audit(req, 'support.update', 'support', r.id, d);
  res.json({ request: mapSupport(await one(`${SUP_SELECT} WHERE s.id=$1`, [r.id])) });
});

/* ================= Dashboards (all numbers computed from the database) ================= */
const card = (key, label, value, kind = 'number') => ({ key, label, value: kind === 'currency' ? round2(value) : Number(value), kind });

router.get('/dashboard', async (req, res) => {
  const { role, id: uid, companyId, driverId } = req.user;
  const cards = []; let recent = null;
  const unread = (await one('SELECT COUNT(*)::int n FROM notifications WHERE user_id=$1 AND read_at IS NULL', [uid])).n;
  const shipCounts = Object.fromEntries((await many('SELECT status, COUNT(*)::int n FROM shipments GROUP BY status')).map((r) => [r.status, r.n]));

  if (role === 'admin') {
    const u = await one(`SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status='active')::int active FROM users`);
    cards.push(card('users', 'Active users', u.active), card('companies', 'Companies', (await one('SELECT COUNT(*)::int n FROM companies')).n),
      card('shipments', 'Shipments in progress', (shipCounts.assigned || 0) + (shipCounts.collected || 0) + (shipCounts.in_transit || 0)),
      card('quotations', 'Quotations awaiting action', (await one(`SELECT COUNT(*)::int n FROM quotations WHERE status IN ('submitted','in_review')`)).n),
      card('support', 'Open support requests', (await one(`SELECT COUNT(*)::int n FROM support_requests WHERE status IN ('open','in_progress')`)).n),
      card('audit24', 'Audit events (24h)', (await one(`SELECT COUNT(*)::int n FROM audit_logs WHERE created_at > now() - interval '24 hours'`)).n));
    recent = { title: 'Recent activity', items: (await many(`SELECT a.action, a.created_at, u.full_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC, a.id DESC LIMIT 6`)).map((r) => ({ title: r.action, subtitle: r.full_name || 'System', at: r.created_at })) };
  } else if (role === 'dispatcher') {
    cards.push(card('pending', 'Pending shipments', shipCounts.pending || 0), card('assigned', 'Assigned / scheduled', shipCounts.assigned || 0), card('inTransit', 'In transit', (shipCounts.collected || 0) + (shipCounts.in_transit || 0)),
      card('drivers', 'Available drivers', (await one(`SELECT COUNT(*)::int n FROM drivers d JOIN users u ON u.id=d.user_id WHERE d.status='available' AND u.status='active'`)).n),
      card('vehicles', 'Available vehicles', (await one(`SELECT COUNT(*)::int n FROM vehicles WHERE status='available'`)).n),
      card('toConvert', 'Accepted quotations to convert', (await one(`SELECT COUNT(*)::int n FROM quotations WHERE status='accepted'`)).n));
    recent = { title: 'Latest shipments', items: (await many(`SELECT s.tracking_ref, s.status, s.destination, s.created_at FROM shipments s ORDER BY s.created_at DESC, s.id DESC LIMIT 6`)).map((r) => ({ title: r.tracking_ref, subtitle: `${r.status} - ${r.destination}`, at: r.created_at })) };
  } else if (role === 'warehouse') {
    cards.push(card('items', 'Stock items', (await one('SELECT COUNT(*)::int n FROM inventory')).n), card('units', 'Total units on hand', (await one('SELECT COALESCE(SUM(quantity),0)::int n FROM inventory')).n),
      card('low', 'Low-stock items', (await one('SELECT COUNT(*)::int n FROM inventory WHERE quantity <= reorder_level')).n),
      card('moves7', 'Movements (7 days)', (await one(`SELECT COUNT(*)::int n FROM stock_movements WHERE created_at > now() - interval '7 days'`)).n),
      card('warehouses', 'Active warehouses', (await one(`SELECT COUNT(*)::int n FROM warehouses WHERE status='active'`)).n));
    recent = { title: 'Latest stock movements', items: (await many(`SELECT m.type, m.quantity, m.created_at, i.name FROM stock_movements m JOIN inventory i ON i.id=m.inventory_id ORDER BY m.created_at DESC, m.id DESC LIMIT 6`)).map((r) => ({ title: r.name, subtitle: `${r.type} (${r.quantity > 0 ? '+' : ''}${r.quantity})`, at: r.created_at })) };
  } else if (role === 'fleet') {
    const vc = Object.fromEntries((await many('SELECT status, COUNT(*)::int n FROM vehicles GROUP BY status')).map((r) => [r.status, r.n]));
    cards.push(card('available', 'Available vehicles', vc.available || 0), card('onRoute', 'On route / assigned', (vc.on_route || 0) + (vc.assigned || 0)), card('maintenance', 'In maintenance', vc.maintenance || 0),
      card('serviceDue', 'Service due within 30 days', (await one(`SELECT COUNT(*)::int n FROM vehicles WHERE status<>'retired' AND next_service_date <= CURRENT_DATE + 30`)).n),
      card('fuelMonth', 'Fuel spend this month', (await one(`SELECT COALESCE(SUM(total_cost),0) n FROM fuel_transactions WHERE fuelled_at >= date_trunc('month', now())`)).n, 'currency'),
      card('incidents', 'Open incidents', (await one(`SELECT COUNT(*)::int n FROM incidents WHERE status<>'resolved'`)).n));
    recent = { title: 'Maintenance coming up', items: (await many(`SELECT m.type, m.scheduled_date, v.registration FROM maintenance_records m JOIN vehicles v ON v.id=m.vehicle_id WHERE m.status IN ('scheduled','in_progress') ORDER BY m.scheduled_date LIMIT 6`)).map((r) => ({ title: r.registration, subtitle: r.type, at: r.scheduled_date })) };
  } else if (role === 'procurement') {
    cards.push(card('quotes', 'Quotations to process', (await one(`SELECT COUNT(*)::int n FROM quotations WHERE status IN ('submitted','in_review')`)).n), card('prs', 'Pending purchase requests', (await one(`SELECT COUNT(*)::int n FROM purchase_requests WHERE status='pending'`)).n),
      card('pos', 'Open purchase orders', (await one(`SELECT COUNT(*)::int n FROM purchase_orders WHERE status IN ('pending','approved','ordered')`)).n),
      card('suppliers', 'Active suppliers', (await one(`SELECT COUNT(*)::int n FROM suppliers WHERE status='active'`)).n),
      card('payable', 'Unpaid supplier invoices', (await one(`SELECT COALESCE(SUM(amount),0) n FROM supplier_invoices WHERE status='unpaid'`)).n, 'currency'));
    recent = { title: 'Latest purchase orders', items: (await many(`SELECT o.po_number, o.item, o.status, o.created_at FROM purchase_orders o ORDER BY o.id DESC LIMIT 6`)).map((r) => ({ title: r.po_number, subtitle: `${r.item} - ${r.status}`, at: r.created_at })) };
  } else if (role === 'finance') {
    const open = await one(`SELECT COALESCE(SUM(balance),0) AS outstanding, COALESCE(SUM(balance) FILTER (WHERE display_status='overdue'),0) AS overdue, COUNT(*)::int AS n
      FROM (SELECT i.status, i.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id),0) AS balance,
        CASE WHEN i.status IN ('unpaid','partially_paid') AND i.due_date < CURRENT_DATE THEN 'overdue' ELSE i.status END AS display_status FROM invoices i) x WHERE x.status IN ('unpaid','partially_paid')`);
    cards.push(card('outstanding', 'Outstanding receivables', open.outstanding, 'currency'), card('overdue', 'Overdue amount', open.overdue, 'currency'), card('openInvoices', 'Open invoices', open.n),
      card('collected', 'Collected this month', (await one(`SELECT COALESCE(SUM(amount),0) n FROM payments WHERE paid_at >= date_trunc('month', now())`)).n, 'currency'),
      card('payables', 'Unpaid supplier invoices', (await one(`SELECT COALESCE(SUM(amount),0) n FROM supplier_invoices WHERE status='unpaid'`)).n, 'currency'),
      card('pendingExp', 'Expenses awaiting approval', (await one(`SELECT COUNT(*)::int n FROM expenses WHERE status='pending'`)).n));
    recent = { title: 'Delivered, not yet invoiced', items: (await many(`SELECT s.tracking_ref, c.name, s.delivered_at FROM shipments s JOIN companies c ON c.id=s.company_id WHERE s.status='delivered'
      AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.shipment_id=s.id AND i.status<>'cancelled') ORDER BY s.delivered_at DESC LIMIT 6`)).map((r) => ({ title: r.tracking_ref, subtitle: r.name, at: r.delivered_at })) };
  } else if (role === 'driver') {
    const d = driverId || 0;
    cards.push(card('assigned', 'Assigned deliveries', (await one(`SELECT COUNT(*)::int n FROM delivery_assignments WHERE driver_id=$1 AND status='assigned'`, [d])).n),
      card('active', 'In progress', (await one(`SELECT COUNT(*)::int n FROM delivery_assignments WHERE driver_id=$1 AND status='active'`, [d])).n),
      card('completed', 'Completed deliveries', (await one(`SELECT COUNT(*)::int n FROM delivery_assignments WHERE driver_id=$1 AND status='completed'`, [d])).n),
      card('incidents', 'Open incidents reported', (await one(`SELECT COUNT(*)::int n FROM incidents WHERE driver_id=$1 AND status<>'resolved'`, [d])).n));
    recent = { title: 'Upcoming deliveries', items: (await many(`SELECT s.tracking_ref, s.destination, a.scheduled_pickup FROM delivery_assignments a JOIN shipments s ON s.id=a.shipment_id WHERE a.driver_id=$1 AND a.status IN ('assigned','active') ORDER BY a.scheduled_pickup NULLS LAST LIMIT 6`, [d])).map((r) => ({ title: r.tracking_ref, subtitle: r.destination, at: r.scheduled_pickup })) };
  } else {
    const c = companyId || 0;
    const inv = await one(`SELECT COUNT(*)::int n, COALESCE(SUM(balance),0) AS bal FROM (SELECT i.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id),0) AS balance FROM invoices i
      WHERE i.company_id=$1 AND i.status IN ('unpaid','partially_paid')) x`, [c]);
    cards.push(card('active', 'Active shipments', (await one(`SELECT COUNT(*)::int n FROM shipments WHERE company_id=$1 AND status IN ('pending','assigned','collected','in_transit')`, [c])).n),
      card('delivered', 'Delivered shipments', (await one(`SELECT COUNT(*)::int n FROM shipments WHERE company_id=$1 AND status='delivered'`, [c])).n),
      card('quotes', 'Open quotations', (await one(`SELECT COUNT(*)::int n FROM quotations WHERE company_id=$1 AND status IN ('submitted','in_review','quoted','accepted')`, [c])).n),
      card('unpaid', 'Unpaid invoices', inv.n), card('balance', 'Outstanding balance', inv.bal, 'currency'));
    recent = { title: 'Latest shipments', items: (await many(`SELECT tracking_ref, status, destination, created_at FROM shipments WHERE company_id=$1 ORDER BY created_at DESC, id DESC LIMIT 6`, [c])).map((r) => ({ title: r.tracking_ref, subtitle: `${r.status} - ${r.destination}`, at: r.created_at })) };
  }
  res.json({ role, cards, recent, unreadNotifications: unread });
});

/* ================= Reports ================= */
const REPORT_ROLES = { shipments: ['dispatcher', 'admin', 'finance'], inventory: ['warehouse', 'admin'], fleet: ['fleet', 'admin'], procurement: ['procurement', 'admin', 'finance'], finance: ['finance', 'admin'] };
const table = (name, rows) => ({ name, columns: rows[0] ? Object.keys(rows[0]) : [], rows });

const REPORTS = {
  async shipments() {
    const byStatus = await many('SELECT status, COUNT(*)::int AS shipments FROM shipments GROUP BY status ORDER BY status');
    const byCompany = await many(`SELECT c.name AS company, COUNT(*)::int AS shipments, COUNT(*) FILTER (WHERE s.status='delivered')::int AS delivered FROM shipments s JOIN companies c ON c.id=s.company_id GROUP BY c.name ORDER BY shipments DESC LIMIT 15`);
    const avg = await one(`SELECT ROUND(AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))/86400)::numeric,1) AS days FROM shipments WHERE status='delivered' AND delivered_at IS NOT NULL`);
    const total = (await one('SELECT COUNT(*)::int n FROM shipments')).n;
    return { title: 'Shipment report', summary: [{ label: 'Total shipments', value: total }, { label: 'Delivered', value: byStatus.find((x) => x.status === 'delivered')?.shipments || 0 }, { label: 'Average days to deliver', value: avg.days === null ? 0 : Number(avg.days) }], tables: [table('By status', byStatus), table('By client', byCompany)] };
  },
  async inventory() {
    const perWh = await many(`SELECT w.name AS warehouse, COUNT(i.id)::int AS items, COALESCE(SUM(i.quantity),0)::int AS units FROM warehouses w LEFT JOIN inventory i ON i.warehouse_id=w.id GROUP BY w.name, w.id ORDER BY w.id`);
    const low = await many(`SELECT w.name AS warehouse, i.sku, i.name AS item, i.quantity, i.reorder_level FROM inventory i JOIN warehouses w ON w.id=i.warehouse_id WHERE i.quantity <= i.reorder_level ORDER BY i.quantity`);
    const moves = await many(`SELECT type, COUNT(*)::int AS movements, SUM(quantity)::int AS net_units FROM stock_movements WHERE created_at > now() - interval '30 days' GROUP BY type ORDER BY type`);
    return { title: 'Inventory report', summary: [{ label: 'Stock lines', value: perWh.reduce((a, r) => a + r.items, 0) }, { label: 'Units on hand', value: perWh.reduce((a, r) => a + r.units, 0) }, { label: 'Low-stock lines', value: low.length }],
      tables: [table('Stock by warehouse', perWh), table('Low-stock items', low), table('Movements (30 days)', moves)] };
  },
  async fleet() {
    const status = await many('SELECT status, COUNT(*)::int AS vehicles FROM vehicles GROUP BY status ORDER BY status');
    const fuel = await many(`SELECT v.registration, ROUND(SUM(f.litres),1) AS litres, ROUND(SUM(f.total_cost),2) AS fuel_cost FROM fuel_transactions f JOIN vehicles v ON v.id=f.vehicle_id GROUP BY v.registration ORDER BY fuel_cost DESC`);
    const maint = await one(`SELECT COALESCE(SUM(cost),0) AS cost FROM maintenance_records WHERE status='completed' AND completed_date > CURRENT_DATE - 90`);
    return { title: 'Fleet report', summary: [{ label: 'Vehicles', value: status.reduce((a, r) => a + r.vehicles, 0) }, { label: 'Maintenance spend (90 days)', value: round2(maint.cost), kind: 'currency' }, { label: 'Fuel spend (all time)', value: round2(fuel.reduce((a, r) => a + Number(r.fuel_cost), 0)), kind: 'currency' }],
      tables: [table('Vehicles by status', status), table('Fuel by vehicle', fuel)] };
  },
  async procurement() {
    const pos = await many(`SELECT status, COUNT(*)::int AS orders, ROUND(SUM(quantity*unit_cost),2) AS value FROM purchase_orders GROUP BY status ORDER BY status`);
    const spend = await many(`SELECT s.name AS supplier, COUNT(o.id)::int AS orders, ROUND(SUM(o.quantity*o.unit_cost),2) AS value FROM purchase_orders o JOIN suppliers s ON s.id=o.supplier_id WHERE o.status<>'cancelled' GROUP BY s.name ORDER BY value DESC`);
    const prs = await many('SELECT status, COUNT(*)::int AS requests FROM purchase_requests GROUP BY status ORDER BY status');
    return { title: 'Procurement summary', summary: [{ label: 'Purchase orders', value: pos.reduce((a, r) => a + r.orders, 0) }, { label: 'Order value (excl. cancelled)', value: round2(spend.reduce((a, r) => a + Number(r.value), 0)), kind: 'currency' }], tables: [table('Orders by status', pos), table('Spend by supplier', spend), table('Requests by status', prs)] };
  },
  async finance() {
    const monthly = await many(`SELECT to_char(date_trunc('month', issue_date),'YYYY-MM') AS month, COUNT(*)::int AS invoices, ROUND(SUM(total),2) AS invoiced FROM invoices WHERE status<>'cancelled' GROUP BY 1 ORDER BY 1`);
    const collected = await many(`SELECT to_char(date_trunc('month', paid_at),'YYYY-MM') AS month, ROUND(SUM(amount),2) AS collected FROM payments GROUP BY 1 ORDER BY 1`);
    const exp = await many(`SELECT category, ROUND(SUM(amount),2) AS approved_total FROM expenses WHERE status='approved' GROUP BY category ORDER BY approved_total DESC`);
    const t = await one(`SELECT COALESCE((SELECT SUM(total) FROM invoices WHERE status<>'cancelled'),0) AS invoiced, COALESCE((SELECT SUM(amount) FROM payments),0) AS collected, COALESCE((SELECT SUM(amount) FROM expenses WHERE status='approved'),0) AS expenses`);
    return { title: 'Financial report', summary: [{ label: 'Total invoiced', value: round2(t.invoiced), kind: 'currency' }, { label: 'Total collected', value: round2(t.collected), kind: 'currency' }, { label: 'Outstanding', value: round2(t.invoiced - t.collected), kind: 'currency' }, { label: 'Approved expenses', value: round2(t.expenses), kind: 'currency' }],
      tables: [table('Invoiced by month', monthly), table('Collected by month', collected), table('Expenses by category', exp)] };
  },
};

router.get('/reports/:name', validate(z.object({ format: z.enum(['json', 'csv']).default('json'), table: z.coerce.number().int().min(0).max(5).default(0) }), 'query'), async (req, res) => {
  const name = req.params.name;
  if (!REPORTS[name]) throw E.notFound('Unknown report.');
  if (!REPORT_ROLES[name].includes(req.user.role)) throw E.forbidden();
  const report = await REPORTS[name]();
  if (req.valid.query.format === 'csv') {
    const t = report.tables[req.valid.query.table];
    if (!t) throw E.notFound('That report table does not exist.');
    return sendCsv(res, `${name}-report.csv`, t.rows, t.columns);
  }
  return res.json({ ...report, generatedAt: new Date().toISOString() });
});

module.exports = router;
