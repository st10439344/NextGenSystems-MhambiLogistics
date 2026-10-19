'use strict';

const db = require('../src/config/db');
const { api, as, ACCOUNTS, SEED_PASSWORD } = require('./helpers');

afterAll(async () => { await db.close(); });

const ROLES = ['admin', 'dispatcher', 'warehouse', 'fleet', 'procurement', 'finance', 'driver', 'client'];

// endpoint -> roles allowed to read it
const MATRIX = [
  ['/api/v1/users', ['admin']],
  ['/api/v1/roles', ['admin']],
  ['/api/v1/audit-logs', ['admin']],
  ['/api/v1/settings/system', ['admin']],
  ['/api/v1/admin/tables', ['admin']],
  ['/api/v1/companies', ['admin', 'dispatcher', 'finance', 'procurement']],
  ['/api/v1/inventory', ['warehouse', 'admin', 'procurement', 'dispatcher', 'finance', 'fleet']],
  ['/api/v1/vehicles', ['fleet', 'admin', 'dispatcher']],
  ['/api/v1/maintenance', ['fleet', 'admin', 'dispatcher']],
  ['/api/v1/fuel', ['fleet', 'admin', 'dispatcher']],
  ['/api/v1/drivers', ['dispatcher', 'admin', 'fleet']],
  ['/api/v1/suppliers', ['procurement', 'admin', 'finance', 'warehouse', 'fleet']],
  ['/api/v1/purchase-orders', ['procurement', 'admin', 'finance', 'warehouse']],
  ['/api/v1/supplier-invoices', ['procurement', 'admin', 'finance']],
  ['/api/v1/invoices', ['finance', 'admin', 'client']],
  ['/api/v1/expenses', ['finance', 'admin']],
  ['/api/v1/budgets', ['finance', 'admin']],
  ['/api/v1/finance/receivables', ['finance', 'admin']],
  ['/api/v1/reports/finance', ['finance', 'admin']],
  ['/api/v1/reports/inventory', ['warehouse', 'admin']],
  ['/api/v1/reports/fleet', ['fleet', 'admin']],
  ['/api/v1/reports/shipments', ['dispatcher', 'admin', 'finance']],
  ['/api/v1/driver/deliveries', ['driver']],
  ['/api/v1/quotations', ['admin', 'dispatcher', 'procurement', 'finance', 'client']],
  ['/api/v1/documents', ['admin', 'finance', 'dispatcher', 'client']],
  ['/api/v1/support', ['admin', 'dispatcher', 'client']],
];

describe('server-side role-based access control', () => {
  for (const [url, allowed] of MATRIX) {
    it(`GET ${url}`, async () => {
      for (const role of ROLES) {
        const res = await as(role).get(url);
        if (allowed.includes(role)) expect([role, res.status]).toEqual([role, 200]);
        else expect([role, res.status]).toEqual([role, 403]);
      }
      expect((await api().get(url)).status).toBe(401); // never reachable anonymously
    });
  }

  it('every role can use the common features', async () => {
    for (const role of ROLES) {
      for (const url of ['/api/v1/dashboard', '/api/v1/notifications', '/api/v1/settings/me', '/api/v1/auth/me']) {
        expect([role, url, (await as(role).get(url)).status]).toEqual([role, url, 200]);
      }
    }
  });

  it('write actions are restricted to the owning department', async () => {
    const attempts = [
      ['post', '/api/v1/users', { fullName: 'X Y', email: 'x@y.test', role: 'admin', password: 'Aaaaaaaa1111' }, ['admin']],
      ['post', '/api/v1/vehicles', { registration: 'T 1 GP', makeModel: 'A', type: 'B', capacityKg: 100 }, ['fleet', 'admin']],
      ['post', '/api/v1/inventory', { warehouseId: 1, sku: 'ZZ-1', name: 'n', category: 'c' }, ['warehouse', 'admin']],
      ['post', '/api/v1/suppliers', { name: 'S', category: 'c' }, ['procurement', 'admin']],
      ['post', '/api/v1/invoices', { companyId: 1, description: 'd', subtotal: 100, dueDate: '2099-01-01' }, ['finance', 'admin']],
      ['post', '/api/v1/shipments', { companyId: 1, origin: 'A', destination: 'B', cargoDescription: 'c', weightKg: 10 }, ['dispatcher', 'admin']],
      ['post', '/api/v1/quotations', { origin: 'A', destination: 'B', cargoDescription: 'c', weightKg: 10 }, ['client']],
      ['post', '/api/v1/expenses', { department: 'fleet', category: 'c', description: 'd', amount: 10, expenseDate: '2026-01-01' }, ['finance', 'admin']],
    ];
    for (const [method, url, body, allowed] of attempts) {
      for (const role of ROLES.filter((r) => !allowed.includes(r))) {
        const res = await as(role)[method](url, body);
        expect([role, url, res.status]).toEqual([role, url, 403]);
      }
    }
  });

  it('only an administrator can assign roles, and cannot change their own role or deactivate themselves', async () => {
    const reg = await api().post('/api/v1/auth/register').send({ fullName: 'Role Test', email: `role.test${Date.now()}@example.test`, phone: '+27 82 555 0100', companyName: 'RT', password: 'Str0ng-Passw0rd!', confirmPassword: 'Str0ng-Passw0rd!' });
    const id = reg.body.user.id;
    for (const role of ROLES.filter((r) => r !== 'admin')) expect((await as(role).put(`/api/v1/users/${id}/role`, { role: 'dispatcher' })).status).toBe(403);
    const clientTry = await api().put(`/api/v1/users/${id}/role`).set('Authorization', `Bearer ${reg.body.accessToken}`).send({ role: 'admin' });
    expect(clientTry.status).toBe(403);
    const adminMe = (await as('admin').get('/api/v1/auth/me')).body.user.id;
    expect((await as('admin').put(`/api/v1/users/${adminMe}/role`, { role: 'client', companyId: 1 })).body.error.code).toBe('SELF_ROLE_CHANGE');
    expect((await as('admin').patch(`/api/v1/users/${adminMe}/status`, { status: 'inactive' })).body.error.code).toBe('SELF_DEACTIVATE');
    const promote = await as('admin').put(`/api/v1/users/${id}/role`, { role: 'dispatcher' });
    expect(promote.status).toBe(200);
    expect(promote.body.user.role).toBe('dispatcher');
    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: reg.body.refreshToken })).status).toBe(401); // role change forces re-login
  });

  it('administrators create staff accounts that can sign in with the assigned role; duplicates and weak passwords are refused', async () => {
    const email = `staff.${Date.now()}@mhambi-demo.test`;
    const pw = 'Initial-Passw0rd1';
    const created = await as('admin').post('/api/v1/users', { fullName: 'New Warehouse Staff', email, phone: '+27 82 555 0123', role: 'warehouse', password: pw });
    expect(created.status).toBe(201);
    expect(created.body.user.role).toBe('warehouse');
    expect(created.body.user.mustChangePassword).toBe(true);
    const login = await api().post('/api/v1/auth/login').send({ email, password: pw });
    expect(login.body.user.role).toBe('warehouse');
    expect((await as('admin').post('/api/v1/users', { fullName: 'Dup', email, role: 'fleet', password: pw })).status).toBe(409);
    expect((await as('admin').post('/api/v1/users', { fullName: 'Weak', email: `weak${Date.now()}@x.test`, role: 'fleet', password: 'weak' })).status).toBe(422);
    expect((await as('admin').post('/api/v1/users', { fullName: 'No Co', email: `noco${Date.now()}@x.test`, role: 'client', password: pw })).status).toBe(422);
    expect((await as('admin').post('/api/v1/users', { fullName: 'Drv', email: `drv${Date.now()}@x.test`, role: 'driver', password: pw })).status).toBe(422);
    const drv = await as('admin').post('/api/v1/users', { fullName: 'New Driver', email: `drv${Date.now()}@mhambi-demo.test`, role: 'driver', password: pw, licenceNumber: `DL-${Date.now()}` });
    expect(drv.status).toBe(201);
    expect(drv.body.user.driverId).toBeGreaterThan(0);
  });

  it('administrator can edit users, search and filter', async () => {
    const list = await as('admin').get('/api/v1/users?role=driver&limit=5');
    expect(list.status).toBe(200);
    expect(list.body.data.every((u) => u.role === 'driver')).toBe(true);
    expect(list.body.data.length).toBeLessThanOrEqual(5);
    const search = await as('admin').get('/api/v1/users?q=nomsa');
    expect(search.body.data.map((u) => u.email)).toContain(ACCOUNTS.admin);
    const target = list.body.data[0];
    const upd = await as('admin').patch(`/api/v1/users/${target.id}`, { phone: '+27 83 555 9999' });
    expect(upd.body.user.phone).toBe('+27 83 555 9999');
  });
});

describe('data isolation', () => {
  it("a client cannot see another company's shipments, quotations, invoices or documents", async () => {
    const mine = await as('client').get('/api/v1/shipments');
    expect(mine.body.data.length).toBeGreaterThan(0);
    expect(mine.body.data.every((s) => s.companyId === 1)).toBe(true);
    const other = await db.query('SELECT id FROM shipments WHERE company_id=2 LIMIT 1');
    expect((await as('client').get(`/api/v1/shipments/${other.rows[0].id}`)).status).toBe(404);
    const q = await db.query('SELECT id FROM quotations WHERE company_id=2 LIMIT 1');
    expect((await as('client').get(`/api/v1/quotations/${q.rows[0].id}`)).status).toBe(404);
    const inv = await db.query(`SELECT id FROM invoices WHERE company_id=2 AND status<>'draft' LIMIT 1`);
    expect((await as('client').get(`/api/v1/invoices/${inv.rows[0].id}`)).status).toBe(404);
    const doc = await db.query('SELECT id FROM documents WHERE company_id=2 LIMIT 1');
    expect((await as('client').get(`/api/v1/documents/${doc.rows[0].id}/download`)).status).toBe(404);
    expect((await as('client').get('/api/v1/invoices')).body.data.every((i) => i.companyId === 1)).toBe(true);
    expect((await as('client').get('/api/v1/documents')).body.data.every((d) => d.companyId === 1)).toBe(true);
    expect((await as('client').get('/api/v1/quotations')).body.data.every((x) => x.companyId === 1)).toBe(true);
  });

  it('clients cannot see driver or vehicle details or internal staff names on their shipments', async () => {
    const list = await as('client').get('/api/v1/shipments');
    const withAssignment = list.body.data.find((s) => s.assignment);
    expect(withAssignment.assignment.driverName).toBeNull();
    expect(withAssignment.assignment.vehicleRegistration).toBeNull();
    const detail = await as('client').get(`/api/v1/shipments/${withAssignment.id}`);
    expect(detail.body.history.every((h) => h.by === null)).toBe(true);
  });

  it("a driver only sees their own assignments and cannot open or modify another driver's shipment", async () => {
    const mine = await as('driver1').get('/api/v1/driver/deliveries');
    expect(mine.status).toBe(200);
    const ids = mine.body.data.map((s) => s.id);
    expect(ids.length).toBeGreaterThan(0);
    const all = await as('driver1').get('/api/v1/shipments');
    expect(all.body.data.length).toBeGreaterThan(0);
    const mineInDb = (await db.query('SELECT DISTINCT shipment_id FROM delivery_assignments WHERE driver_id=1')).rows.map((r) => Number(r.shipment_id));
    expect(all.body.data.every((s) => mineInDb.includes(s.id) && (!s.assignment || s.assignment.driverId === 1))).toBe(true);
    const foreign = await db.query(`SELECT shipment_id FROM delivery_assignments WHERE driver_id=2 AND status='active' LIMIT 1`);
    const foreignId = foreign.rows[0].shipment_id;
    expect(ids).not.toContain(Number(foreignId));
    expect((await as('driver1').get(`/api/v1/shipments/${foreignId}`)).status).toBe(403);
    expect((await as('driver1').patch(`/api/v1/shipments/${foreignId}/status`, { status: 'in_transit' })).status).toBe(403);
    expect((await as('driver1').post(`/api/v1/shipments/${foreignId}/pod`, { recipientName: 'Someone' })).status).toBe(403);
    expect((await as('driver1').post('/api/v1/incidents', { shipmentId: Number(foreignId), type: 'delay', description: 'not mine' })).status).toBe(403);
  });

  it('users only ever read their own notifications', async () => {
    const note = await db.query('SELECT id FROM notifications WHERE user_id=1 LIMIT 1');
    expect((await as('client').get(`/api/v1/notifications/${note.rows[0].id}`)).status).toBe(404);
    expect((await as('client').patch(`/api/v1/notifications/${note.rows[0].id}/read`)).status).toBe(404);
    const mine = await as('admin').get('/api/v1/notifications');
    expect(mine.body.data.length).toBeGreaterThan(0);
  });
});

describe('error handling', () => {
  it('returns JSON errors for unknown routes, bad ids and invalid query values', async () => {
    const nf = await as('admin').get('/api/v1/does-not-exist');
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('NOT_FOUND');
    expect((await as('admin').get('/api/v1/users/abc')).status).toBe(422);
    expect((await as('admin').get('/api/v1/users/999999')).status).toBe(404);
    expect((await as('admin').get('/api/v1/users?role=wizard')).status).toBe(422);
    expect((await as('dispatcher').get('/api/v1/shipments/999999')).status).toBe(404);
  });

  it('health endpoint reports database status', async () => {
    const res = await api().get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });
});

void SEED_PASSWORD;
