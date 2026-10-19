'use strict';

const db = require('../src/config/db');
const { api, as, ACCOUNTS, SEED_PASSWORD } = require('./helpers');

afterAll(async () => { await db.close(); });
const API = '/api/v1';
const stamp = Date.now().toString(36).toUpperCase();

describe('fleet', () => {
  let v;
  it('registers, edits and validates vehicles', async () => {
    expect((await as('fleet').post(`${API}/vehicles`, { registration: `FL ${stamp}`, makeModel: 'Test', type: 'Van', capacityKg: 0 })).status).toBe(422);
    const res = await as('fleet').post(`${API}/vehicles`, { registration: `fl ${stamp} gp`, makeModel: 'Test Van', type: 'Panel van', capacityKg: 1200, mileageKm: 5000, nextServiceDate: '2099-01-01' });
    expect(res.status).toBe(201);
    v = res.body.vehicle;
    expect(v).toMatchObject({ registration: `FL ${stamp} GP`, status: 'available', capacityKg: 1200 });
    expect((await as('fleet').post(`${API}/vehicles`, { registration: v.registration, makeModel: 'Dup', type: 'Van', capacityKg: 10 })).status).toBe(409);
    const upd = await as('fleet').patch(`${API}/vehicles/${v.id}`, { capacityKg: 1500, type: 'Large panel van' });
    expect(upd.body.vehicle).toMatchObject({ capacityKg: 1500, type: 'Large panel van', mileageKm: 5000, makeModel: 'Test Van' });
    expect((await as('fleet').patch(`${API}/vehicles/${v.id}`, { status: 'on_route' })).body.error.code).toBe('INVALID_STATUS');
    expect((await as('fleet').patch(`${API}/vehicles/${v.id}`, { status: 'idle' })).body.vehicle.status).toBe('idle');
  });

  it('prevents changing or retiring a vehicle that has a live assignment', async () => {
    const live = await db.query(`SELECT vehicle_id FROM delivery_assignments WHERE status='assigned' LIMIT 1`);
    const id = live.rows[0].vehicle_id;
    expect((await as('fleet').patch(`${API}/vehicles/${id}`, { status: 'maintenance' })).body.error.code).toBe('VEHICLE_ASSIGNED');
    expect((await as('fleet').del(`${API}/vehicles/${id}`)).status).toBe(409);
  });

  it('lists only assignable vehicles for dispatch and filters by capacity', async () => {
    const list = await as('dispatcher').get(`${API}/vehicles?status=available&minCapacityKg=7000`);
    expect(list.body.data.length).toBeGreaterThan(0);
    expect(list.body.data.every((x) => x.status === 'available' && x.capacityKg >= 7000)).toBe(true);
  });

  it('runs a maintenance cycle that takes the vehicle out of service and back', async () => {
    await as('fleet').patch(`${API}/vehicles/${v.id}`, { status: 'available' });
    expect((await as('fleet').post(`${API}/maintenance`, { vehicleId: v.id, type: 'Service', scheduledDate: 'tomorrow' })).status).toBe(422);
    const m = await as('fleet').post(`${API}/maintenance`, { vehicleId: v.id, type: 'Full service', description: 'Test', cost: 2500, scheduledDate: new Date().toISOString().slice(0, 10) });
    expect(m.status).toBe(201);
    const up = await as('fleet').get(`${API}/maintenance/upcoming`);
    expect(up.body.scheduled.map((r) => r.id)).toContain(m.body.record.id);
    expect((await as('fleet').patch(`${API}/maintenance/${m.body.record.id}`, { status: 'in_progress' })).body.record.status).toBe('in_progress');
    expect((await as('fleet').get(`${API}/vehicles/${v.id}`)).body.vehicle.status).toBe('maintenance');
    const done = await as('fleet').patch(`${API}/maintenance/${m.body.record.id}`, { status: 'completed', cost: 2750 });
    expect(done.body.record).toMatchObject({ status: 'completed', cost: 2750 });
    const after = (await as('fleet').get(`${API}/vehicles/${v.id}`)).body.vehicle;
    expect(after.status).toBe('available');
    expect(after.lastServiceDate).toBeTruthy();
    expect((await as('fleet').patch(`${API}/maintenance/${m.body.record.id}`, { status: 'in_progress' })).status).toBe(409);
  });

  it('records fuel with server-side totals and protects the odometer', async () => {
    expect((await as('fleet').post(`${API}/fuel`, { vehicleId: v.id, litres: 0, costPerLitre: 23 })).status).toBe(422);
    expect((await as('fleet').post(`${API}/fuel`, { vehicleId: v.id, litres: 50, costPerLitre: 23, odometerKm: 100 })).body.error.code).toBe('ODOMETER_LOWER');
    const ok = await as('fleet').post(`${API}/fuel`, { vehicleId: v.id, litres: 50, costPerLitre: 23.5, odometerKm: 5200, station: 'Test Station' });
    expect(ok.status).toBe(201);
    expect(ok.body.transaction.totalCost).toBe(1175);
    expect((await as('fleet').get(`${API}/vehicles/${v.id}`)).body.vehicle.mileageKm).toBe(5200);
    expect((await as('fleet').get(`${API}/fuel?vehicleId=${v.id}`)).body.totalCost).toBe(1175);
  });

  it('shows live fleet status and retires vehicles without deleting history', async () => {
    const o = await as('fleet').get(`${API}/fleet/overview`);
    expect(o.body.liveAssignments.length).toBeGreaterThan(0);
    expect(o.body.statusCounts.available).toBeGreaterThan(0);
    expect((await as('fleet').del(`${API}/vehicles/${v.id}`)).status).toBe(200);
    expect((await as('fleet').get(`${API}/vehicles/${v.id}`)).body.vehicle.status).toBe('retired');
    expect((await as('fleet').get(`${API}/reports/fleet`)).body.tables.length).toBeGreaterThan(0);
  });
});

describe('procurement', () => {
  let sup; let pr; let po;
  it('manages suppliers', async () => {
    expect((await as('procurement').post(`${API}/suppliers`, { name: '', category: 'x' })).status).toBe(422);
    expect((await as('procurement').post(`${API}/suppliers`, { name: 'Bad Mail', category: 'x', email: 'nope' })).status).toBe(422);
    const res = await as('procurement').post(`${API}/suppliers`, { name: `Test Supplier ${stamp}`, category: 'Test', contactName: 'T. Person', email: `s${stamp}@supplier-demo.test`, phone: '+27 11 555 0100' });
    expect(res.status).toBe(201);
    sup = res.body.supplier;
    expect((await as('procurement').patch(`${API}/suppliers/${sup.id}`, { category: 'Updated' })).body.supplier.category).toBe('Updated');
    expect((await as('procurement').get(`${API}/suppliers?q=${stamp}`)).body.data).toHaveLength(1);
  });

  it('takes a purchase request through approval to an order', async () => {
    expect((await as('warehouse').post(`${API}/purchase-requests`, { item: 'Pallet jacks', quantity: 0, estimatedCost: 100 })).status).toBe(422);
    const res = await as('warehouse').post(`${API}/purchase-requests`, { item: 'Pallet jacks', quantity: 4, estimatedCost: 18000, justification: 'Replace broken units' });
    expect(res.status).toBe(201);
    pr = res.body.request;
    expect((await as('procurement').get(`${API}/notifications`)).body.data.some((n) => n.entityType === 'purchase_request' && n.entityId === pr.id)).toBe(true);
    expect((await as('warehouse').get(`${API}/purchase-requests`)).body.data.every((r) => r.requestedById === (JSON.parse(JSON.stringify(res.body)).request.requestedById))).toBe(true);
    expect((await as('warehouse').patch(`${API}/purchase-requests/${pr.id}/decision`, { decision: 'approve' })).status).toBe(403);
    const orderTooEarly = await as('procurement').post(`${API}/purchase-orders`, { supplierId: sup.id, purchaseRequestId: pr.id, item: 'Pallet jacks', quantity: 4, unitCost: 4500 });
    expect(orderTooEarly.body.error.code).toBe('REQUEST_NOT_APPROVED');
    expect((await as('procurement').patch(`${API}/purchase-requests/${pr.id}/decision`, { decision: 'approve' })).body.request.status).toBe('approved');
    expect((await as('procurement').patch(`${API}/purchase-requests/${pr.id}/decision`, { decision: 'reject' })).status).toBe(409);
    const order = await as('procurement').post(`${API}/purchase-orders`, { supplierId: sup.id, purchaseRequestId: pr.id, item: 'Pallet jacks', quantity: 4, unitCost: 4500 });
    expect(order.status).toBe(201);
    po = order.body.order;
    expect(po).toMatchObject({ status: 'draft', total: 18000, quantityReceived: 0 });
    expect((await as('procurement').get(`${API}/purchase-requests?status=ordered`)).body.data.map((r) => r.id)).toContain(pr.id);
  });

  it('enforces the purchase-order lifecycle and goods-received rules', async () => {
    expect((await as('procurement').patch(`${API}/purchase-orders/${po.id}/status`, { status: 'ordered' })).status).toBe(409); // draft -> ordered not allowed
    for (const s of ['pending', 'approved', 'ordered']) expect((await as('procurement').patch(`${API}/purchase-orders/${po.id}/status`, { status: s })).body.order.status).toBe(s);
    const inv = (await as('warehouse').post(`${API}/inventory`, { warehouseId: 2, sku: `PJ-${stamp}`, name: 'Pallet jacks', category: 'Equipment', quantity: 0 })).body.item;
    const bad = [{ purchaseOrderId: po.id, warehouseId: 2, quantityReceived: 5 }, { purchaseOrderId: po.id, warehouseId: 3, quantityReceived: 1, inventoryId: inv.id }];
    expect((await as('warehouse').post(`${API}/goods-received`, bad[0])).body.error.code).toBe('OVER_RECEIPT');
    expect((await as('warehouse').post(`${API}/goods-received`, bad[1])).body.error.code).toBe('INVALID_INVENTORY');
    expect((await as('client').post(`${API}/goods-received`, { purchaseOrderId: po.id, warehouseId: 2, quantityReceived: 1 })).status).toBe(403);
    const part = await as('warehouse').post(`${API}/goods-received`, { purchaseOrderId: po.id, warehouseId: 2, quantityReceived: 3, inventoryId: inv.id, note: 'Part delivery' });
    expect(part.status).toBe(201);
    expect((await as('warehouse').get(`${API}/inventory/${inv.id}`)).body.item.quantity).toBe(3);
    expect((await as('procurement').get(`${API}/purchase-orders?status=ordered`)).body.data.find((o) => o.id === po.id).quantityReceived).toBe(3);
    expect((await as('procurement').patch(`${API}/purchase-orders/${po.id}/status`, { status: 'cancelled' })).status).toBe(409); // goods already received
    await as('warehouse').post(`${API}/goods-received`, { purchaseOrderId: po.id, warehouseId: 2, quantityReceived: 1, inventoryId: inv.id });
    expect((await as('procurement').get(`${API}/purchase-orders?status=received`)).body.data.map((o) => o.id)).toContain(po.id);
    expect((await as('warehouse').post(`${API}/goods-received`, { purchaseOrderId: po.id, warehouseId: 2, quantityReceived: 1 })).status).toBe(409);
    expect((await as('warehouse').get(`${API}/inventory/${inv.id}`)).body.item.quantity).toBe(4);
    expect((await as('procurement').get(`${API}/goods-received`)).body.data.length).toBeGreaterThanOrEqual(12);
  });

  it('captures supplier invoices once, finance pays them, and summaries are generated', async () => {
    const body = { invoiceNumber: `SI-${stamp}`, supplierId: sup.id, purchaseOrderId: po.id, amount: 20700, issueDate: '2026-10-01', dueDate: '2026-10-31' };
    expect((await as('procurement').post(`${API}/supplier-invoices`, { ...body, dueDate: '2026-09-01' })).status).toBe(422);
    const res = await as('procurement').post(`${API}/supplier-invoices`, body);
    expect(res.status).toBe(201);
    expect((await as('procurement').post(`${API}/supplier-invoices`, body)).status).toBe(409);
    expect((await as('procurement').patch(`${API}/supplier-invoices/${res.body.invoice.id}/pay`)).status).toBe(403);
    const pay = await as('finance').patch(`${API}/supplier-invoices/${res.body.invoice.id}/pay`);
    expect(pay.body.invoice.status).toBe('paid');
    expect((await as('finance').patch(`${API}/supplier-invoices/${res.body.invoice.id}/pay`)).status).toBe(409);
    const rep = await as('procurement').get(`${API}/reports/procurement`);
    expect(rep.body.tables.map((t) => t.name)).toContain('Spend by supplier');
    expect((await as('procurement').get(`${API}/reports/procurement?format=csv`)).headers['content-type']).toMatch(/csv/);
    expect((await as('procurement').del(`${API}/suppliers/${sup.id}`)).body.error.code).toBe('SUPPLIER_IN_USE');
  });
});

describe('finance extras', () => {
  it('creates draft invoices, edits them, issues and cancels', async () => {
    const draft = await as('finance').post(`${API}/invoices`, { companyId: 5, description: 'Standalone storage fee', subtotal: 1000, dueDate: '2099-03-31', issue: false });
    expect(draft.body.invoice.status).toBe('draft');
    expect((await as('client').get(`${API}/invoices/${draft.body.invoice.id}`)).status).toBe(404); // drafts hidden from clients
    expect((await as('finance').patch(`${API}/invoices/${draft.body.invoice.id}`, { subtotal: 2000 })).body.invoice).toMatchObject({ subtotal: 2000, vatAmount: 300, total: 2300 });
    expect((await as('finance').post(`${API}/invoices/${draft.body.invoice.id}/issue`)).body.invoice.status).toBe('unpaid');
    expect((await as('finance').post(`${API}/invoices/${draft.body.invoice.id}/issue`)).status).toBe(409);
    expect((await as('finance').post(`${API}/invoices/${draft.body.invoice.id}/cancel`)).body.invoice.status).toBe('cancelled');
    expect((await as('finance').post(`${API}/invoices`, { companyId: 5, description: 'bad dates', subtotal: 10, issueDate: '2026-05-02', dueDate: '2026-05-01' })).status).toBe(422);
    expect((await as('finance').post(`${API}/invoices`, { companyId: 99999, description: 'x', subtotal: 10, dueDate: '2099-01-01' })).status).toBe(422);
  });

  it('flags overdue invoices, filters them, and lists balances per client', async () => {
    const overdue = await as('finance').get(`${API}/invoices?status=overdue`);
    expect(overdue.body.data.length).toBeGreaterThan(0);
    expect(overdue.body.data.every((i) => i.displayStatus === 'overdue' && i.balance > 0)).toBe(true);
    const rec = await as('finance').get(`${API}/finance/receivables`);
    expect(rec.body.totalOutstanding).toBeGreaterThan(0);
    expect(rec.body.data[0]).toHaveProperty('overdue');
    expect((await as('finance').get(`${API}/finance/payables`)).body.totalPayable).toBeGreaterThan(0);
    const csv = await as('finance').get(`${API}/invoices?format=csv`);
    expect(csv.text).toMatch(/INV-0001/);
  });

  it('manages expenses and budgets with computed spend', async () => {
    expect((await as('finance').post(`${API}/expenses`, { department: 'fleet', category: 'Tolls', description: 'x', amount: 0, expenseDate: '2026-11-05' })).status).toBe(422);
    expect((await as('finance').post(`${API}/expenses`, { department: 'bogus', category: 'Tolls', description: 'x', amount: 5, expenseDate: '2026-11-05' })).status).toBe(422);
    const b = await as('finance').post(`${API}/budgets`, { department: 'procurement', periodLabel: `T-${stamp}`, startDate: '2027-01-01', endDate: '2027-03-31', allocatedAmount: 10000 });
    expect(b.status).toBe(201);
    expect((await as('finance').post(`${API}/budgets`, { department: 'procurement', periodLabel: `T-${stamp}`, startDate: '2027-01-01', endDate: '2027-03-31', allocatedAmount: 5 })).status).toBe(409);
    const e = await as('finance').post(`${API}/expenses`, { department: 'procurement', category: 'Travel', description: 'Supplier visit', amount: 2500, expenseDate: '2027-02-10' });
    expect(e.body.expense.status).toBe('pending');
    expect((await as('finance').get(`${API}/budgets`)).body.data.find((x) => x.id === b.body.budget.id).spent).toBe(0);
    expect((await as('finance').patch(`${API}/expenses/${e.body.expense.id}/decision`, { decision: 'approve' })).body.expense.status).toBe('approved');
    expect((await as('finance').patch(`${API}/expenses/${e.body.expense.id}/decision`, { decision: 'reject' })).status).toBe(409);
    const after = (await as('finance').get(`${API}/budgets`)).body.data.find((x) => x.id === b.body.budget.id);
    expect(after).toMatchObject({ spent: 2500, remaining: 7500, overBudget: false });
    expect((await as('finance').patch(`${API}/budgets/${b.body.budget.id}`, { allocatedAmount: 2000 })).body.budget.overBudget).toBe(true);
    expect((await as('finance').del(`${API}/expenses/${e.body.expense.id}`)).status).toBe(409); // approved: part of the record
    expect((await as('finance').del(`${API}/budgets/${b.body.budget.id}`)).status).toBe(200);
    const fin = await as('finance').get(`${API}/reports/finance`);
    expect(fin.body.summary.map((s) => s.label)).toContain('Total invoiced');
  });
});

describe('admin features', () => {
  it('manages companies', async () => {
    expect((await as('admin').post(`${API}/companies`, { name: '' })).status).toBe(422);
    const c = await as('admin').post(`${API}/companies`, { name: `Test Co ${stamp}`, city: 'Durban', email: `a${stamp}@testco.test` });
    expect(c.status).toBe(201);
    const upd = await as('admin').patch(`${API}/companies/${c.body.company.id}`, { status: 'inactive', industry: 'Testing' });
    expect(upd.body.company).toMatchObject({ status: 'inactive', industry: 'Testing', city: 'Durban' });
    expect((await as('admin').get(`${API}/companies?status=inactive&q=${stamp}`)).body.total).toBe(1);
    expect((await as('dispatcher').post(`${API}/shipments`, { companyId: c.body.company.id, origin: 'A', destination: 'B', cargoDescription: 'c', weightKg: 5 })).body.error.code).toBe('INVALID_COMPANY');
  });

  it('clients can update only the permitted details of their own company', async () => {
    const res = await as('client').patch(`${API}/companies/me`, { phone: '+27 11 555 7777', address: '1 New Road', name: 'HACKED', vatNumber: '000' });
    expect(res.status).toBe(200);
    expect(res.body.company).toMatchObject({ phone: '+27 11 555 7777', address: '1 New Road' });
    expect(res.body.company.name).not.toBe('HACKED');
    expect(res.body.company.vatNumber).not.toBe('000');
    expect((await as('client').patch(`${API}/companies/me`, { email: 'nope' })).status).toBe(422);
    expect((await as('dispatcher').get(`${API}/companies/me`)).status).toBe(403);
  });

  it('records and filters audit logs, and exports data', async () => {
    const logs = await as('admin').get(`${API}/audit-logs?action=company.create`);
    expect(logs.body.data.length).toBeGreaterThan(0);
    expect(logs.body.data[0].userName).toBeTruthy();
    expect((await as('admin').get(`${API}/audit-logs?format=csv`)).text.split('\r\n')[0]).toContain('action');
    const tables = await as('admin').get(`${API}/admin/tables`);
    expect(tables.body.data.find((t) => t.table === 'users').rows).toBeGreaterThan(10);
    const exp = await as('admin').get(`${API}/admin/export/users`);
    expect(exp.status).toBe(200);
    expect(exp.text).not.toMatch(/password/i);
    expect((await as('admin').get(`${API}/admin/export/refresh_sessions`)).status).toBe(404);
    expect((await as('admin').get(`${API}/roles`)).body.data).toHaveLength(8);
  });

  it('administrators can broadcast notifications to a role', async () => {
    const res = await as('admin').post(`${API}/notifications`, { role: 'driver', title: 'Safety briefing', message: 'Toolbox talk at 07:00', type: 'warning' });
    const drivers = await db.query(`SELECT COUNT(*)::int n FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.code='driver' AND u.status='active'`);
    expect(res.body.sent).toBe(drivers.rows[0].n);
    expect(res.body.sent).toBeGreaterThanOrEqual(10);
    expect((await as('driver').get(`${API}/notifications`)).body.data.some((n) => n.title === 'Safety briefing')).toBe(true);
    expect((await as('admin').post(`${API}/notifications`, { title: 'x', message: 'y' })).status).toBe(422);
    expect((await as('client').post(`${API}/notifications`, { role: 'driver', title: 'x', message: 'y' })).status).toBe(403);
  });
});

describe('settings, notifications, documents and support', () => {
  it('persists user settings across sessions and validates values', async () => {
    expect((await as('client').get(`${API}/settings/me`)).body.settings).toMatchObject({ theme: expect.any(String), inAppNotifications: expect.any(Boolean) });
    expect((await as('client').put(`${API}/settings/me`, { theme: 'neon' })).status).toBe(422);
    expect((await as('client').put(`${API}/settings/me`, {})).status).toBe(422);
    const res = await as('client2').put(`${API}/settings/me`, { theme: 'dark', emailNotifications: true, language: 'zu' });
    expect(res.body.settings).toMatchObject({ theme: 'dark', emailNotifications: true, language: 'zu' });
    const fresh = await api().post(`${API}/auth/login`).send({ email: ACCOUNTS.client2, password: SEED_PASSWORD() }); // brand-new session
    const again = await api().get(`${API}/settings/me`).set('Authorization', `Bearer ${fresh.body.accessToken}`);
    expect(again.body.settings).toMatchObject({ theme: 'dark', emailNotifications: true, language: 'zu' });
    expect((await as('client').get(`${API}/settings/me`)).body.settings.theme).not.toBe('dark'); // settings are per user
  });

  it('respects the in-app notification preference', async () => {
    await as('fleet').put(`${API}/settings/me`, { inAppNotifications: false });
    const before = (await as('fleet').get(`${API}/notifications`)).body.data.length;
    await as('admin').post(`${API}/notifications`, { userId: (await as('fleet').get(`${API}/auth/me`)).body.user.id, title: 'Muted', message: 'should not arrive' });
    expect((await as('fleet').get(`${API}/notifications`)).body.data.length).toBe(before);
    await as('fleet').put(`${API}/settings/me`, { inAppNotifications: true });
  });

  it('marks notifications read, counts unread, and deletes', async () => {
    const list = await as('client2').get(`${API}/notifications?unread=true`);
    expect(list.body.unreadCount).toBe(list.body.data.length);
    expect(list.body.unreadCount).toBeGreaterThan(0);
    const detail = await as('client2').get(`${API}/notifications/${list.body.data[0].id}`);
    expect(detail.body.notification.message).toBeTruthy();
    expect((await as('client2').get(`${API}/notifications/unread-count`)).body.unreadCount).toBe(list.body.unreadCount);
    const all = await as('client2').post(`${API}/notifications/read-all`);
    expect(all.body.unreadCount).toBe(0);
    expect((await as('client2').get(`${API}/notifications?unread=true`)).body.data).toHaveLength(0);
    expect((await as('client2').del(`${API}/notifications/${list.body.data[0].id}`)).status).toBe(200);
    expect((await as('client2').get(`${API}/notifications/999999`)).status).toBe(404);
  });

  it('administrator system settings drive the VAT rate on new invoices', async () => {
    expect((await as('finance').put(`${API}/settings/system`, { vatRate: 0.2 })).status).toBe(403);
    expect((await as('admin').put(`${API}/settings/system`, { vatRate: 5 })).status).toBe(422);
    expect((await as('admin').put(`${API}/settings/system`, { supportEmail: 'bad' })).status).toBe(422);
    expect((await as('admin').put(`${API}/settings/system`, { vatRate: 0.2, tradingHours: 'Mon-Sat 06:00-18:00' })).body.settings).toMatchObject({ vatRate: 0.2, tradingHours: 'Mon-Sat 06:00-18:00' });
    const inv = await as('finance').post(`${API}/invoices`, { companyId: 6, description: 'VAT test', subtotal: 1000, dueDate: '2099-01-01' });
    expect(inv.body.invoice).toMatchObject({ vatAmount: 200, total: 1200 });
    await as('admin').put(`${API}/settings/system`, { vatRate: 0.15 });
    expect((await as('finance').post(`${API}/invoices`, { companyId: 6, description: 'VAT test 2', subtotal: 1000, dueDate: '2099-01-01' })).body.invoice.vatAmount).toBe(150);
  });

  it('lets clients upload, download and delete their own documents with safe file types only', async () => {
    const pdf = Buffer.from('%PDF-1.4 test').toString('base64');
    const base = { title: 'Delivery note', fileName: 'note.pdf', mimeType: 'application/pdf', contentBase64: pdf };
    expect((await as('client').post(`${API}/documents`, { ...base, mimeType: 'text/html' })).body.error.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect((await as('client').post(`${API}/documents`, { ...base, mimeType: 'image/svg+xml' })).status).toBe(422);
    expect((await as('client').post(`${API}/documents`, { ...base, contentBase64: '***' })).status).toBe(422);
    expect((await as('driver').post(`${API}/documents`, base)).status).toBe(403);
    const up = await as('client').post(`${API}/documents`, base);
    expect(up.status).toBe(201);
    const dl = await as('client').get(`${API}/documents/${up.body.id}/download`);
    expect(dl.headers['content-type']).toMatch(/pdf/);
    expect(dl.headers['content-disposition']).toMatch(/attachment/);
    expect(Buffer.from(dl.body).toString()).toContain('%PDF');
    expect((await as('client2').get(`${API}/documents/${up.body.id}/download`)).status).toBe(404);
    expect((await as('finance').get(`${API}/documents?companyId=1`)).body.data.map((d) => d.id)).toContain(up.body.id);
    expect((await as('client2').del(`${API}/documents/${up.body.id}`)).status).toBe(404);
    expect((await as('client').del(`${API}/documents/${up.body.id}`)).status).toBe(200);
    const seeded = (await as('client').get(`${API}/documents?type=invoice`)).body.data[0];
    expect((await as('client').del(`${API}/documents/${seeded.id}`)).status).toBe(403); // generated records cannot be deleted by clients
  });

  it('runs the support workflow: client submits, staff respond, client is notified', async () => {
    expect((await as('client').post(`${API}/support`, { subject: '', message: '' })).status).toBe(422);
    const body = { category: 'billing', subject: `Question ${stamp}`, message: 'Please explain the VAT line.' };
    const res = await as('client').post(`${API}/support`, body);
    expect(res.status).toBe(201);
    expect((await as('client').post(`${API}/support`, body)).body.error.code).toBe('DUPLICATE_SUBMISSION');
    const id = res.body.request.id;
    expect((await as('client2').get(`${API}/support/${id}`)).status).toBe(404);
    expect((await as('client').patch(`${API}/support/${id}`, { status: 'resolved' })).status).toBe(403);
    expect((await as('admin').patch(`${API}/support/${id}`, {})).status).toBe(422);
    const upd = await as('admin').patch(`${API}/support/${id}`, { status: 'resolved', response: 'VAT is charged at 15%.' });
    expect(upd.body.request).toMatchObject({ status: 'resolved', response: 'VAT is charged at 15%.' });
    expect((await as('client').get(`${API}/notifications`)).body.data.some((n) => n.entityType === 'support' && n.entityId === id)).toBe(true);
    expect((await as('client').get(`${API}/support?status=resolved`)).body.data.map((s) => s.id)).toContain(id);
  });

  it('dashboards contain no placeholder statistics: values change when data changes', async () => {
    const before = (await as('dispatcher').get(`${API}/dashboard`)).body.cards.find((c) => c.key === 'pending').value;
    await as('dispatcher').post(`${API}/shipments`, { companyId: 7, origin: 'A', destination: 'B', cargoDescription: 'Dashboard probe', weightKg: 10 });
    const after = (await as('dispatcher').get(`${API}/dashboard`)).body.cards.find((c) => c.key === 'pending').value;
    expect(after).toBe(before + 1);
    const real = (await db.query(`SELECT COUNT(*)::int n FROM shipments WHERE status='pending'`)).rows[0].n;
    expect(after).toBe(real);
    for (const role of ['admin', 'dispatcher', 'warehouse', 'fleet', 'procurement', 'finance', 'driver', 'client']) {
      const d = (await as(role).get(`${API}/dashboard`)).body;
      expect([role, d.role, d.cards.length > 0]).toEqual([role, role, true]);
    }
  });
});
