'use strict';

const express = require('express');
const db = require('../config/db');
const { E } = require('../utils/errors');
const { validate, z, idParam, reqText, optionalText } = require('../utils/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { notifyRoles } = require('../services/notify');
const { sendCsv } = require('../utils/csv');

const router = express.Router();
router.use(authenticate);

const READ = ['warehouse', 'admin', 'procurement', 'dispatcher', 'finance', 'fleet'];
const WRITE = ['warehouse', 'admin'];
const qty = z.coerce.number({ error: 'Quantity is required.' }).int('Quantity must be a whole number.').positive('Quantity must be greater than zero.').max(10000000);

const mapItem = (i) => ({ id: Number(i.id), warehouseId: Number(i.warehouse_id), warehouseName: i.warehouse_name, sku: i.sku, name: i.name, category: i.category, unit: i.unit,
  quantity: i.quantity, reorderLevel: i.reorder_level, location: i.location, lowStock: i.quantity <= i.reorder_level });
const ITEM_SELECT = 'SELECT i.*, w.name AS warehouse_name FROM inventory i JOIN warehouses w ON w.id=i.warehouse_id';
const mapMove = (m) => ({ id: Number(m.id), inventoryId: Number(m.inventory_id), sku: m.sku, itemName: m.item_name, warehouseName: m.warehouse_name, type: m.type, quantity: m.quantity, balanceAfter: m.balance_after,
  reference: m.reference, shipmentId: m.shipment_id ? Number(m.shipment_id) : null, note: m.note, performedBy: m.performed_by_name, createdAt: m.created_at });

/** Locks the inventory row, applies a signed quantity change, records the movement. Rejects negative stock. */
async function applyMovement(client, invId, type, delta, { reference, shipmentId, note, userId }) {
  const row = (await client.query('SELECT * FROM inventory WHERE id=$1 FOR UPDATE', [invId])).rows[0];
  if (!row) throw E.notFound('Inventory item not found.');
  const next = row.quantity + delta;
  if (next < 0) throw E.conflict(`Insufficient stock: only ${row.quantity} ${row.unit} of ${row.sku} available.`, 'INSUFFICIENT_STOCK');
  await client.query('UPDATE inventory SET quantity=$2 WHERE id=$1', [invId, next]);
  await client.query(`INSERT INTO stock_movements (inventory_id, type, quantity, balance_after, reference, shipment_id, note, performed_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [invId, type, delta, next, reference || null, shipmentId || null, note || null, userId || null]);
  if (delta < 0 && next <= row.reorder_level) {
    await notifyRoles(['warehouse'], { title: 'Low stock alert', message: `${row.name} (${row.sku}) is at ${next} ${row.unit}, at or below its reorder level of ${row.reorder_level}.`, type: 'warning', entityType: 'inventory', entityId: invId }, client);
  }
  return { ...row, quantity: next };
}

router.get('/warehouses', requireRole(...READ), async (req, res) => {
  const rows = (await db.query(`SELECT w.*, (SELECT COUNT(*)::int FROM inventory i WHERE i.warehouse_id=w.id) AS item_count FROM warehouses w ORDER BY w.id`)).rows;
  res.json({ data: rows.map((w) => ({ id: Number(w.id), code: w.code, name: w.name, city: w.city, address: w.address, status: w.status, itemCount: w.item_count })) });
});

router.post('/warehouses', requireRole(...WRITE), validate(z.object({ code: reqText(12, 'Code').transform((s) => s.toUpperCase()), name: reqText(120, 'Name'), city: reqText(80, 'City'), address: optionalText(255) })), async (req, res) => {
  const d = req.valid.body;
  const r = await db.query('INSERT INTO warehouses (code, name, city, address) VALUES ($1,$2,$3,$4) RETURNING *', [d.code, d.name, d.city, d.address ?? null]);
  await audit(req, 'warehouse.create', 'warehouse', r.rows[0].id);
  res.status(201).json({ warehouse: r.rows[0] });
});

router.get('/inventory', requireRole(...READ), validate(z.object({ warehouseId: z.coerce.number().int().optional(), q: z.string().trim().max(80).optional(),
  lowStock: z.enum(['true', 'false']).optional(), format: z.enum(['json', 'csv']).default('json') }), 'query'), async (req, res) => {
  const { warehouseId, q, lowStock, format } = req.valid.query; const p = []; const where = [];
  if (warehouseId) { p.push(warehouseId); where.push(`i.warehouse_id=$${p.length}`); }
  if (q) { p.push(`%${q.toLowerCase()}%`); where.push(`(lower(i.sku) LIKE $${p.length} OR lower(i.name) LIKE $${p.length} OR lower(i.category) LIKE $${p.length})`); }
  if (lowStock === 'true') where.push('i.quantity <= i.reorder_level');
  const rows = (await db.query(`${ITEM_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY i.warehouse_id, i.sku`, p)).rows;
  if (format === 'csv') return sendCsv(res, 'inventory.csv', rows.map((i) => ({ warehouse: i.warehouse_name, sku: i.sku, name: i.name, category: i.category, unit: i.unit, quantity: i.quantity, reorder_level: i.reorder_level, low_stock: i.quantity <= i.reorder_level })));
  return res.json({ data: rows.map(mapItem), lowStockCount: rows.filter((i) => i.quantity <= i.reorder_level).length });
});

router.get('/inventory/:id', requireRole(...READ), validate(idParam, 'params'), async (req, res) => {
  const r = (await db.query(`${ITEM_SELECT} WHERE i.id=$1`, [req.valid.params.id])).rows[0];
  if (!r) throw E.notFound('Inventory item not found.');
  res.json({ item: mapItem(r) });
});

router.post('/inventory', requireRole(...WRITE), validate(z.object({ warehouseId: z.coerce.number({ error: 'Choose a warehouse.' }).int().positive(), sku: reqText(30, 'SKU').transform((s) => s.toUpperCase()),
  name: reqText(160, 'Name'), category: reqText(60, 'Category'), unit: reqText(20, 'Unit').default('units'), quantity: z.coerce.number().int().min(0).default(0),
  reorderLevel: z.coerce.number().int().min(0).default(10), location: optionalText(40) })), async (req, res) => {
  const d = req.valid.body;
  const id = await db.tx(async (client) => {
    let r;
    try {
      r = await client.query(`INSERT INTO inventory (warehouse_id, sku, name, category, unit, quantity, reorder_level, location) VALUES ($1,$2,$3,$4,$5,0,$6,$7) RETURNING id`,
        [d.warehouseId, d.sku, d.name, d.category, d.unit, d.reorderLevel, d.location ?? null]);
    } catch (err) {
      if (err.code === '23505') throw E.conflict(`SKU ${d.sku} already exists in that warehouse.`, 'DUPLICATE');
      throw err;
    }
    if (d.quantity > 0) await applyMovement(client, r.rows[0].id, 'receive', d.quantity, { reference: 'OPENING', note: 'Opening stock', userId: req.user.id });
    await audit(req, 'inventory.create', 'inventory', r.rows[0].id, { sku: d.sku }, client);
    return r.rows[0].id;
  });
  res.status(201).json({ item: mapItem((await db.query(`${ITEM_SELECT} WHERE i.id=$1`, [id])).rows[0]) });
});

router.patch('/inventory/:id', requireRole(...WRITE), validate(idParam, 'params'), validate(z.object({ name: reqText(160).optional(), category: reqText(60).optional(), unit: reqText(20).optional(), reorderLevel: z.coerce.number().int().min(0).optional(), location: optionalText(40) })), async (req, res) => {
  const d = req.valid.body;
  const r = await db.query(`UPDATE inventory SET name=COALESCE($2,name), category=COALESCE($3,category), unit=COALESCE($4,unit), reorder_level=COALESCE($5,reorder_level), location=COALESCE($6,location) WHERE id=$1 RETURNING id`,
    [req.valid.params.id, d.name ?? null, d.category ?? null, d.unit ?? null, d.reorderLevel ?? null, d.location ?? null]);
  if (!r.rowCount) throw E.notFound('Inventory item not found.');
  await audit(req, 'inventory.update', 'inventory', req.valid.params.id, d);
  res.json({ item: mapItem((await db.query(`${ITEM_SELECT} WHERE i.id=$1`, [req.valid.params.id])).rows[0]) });
});

router.delete('/inventory/:id', requireRole(...WRITE), validate(idParam, 'params'), async (req, res) => {
  const cur = (await db.query('SELECT quantity FROM inventory WHERE id=$1', [req.valid.params.id])).rows[0];
  if (!cur) throw E.notFound('Inventory item not found.');
  if (cur.quantity > 0) throw E.conflict('Only items with zero stock can be deleted. Dispatch or transfer the remaining stock first.', 'STOCK_REMAINS');
  await db.query('DELETE FROM inventory WHERE id=$1', [req.valid.params.id]);
  await audit(req, 'inventory.delete', 'inventory', req.valid.params.id);
  res.json({ message: 'Inventory item deleted.' });
});

const moveBody = z.object({ quantity: qty, reference: optionalText(60), note: optionalText(300), shipmentId: z.coerce.number().int().positive().optional() });
const respondItem = async (res, id, status = 200) => res.status(status).json({ item: mapItem((await db.query(`${ITEM_SELECT} WHERE i.id=$1`, [id])).rows[0]) });

router.post('/inventory/:id/receive', requireRole(...WRITE), validate(idParam, 'params'), validate(moveBody), async (req, res) => {
  const d = req.valid.body;
  await db.tx(async (c) => { await applyMovement(c, req.valid.params.id, 'receive', d.quantity, { ...d, userId: req.user.id }); await audit(req, 'inventory.receive', 'inventory', req.valid.params.id, { quantity: d.quantity }, c); });
  await respondItem(res, req.valid.params.id);
});

router.post('/inventory/:id/dispatch', requireRole(...WRITE), validate(idParam, 'params'), validate(moveBody), async (req, res) => {
  const d = req.valid.body;
  await db.tx(async (c) => {
    if (d.shipmentId) { const s = await c.query('SELECT 1 FROM shipments WHERE id=$1', [d.shipmentId]); if (!s.rowCount) throw E.unprocessable('That shipment does not exist.', 'INVALID_SHIPMENT'); }
    await applyMovement(c, req.valid.params.id, 'dispatch', -d.quantity, { ...d, userId: req.user.id });
    await audit(req, 'inventory.dispatch', 'inventory', req.valid.params.id, { quantity: d.quantity }, c);
  });
  await respondItem(res, req.valid.params.id);
});

router.post('/inventory/:id/adjust', requireRole(...WRITE), validate(idParam, 'params'), validate(z.object({ newQuantity: z.coerce.number({ error: 'Enter the counted quantity.' }).int().min(0).max(10000000), note: reqText(300, 'A reason') })), async (req, res) => {
  const { newQuantity, note } = req.valid.body;
  await db.tx(async (c) => {
    const cur = (await c.query('SELECT quantity FROM inventory WHERE id=$1 FOR UPDATE', [req.valid.params.id])).rows[0];
    if (!cur) throw E.notFound('Inventory item not found.');
    if (cur.quantity === newQuantity) throw E.unprocessable('The counted quantity equals the current stock; nothing to adjust.', 'NO_CHANGE');
    await applyMovement(c, req.valid.params.id, 'adjustment', newQuantity - cur.quantity, { note, reference: 'ADJUSTMENT', userId: req.user.id });
    await audit(req, 'inventory.adjust', 'inventory', req.valid.params.id, { to: newQuantity }, c);
  });
  await respondItem(res, req.valid.params.id);
});

router.post('/inventory/:id/transfer', requireRole(...WRITE), validate(idParam, 'params'), validate(z.object({ toWarehouseId: z.coerce.number({ error: 'Choose the destination warehouse.' }).int().positive(), quantity: qty, note: optionalText(300) })), async (req, res) => {
  const { toWarehouseId, quantity, note } = req.valid.body; const id = req.valid.params.id;
  const ref = `TRF-${Date.now().toString(36).toUpperCase()}`;
  await db.tx(async (c) => {
    const src = (await c.query('SELECT * FROM inventory WHERE id=$1', [id])).rows[0];
    if (!src) throw E.notFound('Inventory item not found.');
    if (Number(src.warehouse_id) === toWarehouseId) throw E.unprocessable('Choose a different destination warehouse.', 'SAME_WAREHOUSE');
    const wh = (await c.query(`SELECT 1 FROM warehouses WHERE id=$1 AND status='active'`, [toWarehouseId])).rowCount;
    if (!wh) throw E.unprocessable('The destination warehouse does not exist or is inactive.', 'INVALID_WAREHOUSE');
    let dest = (await c.query('SELECT id FROM inventory WHERE warehouse_id=$1 AND sku=$2', [toWarehouseId, src.sku])).rows[0];
    if (!dest) dest = (await c.query(`INSERT INTO inventory (warehouse_id, sku, name, category, unit, quantity, reorder_level, location) VALUES ($1,$2,$3,$4,$5,0,$6,NULL) RETURNING id`,
      [toWarehouseId, src.sku, src.name, src.category, src.unit, src.reorder_level])).rows[0];
    await applyMovement(c, id, 'transfer_out', -quantity, { reference: ref, note: note || `Transfer to warehouse ${toWarehouseId}`, userId: req.user.id });
    await applyMovement(c, dest.id, 'transfer_in', quantity, { reference: ref, note: note || `Transfer from warehouse ${src.warehouse_id}`, userId: req.user.id });
    await c.query('INSERT INTO stock_transfers (reference, sku, from_warehouse_id, to_warehouse_id, quantity, note, performed_by) VALUES ($1,$2,$3,$4,$5,$6,$7)', [ref, src.sku, src.warehouse_id, toWarehouseId, quantity, note || null, req.user.id]);
    await audit(req, 'inventory.transfer', 'inventory', id, { quantity, toWarehouseId }, c);
  });
  await respondItem(res, id);
});

router.get('/stock-movements', requireRole(...READ), validate(z.object({ inventoryId: z.coerce.number().int().optional(), type: z.enum(['receive', 'dispatch', 'transfer_in', 'transfer_out', 'adjustment']).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) }), 'query'), async (req, res) => {
  const { inventoryId, type, limit } = req.valid.query; const p = []; const where = [];
  if (inventoryId) { p.push(inventoryId); where.push(`m.inventory_id=$${p.length}`); }
  if (type) { p.push(type); where.push(`m.type=$${p.length}`); }
  p.push(limit);
  const rows = (await db.query(`SELECT m.*, i.sku, i.name AS item_name, w.name AS warehouse_name, u.full_name AS performed_by_name FROM stock_movements m JOIN inventory i ON i.id=m.inventory_id
    JOIN warehouses w ON w.id=i.warehouse_id LEFT JOIN users u ON u.id=m.performed_by ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY m.created_at DESC, m.id DESC LIMIT $${p.length}`, p)).rows;
  res.json({ data: rows.map(mapMove) });
});

router.get('/stock-transfers', requireRole(...READ), async (req, res) => {
  const rows = (await db.query(`SELECT t.*, f.name AS from_name, d.name AS to_name, u.full_name AS by_name FROM stock_transfers t JOIN warehouses f ON f.id=t.from_warehouse_id JOIN warehouses d ON d.id=t.to_warehouse_id LEFT JOIN users u ON u.id=t.performed_by ORDER BY t.created_at DESC, t.id DESC LIMIT 200`)).rows;
  res.json({ data: rows.map((t) => ({ id: Number(t.id), reference: t.reference, sku: t.sku, fromWarehouse: t.from_name, toWarehouse: t.to_name, quantity: t.quantity, note: t.note, performedBy: t.by_name, createdAt: t.created_at })) });
});

module.exports = router;
module.exports.applyMovement = applyMovement;
