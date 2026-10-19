'use strict';

const express = require('express');
const db = require('../config/db');
const { E } = require('../utils/errors');
const { validate, z, idParam, isoDate, reqText, optionalText, money, positiveMoney, emailSchema } = require('../utils/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { notifyUsers } = require('../services/notify');
const { applyMovement } = require('./warehouse');

const router = express.Router();
router.use(authenticate);

const PROC = ['procurement', 'admin'];
const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number.');

/* ---------- Suppliers ---------- */
const mapSupplier = (s) => ({ id: Number(s.id), code: s.code, name: s.name, category: s.category, contactName: s.contact_name, email: s.email, phone: s.phone, status: s.status });

router.get('/suppliers', requireRole('procurement', 'admin', 'finance', 'warehouse', 'fleet'), validate(z.object({ q: z.string().trim().max(80).optional(), status: z.enum(['active', 'inactive']).optional() }), 'query'), async (req, res) => {
  const p = []; const where = [];
  if (req.valid.query.q) { p.push(`%${req.valid.query.q.toLowerCase()}%`); where.push(`(lower(name) LIKE $${p.length} OR lower(code) LIKE $${p.length} OR lower(category) LIKE $${p.length})`); }
  if (req.valid.query.status) { p.push(req.valid.query.status); where.push(`status=$${p.length}`); }
  const rows = (await db.query(`SELECT * FROM suppliers ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`, p)).rows;
  res.json({ data: rows.map(mapSupplier) });
});

router.post('/suppliers', requireRole(...PROC), validate(z.object({ name: reqText(160, 'Supplier name'), category: reqText(60, 'Category'), contactName: optionalText(120), email: emailSchema.optional(), phone: phone.optional() })), async (req, res) => {
  const d = req.valid.body;
  const r = await db.query(`INSERT INTO suppliers (code, name, category, contact_name, email, phone) VALUES ('SUP-' || lpad((SELECT COALESCE(MAX(id),0)+1 FROM suppliers)::text, 3, '0') || upper(substr(md5(random()::text),1,2)), $1,$2,$3,$4,$5) RETURNING *`,
    [d.name, d.category, d.contactName ?? null, d.email ?? null, d.phone ?? null]);
  await audit(req, 'supplier.create', 'supplier', r.rows[0].id);
  res.status(201).json({ supplier: mapSupplier(r.rows[0]) });
});

router.patch('/suppliers/:id', requireRole(...PROC), validate(idParam, 'params'), validate(z.object({ name: reqText(160).optional(), category: reqText(60).optional(), contactName: optionalText(120), email: emailSchema.optional(), phone: phone.optional(), status: z.enum(['active', 'inactive']).optional() })), async (req, res) => {
  const d = req.valid.body;
  const r = await db.query(`UPDATE suppliers SET name=COALESCE($2,name), category=COALESCE($3,category), contact_name=COALESCE($4,contact_name), email=COALESCE($5,email), phone=COALESCE($6,phone), status=COALESCE($7,status) WHERE id=$1 RETURNING *`,
    [req.valid.params.id, d.name ?? null, d.category ?? null, d.contactName ?? null, d.email ?? null, d.phone ?? null, d.status ?? null]);
  if (!r.rows[0]) throw E.notFound('Supplier not found.');
  await audit(req, 'supplier.update', 'supplier', req.valid.params.id, d);
  res.json({ supplier: mapSupplier(r.rows[0]) });
});

router.delete('/suppliers/:id', requireRole(...PROC), validate(idParam, 'params'), async (req, res) => {
  const r = await db.query('DELETE FROM suppliers WHERE id=$1 RETURNING id', [req.valid.params.id]).catch((err) => {
    if (err.code === '23503') throw E.conflict('This supplier has orders or invoices and cannot be deleted. Mark it inactive instead.', 'SUPPLIER_IN_USE');
    throw err;
  });
  if (!r.rowCount) throw E.notFound('Supplier not found.');
  await audit(req, 'supplier.delete', 'supplier', req.valid.params.id);
  res.json({ message: 'Supplier deleted.' });
});

/* ---------- Purchase requests ---------- */
const mapPR = (r) => ({ id: Number(r.id), reference: r.reference, requestedBy: r.requested_by_name, requestedById: r.requested_by ? Number(r.requested_by) : null, item: r.item, quantity: r.quantity,
  estimatedCost: Number(r.estimated_cost), justification: r.justification, status: r.status, decidedAt: r.decided_at, createdAt: r.created_at });
const PR_SELECT = 'SELECT r.*, u.full_name AS requested_by_name FROM purchase_requests r LEFT JOIN users u ON u.id=r.requested_by';

router.get('/purchase-requests', requireRole('procurement', 'admin', 'finance', 'warehouse', 'fleet'), validate(z.object({ status: z.enum(['pending', 'approved', 'rejected', 'ordered']).optional() }), 'query'), async (req, res) => {
  const p = []; const where = [];
  if (['warehouse', 'fleet'].includes(req.user.role)) { p.push(req.user.id); where.push(`r.requested_by=$${p.length}`); }
  if (req.valid.query.status) { p.push(req.valid.query.status); where.push(`r.status=$${p.length}`); }
  const rows = (await db.query(`${PR_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.created_at DESC, r.id DESC LIMIT 300`, p)).rows;
  res.json({ data: rows.map(mapPR) });
});

router.post('/purchase-requests', requireRole('procurement', 'admin', 'warehouse', 'fleet'), validate(z.object({ item: reqText(160, 'Item'), quantity: z.coerce.number({ error: 'Quantity is required.' }).int().positive('Quantity must be at least 1.').max(1000000),
  estimatedCost: money, justification: optionalText(300) })), async (req, res) => {
  const d = req.valid.body;
  const r = await db.query(`INSERT INTO purchase_requests (reference, requested_by, item, quantity, estimated_cost, justification) VALUES ('PR-' || nextval('pr_ref_seq'),$1,$2,$3,$4,$5) RETURNING id`,
    [req.user.id, d.item, d.quantity, d.estimatedCost, d.justification ?? null]);
  const pr = (await db.query(`${PR_SELECT} WHERE r.id=$1`, [r.rows[0].id])).rows[0];
  const procs = (await db.query(`SELECT ur.user_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE r.code='procurement'`)).rows.map((x) => x.user_id);
  await notifyUsers(procs, { title: 'New purchase request', message: `${req.user.fullName} requested ${d.quantity} x ${d.item} (${pr.reference}).`, type: 'info', entityType: 'purchase_request', entityId: pr.id });
  await audit(req, 'purchase_request.create', 'purchase_request', pr.id);
  res.status(201).json({ request: mapPR(pr) });
});

router.patch('/purchase-requests/:id/decision', requireRole(...PROC), validate(idParam, 'params'), validate(z.object({ decision: z.enum(['approve', 'reject']) })), async (req, res) => {
  const id = req.valid.params.id;
  await db.tx(async (client) => {
    const cur = (await client.query('SELECT * FROM purchase_requests WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw E.notFound('Purchase request not found.');
    if (cur.status !== 'pending') throw E.conflict(`This request is already ${cur.status}.`, 'INVALID_STATE');
    const next = req.valid.body.decision === 'approve' ? 'approved' : 'rejected';
    await client.query('UPDATE purchase_requests SET status=$2, decided_by=$3, decided_at=now() WHERE id=$1', [id, next, req.user.id]);
    await notifyUsers([cur.requested_by], { title: `Purchase request ${next}`, message: `${cur.reference} (${cur.item}) was ${next}.`, type: next === 'approved' ? 'success' : 'warning', entityType: 'purchase_request', entityId: id }, client);
    await audit(req, `purchase_request.${next}`, 'purchase_request', id, null, client);
  });
  res.json({ request: mapPR((await db.query(`${PR_SELECT} WHERE r.id=$1`, [id])).rows[0]) });
});

/* ---------- Purchase orders ---------- */
const mapPO = (o) => ({ id: Number(o.id), poNumber: o.po_number, supplierId: Number(o.supplier_id), supplierName: o.supplier_name, purchaseRequestId: o.purchase_request_id ? Number(o.purchase_request_id) : null,
  item: o.item, quantity: o.quantity, unitCost: Number(o.unit_cost), total: Math.round(o.quantity * Number(o.unit_cost) * 100) / 100, quantityReceived: o.quantity_received || 0, status: o.status, orderedAt: o.ordered_at, createdAt: o.created_at });
const PO_SELECT = `SELECT o.*, s.name AS supplier_name, COALESCE((SELECT SUM(quantity_received)::int FROM goods_received g WHERE g.purchase_order_id=o.id),0) AS quantity_received
  FROM purchase_orders o JOIN suppliers s ON s.id=o.supplier_id`;
const PO_FLOW = { draft: ['pending', 'cancelled'], pending: ['approved', 'cancelled'], approved: ['ordered', 'cancelled'], ordered: ['cancelled'], received: [], cancelled: [] };

router.get('/purchase-orders', requireRole('procurement', 'admin', 'finance', 'warehouse'), validate(z.object({ status: z.enum(['draft', 'pending', 'approved', 'ordered', 'received', 'cancelled']).optional(), supplierId: z.coerce.number().int().optional() }), 'query'), async (req, res) => {
  const p = []; const where = [];
  if (req.valid.query.status) { p.push(req.valid.query.status); where.push(`o.status=$${p.length}`); }
  if (req.valid.query.supplierId) { p.push(req.valid.query.supplierId); where.push(`o.supplier_id=$${p.length}`); }
  const rows = (await db.query(`${PO_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.id DESC LIMIT 300`, p)).rows;
  res.json({ data: rows.map(mapPO) });
});

router.post('/purchase-orders', requireRole(...PROC), validate(z.object({ supplierId: z.coerce.number({ error: 'Choose a supplier.' }).int().positive(), purchaseRequestId: z.coerce.number().int().positive().optional(),
  item: reqText(160, 'Item'), quantity: z.coerce.number({ error: 'Quantity is required.' }).int().positive().max(1000000), unitCost: positiveMoney })), async (req, res) => {
  const d = req.valid.body;
  const id = await db.tx(async (client) => {
    const sup = (await client.query(`SELECT status FROM suppliers WHERE id=$1`, [d.supplierId])).rows[0];
    if (!sup) throw E.unprocessable('That supplier does not exist.', 'INVALID_SUPPLIER');
    if (sup.status !== 'active') throw E.unprocessable('That supplier is inactive.', 'SUPPLIER_INACTIVE');
    if (d.purchaseRequestId) {
      const pr = (await client.query('SELECT status FROM purchase_requests WHERE id=$1 FOR UPDATE', [d.purchaseRequestId])).rows[0];
      if (!pr) throw E.unprocessable('That purchase request does not exist.', 'INVALID_REQUEST');
      if (pr.status !== 'approved') throw E.unprocessable('Only an approved purchase request can be turned into an order.', 'REQUEST_NOT_APPROVED');
      await client.query(`UPDATE purchase_requests SET status='ordered' WHERE id=$1`, [d.purchaseRequestId]);
    }
    const r = await client.query(`INSERT INTO purchase_orders (po_number, supplier_id, purchase_request_id, item, quantity, unit_cost, created_by) VALUES ('PO-' || nextval('po_ref_seq'),$1,$2,$3,$4,$5,$6) RETURNING id`,
      [d.supplierId, d.purchaseRequestId || null, d.item, d.quantity, d.unitCost, req.user.id]);
    await audit(req, 'purchase_order.create', 'purchase_order', r.rows[0].id, null, client);
    return r.rows[0].id;
  });
  res.status(201).json({ order: mapPO((await db.query(`${PO_SELECT} WHERE o.id=$1`, [id])).rows[0]) });
});

router.patch('/purchase-orders/:id/status', requireRole(...PROC), validate(idParam, 'params'), validate(z.object({ status: z.enum(['pending', 'approved', 'ordered', 'cancelled']) })), async (req, res) => {
  const id = req.valid.params.id; const next = req.valid.body.status;
  await db.tx(async (client) => {
    const cur = (await client.query('SELECT * FROM purchase_orders WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw E.notFound('Purchase order not found.');
    if (!PO_FLOW[cur.status].includes(next)) throw E.conflict(`A "${cur.status}" order cannot move to "${next}".`, 'INVALID_STATE');
    if (next === 'cancelled') {
      const got = (await client.query('SELECT COUNT(*)::int n FROM goods_received WHERE purchase_order_id=$1', [id])).rows[0].n;
      if (got) throw E.conflict('Goods have already been received against this order.', 'INVALID_STATE');
    }
    await client.query(`UPDATE purchase_orders SET status=$2::text, ordered_at=CASE WHEN $2::text='ordered' THEN now() ELSE ordered_at END WHERE id=$1`, [id, next]);
    await audit(req, `purchase_order.${next}`, 'purchase_order', id, null, client);
  });
  res.json({ order: mapPO((await db.query(`${PO_SELECT} WHERE o.id=$1`, [id])).rows[0]) });
});

/* ---------- Goods received ---------- */
router.get('/goods-received', requireRole('procurement', 'admin', 'finance', 'warehouse'), async (req, res) => {
  const rows = (await db.query(`SELECT g.*, o.po_number, o.item, w.name AS warehouse_name, u.full_name AS by_name FROM goods_received g JOIN purchase_orders o ON o.id=g.purchase_order_id
    JOIN warehouses w ON w.id=g.warehouse_id LEFT JOIN users u ON u.id=g.received_by ORDER BY g.received_at DESC, g.id DESC LIMIT 300`)).rows;
  res.json({ data: rows.map((g) => ({ id: Number(g.id), purchaseOrderId: Number(g.purchase_order_id), poNumber: g.po_number, item: g.item, warehouseName: g.warehouse_name, inventoryId: g.inventory_id ? Number(g.inventory_id) : null,
    quantityReceived: g.quantity_received, note: g.note, receivedBy: g.by_name, receivedAt: g.received_at })) });
});

router.post('/goods-received', requireRole('procurement', 'admin', 'warehouse'), validate(z.object({ purchaseOrderId: z.coerce.number({ error: 'Choose a purchase order.' }).int().positive(), warehouseId: z.coerce.number({ error: 'Choose a warehouse.' }).int().positive(),
  quantityReceived: z.coerce.number({ error: 'Quantity is required.' }).int().positive('Quantity must be at least 1.'), inventoryId: z.coerce.number().int().positive().optional(), note: optionalText(300) })), async (req, res) => {
  const d = req.valid.body;
  const id = await db.tx(async (client) => {
    const po = (await client.query('SELECT * FROM purchase_orders WHERE id=$1 FOR UPDATE', [d.purchaseOrderId])).rows[0];
    if (!po) throw E.notFound('Purchase order not found.');
    if (po.status !== 'ordered') throw E.conflict(`Goods can only be received against an "ordered" purchase order (this one is "${po.status}").`, 'INVALID_STATE');
    const got = (await client.query('SELECT COALESCE(SUM(quantity_received),0)::int AS n FROM goods_received WHERE purchase_order_id=$1', [po.id])).rows[0].n;
    if (got + d.quantityReceived > po.quantity) throw E.unprocessable(`Only ${po.quantity - got} more unit(s) are outstanding on ${po.po_number}.`, 'OVER_RECEIPT');
    if (d.inventoryId) {
      const inv = (await client.query('SELECT warehouse_id FROM inventory WHERE id=$1', [d.inventoryId])).rows[0];
      if (!inv || Number(inv.warehouse_id) !== d.warehouseId) throw E.unprocessable('That stock record does not belong to the chosen warehouse.', 'INVALID_INVENTORY');
      await applyMovement(client, d.inventoryId, 'receive', d.quantityReceived, { reference: po.po_number, note: 'Goods received against purchase order', userId: req.user.id });
    }
    const r = await client.query(`INSERT INTO goods_received (purchase_order_id, warehouse_id, inventory_id, quantity_received, note, received_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [po.id, d.warehouseId, d.inventoryId || null, d.quantityReceived, d.note ?? null, req.user.id]);
    if (got + d.quantityReceived === po.quantity) await client.query(`UPDATE purchase_orders SET status='received' WHERE id=$1`, [po.id]);
    await audit(req, 'goods.receive', 'purchase_order', po.id, { quantity: d.quantityReceived }, client);
    return r.rows[0].id;
  });
  res.status(201).json({ id, message: 'Goods recorded.' });
});

/* ---------- Supplier invoices ---------- */
const mapSI = (i) => ({ id: Number(i.id), invoiceNumber: i.invoice_number, supplierId: Number(i.supplier_id), supplierName: i.supplier_name, purchaseOrderId: i.purchase_order_id ? Number(i.purchase_order_id) : null,
  amount: Number(i.amount), status: i.status, displayStatus: i.status === 'unpaid' && new Date(i.due_date) < new Date(new Date().toDateString()) ? 'overdue' : i.status, issueDate: i.issue_date, dueDate: i.due_date, paidAt: i.paid_at });
const SI_SELECT = 'SELECT i.*, s.name AS supplier_name FROM supplier_invoices i JOIN suppliers s ON s.id=i.supplier_id';

router.get('/supplier-invoices', requireRole('procurement', 'admin', 'finance'), async (req, res) => {
  const rows = (await db.query(`${SI_SELECT} ORDER BY i.due_date DESC, i.id DESC LIMIT 300`)).rows;
  res.json({ data: rows.map(mapSI) });
});

router.post('/supplier-invoices', requireRole('procurement', 'admin', 'finance'), validate(z.object({ invoiceNumber: reqText(30, 'Invoice number'), supplierId: z.coerce.number({ error: 'Choose a supplier.' }).int().positive(),
  purchaseOrderId: z.coerce.number().int().positive().optional(), amount: positiveMoney, issueDate: isoDate, dueDate: isoDate })), async (req, res) => {
  const d = req.valid.body;
  if (d.dueDate < d.issueDate) throw E.validation([{ field: 'dueDate', message: 'Due date cannot be before the issue date.' }]);
  let r;
  try {
    r = await db.query(`INSERT INTO supplier_invoices (invoice_number, supplier_id, purchase_order_id, amount, issue_date, due_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [d.invoiceNumber, d.supplierId, d.purchaseOrderId || null, d.amount, d.issueDate, d.dueDate]);
  } catch (err) {
    if (err.code === '23505') throw E.conflict('That supplier invoice number has already been captured.', 'DUPLICATE');
    throw err;
  }
  await audit(req, 'supplier_invoice.create', 'supplier_invoice', r.rows[0].id);
  res.status(201).json({ invoice: mapSI((await db.query(`${SI_SELECT} WHERE i.id=$1`, [r.rows[0].id])).rows[0]) });
});

router.patch('/supplier-invoices/:id/pay', requireRole('finance', 'admin'), validate(idParam, 'params'), async (req, res) => {
  const r = await db.query(`UPDATE supplier_invoices SET status='paid', paid_at=now() WHERE id=$1 AND status='unpaid' RETURNING id`, [req.valid.params.id]);
  if (!r.rowCount) {
    const ex = await db.query('SELECT status FROM supplier_invoices WHERE id=$1', [req.valid.params.id]);
    if (!ex.rowCount) throw E.notFound('Supplier invoice not found.');
    throw E.conflict('This supplier invoice is already paid.', 'INVALID_STATE');
  }
  await audit(req, 'supplier_invoice.pay', 'supplier_invoice', req.valid.params.id);
  res.json({ invoice: mapSI((await db.query(`${SI_SELECT} WHERE i.id=$1`, [req.valid.params.id])).rows[0]) });
});

module.exports = router;
