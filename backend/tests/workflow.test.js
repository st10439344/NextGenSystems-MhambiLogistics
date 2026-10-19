'use strict';

const db = require('../src/config/db');
const { api, as } = require('./helpers');

afterAll(async () => { await db.close(); });

const state = {};
const API = '/api/v1';

describe('complete workflow: quotation -> shipment -> dispatch -> delivery -> invoice -> payment', () => {
  it('1. Client submits a quotation (validated, duplicate-protected)', async () => {
    const body = { origin: 'Johannesburg', destination: 'Durban', cargoDescription: 'Workflow test steel coils', weightKg: 5000, serviceType: 'standard', preferredDate: '2026-12-01' };
    expect((await as('client').post(`${API}/quotations`, { ...body, weightKg: -5 })).status).toBe(422);
    expect((await as('client').post(`${API}/quotations`, { ...body, origin: '' })).status).toBe(422);
    const res = await as('client').post(`${API}/quotations`, body);
    expect(res.status).toBe(201);
    expect(res.body.quotation.reference).toMatch(/^QT-\d+$/);
    expect(res.body.quotation.status).toBe('submitted');
    state.q = res.body.quotation;
    const dup = await as('client').post(`${API}/quotations`, body);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_SUBMISSION');
  });

  it('2. Authorised staff see it and are notified; clients and drivers cannot process it', async () => {
    const list = await as('procurement').get(`${API}/quotations?status=submitted`);
    expect(list.body.data.map((q) => q.id)).toContain(state.q.id);
    const notes = await as('procurement').get(`${API}/notifications?unread=true`);
    expect(notes.body.data.some((n) => n.entityType === 'quotation' && n.entityId === state.q.id)).toBe(true);
    for (const who of ['client', 'driver', 'warehouse', 'finance']) {
      expect([who, (await as(who).patch(`${API}/quotations/${state.q.id}/process`, { action: 'review' })).status]).toEqual([who, 403]);
    }
  });

  it('3. Procurement reviews and quotes; invalid actions are refused', async () => {
    expect((await as('procurement').patch(`${API}/quotations/${state.q.id}/process`, { action: 'quote' })).status).toBe(422);
    expect((await as('procurement').patch(`${API}/quotations/${state.q.id}/process`, { action: 'reject' })).status).toBe(422);
    expect((await as('procurement').patch(`${API}/quotations/${state.q.id}/process`, { action: 'review' })).body.quotation.status).toBe('in_review');
    expect((await as('procurement').patch(`${API}/quotations/${state.q.id}/process`, { action: 'review' })).status).toBe(409);
    const quoted = await as('procurement').patch(`${API}/quotations/${state.q.id}/process`, { action: 'quote', quotedAmount: 12000, notes: 'Per route tariff' });
    expect(quoted.status).toBe(200);
    expect(quoted.body.quotation.status).toBe('quoted');
    expect(quoted.body.quotation.quotedAmount).toBe(12000);
  });

  it('4. Client sees the updated status and notification, then accepts', async () => {
    const q = await as('client').get(`${API}/quotations/${state.q.id}`);
    expect(q.body.quotation.status).toBe('quoted');
    const notes = await as('client').get(`${API}/notifications`);
    expect(notes.body.data.some((n) => n.entityType === 'quotation' && n.entityId === state.q.id)).toBe(true);
    expect((await as('client2').post(`${API}/quotations/${state.q.id}/respond`, { action: 'accept' })).status).toBe(404); // another company
    expect((await as('dispatcher').post(`${API}/quotations/${state.q.id}/convert`)).status).toBe(409); // not accepted yet
    const accepted = await as('client').post(`${API}/quotations/${state.q.id}/respond`, { action: 'accept' });
    expect(accepted.body.quotation.status).toBe('accepted');
    expect((await as('client').post(`${API}/quotations/${state.q.id}/respond`, { action: 'accept' })).status).toBe(409);
  });

  it('5. Dispatcher converts it into a shipment with a unique tracking reference', async () => {
    expect((await as('client').post(`${API}/quotations/${state.q.id}/convert`)).status).toBe(403);
    const res = await as('dispatcher').post(`${API}/quotations/${state.q.id}/convert`, { priority: 'high' });
    expect(res.status).toBe(201);
    expect(res.body.shipment.trackingRef).toMatch(/^MHM-\d{6}$/);
    expect(res.body.shipment.status).toBe('pending');
    state.ship = res.body.shipment;
    expect((await as('dispatcher').post(`${API}/quotations/${state.q.id}/convert`)).status).toBe(409);
    const q = await as('client').get(`${API}/quotations/${state.q.id}`);
    expect(q.body.quotation.status).toBe('converted');
    expect(q.body.quotation.trackingRef).toBe(state.ship.trackingRef);
  });

  it('6. Public tracking works for valid references and handles invalid ones', async () => {
    const ok = await api().get(`${API}/track/${state.ship.trackingRef}`);
    expect(ok.status).toBe(200);
    expect(ok.body.shipment.status).toBe('pending');
    expect(ok.body.history).toHaveLength(1);
    expect(JSON.stringify(ok.body)).not.toMatch(/driver|company|weight/i);
    expect((await api().get(`${API}/track/MHM-999999`)).status).toBe(404);
    expect((await api().get(`${API}/track/hello`)).status).toBe(400);
    expect((await api().get(`${API}/track/${state.ship.trackingRef.toLowerCase()}`)).status).toBe(200);
  });

  it('7. Dispatcher cannot assign unavailable resources (maintenance vehicle, off-duty driver, overloaded vehicle)', async () => {
    const id = state.ship.id;
    const ok = { scheduledPickup: '2026-12-02T08:00:00Z', scheduledDelivery: '2026-12-03T16:00:00Z' };
    const maint = await as('dispatcher').post(`${API}/shipments/${id}/assign`, { driverId: 6, vehicleId: 6, ...ok });
    expect(maint.status).toBe(409);
    expect(maint.body.error.code).toBe('VEHICLE_UNAVAILABLE');
    const offDuty = await as('dispatcher').post(`${API}/shipments/${id}/assign`, { driverId: 10, vehicleId: 9, ...ok });
    expect(offDuty.body.error.code).toBe('DRIVER_UNAVAILABLE');
    const small = await as('dispatcher').post(`${API}/shipments/${id}/assign`, { driverId: 6, vehicleId: 12, ...ok });
    expect(small.status).toBe(422);
    expect(small.body.error.code).toBe('CAPACITY_EXCEEDED');
    expect((await as('dispatcher').post(`${API}/shipments/${id}/assign`, { driverId: 6, vehicleId: 9, scheduledPickup: '2026-12-05T08:00:00Z', scheduledDelivery: '2026-12-04T08:00:00Z' })).status).toBe(422);
    expect((await as('dispatcher').post(`${API}/shipments/${id}/assign`, { vehicleId: 9 })).status).toBe(422);
    expect((await as('dispatcher').post(`${API}/shipments/${id}/assign`, { driverId: 9999, vehicleId: 9 })).status).toBe(404);
  });

  it('8. Dispatcher assigns an available driver and vehicle; the assignment is saved and visible to the driver', async () => {
    const res = await as('dispatcher').post(`${API}/shipments/${state.ship.id}/assign`, { driverId: 6, vehicleId: 9, scheduledPickup: '2026-12-02T08:00:00Z', scheduledDelivery: '2026-12-03T16:00:00Z' });
    expect(res.status).toBe(200);
    expect(res.body.shipment.status).toBe('assigned');
    expect(res.body.shipment.assignment).toMatchObject({ driverId: 6, vehicleId: 9, status: 'assigned' });
    const v = await db.query('SELECT status FROM vehicles WHERE id=9');
    expect(v.rows[0].status).toBe('assigned');
    const row = await db.query(`SELECT COUNT(*)::int n FROM delivery_assignments WHERE shipment_id=$1 AND status='assigned'`, [state.ship.id]);
    expect(row.rows[0].n).toBe(1);
    const mine = await as('driver').get(`${API}/driver/deliveries`);
    expect(mine.body.data.map((s) => s.id)).toContain(state.ship.id);
    const notes = await as('driver').get(`${API}/notifications`);
    expect(notes.body.data.some((n) => n.entityType === 'shipment' && n.entityId === state.ship.id)).toBe(true);
    // the same vehicle cannot be booked twice, nor the shipment re-assigned
    const other = await as('dispatcher').post(`${API}/shipments`, { companyId: 1, origin: 'Pretoria', destination: 'Cape Town', cargoDescription: 'Second load', weightKg: 800 });
    expect(other.status).toBe(201);
    state.ship2 = other.body.shipment;
    expect((await as('dispatcher').post(`${API}/shipments/${state.ship2.id}/assign`, { driverId: 7, vehicleId: 9 })).body.error.code).toBe('VEHICLE_UNAVAILABLE');
    expect((await as('dispatcher').post(`${API}/shipments/${state.ship.id}/assign`, { driverId: 7, vehicleId: 10 })).status).toBe(409);
  });

  it('9. Driver updates progress in the correct order and captures proof of delivery', async () => {
    const id = state.ship.id;
    expect((await as('driver').patch(`${API}/shipments/${id}/status`, { status: 'delivered' })).status).toBe(422); // not an allowed driver status
    expect((await as('driver').patch(`${API}/shipments/${id}/status`, { status: 'in_transit' })).body.error.code).toBe('INVALID_TRANSITION');
    expect((await as('driver').post(`${API}/shipments/${id}/pod`, { recipientName: 'Early Person' })).status).toBe(409);
    const col = await as('driver').patch(`${API}/shipments/${id}/status`, { status: 'collected', location: 'Johannesburg depot' });
    expect(col.status).toBe(200);
    expect(col.body.shipment.status).toBe('collected');
    expect((await db.query('SELECT status FROM vehicles WHERE id=9')).rows[0].status).toBe('on_route');
    expect((await as('driver').patch(`${API}/shipments/${id}/status`, { status: 'in_transit' })).body.shipment.status).toBe('in_transit');
    expect((await as('driver').post(`${API}/shipments/${id}/pod`, { recipientName: '' })).status).toBe(422);
    const pod = await as('driver').post(`${API}/shipments/${id}/pod`, { recipientName: 'N. Khumalo', note: 'All good', latitude: -29.85, longitude: 31.02 });
    expect(pod.status).toBe(201);
    expect(pod.body.shipment.status).toBe('delivered');
    expect((await as('driver').post(`${API}/shipments/${id}/pod`, { recipientName: 'Again' })).status).toBe(409);
    expect((await db.query('SELECT status FROM vehicles WHERE id=9')).rows[0].status).toBe('available');
    const hist = await as('driver').get(`${API}/driver/deliveries?scope=history`);
    expect(hist.body.data.map((s) => s.id)).toContain(id);
    expect((await as('driver').get(`${API}/driver/deliveries`)).body.data.map((s) => s.id)).not.toContain(id);
  });

  it('10. Client sees the new tracking status, history and proof of delivery; dispatcher and client are notified', async () => {
    const detail = await as('client').get(`${API}/shipments/${state.ship.id}`);
    expect(detail.body.shipment.status).toBe('delivered');
    expect(detail.body.history.map((h) => h.status)).toEqual(['pending', 'assigned', 'collected', 'in_transit', 'delivered']);
    expect(detail.body.proofOfDelivery.recipientName).toBe('N. Khumalo');
    const pub = await api().get(`${API}/track/${state.ship.trackingRef}`);
    expect(pub.body.shipment.status).toBe('delivered');
    const notes = await as('client').get(`${API}/notifications`);
    const delivered = notes.body.data.find((n) => n.title === 'Shipment delivered' && n.entityId === state.ship.id);
    expect(delivered).toBeTruthy();
    const before = notes.body.unreadCount;
    const read = await as('client').patch(`${API}/notifications/${delivered.id}/read`);
    expect(read.body.notification.read).toBe(true);
    expect(read.body.unreadCount).toBe(before - 1);
    const docs = await as('client').get(`${API}/documents?type=pod`);
    expect(docs.body.data.some((d) => d.shipmentId === state.ship.id)).toBe(true);
  });

  it('11. Finance sees the delivered shipment on its dashboard, then invoices it (VAT in ZAR); client can view the invoice', async () => {
    const dash = await as('finance').get(`${API}/dashboard`);
    expect(dash.body.recent.items.map((i) => i.title)).toContain(state.ship.trackingRef);
    const bad = await as('finance').post(`${API}/invoices`, { companyId: 1, shipmentId: state.ship.id, description: 'x', subtotal: 0, dueDate: '2099-01-31' });
    expect(bad.status).toBe(422);
    expect((await as('finance').post(`${API}/invoices`, { companyId: 2, shipmentId: state.ship.id, description: 'wrong company', subtotal: 100, dueDate: '2099-01-31' })).body.error.code).toBe('COMPANY_MISMATCH');
    const res = await as('finance').post(`${API}/invoices`, { companyId: 1, shipmentId: state.ship.id, description: `Freight ${state.ship.trackingRef}`, subtotal: 12000, dueDate: '2099-01-31' });
    expect(res.status).toBe(201);
    expect(res.body.invoice).toMatchObject({ subtotal: 12000, vatAmount: 1800, total: 13800, balance: 13800, status: 'unpaid', displayStatus: 'unpaid' });
    state.inv = res.body.invoice;
    expect((await as('finance').post(`${API}/invoices`, { companyId: 1, shipmentId: state.ship.id, description: 'dup', subtotal: 5, dueDate: '2099-01-31' })).body.error.code).toBe('INVOICE_EXISTS');
    const mine = await as('client').get(`${API}/invoices/${state.inv.id}`);
    expect(mine.status).toBe(200);
    expect((await as('client2').get(`${API}/invoices/${state.inv.id}`)).status).toBe(404);
    const doc = await as('client').get(`${API}/documents?type=invoice`);
    const invDoc = doc.body.data.find((d) => d.invoiceId === state.inv.id);
    expect(invDoc).toBeTruthy();
    const dl = await as('client').get(`${API}/documents/${invDoc.id}/download`);
    expect(dl.status).toBe(200);
    expect(dl.text).toContain(state.inv.invoiceNumber);
    expect(dl.text).toMatch(/R\s?13\s?800,00/);
  });

  it('12. Finance records real-world payments (no gateway): partial, overpayment refused, final, receipts issued', async () => {
    const id = state.inv.id;
    expect((await as('client').post(`${API}/invoices/${id}/payments`, { amount: 1, method: 'eft' })).status).toBe(403);
    expect((await as('finance').post(`${API}/invoices/${id}/payments`, { amount: -5, method: 'eft' })).status).toBe(422);
    expect((await as('finance').post(`${API}/invoices/${id}/payments`, { amount: 100, method: 'bitcoin' })).status).toBe(422);
    const p1 = await as('finance').post(`${API}/invoices/${id}/payments`, { amount: 5800, method: 'eft', reference: 'EFT-TEST-1' });
    expect(p1.status).toBe(201);
    expect(p1.body.outstandingBalance).toBe(8000);
    expect(p1.body.receipt.receiptNumber).toMatch(/^RCT-\d+$/);
    expect((await as('finance').get(`${API}/invoices/${id}`)).body.invoice.status).toBe('partially_paid');
    const over = await as('finance').post(`${API}/invoices/${id}/payments`, { amount: 8000.01, method: 'eft' });
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe('OVERPAYMENT');
    expect((await as('finance').patch(`${API}/invoices/${id}`, { subtotal: 1 })).status).toBe(409); // has payments: locked
    const p2 = await as('finance').post(`${API}/invoices/${id}/payments`, { amount: 8000, method: 'card' });
    expect(p2.body.outstandingBalance).toBe(0);
    const inv = await as('client').get(`${API}/invoices/${id}`);
    expect(inv.body.invoice.status).toBe('paid');
    expect(inv.body.payments).toHaveLength(2);
    expect((await as('finance').post(`${API}/invoices/${id}/payments`, { amount: 1, method: 'eft' })).status).toBe(409);
    const receipts = await as('client').get(`${API}/receipts`);
    expect(receipts.body.data.filter((r) => r.invoiceNumber === state.inv.invoiceNumber)).toHaveLength(2);
  });

  it('13. Assignments can be removed and shipments cancelled, releasing the vehicle', async () => {
    const s = (await as('dispatcher').post(`${API}/shipments`, { companyId: 3, origin: 'Durban', destination: 'Pretoria', cargoDescription: 'Cancel test', weightKg: 2000 })).body.shipment;
    const asg = await as('dispatcher').post(`${API}/shipments/${s.id}/assign`, { driverId: 7, vehicleId: 10 });
    expect(asg.status).toBe(200);
    expect((await db.query('SELECT status FROM vehicles WHERE id=10')).rows[0].status).toBe('assigned');
    expect((await as('driver').del(`${API}/assignments/${asg.body.shipment.assignment.id}`)).status).toBe(403);
    expect((await as('dispatcher').del(`${API}/assignments/${asg.body.shipment.assignment.id}`)).status).toBe(200);
    expect((await db.query('SELECT status FROM vehicles WHERE id=10')).rows[0].status).toBe('available');
    expect((await as('dispatcher').get(`${API}/shipments/${s.id}`)).body.shipment.status).toBe('pending');
    const edit = await as('dispatcher').patch(`${API}/shipments/${s.id}`, { priority: 'urgent', destination: 'Johannesburg' });
    expect(edit.body.shipment).toMatchObject({ priority: 'urgent', destination: 'Johannesburg', cargoDescription: 'Cancel test' });
    const cancel = await as('dispatcher').post(`${API}/shipments/${s.id}/cancel`, { reason: 'Client request' });
    expect(cancel.body.shipment.status).toBe('cancelled');
    expect((await as('dispatcher').post(`${API}/shipments/${s.id}/cancel`)).status).toBe(409);
    expect((await as('dispatcher').patch(`${API}/shipments/${s.id}`, { priority: 'low' })).status).toBe(409);
  });

  it('14. A failed delivery returns the shipment for re-dispatch and frees resources; incidents are reported to dispatch and fleet', async () => {
    const s = (await as('dispatcher').post(`${API}/shipments`, { companyId: 4, origin: 'Cape Town', destination: 'Gqeberha', cargoDescription: 'Failure test', weightKg: 500 })).body.shipment;
    await as('dispatcher').post(`${API}/shipments/${s.id}/assign`, { driverId: 8, vehicleId: 11 });
    const d8 = await db.query('SELECT user_id FROM drivers WHERE id=8');
    const u = await db.query('SELECT email FROM users WHERE id=$1', [d8.rows[0].user_id]);
    const driver8 = u.rows[0].email;
    expect((await as(driver8).patch(`${API}/shipments/${s.id}/status`, { status: 'collected' })).status).toBe(200);
    expect((await as(driver8).patch(`${API}/shipments/${s.id}/status`, { status: 'in_transit' })).status).toBe(200);
    expect((await as(driver8).patch(`${API}/shipments/${s.id}/status`, { status: 'failed' })).status).toBe(422); // reason required
    const inc = await as(driver8).post(`${API}/incidents`, { shipmentId: s.id, type: 'breakdown', severity: 'high', description: 'Engine failure on N2' });
    expect(inc.status).toBe(201);
    expect((await as('fleet').get(`${API}/notifications`)).body.data.some((n) => n.entityType === 'incident' && n.entityId === inc.body.incident.id)).toBe(true);
    expect((await as(driver8).post(`${API}/incidents`, { type: 'volcano', description: 'x' })).status).toBe(422);
    expect((await as('fleet').patch(`${API}/incidents/${inc.body.incident.id}`, { status: 'investigating' })).body.incident.status).toBe('investigating');
    expect((await as('client').patch(`${API}/incidents/${inc.body.incident.id}`, { status: 'resolved' })).status).toBe(403);
    const failed = await as(driver8).patch(`${API}/shipments/${s.id}/status`, { status: 'failed', note: 'Vehicle breakdown' });
    expect(failed.body.shipment.status).toBe('failed');
    expect((await db.query('SELECT status FROM vehicles WHERE id=11')).rows[0].status).toBe('available');
    const re = await as('dispatcher').patch(`${API}/shipments/${s.id}/status`, { status: 'pending', note: 'Re-dispatch' });
    expect(re.body.shipment.status).toBe('pending');
    expect((await as(driver8).patch(`${API}/shipments/${s.id}/status`, { status: 'pending' })).status).toBe(403);
  });
});
