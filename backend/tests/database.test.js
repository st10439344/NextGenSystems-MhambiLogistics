'use strict';

const db = require('../src/config/db');
const { migrate } = require('../src/db/migrate');
const { seed } = require('../src/db/seed');

afterAll(async () => { await db.close(); });

const REQUIRED = ['users', 'user_roles', 'companies', 'quotations', 'shipments', 'shipment_status_history', 'delivery_assignments', 'drivers', 'vehicles', 'warehouses', 'inventory',
  'stock_movements', 'suppliers', 'purchase_requests', 'purchase_orders', 'invoices', 'payments', 'notifications', 'documents', 'settings', 'support_requests', 'audit_logs'];
const count = async (t) => (await db.query(`SELECT COUNT(*)::int n FROM ${t}`)).rows[0].n;

describe('schema and seed data', () => {
  it('has the eight roles', async () => {
    const r = await db.query('SELECT code FROM roles ORDER BY id');
    expect(r.rows.map((x) => x.code)).toEqual(['admin', 'dispatcher', 'warehouse', 'fleet', 'procurement', 'finance', 'driver', 'client']);
  });

  it.each(REQUIRED)('table %s has at least ten fictional records', async (t) => {
    expect(await count(t)).toBeGreaterThanOrEqual(10);
  });

  it('has the expected supporting tables', async () => {
    const r = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
    const names = r.rows.map((x) => x.table_name);
    for (const t of ['roles', 'permissions', 'role_permissions', 'refresh_sessions', 'password_reset_tokens', 'proof_of_delivery', 'incidents', 'stock_transfers', 'maintenance_records', 'fuel_transactions',
      'goods_received', 'supplier_invoices', 'receipts', 'expenses', 'budgets', 'schema_migrations']) expect(names).toContain(t);
  });

  it('keeps referential integrity: no orphaned foreign keys anywhere', async () => {
    const fks = await db.query(`SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent,
        (SELECT string_agg(quote_ident(a.attname), ',' ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum) AS ccols,
        (SELECT string_agg(quote_ident(a.attname), ',' ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum) AS pcols
      FROM pg_constraint c WHERE c.contype='f' AND c.connamespace='public'::regnamespace`);
    expect(fks.rows.length).toBeGreaterThan(40);
    for (const fk of fks.rows) {
      if (fk.ccols.includes(',')) continue;
      const orphans = await db.query(`SELECT COUNT(*)::int n FROM ${fk.child} c WHERE c.${fk.ccols} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${fk.parent} p WHERE p.${fk.pcols}=c.${fk.ccols})`);
      expect([fk.child, fk.ccols, orphans.rows[0].n]).toEqual([fk.child, fk.ccols, 0]);
    }
  });

  it('seed data is internally consistent', async () => {
    const q = async (sql) => (await db.query(sql)).rows;
    expect((await q(`SELECT s.id FROM shipments s WHERE s.status='delivered' AND NOT EXISTS (SELECT 1 FROM proof_of_delivery p WHERE p.shipment_id=s.id)`))).toHaveLength(0);
    expect((await q(`SELECT i.id FROM inventory i WHERE i.quantity <> COALESCE((SELECT SUM(quantity) FROM stock_movements m WHERE m.inventory_id=i.id),0)`))).toHaveLength(0);
    expect((await q(`SELECT i.id FROM inventory i JOIN LATERAL (SELECT balance_after FROM stock_movements m WHERE m.inventory_id=i.id ORDER BY m.id DESC LIMIT 1) l ON TRUE WHERE l.balance_after <> i.quantity`))).toHaveLength(0);
    expect((await q(`SELECT v.id FROM vehicles v JOIN delivery_assignments a ON a.vehicle_id=v.id AND a.status IN ('assigned','active') WHERE v.status NOT IN ('assigned','on_route')`))).toHaveLength(0);
    expect((await q(`SELECT i.id FROM invoices i WHERE i.status='paid' AND i.total <> (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.invoice_id=i.id)`))).toHaveLength(0);
    expect((await q(`SELECT i.id FROM invoices i WHERE i.status='partially_paid' AND NOT ((SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.invoice_id=i.id) BETWEEN 0.01 AND i.total - 0.01)`))).toHaveLength(0);
    expect((await q(`SELECT i.id FROM invoices i WHERE i.id <= 14 AND round(i.subtotal*1.15,2) <> i.total`))).toHaveLength(0);
    expect((await q(`SELECT u.id FROM users u WHERE u.password_hash IS NOT NULL AND u.password_hash NOT LIKE '$2%'`))).toHaveLength(0);
    expect((await q(`SELECT 1 FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id WHERE ur.user_id IS NULL`))).toHaveLength(0);
    expect((await q(`SELECT 1 FROM users WHERE email NOT LIKE '%.test'`))).toHaveLength(0); // only reserved .test domains: no real addresses
  });

  it('each shipment status history ends with the shipment current status', async () => {
    const r = await db.query(`SELECT s.id FROM shipments s JOIN LATERAL (SELECT status FROM shipment_status_history h WHERE h.shipment_id=s.id ORDER BY h.created_at DESC, h.id DESC LIMIT 1) l ON TRUE WHERE l.status <> s.status`);
    expect(r.rows).toHaveLength(0);
  });
});

describe('repeatable migrations and seeds', () => {
  it('re-running migrations applies nothing', async () => {
    expect(await migrate({ quiet: true })).toBe(0);
  });

  it('re-running the seed creates no duplicates', async () => {
    // The first run may legitimately restore seed rows that other tests deleted; the second must change nothing.
    await seed({ password: process.env.TEST_SEED_PASSWORD, quiet: true });
    const before = {};
    for (const t of REQUIRED) before[t] = await count(t);
    const summary = await seed({ password: process.env.TEST_SEED_PASSWORD, quiet: true });
    expect(Object.entries(summary).filter(([, n]) => n !== 0)).toEqual([]);
    for (const t of REQUIRED) expect([t, await count(t)]).toEqual([t, before[t]]);
  });

  it('refuses to seed with a missing or weak demo password', async () => {
    await expect(seed({ password: '', quiet: true })).rejects.toThrow(/DEMO_SEED_PASSWORD/);
    await expect(seed({ password: 'weak', quiet: true })).rejects.toThrow(/DEMO_SEED_PASSWORD/);
  });
});

describe('database constraints enforce business rules', () => {
  const fails = async (sql, params, code) => { await expect(db.query(sql, params)).rejects.toMatchObject({ code }); };

  it('rejects negative stock', async () => {
    await fails('UPDATE inventory SET quantity=-1 WHERE id=1', [], '23514');
  });
  it('rejects double-booking a vehicle, a shipment or an active driver', async () => {
    const live = await db.query(`SELECT shipment_id, driver_id, vehicle_id FROM delivery_assignments WHERE status='active' LIMIT 1`);
    const a = live.rows[0];
    const spare = await db.query(`SELECT id FROM shipments WHERE status='pending' LIMIT 1`);
    await fails(`INSERT INTO delivery_assignments (shipment_id, driver_id, vehicle_id) VALUES ($1,9,$2)`, [spare.rows[0].id, a.vehicle_id], '23505');
    await fails(`INSERT INTO delivery_assignments (shipment_id, driver_id, vehicle_id) VALUES ($1,9,12)`, [a.shipment_id], '23505');
    await fails(`INSERT INTO delivery_assignments (shipment_id, driver_id, vehicle_id, status) VALUES ($1,$2,12,'active')`, [spare.rows[0].id, a.driver_id], '23505');
  });
  it('rejects duplicate emails (case-insensitive), SKUs per warehouse and tracking references', async () => {
    await fails(`INSERT INTO users (email, password_hash, full_name) VALUES (UPPER('nomsa.dlamini@mhambi-demo.test'), 'x', 'Dup')`, [], '23505');
    await fails(`INSERT INTO inventory (warehouse_id, sku, name, category) VALUES (1, 'PAL-EUR', 'dup', 'x')`, [], '23505');
    await fails(`UPDATE shipments SET tracking_ref='MHM-000001' WHERE id=2`, [], '23505');
  });
  it('rejects invalid values and broken references', async () => {
    await fails(`INSERT INTO invoices (invoice_number, company_id, description, subtotal, vat_amount, total, issue_date, due_date) VALUES ('X-1',1,'d',1,0.15,1.15,'2026-02-01','2026-01-01')`, [], '23514');
    await fails(`INSERT INTO users (email, full_name) VALUES ('nopass@x.test', 'No Login')`, [], '23514');
    await fails(`INSERT INTO payments (invoice_id, amount, method) VALUES (1, 0, 'eft')`, [], '23514');
    await fails(`INSERT INTO shipments (tracking_ref, company_id, origin, destination, cargo_description, weight_kg) VALUES ('MHM-X',9999,'a','b','c',1)`, [], '23503');
    await fails(`INSERT INTO vehicles (registration, make_model, type, capacity_kg, status) VALUES ('BAD 1','m','t',100,'flying')`, [], '23514');
  });
});
