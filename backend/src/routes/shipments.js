'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../config/db');
const config = require('../config/env');
const { E } = require('../utils/errors');
const { validate, z, idParam, isoDate, reqText, optionalText } = require('../utils/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { notifyUsers, notifyRoles, notifyCompany } = require('../services/notify');
const { saveDocument, podHtml } = require('../services/documents');
const { addHistory, createShipment, SHIPMENT_SELECT, mapShipment } = require('../services/shipments');

const router = express.Router();
const paging = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50) });
const STATUSES = ['pending', 'assigned', 'collected', 'in_transit', 'delivered', 'failed', 'cancelled'];

/* ---------- Public tracking (no login) ---------- */
const trackLimiter = rateLimit({ windowMs: 60 * 1000, max: 40, skip: () => config.isTest, standardHeaders: true, legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many tracking requests. Please wait a minute.' } } });

router.get('/track/:ref', trackLimiter, async (req, res) => {
  const ref = String(req.params.ref || '').trim().toUpperCase();
  if (!/^MHM-\d{6}$/.test(ref)) throw E.badRequest('Tracking references look like MHM-000123.');
  const s = (await db.query('SELECT id, tracking_ref, origin, destination, status, eta, delivered_at FROM shipments WHERE tracking_ref=$1', [ref])).rows[0];
  if (!s) throw E.notFound('No shipment was found with that tracking reference.');
  const h = (await db.query('SELECT status, note, location, created_at FROM shipment_status_history WHERE shipment_id=$1 ORDER BY created_at, id', [s.id])).rows;
  res.json({ shipment: { trackingRef: s.tracking_ref, origin: s.origin, destination: s.destination, status: s.status, eta: s.eta, deliveredAt: s.delivered_at },
    history: h.map((x) => ({ status: x.status, note: x.note, location: x.location, at: x.created_at })) });
});

router.use(authenticate);

/* ---------- Access helpers ---------- */
async function loadShipment(req, id, client = db) {
  const s = (await client.query(`${SHIPMENT_SELECT} WHERE s.id=$1`, [id])).rows[0];
  if (!s) throw E.notFound('Shipment not found.');
  const { role } = req.user;
  if (role === 'client' && Number(s.company_id) !== req.user.companyId) throw E.notFound('Shipment not found.');
  if (role === 'driver') {
    const mine = await client.query('SELECT 1 FROM delivery_assignments WHERE shipment_id=$1 AND driver_id=$2 LIMIT 1', [id, req.user.driverId || 0]);
    if (!mine.rowCount) throw E.forbidden('This shipment is not assigned to you.');
  }
  return s;
}

/* ---------- List & detail ---------- */
router.get('/shipments', validate(paging.extend({ status: z.enum(STATUSES).optional(), q: z.string().trim().max(80).optional(), companyId: z.coerce.number().int().optional(), format: z.enum(['json', 'csv']).default('json') }), 'query'), async (req, res) => {
  const { status, q, companyId, page, limit, format } = req.valid.query; const p = []; const where = [];
  if (req.user.role === 'client') { p.push(req.user.companyId || 0); where.push(`s.company_id=$${p.length}`); }
  else if (req.user.role === 'driver') { p.push(req.user.driverId || 0); where.push(`EXISTS (SELECT 1 FROM delivery_assignments x WHERE x.shipment_id=s.id AND x.driver_id=$${p.length})`); }
  else if (companyId) { p.push(companyId); where.push(`s.company_id=$${p.length}`); }
  if (status) { p.push(status); where.push(`s.status=$${p.length}`); }
  if (q) { p.push(`%${q.toLowerCase()}%`); where.push(`(lower(s.tracking_ref) LIKE $${p.length} OR lower(s.destination) LIKE $${p.length} OR lower(s.origin) LIKE $${p.length} OR lower(c.name) LIKE $${p.length} OR lower(s.cargo_description) LIKE $${p.length})`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db.query(`SELECT COUNT(*)::int n FROM shipments s JOIN companies c ON c.id=s.company_id ${w}`, p)).rows[0].n;
  p.push(format === 'csv' ? 5000 : limit, format === 'csv' ? 0 : (page - 1) * limit);
  const rows = (await db.query(`${SHIPMENT_SELECT} ${w} ORDER BY s.created_at DESC, s.id DESC LIMIT $${p.length - 1} OFFSET $${p.length}`, p)).rows;
  if (format === 'csv') {
    if (req.user.role === 'client' || req.user.role === 'driver') throw E.forbidden();
    return require('../utils/csv').sendCsv(res, 'shipments.csv', rows.map((s) => ({ tracking_ref: s.tracking_ref, company: s.company_name, origin: s.origin, destination: s.destination, status: s.status, priority: s.priority, weight_kg: s.weight_kg, scheduled_date: s.scheduled_date, eta: s.eta, driver: s.driver_name, vehicle: s.vehicle_registration })));
  }
  return res.json({ data: rows.map((s) => mapShipment(s, req.user.role)), total, page, limit });
});

router.get('/shipments/:id', validate(idParam, 'params'), async (req, res) => {
  const s = await loadShipment(req, req.valid.params.id);
  const history = (await db.query(`SELECT h.status, h.note, h.location, h.created_at, u.full_name AS by_name FROM shipment_status_history h LEFT JOIN users u ON u.id=h.changed_by WHERE h.shipment_id=$1 ORDER BY h.created_at, h.id`, [s.id])).rows;
  const pod = (await db.query('SELECT recipient_name, note, latitude, longitude, delivered_at FROM proof_of_delivery WHERE shipment_id=$1', [s.id])).rows[0];
  res.json({ shipment: mapShipment(s, req.user.role),
    history: history.map((h) => ({ status: h.status, note: h.note, location: h.location, at: h.created_at, by: req.user.role === 'client' ? null : h.by_name })),
    proofOfDelivery: pod ? { recipientName: pod.recipient_name, note: pod.note, latitude: pod.latitude === null ? null : Number(pod.latitude), longitude: pod.longitude === null ? null : Number(pod.longitude), deliveredAt: pod.delivered_at } : null });
});

/* ---------- Create / edit / cancel (dispatcher, admin) ---------- */
const shipFields = {
  origin: reqText(160, 'Origin'), destination: reqText(160, 'Destination'), cargoDescription: reqText(300, 'Cargo description'),
  weightKg: z.coerce.number({ error: 'Weight is required.' }).positive('Weight must be greater than zero.').max(100000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']), scheduledDate: isoDate.optional(), eta: isoDate.optional(),
  warehouseId: z.coerce.number().int().positive().optional(),
};

router.post('/shipments', requireRole('dispatcher', 'admin'), validate(z.object({ companyId: z.coerce.number({ error: 'Choose a client company.' }).int().positive(), ...shipFields, priority: shipFields.priority.default('normal') })), async (req, res) => {
  const d = req.valid.body;
  const comp = await db.query(`SELECT 1 FROM companies WHERE id=$1 AND status='active'`, [d.companyId]);
  if (!comp.rowCount) throw E.unprocessable('That company does not exist or is inactive.', 'INVALID_COMPANY');
  const s = await db.tx(async (client) => {
    const row = await createShipment(client, { ...d, createdBy: req.user.id });
    await notifyCompany(d.companyId, { title: 'Shipment created', message: `Shipment ${row.tracking_ref} has been created for you.`, type: 'info', entityType: 'shipment', entityId: row.id }, client);
    await audit(req, 'shipment.create', 'shipment', row.id, null, client);
    return row;
  });
  res.status(201).json({ shipment: mapShipment((await db.query(`${SHIPMENT_SELECT} WHERE s.id=$1`, [s.id])).rows[0], req.user.role) });
});

router.patch('/shipments/:id', requireRole('dispatcher', 'admin'), validate(idParam, 'params'), validate(z.object(Object.fromEntries(Object.entries(shipFields).map(([k, v]) => [k, v.optional()])))), async (req, res) => {
  const d = req.valid.body; const id = req.valid.params.id;
  const cur = (await db.query('SELECT status FROM shipments WHERE id=$1', [id])).rows[0];
  if (!cur) throw E.notFound('Shipment not found.');
  if (!['pending', 'assigned'].includes(cur.status)) throw E.conflict('Only pending or assigned shipments can be edited.', 'INVALID_STATE');
  await db.query(`UPDATE shipments SET origin=COALESCE($2,origin), destination=COALESCE($3,destination), cargo_description=COALESCE($4,cargo_description), weight_kg=COALESCE($5,weight_kg),
    priority=COALESCE($6,priority), scheduled_date=COALESCE($7,scheduled_date), eta=COALESCE($8,eta), warehouse_id=COALESCE($9,warehouse_id), updated_at=now() WHERE id=$1`,
  [id, d.origin ?? null, d.destination ?? null, d.cargoDescription ?? null, d.weightKg ?? null, d.priority ?? null, d.scheduledDate ?? null, d.eta ?? null, d.warehouseId ?? null]);
  await audit(req, 'shipment.update', 'shipment', id, d);
  res.json({ shipment: mapShipment((await db.query(`${SHIPMENT_SELECT} WHERE s.id=$1`, [id])).rows[0], req.user.role) });
});

async function releaseResources(client, shipmentId, assignmentStatus) {
  const a = (await client.query(`UPDATE delivery_assignments SET status=$2 WHERE shipment_id=$1 AND status IN ('assigned','active') RETURNING vehicle_id, driver_id`, [shipmentId, assignmentStatus])).rows[0];
  if (a) await client.query(`UPDATE vehicles SET status='available' WHERE id=$1 AND status IN ('assigned','on_route')`, [a.vehicle_id]);
  return a;
}

router.post('/shipments/:id/cancel', requireRole('dispatcher', 'admin'), validate(idParam, 'params'), validate(z.object({ reason: optionalText(300) })), async (req, res) => {
  const id = req.valid.params.id;
  await db.tx(async (client) => {
    const cur = (await client.query('SELECT * FROM shipments WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw E.notFound('Shipment not found.');
    if (!['pending', 'assigned'].includes(cur.status)) throw E.conflict('Only pending or assigned shipments can be cancelled.', 'INVALID_STATE');
    await releaseResources(client, id, 'cancelled');
    await client.query(`UPDATE shipments SET status='cancelled', updated_at=now() WHERE id=$1`, [id]);
    await addHistory(client, id, 'cancelled', req.valid.body.reason || 'Cancelled by dispatch', null, req.user.id);
    await notifyCompany(cur.company_id, { title: 'Shipment cancelled', message: `Shipment ${cur.tracking_ref} has been cancelled.`, type: 'warning', entityType: 'shipment', entityId: id }, client);
    await audit(req, 'shipment.cancel', 'shipment', id, null, client);
  });
  res.json({ shipment: mapShipment((await db.query(`${SHIPMENT_SELECT} WHERE s.id=$1`, [id])).rows[0], req.user.role) });
});

/* ---------- Dispatch: assign driver + vehicle ---------- */
router.post('/shipments/:id/assign', requireRole('dispatcher', 'admin'), validate(idParam, 'params'),
  validate(z.object({ driverId: z.coerce.number({ error: 'Choose a driver.' }).int().positive(), vehicleId: z.coerce.number({ error: 'Choose a vehicle.' }).int().positive(),
    scheduledPickup: z.coerce.date().optional(), scheduledDelivery: z.coerce.date().optional() })), async (req, res) => {
    const id = req.valid.params.id; const d = req.valid.body;
    if (d.scheduledPickup && d.scheduledDelivery && d.scheduledDelivery < d.scheduledPickup) throw E.validation([{ field: 'scheduledDelivery', message: 'Delivery cannot be before pickup.' }]);
    await db.tx(async (client) => {
      const s = (await client.query('SELECT * FROM shipments WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!s) throw E.notFound('Shipment not found.');
      if (s.status !== 'pending') throw E.conflict(`Shipment is "${s.status}"; only pending shipments can be assigned.`, 'INVALID_STATE');
      const drv = (await client.query('SELECT d.*, u.status AS user_status, u.full_name FROM drivers d LEFT JOIN users u ON u.id=d.user_id WHERE d.id=$1 FOR UPDATE OF d', [d.driverId])).rows[0];
      if (!drv) throw E.notFound('Driver not found.');
      if (drv.status !== 'available' || drv.user_status !== 'active') throw E.conflict('That driver is not available.', 'DRIVER_UNAVAILABLE');
      const veh = (await client.query('SELECT * FROM vehicles WHERE id=$1 FOR UPDATE', [d.vehicleId])).rows[0];
      if (!veh) throw E.notFound('Vehicle not found.');
      if (veh.status !== 'available') throw E.conflict(`Vehicle ${veh.registration} is "${veh.status}" and cannot be assigned.`, 'VEHICLE_UNAVAILABLE');
      if (Number(veh.capacity_kg) < Number(s.weight_kg)) throw E.unprocessable(`Vehicle ${veh.registration} (${veh.capacity_kg} kg) cannot carry ${s.weight_kg} kg.`, 'CAPACITY_EXCEEDED');
      await client.query(`INSERT INTO delivery_assignments (shipment_id, driver_id, vehicle_id, assigned_by, scheduled_pickup, scheduled_delivery) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, d.driverId, d.vehicleId, req.user.id, d.scheduledPickup || null, d.scheduledDelivery || null]);
      await client.query(`UPDATE vehicles SET status='assigned' WHERE id=$1`, [d.vehicleId]);
      await client.query(`UPDATE shipments SET status='assigned', scheduled_date=COALESCE($2::date, scheduled_date), updated_at=now() WHERE id=$1`, [id, d.scheduledPickup || null]);
      await addHistory(client, id, 'assigned', `Assigned to ${drv.full_name} with vehicle ${veh.registration}`, s.origin, req.user.id);
      await notifyUsers([drv.user_id], { title: 'New delivery assigned', message: `You have been assigned shipment ${s.tracking_ref} (${s.origin} to ${s.destination}).`, type: 'info', entityType: 'shipment', entityId: id }, client);
      await notifyCompany(s.company_id, { title: 'Shipment scheduled', message: `Shipment ${s.tracking_ref} has been scheduled for collection.`, type: 'info', entityType: 'shipment', entityId: id }, client);
      await audit(req, 'shipment.assign', 'shipment', id, { driverId: d.driverId, vehicleId: d.vehicleId }, client);
    });
    res.json({ shipment: mapShipment((await db.query(`${SHIPMENT_SELECT} WHERE s.id=$1`, [id])).rows[0], req.user.role) });
  });

router.delete('/assignments/:id', requireRole('dispatcher', 'admin'), validate(idParam, 'params'), async (req, res) => {
  const id = req.valid.params.id;
  await db.tx(async (client) => {
    const a = (await client.query('SELECT * FROM delivery_assignments WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!a) throw E.notFound('Assignment not found.');
    if (a.status !== 'assigned') throw E.conflict('Only assignments that have not started can be removed.', 'INVALID_STATE');
    await client.query(`UPDATE delivery_assignments SET status='cancelled' WHERE id=$1`, [id]);
    await client.query(`UPDATE vehicles SET status='available' WHERE id=$1 AND status='assigned'`, [a.vehicle_id]);
    await client.query(`UPDATE shipments SET status='pending', updated_at=now() WHERE id=$1`, [a.shipment_id]);
    await addHistory(client, a.shipment_id, 'pending', 'Assignment removed; awaiting reassignment', null, req.user.id);
    await audit(req, 'assignment.cancel', 'assignment', id, null, client);
  });
  res.json({ message: 'Assignment removed. The shipment is pending again.' });
});

router.get('/assignments', requireRole('dispatcher', 'admin', 'fleet', 'driver'), validate(z.object({ status: z.enum(['assigned', 'active', 'completed', 'cancelled']).optional() }), 'query'), async (req, res) => {
  const p = []; const where = [];
  if (req.user.role === 'driver') { p.push(req.user.driverId || 0); where.push(`a.driver_id=$${p.length}`); }
  if (req.valid.query.status) { p.push(req.valid.query.status); where.push(`a.status=$${p.length}`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = (await db.query(`SELECT a.*, s.tracking_ref, s.origin, s.destination, s.status AS shipment_status, du.full_name AS driver_name, v.registration
    FROM delivery_assignments a JOIN shipments s ON s.id=a.shipment_id JOIN drivers d ON d.id=a.driver_id LEFT JOIN users du ON du.id=d.user_id JOIN vehicles v ON v.id=a.vehicle_id
    ${w} ORDER BY a.created_at DESC, a.id DESC LIMIT 200`, p)).rows;
  res.json({ data: rows.map((a) => ({ id: Number(a.id), shipmentId: Number(a.shipment_id), trackingRef: a.tracking_ref, origin: a.origin, destination: a.destination, shipmentStatus: a.shipment_status,
    driverId: Number(a.driver_id), driverName: a.driver_name, vehicleId: Number(a.vehicle_id), vehicleRegistration: a.registration, scheduledPickup: a.scheduled_pickup, scheduledDelivery: a.scheduled_delivery, status: a.status })) });
});

router.get('/drivers', requireRole('dispatcher', 'admin', 'fleet'), validate(z.object({ availableOnly: z.enum(['true', 'false']).optional() }), 'query'), async (req, res) => {
  const rows = (await db.query(`SELECT d.id, d.licence_number, d.licence_code, d.phone, d.status, u.full_name, u.email, u.status AS user_status,
      (SELECT COUNT(*)::int FROM delivery_assignments a WHERE a.driver_id=d.id AND a.status IN ('assigned','active')) AS open_assignments,
      EXISTS (SELECT 1 FROM delivery_assignments a WHERE a.driver_id=d.id AND a.status='active') AS on_trip
    FROM drivers d LEFT JOIN users u ON u.id=d.user_id ORDER BY d.id`)).rows;
  let data = rows.map((d) => ({ id: Number(d.id), fullName: d.full_name, email: d.email, licenceNumber: d.licence_number, licenceCode: d.licence_code, phone: d.phone, status: d.status,
    openAssignments: d.open_assignments, onTrip: d.on_trip, assignable: d.status === 'available' && d.user_status === 'active' }));
  if (req.valid.query.availableOnly === 'true') data = data.filter((d) => d.assignable);
  res.json({ data });
});

/* ---------- Driver operations ---------- */
router.get('/driver/deliveries', requireRole('driver'), validate(z.object({ scope: z.enum(['current', 'history']).default('current') }), 'query'), async (req, res) => {
  const statuses = req.valid.query.scope === 'current' ? ['assigned', 'active'] : ['completed'];
  const rows = (await db.query(`${SHIPMENT_SELECT} WHERE a.driver_id=$1 AND a.status = ANY($2::text[]) ORDER BY a.scheduled_pickup NULLS LAST, s.id DESC LIMIT 200`, [req.user.driverId || 0, statuses])).rows;
  res.json({ data: rows.map((s) => mapShipment(s, 'driver')) });
});

const DRIVER_TARGETS = { collected: 'assigned', in_transit: 'collected', failed: 'in_transit' };

router.patch('/shipments/:id/status', requireRole('driver', 'dispatcher', 'admin'), validate(idParam, 'params'),
  validate(z.object({ status: z.enum(['collected', 'in_transit', 'failed', 'pending']), note: optionalText(300), location: optionalText(160) })), async (req, res) => {
    const id = req.valid.params.id; const { status, note, location } = req.valid.body;
    await db.tx(async (client) => {
      const s = (await client.query('SELECT * FROM shipments WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!s) throw E.notFound('Shipment not found.');
      if (req.user.role === 'driver') { // ownership is verified before anything about the shipment's state is revealed
        const mine = await client.query(`SELECT 1 FROM delivery_assignments WHERE shipment_id=$1 AND driver_id=$2 AND status IN ('assigned','active','completed')`, [id, req.user.driverId || 0]);
        if (!mine.rowCount) throw E.forbidden('This shipment is not assigned to you.');
      }
      if (status === 'pending') {
        if (req.user.role === 'driver') throw E.forbidden();
        if (s.status !== 'failed') throw E.conflict('Only failed shipments can be returned to pending.', 'INVALID_STATE');
        await client.query(`UPDATE shipments SET status='pending', updated_at=now() WHERE id=$1`, [id]);
        await addHistory(client, id, 'pending', note || 'Returned to pending for re-dispatch', null, req.user.id);
        await audit(req, 'shipment.requeue', 'shipment', id, null, client);
        return;
      }
      const required = DRIVER_TARGETS[status];
      if (s.status !== required) throw E.conflict(`Shipment is "${s.status}". It must be "${required}" before it can be marked "${status}".`, 'INVALID_TRANSITION');
      const a = (await client.query(`SELECT * FROM delivery_assignments WHERE shipment_id=$1 AND status IN ('assigned','active') FOR UPDATE`, [id])).rows[0];
      if (!a) throw E.conflict('This shipment has no live assignment.', 'NO_ASSIGNMENT');
      if (req.user.role === 'driver' && Number(a.driver_id) !== req.user.driverId) throw E.forbidden('This shipment is not assigned to you.');
      if (status === 'failed' && !note) throw E.validation([{ field: 'note', message: 'Explain why the delivery failed.' }]);
      if (status === 'collected') {
        const busy = await client.query(`SELECT 1 FROM delivery_assignments WHERE driver_id=$1 AND status='active' AND id<>$2`, [a.driver_id, a.id]);
        if (busy.rowCount) throw E.conflict('You already have a delivery in progress. Finish it first.', 'DRIVER_BUSY');
        await client.query(`UPDATE delivery_assignments SET status='active' WHERE id=$1`, [a.id]);
        await client.query(`UPDATE vehicles SET status='on_route' WHERE id=$1`, [a.vehicle_id]);
      }
      if (status === 'failed') {
        await client.query(`UPDATE delivery_assignments SET status='completed' WHERE id=$1`, [a.id]);
        await client.query(`UPDATE vehicles SET status='available' WHERE id=$1 AND status IN ('assigned','on_route')`, [a.vehicle_id]);
      }
      await client.query('UPDATE shipments SET status=$2, updated_at=now() WHERE id=$1', [id, status]);
      await addHistory(client, id, status, note || { collected: 'Cargo collected', in_transit: 'Departed for destination' }[status], location || null, req.user.id);
      const label = { collected: 'collected', in_transit: 'on its way', failed: 'delayed: delivery attempt failed' }[status];
      await notifyCompany(s.company_id, { title: 'Shipment update', message: `Shipment ${s.tracking_ref} is ${label}.`, type: status === 'failed' ? 'warning' : 'info', entityType: 'shipment', entityId: id }, client);
      await notifyRoles(['dispatcher'], { title: 'Delivery status updated', message: `${s.tracking_ref} is now "${status}".`, type: status === 'failed' ? 'warning' : 'info', entityType: 'shipment', entityId: id }, client);
      await audit(req, 'shipment.status', 'shipment', id, { status }, client);
    });
    res.json({ shipment: mapShipment((await db.query(`${SHIPMENT_SELECT} WHERE s.id=$1`, [id])).rows[0], req.user.role) });
  });

router.post('/shipments/:id/pod', requireRole('driver'), validate(idParam, 'params'),
  validate(z.object({ recipientName: reqText(120, 'Recipient name'), note: optionalText(300), latitude: z.coerce.number().min(-90).max(90).optional(), longitude: z.coerce.number().min(-180).max(180).optional() })), async (req, res) => {
    const id = req.valid.params.id; const d = req.valid.body;
    await db.tx(async (client) => {
      const s = (await client.query('SELECT * FROM shipments WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!s) throw E.notFound('Shipment not found.');
      const own = await client.query(`SELECT 1 FROM delivery_assignments WHERE shipment_id=$1 AND driver_id=$2 AND status IN ('assigned','active','completed')`, [id, req.user.driverId || 0]);
      if (!own.rowCount) throw E.forbidden('This shipment is not assigned to you.');
      const a = (await client.query(`SELECT * FROM delivery_assignments WHERE shipment_id=$1 AND status='active' FOR UPDATE`, [id])).rows[0];
      if (!a) throw E.conflict('Mark the shipment as collected and in transit before capturing proof of delivery.', 'INVALID_TRANSITION');
      if (s.status !== 'in_transit') throw E.conflict('Mark the shipment as in transit before capturing proof of delivery.', 'INVALID_TRANSITION');
      const pod = (await client.query(`INSERT INTO proof_of_delivery (shipment_id, driver_id, recipient_name, note, latitude, longitude) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [id, a.driver_id, d.recipientName, d.note || null, d.latitude ?? null, d.longitude ?? null])).rows[0];
      await client.query(`UPDATE shipments SET status='delivered', delivered_at=now(), updated_at=now() WHERE id=$1`, [id]);
      await client.query(`UPDATE delivery_assignments SET status='completed' WHERE id=$1`, [a.id]);
      await client.query(`UPDATE vehicles SET status='available' WHERE id=$1 AND status IN ('assigned','on_route')`, [a.vehicle_id]);
      await addHistory(client, id, 'delivered', `Delivered and signed for by ${d.recipientName}`, s.destination, req.user.id);
      await saveDocument(client, { companyId: s.company_id, shipmentId: id, type: 'pod', title: `Proof of delivery ${s.tracking_ref}`, fileName: `POD-${s.tracking_ref}.html`, content: podHtml(s, pod), uploadedBy: req.user.id });
      await notifyCompany(s.company_id, { title: 'Shipment delivered', message: `Shipment ${s.tracking_ref} has been delivered.`, type: 'success', entityType: 'shipment', entityId: id }, client);
      await notifyRoles(['dispatcher', 'finance'], { title: 'Delivery completed', message: `${s.tracking_ref} was delivered. Invoice can be raised.`, type: 'success', entityType: 'shipment', entityId: id }, client);
      await audit(req, 'shipment.pod', 'shipment', id, null, client);
    });
    res.status(201).json({ shipment: mapShipment((await db.query(`${SHIPMENT_SELECT} WHERE s.id=$1`, [id])).rows[0], req.user.role) });
  });

/* ---------- Incidents ---------- */
const mapIncident = (i) => ({ id: Number(i.id), driverId: Number(i.driver_id), driverName: i.driver_name, shipmentId: i.shipment_id ? Number(i.shipment_id) : null, trackingRef: i.tracking_ref,
  vehicleId: i.vehicle_id ? Number(i.vehicle_id) : null, vehicleRegistration: i.registration, type: i.type, severity: i.severity, description: i.description, status: i.status, reportedAt: i.reported_at });
const INC_SELECT = `SELECT i.*, u.full_name AS driver_name, s.tracking_ref, v.registration FROM incidents i JOIN drivers d ON d.id=i.driver_id LEFT JOIN users u ON u.id=d.user_id
  LEFT JOIN shipments s ON s.id=i.shipment_id LEFT JOIN vehicles v ON v.id=i.vehicle_id`;

router.post('/incidents', requireRole('driver'), validate(z.object({ shipmentId: z.coerce.number().int().positive().optional(), type: z.enum(['breakdown', 'accident', 'delay', 'damage', 'theft', 'other']),
  severity: z.enum(['low', 'medium', 'high']).default('low'), description: reqText(1000, 'Description') })), async (req, res) => {
  const d = req.valid.body; let vehicleId = null;
  if (d.shipmentId) {
    const a = (await db.query(`SELECT vehicle_id FROM delivery_assignments WHERE shipment_id=$1 AND driver_id=$2 ORDER BY id DESC LIMIT 1`, [d.shipmentId, req.user.driverId || 0])).rows[0];
    if (!a) throw E.forbidden('You can only report incidents for your own shipments.');
    vehicleId = a.vehicle_id;
  }
  const r = await db.query(`INSERT INTO incidents (driver_id, shipment_id, vehicle_id, type, severity, description) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [req.user.driverId, d.shipmentId || null, vehicleId, d.type, d.severity, d.description]);
  await notifyRoles(['dispatcher', 'fleet'], { title: `Incident reported (${d.severity})`, message: `${req.user.fullName} reported a ${d.type}.`, type: d.severity === 'high' ? 'error' : 'warning', entityType: 'incident', entityId: r.rows[0].id });
  await audit(req, 'incident.create', 'incident', r.rows[0].id);
  res.status(201).json({ incident: mapIncident((await db.query(`${INC_SELECT} WHERE i.id=$1`, [r.rows[0].id])).rows[0]) });
});

router.get('/incidents', requireRole('driver', 'dispatcher', 'fleet', 'admin'), async (req, res) => {
  const rows = req.user.role === 'driver'
    ? (await db.query(`${INC_SELECT} WHERE i.driver_id=$1 ORDER BY i.reported_at DESC LIMIT 200`, [req.user.driverId || 0])).rows
    : (await db.query(`${INC_SELECT} ORDER BY i.reported_at DESC LIMIT 200`)).rows;
  res.json({ data: rows.map(mapIncident) });
});

router.patch('/incidents/:id', requireRole('dispatcher', 'fleet', 'admin'), validate(idParam, 'params'), validate(z.object({ status: z.enum(['open', 'investigating', 'resolved']) })), async (req, res) => {
  const r = await db.query('UPDATE incidents SET status=$2 WHERE id=$1 RETURNING id', [req.valid.params.id, req.valid.body.status]);
  if (!r.rowCount) throw E.notFound('Incident not found.');
  await audit(req, 'incident.update', 'incident', req.valid.params.id, req.valid.body);
  res.json({ incident: mapIncident((await db.query(`${INC_SELECT} WHERE i.id=$1`, [req.valid.params.id])).rows[0]) });
});

module.exports = router;
