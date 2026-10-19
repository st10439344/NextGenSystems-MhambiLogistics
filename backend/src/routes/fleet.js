'use strict';

const express = require('express');
const db = require('../config/db');
const { E } = require('../utils/errors');
const { validate, z, idParam, isoDate, reqText, optionalText, money } = require('../utils/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');

const router = express.Router();
router.use(authenticate);

const READ = ['fleet', 'admin', 'dispatcher'];
const WRITE = ['fleet', 'admin'];
const MANUAL_STATUS = ['available', 'maintenance', 'idle', 'retired'];

const mapVehicle = (v) => ({ id: Number(v.id), registration: v.registration, makeModel: v.make_model, type: v.type, capacityKg: v.capacity_kg, status: v.status, mileageKm: v.mileage_km,
  lastServiceDate: v.last_service_date, nextServiceDate: v.next_service_date, serviceDueSoon: v.next_service_date ? new Date(v.next_service_date) <= new Date(Date.now() + 30 * 86400000) : false });

const liveAssignment = async (client, vehicleId) => (await client.query(`SELECT 1 FROM delivery_assignments WHERE vehicle_id=$1 AND status IN ('assigned','active') LIMIT 1`, [vehicleId])).rowCount > 0;

router.get('/vehicles', requireRole(...READ), validate(z.object({ status: z.enum(['available', 'assigned', 'on_route', 'maintenance', 'idle', 'retired']).optional(), q: z.string().trim().max(80).optional(), minCapacityKg: z.coerce.number().optional() }), 'query'), async (req, res) => {
  const { status, q, minCapacityKg } = req.valid.query; const p = []; const where = [];
  if (status) { p.push(status); where.push(`status=$${p.length}`); }
  if (q) { p.push(`%${q.toLowerCase()}%`); where.push(`(lower(registration) LIKE $${p.length} OR lower(make_model) LIKE $${p.length} OR lower(type) LIKE $${p.length})`); }
  if (minCapacityKg) { p.push(minCapacityKg); where.push(`capacity_kg >= $${p.length}`); }
  const rows = (await db.query(`SELECT * FROM vehicles ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id`, p)).rows;
  res.json({ data: rows.map(mapVehicle) });
});

router.get('/vehicles/:id', requireRole(...READ), validate(idParam, 'params'), async (req, res) => {
  const v = (await db.query('SELECT * FROM vehicles WHERE id=$1', [req.valid.params.id])).rows[0];
  if (!v) throw E.notFound('Vehicle not found.');
  res.json({ vehicle: mapVehicle(v) });
});

const vehicleFields = {
  registration: reqText(20, 'Registration').transform((s) => s.toUpperCase()), makeModel: reqText(80, 'Make and model'), type: reqText(60, 'Vehicle type'),
  capacityKg: z.coerce.number({ error: 'Capacity is required.' }).int().positive('Capacity must be greater than zero.').max(100000), mileageKm: z.coerce.number().int().min(0),
  lastServiceDate: isoDate.optional(), nextServiceDate: isoDate.optional(),
};

router.post('/vehicles', requireRole(...WRITE), validate(z.object({ ...vehicleFields, mileageKm: vehicleFields.mileageKm.default(0) })), async (req, res) => {
  const d = req.valid.body;
  let r;
  try {
    r = await db.query(`INSERT INTO vehicles (registration, make_model, type, capacity_kg, mileage_km, last_service_date, next_service_date) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [d.registration, d.makeModel, d.type, d.capacityKg, d.mileageKm, d.lastServiceDate || null, d.nextServiceDate || null]);
  } catch (err) {
    if (err.code === '23505') throw E.conflict(`A vehicle with registration ${d.registration} already exists.`, 'DUPLICATE');
    throw err;
  }
  await audit(req, 'vehicle.create', 'vehicle', r.rows[0].id);
  res.status(201).json({ vehicle: mapVehicle(r.rows[0]) });
});

router.patch('/vehicles/:id', requireRole(...WRITE), validate(idParam, 'params'),
  validate(z.object({ ...Object.fromEntries(Object.entries(vehicleFields).map(([k, v]) => [k, v.optional()])), status: z.enum(['available', 'assigned', 'on_route', 'maintenance', 'idle', 'retired']).optional() })), async (req, res) => {
    const d = req.valid.body; const id = req.valid.params.id;
    await db.tx(async (client) => {
      const cur = (await client.query('SELECT * FROM vehicles WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!cur) throw E.notFound('Vehicle not found.');
      if (d.status && d.status !== cur.status) {
        if (!MANUAL_STATUS.includes(d.status)) throw E.unprocessable('"assigned" and "on_route" are set automatically by dispatch.', 'INVALID_STATUS');
        if (await liveAssignment(client, id)) throw E.conflict('This vehicle has a live delivery assignment. Its status cannot be changed until the assignment ends.', 'VEHICLE_ASSIGNED');
      }
      try {
        await client.query(`UPDATE vehicles SET registration=COALESCE($2,registration), make_model=COALESCE($3,make_model), type=COALESCE($4,type), capacity_kg=COALESCE($5,capacity_kg),
          mileage_km=COALESCE($6,mileage_km), last_service_date=COALESCE($7,last_service_date), next_service_date=COALESCE($8,next_service_date), status=COALESCE($9,status) WHERE id=$1`,
        [id, d.registration ?? null, d.makeModel ?? null, d.type ?? null, d.capacityKg ?? null, d.mileageKm ?? null, d.lastServiceDate ?? null, d.nextServiceDate ?? null, d.status ?? null]);
      } catch (err) {
        if (err.code === '23505') throw E.conflict('Another vehicle already uses that registration.', 'DUPLICATE');
        throw err;
      }
      await audit(req, 'vehicle.update', 'vehicle', id, d, client);
    });
    res.json({ vehicle: mapVehicle((await db.query('SELECT * FROM vehicles WHERE id=$1', [id])).rows[0]) });
  });

router.delete('/vehicles/:id', requireRole(...WRITE), validate(idParam, 'params'), async (req, res) => {
  const id = req.valid.params.id;
  await db.tx(async (client) => {
    const cur = (await client.query('SELECT 1 FROM vehicles WHERE id=$1 FOR UPDATE', [id])).rowCount;
    if (!cur) throw E.notFound('Vehicle not found.');
    if (await liveAssignment(client, id)) throw E.conflict('This vehicle has a live delivery assignment and cannot be retired.', 'VEHICLE_ASSIGNED');
    await client.query(`UPDATE vehicles SET status='retired' WHERE id=$1`, [id]);
    await audit(req, 'vehicle.retire', 'vehicle', id, null, client);
  });
  res.json({ message: 'Vehicle retired. Its history is kept.' });
});

/* ---------- Maintenance ---------- */
const mapMaint = (m) => ({ id: Number(m.id), vehicleId: Number(m.vehicle_id), registration: m.registration, supplierId: m.supplier_id ? Number(m.supplier_id) : null, supplierName: m.supplier_name,
  type: m.type, description: m.description, cost: Number(m.cost), scheduledDate: m.scheduled_date, completedDate: m.completed_date, status: m.status });
const MAINT_SELECT = `SELECT m.*, v.registration, s.name AS supplier_name FROM maintenance_records m JOIN vehicles v ON v.id=m.vehicle_id LEFT JOIN suppliers s ON s.id=m.supplier_id`;

router.get('/maintenance', requireRole(...READ), validate(z.object({ status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(), vehicleId: z.coerce.number().int().optional() }), 'query'), async (req, res) => {
  const p = []; const where = [];
  if (req.valid.query.status) { p.push(req.valid.query.status); where.push(`m.status=$${p.length}`); }
  if (req.valid.query.vehicleId) { p.push(req.valid.query.vehicleId); where.push(`m.vehicle_id=$${p.length}`); }
  const rows = (await db.query(`${MAINT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY m.scheduled_date DESC, m.id DESC LIMIT 300`, p)).rows;
  res.json({ data: rows.map(mapMaint) });
});

router.get('/maintenance/upcoming', requireRole(...READ), async (req, res) => {
  const records = (await db.query(`${MAINT_SELECT} WHERE m.status IN ('scheduled','in_progress') AND m.scheduled_date <= CURRENT_DATE + 30 ORDER BY m.scheduled_date`)).rows;
  const due = (await db.query(`SELECT * FROM vehicles WHERE status<>'retired' AND next_service_date IS NOT NULL AND next_service_date <= CURRENT_DATE + 30 ORDER BY next_service_date`)).rows;
  res.json({ scheduled: records.map(mapMaint), vehiclesDueForService: due.map(mapVehicle) });
});

router.post('/maintenance', requireRole(...WRITE), validate(z.object({ vehicleId: z.coerce.number({ error: 'Choose a vehicle.' }).int().positive(), supplierId: z.coerce.number().int().positive().optional(),
  type: reqText(40, 'Maintenance type'), description: optionalText(300), cost: money.default(0), scheduledDate: isoDate })), async (req, res) => {
  const d = req.valid.body;
  const r = await db.query(`INSERT INTO maintenance_records (vehicle_id, supplier_id, type, description, cost, scheduled_date, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [d.vehicleId, d.supplierId || null, d.type, d.description ?? null, d.cost, d.scheduledDate, req.user.id]);
  await audit(req, 'maintenance.create', 'maintenance', r.rows[0].id);
  res.status(201).json({ record: mapMaint((await db.query(`${MAINT_SELECT} WHERE m.id=$1`, [r.rows[0].id])).rows[0]) });
});

router.patch('/maintenance/:id', requireRole(...WRITE), validate(idParam, 'params'),
  validate(z.object({ status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(), cost: money.optional(), description: optionalText(300), scheduledDate: isoDate.optional() })), async (req, res) => {
    const d = req.valid.body; const id = req.valid.params.id;
    await db.tx(async (client) => {
      const m = (await client.query('SELECT * FROM maintenance_records WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!m) throw E.notFound('Maintenance record not found.');
      if (['completed', 'cancelled'].includes(m.status)) throw E.conflict(`This record is already ${m.status}.`, 'INVALID_STATE');
      if (d.status === 'in_progress') {
        await client.query('SELECT 1 FROM vehicles WHERE id=$1 FOR UPDATE', [m.vehicle_id]);
        if (await liveAssignment(client, m.vehicle_id)) throw E.conflict('The vehicle has a live delivery assignment; it cannot enter maintenance yet.', 'VEHICLE_ASSIGNED');
        await client.query(`UPDATE vehicles SET status='maintenance' WHERE id=$1`, [m.vehicle_id]);
      }
      if (d.status === 'completed') {
        await client.query(`UPDATE vehicles SET status=CASE WHEN status='maintenance' THEN 'available' ELSE status END, last_service_date=CURRENT_DATE, next_service_date=CURRENT_DATE + 90 WHERE id=$1`, [m.vehicle_id]);
      }
      if (d.status === 'cancelled') await client.query(`UPDATE vehicles SET status='available' WHERE id=$1 AND status='maintenance' AND $2='in_progress'`, [m.vehicle_id, m.status]);
      await client.query(`UPDATE maintenance_records SET status=COALESCE($2,status), cost=COALESCE($3,cost), description=COALESCE($4,description), scheduled_date=COALESCE($5,scheduled_date),
        completed_date=CASE WHEN $2='completed' THEN CURRENT_DATE ELSE completed_date END WHERE id=$1`, [id, d.status ?? null, d.cost ?? null, d.description ?? null, d.scheduledDate ?? null]);
      await audit(req, 'maintenance.update', 'maintenance', id, d, client);
    });
    res.json({ record: mapMaint((await db.query(`${MAINT_SELECT} WHERE m.id=$1`, [id])).rows[0]) });
  });

/* ---------- Fuel ---------- */
const mapFuel = (f) => ({ id: Number(f.id), vehicleId: Number(f.vehicle_id), registration: f.registration, driverName: f.driver_name, litres: Number(f.litres), costPerLitre: Number(f.cost_per_litre), totalCost: Number(f.total_cost),
  odometerKm: f.odometer_km, station: f.station, fuelledAt: f.fuelled_at });
const FUEL_SELECT = `SELECT f.*, v.registration, u.full_name AS driver_name FROM fuel_transactions f JOIN vehicles v ON v.id=f.vehicle_id LEFT JOIN drivers d ON d.id=f.driver_id LEFT JOIN users u ON u.id=d.user_id`;

router.get('/fuel', requireRole(...READ), validate(z.object({ vehicleId: z.coerce.number().int().optional() }), 'query'), async (req, res) => {
  const p = []; let w = '';
  if (req.valid.query.vehicleId) { p.push(req.valid.query.vehicleId); w = 'WHERE f.vehicle_id=$1'; }
  const rows = (await db.query(`${FUEL_SELECT} ${w} ORDER BY f.fuelled_at DESC, f.id DESC LIMIT 300`, p)).rows;
  res.json({ data: rows.map(mapFuel), totalCost: rows.reduce((a, r) => a + Number(r.total_cost), 0) });
});

router.post('/fuel', requireRole(...WRITE), validate(z.object({ vehicleId: z.coerce.number({ error: 'Choose a vehicle.' }).int().positive(), driverId: z.coerce.number().int().positive().optional(),
  litres: z.coerce.number({ error: 'Litres are required.' }).positive('Litres must be greater than zero.').max(2000), costPerLitre: z.coerce.number({ error: 'Cost per litre is required.' }).positive().max(200),
  odometerKm: z.coerce.number().int().min(0).optional(), station: optionalText(80), fuelledAt: z.coerce.date().optional() })), async (req, res) => {
  const d = req.valid.body;
  const id = await db.tx(async (client) => {
    const v = (await client.query('SELECT * FROM vehicles WHERE id=$1 FOR UPDATE', [d.vehicleId])).rows[0];
    if (!v) throw E.notFound('Vehicle not found.');
    if (d.odometerKm !== undefined && d.odometerKm < v.mileage_km) throw E.unprocessable(`Odometer (${d.odometerKm} km) cannot be lower than the recorded mileage (${v.mileage_km} km).`, 'ODOMETER_LOWER');
    const r = await client.query(`INSERT INTO fuel_transactions (vehicle_id, driver_id, litres, cost_per_litre, odometer_km, station, fuelled_at, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, now()),$8) RETURNING id`,
      [d.vehicleId, d.driverId || null, d.litres, d.costPerLitre, d.odometerKm ?? null, d.station ?? null, d.fuelledAt || null, req.user.id]);
    if (d.odometerKm !== undefined) await client.query('UPDATE vehicles SET mileage_km=$2 WHERE id=$1', [d.vehicleId, d.odometerKm]);
    await audit(req, 'fuel.create', 'fuel', r.rows[0].id, null, client);
    return r.rows[0].id;
  });
  res.status(201).json({ transaction: mapFuel((await db.query(`${FUEL_SELECT} WHERE f.id=$1`, [id])).rows[0]) });
});

/* ---------- Tracking / assignments overview ---------- */
router.get('/fleet/overview', requireRole(...READ), async (req, res) => {
  const counts = (await db.query(`SELECT status, COUNT(*)::int n FROM vehicles GROUP BY status`)).rows;
  const live = (await db.query(`SELECT v.id AS vehicle_id, v.registration, v.status AS vehicle_status, a.status AS assignment_status, s.tracking_ref, s.origin, s.destination, s.status AS shipment_status, u.full_name AS driver_name
    FROM delivery_assignments a JOIN vehicles v ON v.id=a.vehicle_id JOIN shipments s ON s.id=a.shipment_id JOIN drivers d ON d.id=a.driver_id LEFT JOIN users u ON u.id=d.user_id
    WHERE a.status IN ('assigned','active') ORDER BY v.registration`)).rows;
  res.json({ statusCounts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    liveAssignments: live.map((l) => ({ vehicleId: Number(l.vehicle_id), registration: l.registration, vehicleStatus: l.vehicle_status, assignmentStatus: l.assignment_status, trackingRef: l.tracking_ref,
      origin: l.origin, destination: l.destination, shipmentStatus: l.shipment_status, driverName: l.driver_name })) });
});

module.exports = router;
