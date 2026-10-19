'use strict';

const express = require('express');
const db = require('../config/db');
const { E } = require('../utils/errors');
const { validate, z, idParam, positiveMoney, isoDate, reqText, optionalText } = require('../utils/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { notifyRoles, notifyCompany } = require('../services/notify');
const { saveDocument, quotationHtml } = require('../services/documents');
const { createShipment } = require('../services/shipments');

const router = express.Router();
router.use(authenticate);

const map = (q) => ({ id: Number(q.id), reference: q.reference, companyId: Number(q.company_id), companyName: q.company_name, origin: q.origin, destination: q.destination,
  cargoDescription: q.cargo_description, weightKg: Number(q.weight_kg), serviceType: q.service_type, preferredDate: q.preferred_date, status: q.status,
  quotedAmount: q.quoted_amount === null ? null : Number(q.quoted_amount), staffNotes: q.staff_notes, createdAt: q.created_at, processedAt: q.processed_at,
  shipmentId: q.shipment_id ? Number(q.shipment_id) : null, trackingRef: q.tracking_ref || null });

const SELECT = `SELECT q.*, c.name AS company_name, s.id AS shipment_id, s.tracking_ref
  FROM quotations q JOIN companies c ON c.id=q.company_id LEFT JOIN shipments s ON s.quotation_id=q.id`;
const STAFF_Q = ['admin', 'dispatcher', 'procurement', 'finance'];

const createSchema = z.object({
  origin: reqText(160, 'Origin'), destination: reqText(160, 'Destination'), cargoDescription: reqText(300, 'Cargo description'),
  weightKg: z.coerce.number({ error: 'Weight is required.' }).positive('Weight must be greater than zero.').max(100000),
  serviceType: z.enum(['standard', 'express', 'refrigerated', 'bulk', 'hazardous']).default('standard'), preferredDate: isoDate.optional(),
});

router.post('/', requireRole('client'), validate(createSchema), async (req, res) => {
  const d = req.valid.body;
  if (!req.user.companyId) throw E.unprocessable('Your account is not linked to a company.', 'NO_COMPANY');
  const dup = await db.query(`SELECT 1 FROM quotations WHERE company_id=$1 AND lower(origin)=lower($2) AND lower(destination)=lower($3) AND lower(cargo_description)=lower($4)
    AND weight_kg=$5 AND created_at > now() - interval '60 seconds'`, [req.user.companyId, d.origin, d.destination, d.cargoDescription, d.weightKg]);
  if (dup.rowCount) throw E.conflict('This quotation request was already submitted a moment ago.', 'DUPLICATE_SUBMISSION');
  const r = await db.query(`INSERT INTO quotations (reference, company_id, requested_by, origin, destination, cargo_description, weight_kg, service_type, preferred_date)
    VALUES ('QT-' || nextval('quotation_ref_seq'), $1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
  [req.user.companyId, req.user.id, d.origin, d.destination, d.cargoDescription, d.weightKg, d.serviceType, d.preferredDate || null]);
  const q = (await db.query(`${SELECT} WHERE q.id=$1`, [r.rows[0].id])).rows[0];
  await notifyRoles(['procurement', 'dispatcher', 'admin'], { title: 'New quotation request', message: `${q.company_name} requested quotation ${q.reference}.`, type: 'info', entityType: 'quotation', entityId: q.id });
  await audit(req, 'quotation.create', 'quotation', q.id);
  res.status(201).json({ quotation: map(q) });
});

router.get('/', validate(z.object({ status: z.enum(['submitted', 'in_review', 'quoted', 'accepted', 'rejected', 'declined', 'converted']).optional(), q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50) }), 'query'), async (req, res) => {
  if (req.user.role !== 'client' && !STAFF_Q.includes(req.user.role)) throw E.forbidden();
  const { status, q, page, limit } = req.valid.query; const p = []; const where = [];
  if (req.user.role === 'client') { p.push(req.user.companyId || 0); where.push(`q.company_id=$${p.length}`); }
  if (status) { p.push(status); where.push(`q.status=$${p.length}`); }
  if (q) { p.push(`%${q.toLowerCase()}%`); where.push(`(lower(q.reference) LIKE $${p.length} OR lower(c.name) LIKE $${p.length} OR lower(q.destination) LIKE $${p.length})`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (await db.query(`SELECT COUNT(*)::int n FROM quotations q JOIN companies c ON c.id=q.company_id ${w}`, p)).rows[0].n;
  p.push(limit, (page - 1) * limit);
  const rows = (await db.query(`${SELECT} ${w} ORDER BY q.created_at DESC, q.id DESC LIMIT $${p.length - 1} OFFSET $${p.length}`, p)).rows;
  res.json({ data: rows.map(map), total, page, limit });
});

async function loadForUser(req, id) {
  const q = (await db.query(`${SELECT} WHERE q.id=$1`, [id])).rows[0];
  if (!q) throw E.notFound('Quotation not found.');
  if (req.user.role === 'client') { if (Number(q.company_id) !== req.user.companyId) throw E.notFound('Quotation not found.'); }
  else if (!STAFF_Q.includes(req.user.role)) throw E.forbidden();
  return q;
}

router.get('/:id', validate(idParam, 'params'), async (req, res) => res.json({ quotation: map(await loadForUser(req, req.valid.params.id)) }));

router.patch('/:id/process', requireRole('admin', 'dispatcher', 'procurement'), validate(idParam, 'params'),
  validate(z.object({ action: z.enum(['review', 'quote', 'reject']), quotedAmount: positiveMoney.optional(), notes: optionalText(500) })), async (req, res) => {
    const { action, quotedAmount, notes } = req.valid.body; const id = req.valid.params.id;
    if (action === 'quote' && !quotedAmount) throw E.validation([{ field: 'quotedAmount', message: 'Enter the quoted amount (excluding VAT).' }]);
    if (action === 'reject' && !notes) throw E.validation([{ field: 'notes', message: 'Give a reason for rejecting the quotation.' }]);
    const result = await db.tx(async (client) => {
      const cur = (await client.query('SELECT * FROM quotations WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!cur) throw E.notFound('Quotation not found.');
      const allowed = { review: ['submitted'], quote: ['submitted', 'in_review', 'quoted'], reject: ['submitted', 'in_review', 'quoted'] }[action];
      if (!allowed.includes(cur.status)) throw E.conflict(`A quotation that is "${cur.status}" cannot be ${action === 'review' ? 'moved to review' : action === 'quote' ? 'quoted' : 'rejected'}.`, 'INVALID_STATE');
      const next = { review: 'in_review', quote: 'quoted', reject: 'rejected' }[action];
      await client.query(`UPDATE quotations SET status=$2, quoted_amount=COALESCE($3,quoted_amount), staff_notes=COALESCE($4,staff_notes), processed_by=$5, processed_at=now(), updated_at=now() WHERE id=$1`,
        [id, next, action === 'quote' ? quotedAmount : null, notes ?? null, req.user.id]);
      const q = (await client.query(`${SELECT} WHERE q.id=$1`, [id])).rows[0];
      if (action === 'quote') {
        const comp = (await client.query('SELECT * FROM companies WHERE id=$1', [q.company_id])).rows[0];
        await saveDocument(client, { companyId: q.company_id, type: 'quotation', title: `Quotation ${q.reference}`, fileName: `${q.reference}.html`, content: quotationHtml(q, comp), uploadedBy: req.user.id });
      }
      const msg = { review: `Quotation ${q.reference} is now being reviewed.`, quote: `Quotation ${q.reference} has been priced. Please review and accept or decline.`, reject: `Quotation ${q.reference} could not be accommodated.` }[action];
      await notifyCompany(q.company_id, { title: 'Quotation update', message: msg, type: action === 'reject' ? 'warning' : 'info', entityType: 'quotation', entityId: id }, client);
      await audit(req, `quotation.${action}`, 'quotation', id, { quotedAmount }, client);
      return q;
    });
    res.json({ quotation: map(result) });
  });

router.post('/:id/respond', requireRole('client'), validate(idParam, 'params'), validate(z.object({ action: z.enum(['accept', 'decline']) })), async (req, res) => {
  const id = req.valid.params.id;
  const q = await db.tx(async (client) => {
    const cur = (await client.query('SELECT * FROM quotations WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, req.user.companyId || 0])).rows[0];
    if (!cur) throw E.notFound('Quotation not found.');
    if (cur.status !== 'quoted') throw E.conflict('Only a quoted quotation can be accepted or declined.', 'INVALID_STATE');
    const next = req.valid.body.action === 'accept' ? 'accepted' : 'declined';
    await client.query('UPDATE quotations SET status=$2, updated_at=now() WHERE id=$1', [id, next]);
    await notifyRoles(['dispatcher', 'admin'], { title: `Quotation ${next}`, message: `Quotation ${cur.reference} was ${next} by the client.`, type: next === 'accepted' ? 'success' : 'warning', entityType: 'quotation', entityId: id }, client);
    await audit(req, `quotation.${next}`, 'quotation', id, null, client);
    return (await client.query(`${SELECT} WHERE q.id=$1`, [id])).rows[0];
  });
  res.json({ quotation: map(q) });
});

router.post('/:id/convert', requireRole('admin', 'dispatcher'), validate(idParam, 'params'),
  validate(z.object({ priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'), scheduledDate: isoDate.optional() })), async (req, res) => {
    const id = req.valid.params.id;
    const shipment = await db.tx(async (client) => {
      const q = (await client.query('SELECT * FROM quotations WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!q) throw E.notFound('Quotation not found.');
      if (q.status !== 'accepted') throw E.conflict('Only an accepted quotation can be converted to a shipment.', 'INVALID_STATE');
      const s = await createShipment(client, { companyId: q.company_id, quotationId: q.id, origin: q.origin, destination: q.destination, cargoDescription: q.cargo_description,
        weightKg: q.weight_kg, priority: req.valid.body.priority, scheduledDate: req.valid.body.scheduledDate || q.preferred_date, createdBy: req.user.id });
      await client.query(`UPDATE quotations SET status='converted', updated_at=now() WHERE id=$1`, [id]);
      await notifyCompany(q.company_id, { title: 'Shipment created', message: `Your shipment ${s.tracking_ref} has been created from quotation ${q.reference}.`, type: 'success', entityType: 'shipment', entityId: s.id }, client);
      await audit(req, 'quotation.convert', 'quotation', id, { shipmentId: s.id }, client);
      return s;
    });
    res.status(201).json({ shipment: { id: Number(shipment.id), trackingRef: shipment.tracking_ref, status: shipment.status } });
  });

module.exports = router;
