'use strict';

const db = require('../src/config/db');
const { as } = require('./helpers');

afterAll(async () => { await db.close(); });
const API = '/api/v1';
let item;
const sku = `T-${Date.now().toString(36).toUpperCase()}`;

describe('warehouse inventory', () => {
  it('creates a stock record with opening stock and a movement history entry', async () => {
    expect((await as('warehouse').post(`${API}/inventory`, { warehouseId: 1, sku, name: 'Test widgets', category: 'Test', quantity: -3 })).status).toBe(422);
    expect((await as('warehouse').post(`${API}/inventory`, { warehouseId: 9999, sku: 'NOWH', name: 'x', category: 'y' })).status).toBe(409);
    const res = await as('warehouse').post(`${API}/inventory`, { warehouseId: 1, sku: sku.toLowerCase(), name: 'Test widgets', category: 'Test', unit: 'units', quantity: 100, reorderLevel: 20 });
    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({ sku, quantity: 100, lowStock: false });
    item = res.body.item;
    expect((await as('warehouse').post(`${API}/inventory`, { warehouseId: 1, sku, name: 'dup', category: 'Test' })).status).toBe(409);
    const moves = await as('warehouse').get(`${API}/stock-movements?inventoryId=${item.id}`);
    expect(moves.body.data).toHaveLength(1);
    expect(moves.body.data[0]).toMatchObject({ type: 'receive', quantity: 100, balanceAfter: 100 });
  });

  it('receives stock and rejects invalid quantities', async () => {
    for (const q of [0, -5, 2.5, 'abc', null]) expect([q, (await as('warehouse').post(`${API}/inventory/${item.id}/receive`, { quantity: q })).status]).toEqual([q, 422]);
    const res = await as('warehouse').post(`${API}/inventory/${item.id}/receive`, { quantity: 50, reference: 'GRN-1', note: 'Delivery' });
    expect(res.body.item.quantity).toBe(150);
    expect((await as('warehouse').post(`${API}/inventory/999999/receive`, { quantity: 1 })).status).toBe(404);
  });

  it('dispatches stock but never below zero, and records the movement', async () => {
    const over = await as('warehouse').post(`${API}/inventory/${item.id}/dispatch`, { quantity: 151 });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect((await as('warehouse').get(`${API}/inventory/${item.id}`)).body.item.quantity).toBe(150);
    const ok = await as('warehouse').post(`${API}/inventory/${item.id}/dispatch`, { quantity: 40, shipmentId: 1, reference: 'SHP-1' });
    expect(ok.body.item.quantity).toBe(110);
    expect((await as('warehouse').post(`${API}/inventory/${item.id}/dispatch`, { quantity: 1, shipmentId: 999999 })).body.error.code).toBe('INVALID_SHIPMENT');
    const moves = (await as('warehouse').get(`${API}/stock-movements?inventoryId=${item.id}`)).body.data;
    expect(moves[0]).toMatchObject({ type: 'dispatch', quantity: -40, balanceAfter: 110, shipmentId: 1 });
  });

  it('never loses or duplicates stock when two dispatches race for the last units', async () => {
    const r = (await as('warehouse').post(`${API}/inventory`, { warehouseId: 1, sku: `${sku}-RACE`, name: 'Race', category: 'Test', quantity: 10 })).body.item;
    const results = await Promise.all([1, 2, 3, 4].map(() => as('warehouse').post(`${API}/inventory/${r.id}/dispatch`, { quantity: 10 })));
    expect(results.filter((x) => x.status === 200)).toHaveLength(1);
    expect(results.filter((x) => x.status === 409)).toHaveLength(3);
    expect((await db.query('SELECT quantity FROM inventory WHERE id=$1', [r.id])).rows[0].quantity).toBe(0);
  });

  it('transfers stock between warehouses atomically (creating the destination record when needed)', async () => {
    expect((await as('warehouse').post(`${API}/inventory/${item.id}/transfer`, { toWarehouseId: 1, quantity: 5 })).body.error.code).toBe('SAME_WAREHOUSE');
    expect((await as('warehouse').post(`${API}/inventory/${item.id}/transfer`, { toWarehouseId: 9999, quantity: 5 })).status).toBe(422);
    expect((await as('warehouse').post(`${API}/inventory/${item.id}/transfer`, { toWarehouseId: 4, quantity: 500 })).status).toBe(409);
    expect((await db.query('SELECT COUNT(*)::int n FROM inventory WHERE warehouse_id=4 AND sku=$1', [sku])).rows[0].n).toBe(0); // rolled back completely
    const ok = await as('warehouse').post(`${API}/inventory/${item.id}/transfer`, { toWarehouseId: 4, quantity: 30, note: 'Rebalance' });
    expect(ok.status).toBe(200);
    expect(ok.body.item.quantity).toBe(80);
    const dest = await db.query('SELECT quantity FROM inventory WHERE warehouse_id=4 AND sku=$1', [sku]);
    expect(dest.rows[0].quantity).toBe(30);
    const tr = await as('warehouse').get(`${API}/stock-transfers`);
    expect(tr.body.data.some((t) => t.sku === sku && t.quantity === 30)).toBe(true);
    const total = await db.query('SELECT SUM(quantity)::int n FROM inventory WHERE sku=$1', [sku]);
    expect(total.rows[0].n).toBe(110); // nothing created or lost
  });

  it('adjusts stock after a count and requires a reason', async () => {
    expect((await as('warehouse').post(`${API}/inventory/${item.id}/adjust`, { newQuantity: 70 })).status).toBe(422);
    expect((await as('warehouse').post(`${API}/inventory/${item.id}/adjust`, { newQuantity: 80, note: 'same' })).body.error.code).toBe('NO_CHANGE');
    const res = await as('warehouse').post(`${API}/inventory/${item.id}/adjust`, { newQuantity: 15, note: 'Cycle count' });
    expect(res.body.item.quantity).toBe(15);
    expect(res.body.item.lowStock).toBe(true);
  });

  it('raises low-stock alerts, lists them and notifies warehouse staff', async () => {
    const low = await as('warehouse').get(`${API}/inventory?lowStock=true`);
    expect(low.body.data.map((i) => i.sku)).toContain(sku);
    expect(low.body.data.every((i) => i.lowStock)).toBe(true);
    await as('warehouse').post(`${API}/inventory/${item.id}/dispatch`, { quantity: 1 });
    const notes = await as('warehouse').get(`${API}/notifications`);
    expect(notes.body.data.some((n) => n.title === 'Low stock alert' && n.entityId === item.id)).toBe(true);
    const search = await as('warehouse').get(`${API}/inventory?q=${sku.toLowerCase()}`);
    expect(search.body.data.length).toBeGreaterThan(0);
    const csv = await as('warehouse').get(`${API}/inventory?format=csv`);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\r\n')[0]).toContain('sku');
  });

  it('edits item details and only deletes empty items', async () => {
    const upd = await as('warehouse').patch(`${API}/inventory/${item.id}`, { name: 'Renamed widgets', reorderLevel: 5, location: 'Z-01' });
    expect(upd.body.item).toMatchObject({ name: 'Renamed widgets', reorderLevel: 5, location: 'Z-01', quantity: 14 });
    const del = await as('warehouse').del(`${API}/inventory/${item.id}`);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe('STOCK_REMAINS');
    await as('warehouse').post(`${API}/inventory/${item.id}/dispatch`, { quantity: 14 });
    expect((await as('warehouse').del(`${API}/inventory/${item.id}`)).status).toBe(200);
    expect((await as('warehouse').get(`${API}/inventory/${item.id}`)).status).toBe(404);
  });
});
