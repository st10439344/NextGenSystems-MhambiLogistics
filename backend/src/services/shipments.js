'use strict';

async function addHistory(client, shipmentId, status, note, location, userId) {
  await client.query('INSERT INTO shipment_status_history (shipment_id, status, note, location, changed_by) VALUES ($1,$2,$3,$4,$5)',
    [shipmentId, status, note || null, location || null, userId || null]);
}

async function createShipment(client, d) {
  const r = await client.query(
    `INSERT INTO shipments (tracking_ref, quotation_id, company_id, warehouse_id, origin, destination, cargo_description, weight_kg, priority, scheduled_date, eta, created_by)
     VALUES ('MHM-' || lpad(nextval('tracking_ref_seq')::text, 6, '0'), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [d.quotationId || null, d.companyId, d.warehouseId || null, d.origin, d.destination, d.cargoDescription, d.weightKg, d.priority || 'normal', d.scheduledDate || null, d.eta || null, d.createdBy || null]);
  await addHistory(client, r.rows[0].id, 'pending', 'Shipment created', d.origin, d.createdBy);
  return r.rows[0];
}

const SHIPMENT_SELECT = `
  SELECT s.*, c.name AS company_name,
         a.id AS assignment_id, a.status AS assignment_status, a.scheduled_pickup, a.scheduled_delivery,
         d.id AS driver_id, du.full_name AS driver_name, v.id AS vehicle_id, v.registration AS vehicle_registration
  FROM shipments s
  JOIN companies c ON c.id = s.company_id
  LEFT JOIN LATERAL (SELECT * FROM delivery_assignments WHERE shipment_id = s.id AND status <> 'cancelled' ORDER BY id DESC LIMIT 1) a ON TRUE
  LEFT JOIN drivers d ON d.id = a.driver_id
  LEFT JOIN users du ON du.id = d.user_id
  LEFT JOIN vehicles v ON v.id = a.vehicle_id`;

function mapShipment(s, role) {
  const internal = role !== 'client';
  return {
    id: Number(s.id), trackingRef: s.tracking_ref, quotationId: s.quotation_id ? Number(s.quotation_id) : null, companyId: Number(s.company_id), companyName: s.company_name,
    origin: s.origin, destination: s.destination, cargoDescription: s.cargo_description, weightKg: Number(s.weight_kg), priority: s.priority, status: s.status,
    scheduledDate: s.scheduled_date, eta: s.eta, createdAt: s.created_at, deliveredAt: s.delivered_at,
    assignment: s.assignment_id ? { id: Number(s.assignment_id), status: s.assignment_status, scheduledPickup: s.scheduled_pickup, scheduledDelivery: s.scheduled_delivery,
      driverId: internal && s.driver_id ? Number(s.driver_id) : null, driverName: internal ? s.driver_name : null,
      vehicleId: internal && s.vehicle_id ? Number(s.vehicle_id) : null, vehicleRegistration: internal ? s.vehicle_registration : null } : null,
  };
}

module.exports = { addHistory, createShipment, SHIPMENT_SELECT, mapShipment };
