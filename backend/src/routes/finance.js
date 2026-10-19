'use strict';

const express = require('express');
const db = require('../config/db');
const config = require('../config/env');
const { E } = require('../utils/errors');
const { validate, z, idParam, isoDate, reqText, optionalText, positiveMoney } = require('../utils/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { notifyCompany } = require('../services/notify');
const { saveDocument, invoiceHtml, receiptHtml } = require('../services/documents');
const { sendCsv } = require('../utils/csv');

const router = express.Router();
router.use(authenticate);

const FIN = ['finance', 'admin'];
const round2 = (n) => Math.round(n * 100) / 100;
async function vatRate(client) {
  const r = (await client.query(`SELECT value FROM settings WHERE user_id IS NULL AND key='vatRate'`)).rows[0];
  const v = r ? Number(r.value) : NaN;
  return Number.isFinite(v) && v >= 0 ? v : config.vatRate;
}
const DEPTS = ['admin', 'dispatch', 'warehouse', 'fleet', 'procurement', 'finance'];

const INV_SELECT = `SELECT i.*, c.name AS company_name, s.tracking_ref,
    COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id),0) AS paid,
    i.total - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id),0) AS balance,
    CASE WHEN i.status IN ('unpaid','partially_paid') AND i.due_date < CURRENT_DATE THEN 'overdue' ELSE i.status END AS display_status
  FROM invoices i JOIN companies c ON c.id=i.company_id LEFT JOIN shipments s ON s.id=i.shipment_id`;

const mapInv = (i) => ({ id: Number(i.id), invoiceNumber: i.invoice_number, companyId: Number(i.company_id), companyName: i.company_name, shipmentId: i.shipment_id ? Number(i.shipment_id) : null, trackingRef: i.tracking_ref,
  description: i.description, subtotal: Number(i.subtotal), vatAmount: Number(i.vat_amount), total: Number(i.total), paid: Number(i.paid), balance: round2(Number(i.balance)),
  status: i.status, displayStatus: i.display_status, issueDate: i.issue_date, dueDate: i.due_date, createdAt: i.created_at });

function loadInvoiceAccess(req, inv) {
  if (!inv) throw E.notFound('Invoice not found.');
  if (req.user.role === 'client') { if (Number(inv.company_id) !== req.user.companyId || inv.status === 'draft') throw E.notFound('Invoice not found.'); }
  else if (!FIN.includes(req.user.role)) throw E.forbidden();
}

router.get('/invoices', validate(z.object({ status: z.enum(['draft', 'unpaid', 'partially_paid', 'paid', 'cancelled', 'overdue']).optional(), q: z.string().trim().max(80).optional(), companyId: z.coerce.number().int().optional(),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50), format: z.enum(['json', 'csv']).default('json') }), 'query'), async (req, res) => {
  if (req.user.role !== 'client' && !FIN.includes(req.user.role)) throw E.forbidden();
  const { status, q, companyId, page, limit, format } = req.valid.query; const p = []; const where = [];
  if (req.user.role === 'client') { p.push(req.user.companyId || 0); where.push(`i.company_id=$${p.length}`); where.push(`i.status<>'draft'`); }
  else if (companyId) { p.push(companyId); where.push(`i.company_id=$${p.length}`); }
  if (q) { p.push(`%${q.toLowerCase()}%`); where.push(`(lower(i.invoice_number) LIKE $${p.length} OR lower(c.name) LIKE $${p.length} OR lower(i.description) LIKE $${p.length})`); }
  const base = `${INV_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  const filtered = status ? `SELECT * FROM (${base}) x WHERE x.display_status = $${p.push(status)}` : base;
  const total = (await db.query(`SELECT COUNT(*)::int n FROM (${filtered}) y`, p)).rows[0].n;
  const lim = format === 'csv' ? 5000 : limit;
  p.push(lim, format === 'csv' ? 0 : (page - 1) * limit);
  const rows = (await db.query(`SELECT * FROM (${filtered}) z ORDER BY z.created_at DESC, z.id DESC LIMIT $${p.length - 1} OFFSET $${p.length}`, p)).rows;
  if (format === 'csv') return sendCsv(res, 'invoices.csv', rows.map((i) => ({ invoice: i.invoice_number, company: i.company_name, issue_date: i.issue_date, due_date: i.due_date, subtotal: i.subtotal, vat: i.vat_amount, total: i.total, paid: i.paid, balance: i.balance, status: i.display_status })));
  return res.json({ data: rows.map(mapInv), total, page, limit });
});

router.get('/invoices/:id', validate(idParam, 'params'), async (req, res) => {
  const inv = (await db.query(`${INV_SELECT} WHERE i.id=$1`, [req.valid.params.id])).rows[0];
  loadInvoiceAccess(req, inv);
  const pays = (await db.query(`SELECT p.*, r.receipt_number, r.id AS receipt_id FROM payments p LEFT JOIN receipts r ON r.payment_id=p.id WHERE p.invoice_id=$1 ORDER BY p.paid_at, p.id`, [inv.id])).rows;
  res.json({ invoice: mapInv(inv), payments: pays.map((p) => ({ id: Number(p.id), amount: Number(p.amount), method: p.method, reference: p.reference, paidAt: p.paid_at, receiptNumber: p.receipt_number, receiptId: p.receipt_id ? Number(p.receipt_id) : null })) });
});

async function publishInvoice(client, id, req) {
  const inv = (await client.query('SELECT * FROM invoices WHERE id=$1', [id])).rows[0];
  const comp = (await client.query('SELECT * FROM companies WHERE id=$1', [inv.company_id])).rows[0];
  await saveDocument(client, { companyId: inv.company_id, shipmentId: inv.shipment_id, invoiceId: id, type: 'invoice', title: `Invoice ${inv.invoice_number}`, fileName: `${inv.invoice_number}.html`, content: invoiceHtml(inv, comp), uploadedBy: req.user.id });
  await notifyCompany(inv.company_id, { title: 'New invoice', message: `Invoice ${inv.invoice_number} for R ${Number(inv.total).toFixed(2)} is available in Documents.`, type: 'info', entityType: 'invoice', entityId: id }, client);
}

router.post('/invoices', requireRole(...FIN), validate(z.object({ companyId: z.coerce.number({ error: 'Choose a client company.' }).int().positive(), shipmentId: z.coerce.number().int().positive().optional(), description: reqText(300, 'Description'),
  subtotal: z.coerce.number({ error: 'Amount is required.' }).positive('Amount must be greater than zero.').max(99999999), issueDate: isoDate.optional(), dueDate: isoDate, issue: z.boolean().default(true) })), async (req, res) => {
  const d = req.valid.body;
  const issueDate = d.issueDate || new Date().toISOString().slice(0, 10);
  if (d.dueDate < issueDate) throw E.validation([{ field: 'dueDate', message: 'Due date cannot be before the issue date.' }]);
  const id = await db.tx(async (client) => {
    if (d.shipmentId) {
      const s = (await client.query('SELECT company_id FROM shipments WHERE id=$1', [d.shipmentId])).rows[0];
      if (!s) throw E.unprocessable('That shipment does not exist.', 'INVALID_SHIPMENT');
      if (Number(s.company_id) !== d.companyId) throw E.unprocessable('That shipment belongs to a different company.', 'COMPANY_MISMATCH');
      const dup = await client.query(`SELECT invoice_number FROM invoices WHERE shipment_id=$1 AND status<>'cancelled'`, [d.shipmentId]);
      if (dup.rowCount) throw E.conflict(`Shipment already has invoice ${dup.rows[0].invoice_number}.`, 'INVOICE_EXISTS');
    }
    const comp = await client.query(`SELECT 1 FROM companies WHERE id=$1`, [d.companyId]);
    if (!comp.rowCount) throw E.unprocessable('That company does not exist.', 'INVALID_COMPANY');
    const vat = round2(d.subtotal * (await vatRate(client))); const total = round2(d.subtotal + vat);
    const r = await client.query(`INSERT INTO invoices (invoice_number, company_id, shipment_id, description, subtotal, vat_amount, total, status, issue_date, due_date, created_by)
      VALUES ('INV-' || nextval('invoice_ref_seq'),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [d.companyId, d.shipmentId || null, d.description, d.subtotal, vat, total, d.issue ? 'unpaid' : 'draft', issueDate, d.dueDate, req.user.id]);
    if (d.issue) await publishInvoice(client, r.rows[0].id, req);
    await audit(req, 'invoice.create', 'invoice', r.rows[0].id, { total }, client);
    return r.rows[0].id;
  });
  res.status(201).json({ invoice: mapInv((await db.query(`${INV_SELECT} WHERE i.id=$1`, [id])).rows[0]) });
});

router.patch('/invoices/:id', requireRole(...FIN), validate(idParam, 'params'), validate(z.object({ description: reqText(300).optional(), subtotal: z.coerce.number().positive().max(99999999).optional(), dueDate: isoDate.optional() })), async (req, res) => {
  const d = req.valid.body; const id = req.valid.params.id;
  await db.tx(async (client) => {
    const cur = (await client.query('SELECT * FROM invoices WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw E.notFound('Invoice not found.');
    const paid = (await client.query('SELECT COUNT(*)::int n FROM payments WHERE invoice_id=$1', [id])).rows[0].n;
    if (!['draft', 'unpaid'].includes(cur.status) || paid > 0) throw E.conflict('Only draft or unpaid invoices without payments can be edited.', 'INVALID_STATE');
    const subtotal = d.subtotal ?? Number(cur.subtotal); const vat = round2(subtotal * (await vatRate(client)));
    if (d.dueDate && d.dueDate < new Date(cur.issue_date).toISOString().slice(0, 10)) throw E.validation([{ field: 'dueDate', message: 'Due date cannot be before the issue date.' }]);
    await client.query('UPDATE invoices SET description=COALESCE($2,description), subtotal=$3, vat_amount=$4, total=$5, due_date=COALESCE($6,due_date) WHERE id=$1', [id, d.description ?? null, subtotal, vat, round2(subtotal + vat), d.dueDate ?? null]);
    await audit(req, 'invoice.update', 'invoice', id, d, client);
  });
  res.json({ invoice: mapInv((await db.query(`${INV_SELECT} WHERE i.id=$1`, [id])).rows[0]) });
});

router.post('/invoices/:id/issue', requireRole(...FIN), validate(idParam, 'params'), async (req, res) => {
  const id = req.valid.params.id;
  await db.tx(async (client) => {
    const cur = (await client.query('SELECT status FROM invoices WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw E.notFound('Invoice not found.');
    if (cur.status !== 'draft') throw E.conflict('Only draft invoices can be issued.', 'INVALID_STATE');
    await client.query(`UPDATE invoices SET status='unpaid', issue_date=GREATEST(issue_date, CURRENT_DATE) WHERE id=$1`, [id]);
    await client.query(`UPDATE invoices SET due_date = GREATEST(due_date, issue_date) WHERE id=$1`, [id]);
    await publishInvoice(client, id, req);
    await audit(req, 'invoice.issue', 'invoice', id, null, client);
  });
  res.json({ invoice: mapInv((await db.query(`${INV_SELECT} WHERE i.id=$1`, [id])).rows[0]) });
});

router.post('/invoices/:id/cancel', requireRole(...FIN), validate(idParam, 'params'), async (req, res) => {
  const id = req.valid.params.id;
  await db.tx(async (client) => {
    const cur = (await client.query('SELECT status FROM invoices WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw E.notFound('Invoice not found.');
    const paid = (await client.query('SELECT COUNT(*)::int n FROM payments WHERE invoice_id=$1', [id])).rows[0].n;
    if (cur.status === 'cancelled' || paid > 0) throw E.conflict('Invoices with payments, or already cancelled, cannot be cancelled.', 'INVALID_STATE');
    await client.query(`UPDATE invoices SET status='cancelled' WHERE id=$1`, [id]);
    await audit(req, 'invoice.cancel', 'invoice', id, null, client);
  });
  res.json({ invoice: mapInv((await db.query(`${INV_SELECT} WHERE i.id=$1`, [id])).rows[0]) });
});

/* ---------- Payments & receipts (records of money received; no payment gateway) ---------- */
router.post('/invoices/:id/payments', requireRole(...FIN), validate(idParam, 'params'),
  validate(z.object({ amount: positiveMoney, method: z.enum(['eft', 'card', 'cash', 'other']), reference: optionalText(60), paidAt: isoDate.optional() })), async (req, res) => {
    const d = req.valid.body; const id = req.valid.params.id;
    const result = await db.tx(async (client) => {
      const inv = (await client.query('SELECT * FROM invoices WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!inv) throw E.notFound('Invoice not found.');
      if (!['unpaid', 'partially_paid'].includes(inv.status)) throw E.conflict(`A ${inv.status} invoice cannot receive payments.`, 'INVALID_STATE');
      const paid = Number((await client.query('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE invoice_id=$1', [id])).rows[0].s);
      const balance = round2(Number(inv.total) - paid);
      if (d.amount > balance + 0.0001) throw E.unprocessable(`Payment exceeds the outstanding balance of R ${balance.toFixed(2)}.`, 'OVERPAYMENT');
      const pay = (await client.query(`INSERT INTO payments (invoice_id, amount, method, reference, paid_at, recorded_by) VALUES ($1,$2,$3,$4,COALESCE($5::date, CURRENT_DATE),$6) RETURNING *`,
        [id, d.amount, d.method, d.reference ?? null, d.paidAt ?? null, req.user.id])).rows[0];
      const rc = (await client.query(`INSERT INTO receipts (receipt_number, payment_id) VALUES ('RCT-' || nextval('receipt_ref_seq'), $1) RETURNING *`, [pay.id])).rows[0];
      const remaining = round2(balance - d.amount);
      await client.query('UPDATE invoices SET status=$2 WHERE id=$1', [id, remaining <= 0 ? 'paid' : 'partially_paid']);
      const comp = (await client.query('SELECT * FROM companies WHERE id=$1', [inv.company_id])).rows[0];
      await saveDocument(client, { companyId: inv.company_id, invoiceId: id, type: 'receipt', title: `Receipt ${rc.receipt_number}`, fileName: `${rc.receipt_number}.html`,
        content: receiptHtml({ receipt_number: rc.receipt_number, amount: pay.amount, method: pay.method, reference: pay.reference, paid_at: pay.paid_at }, inv, comp), uploadedBy: req.user.id });
      await notifyCompany(inv.company_id, { title: 'Payment received', message: `Payment of R ${Number(d.amount).toFixed(2)} received for ${inv.invoice_number}. Receipt ${rc.receipt_number}.`, type: 'success', entityType: 'invoice', entityId: id }, client);
      await audit(req, 'payment.record', 'payment', pay.id, { invoice: inv.invoice_number, amount: d.amount }, client);
      return { payment: pay, receipt: rc, remaining };
    });
    res.status(201).json({ payment: { id: Number(result.payment.id), amount: Number(result.payment.amount), method: result.payment.method, reference: result.payment.reference },
      receipt: { id: Number(result.receipt.id), receiptNumber: result.receipt.receipt_number }, outstandingBalance: result.remaining });
  });

router.get('/payments', requireRole('finance', 'admin', 'client'), async (req, res) => {
  const p = []; let w = '';
  if (req.user.role === 'client') { p.push(req.user.companyId || 0); w = 'WHERE i.company_id=$1'; }
  const rows = (await db.query(`SELECT p.*, i.invoice_number, c.name AS company_name, r.receipt_number, r.id AS receipt_id FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN companies c ON c.id=i.company_id
    LEFT JOIN receipts r ON r.payment_id=p.id ${w} ORDER BY p.paid_at DESC, p.id DESC LIMIT 300`, p)).rows;
  res.json({ data: rows.map((x) => ({ id: Number(x.id), invoiceId: Number(x.invoice_id), invoiceNumber: x.invoice_number, companyName: x.company_name, amount: Number(x.amount), method: x.method, reference: x.reference, paidAt: x.paid_at, receiptNumber: x.receipt_number, receiptId: x.receipt_id ? Number(x.receipt_id) : null })) });
});

router.get('/receipts', requireRole('finance', 'admin', 'client'), async (req, res) => {
  const p = []; let w = '';
  if (req.user.role === 'client') { p.push(req.user.companyId || 0); w = 'WHERE i.company_id=$1'; }
  const rows = (await db.query(`SELECT r.*, p.amount, p.method, p.paid_at, i.invoice_number, c.name AS company_name FROM receipts r JOIN payments p ON p.id=r.payment_id JOIN invoices i ON i.id=p.invoice_id JOIN companies c ON c.id=i.company_id ${w} ORDER BY r.issued_at DESC, r.id DESC LIMIT 300`, p)).rows;
  res.json({ data: rows.map((x) => ({ id: Number(x.id), receiptNumber: x.receipt_number, invoiceNumber: x.invoice_number, companyName: x.company_name, amount: Number(x.amount), method: x.method, paidAt: x.paid_at, issuedAt: x.issued_at })) });
});

/* ---------- Receivable / payable views ---------- */
router.get('/finance/receivables', requireRole(...FIN), async (req, res) => {
  const rows = (await db.query(`SELECT company_id, company_name, COUNT(*)::int AS invoices, SUM(balance) AS outstanding, SUM(CASE WHEN display_status='overdue' THEN balance ELSE 0 END) AS overdue
    FROM (${INV_SELECT}) x WHERE x.status IN ('unpaid','partially_paid') GROUP BY company_id, company_name ORDER BY outstanding DESC`)).rows;
  res.json({ data: rows.map((r) => ({ companyId: Number(r.company_id), companyName: r.company_name, invoices: r.invoices, outstanding: round2(Number(r.outstanding)), overdue: round2(Number(r.overdue)) })),
    totalOutstanding: round2(rows.reduce((a, r) => a + Number(r.outstanding), 0)) });
});

router.get('/finance/payables', requireRole(...FIN), async (req, res) => {
  const rows = (await db.query(`SELECT i.*, s.name AS supplier_name FROM supplier_invoices i JOIN suppliers s ON s.id=i.supplier_id WHERE i.status='unpaid' ORDER BY i.due_date`)).rows;
  res.json({ data: rows.map((i) => ({ id: Number(i.id), invoiceNumber: i.invoice_number, supplierName: i.supplier_name, amount: Number(i.amount), dueDate: i.due_date, overdue: new Date(i.due_date) < new Date(new Date().toDateString()) })),
    totalPayable: round2(rows.reduce((a, r) => a + Number(r.amount), 0)) });
});

/* ---------- Expenses ---------- */
const mapExp = (e) => ({ id: Number(e.id), department: e.department, category: e.category, description: e.description, amount: Number(e.amount), expenseDate: e.expense_date, status: e.status, recordedBy: e.recorded_by_name });
router.get('/expenses', requireRole(...FIN), validate(z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional(), department: z.enum(DEPTS).optional() }), 'query'), async (req, res) => {
  const p = []; const where = [];
  if (req.valid.query.status) { p.push(req.valid.query.status); where.push(`e.status=$${p.length}`); }
  if (req.valid.query.department) { p.push(req.valid.query.department); where.push(`e.department=$${p.length}`); }
  const rows = (await db.query(`SELECT e.*, u.full_name AS recorded_by_name FROM expenses e LEFT JOIN users u ON u.id=e.recorded_by ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY e.expense_date DESC, e.id DESC LIMIT 300`, p)).rows;
  res.json({ data: rows.map(mapExp), approvedTotal: round2(rows.filter((r) => r.status === 'approved').reduce((a, r) => a + Number(r.amount), 0)) });
});

router.post('/expenses', requireRole(...FIN), validate(z.object({ department: z.enum(DEPTS), category: reqText(60, 'Category'), description: reqText(300, 'Description'), amount: positiveMoney, expenseDate: isoDate })), async (req, res) => {
  const d = req.valid.body;
  const r = await db.query(`INSERT INTO expenses (department, category, description, amount, expense_date, recorded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [d.department, d.category, d.description, d.amount, d.expenseDate, req.user.id]);
  await audit(req, 'expense.create', 'expense', r.rows[0].id);
  res.status(201).json({ expense: mapExp((await db.query('SELECT e.*, u.full_name AS recorded_by_name FROM expenses e LEFT JOIN users u ON u.id=e.recorded_by WHERE e.id=$1', [r.rows[0].id])).rows[0]) });
});

router.patch('/expenses/:id/decision', requireRole(...FIN), validate(idParam, 'params'), validate(z.object({ decision: z.enum(['approve', 'reject']) })), async (req, res) => {
  const r = await db.query(`UPDATE expenses SET status=$2, decided_by=$3 WHERE id=$1 AND status='pending' RETURNING id`, [req.valid.params.id, req.valid.body.decision === 'approve' ? 'approved' : 'rejected', req.user.id]);
  if (!r.rowCount) {
    const ex = await db.query('SELECT status FROM expenses WHERE id=$1', [req.valid.params.id]);
    if (!ex.rowCount) throw E.notFound('Expense not found.');
    throw E.conflict(`This expense is already ${ex.rows[0].status}.`, 'INVALID_STATE');
  }
  await audit(req, `expense.${req.valid.body.decision}`, 'expense', req.valid.params.id);
  res.json({ expense: mapExp((await db.query('SELECT e.*, u.full_name AS recorded_by_name FROM expenses e LEFT JOIN users u ON u.id=e.recorded_by WHERE e.id=$1', [req.valid.params.id])).rows[0]) });
});

router.delete('/expenses/:id', requireRole(...FIN), validate(idParam, 'params'), async (req, res) => {
  const r = await db.query(`DELETE FROM expenses WHERE id=$1 AND status='pending' RETURNING id`, [req.valid.params.id]);
  if (!r.rowCount) throw E.conflict('Only pending expenses can be deleted (approved or rejected expenses are part of the record).', 'INVALID_STATE');
  await audit(req, 'expense.delete', 'expense', req.valid.params.id);
  res.json({ message: 'Expense deleted.' });
});

/* ---------- Budgets ---------- */
const BUD_SELECT = `SELECT b.*, COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.department=b.department AND e.status='approved' AND e.expense_date BETWEEN b.start_date AND b.end_date),0) AS spent FROM budgets b`;
const mapBud = (b) => ({ id: Number(b.id), department: b.department, periodLabel: b.period_label, startDate: b.start_date, endDate: b.end_date, allocated: Number(b.allocated_amount), spent: Number(b.spent),
  remaining: round2(Number(b.allocated_amount) - Number(b.spent)), overBudget: Number(b.spent) > Number(b.allocated_amount) });

router.get('/budgets', requireRole(...FIN), async (req, res) => res.json({ data: (await db.query(`${BUD_SELECT} ORDER BY b.start_date DESC, b.department`)).rows.map(mapBud) }));

router.post('/budgets', requireRole(...FIN), validate(z.object({ department: z.enum(DEPTS), periodLabel: reqText(20, 'Period'), startDate: isoDate, endDate: isoDate, allocatedAmount: z.coerce.number().min(0).max(999999999) })), async (req, res) => {
  const d = req.valid.body;
  if (d.endDate < d.startDate) throw E.validation([{ field: 'endDate', message: 'End date cannot be before the start date.' }]);
  let r;
  try { r = await db.query(`INSERT INTO budgets (department, period_label, start_date, end_date, allocated_amount) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [d.department, d.periodLabel, d.startDate, d.endDate, d.allocatedAmount]); }
  catch (err) { if (err.code === '23505') throw E.conflict('A budget for that department and period already exists.', 'DUPLICATE'); throw err; }
  await audit(req, 'budget.create', 'budget', r.rows[0].id);
  res.status(201).json({ budget: mapBud((await db.query(`${BUD_SELECT} WHERE b.id=$1`, [r.rows[0].id])).rows[0]) });
});

router.patch('/budgets/:id', requireRole(...FIN), validate(idParam, 'params'), validate(z.object({ allocatedAmount: z.coerce.number().min(0).max(999999999) })), async (req, res) => {
  const r = await db.query('UPDATE budgets SET allocated_amount=$2 WHERE id=$1 RETURNING id', [req.valid.params.id, req.valid.body.allocatedAmount]);
  if (!r.rowCount) throw E.notFound('Budget not found.');
  await audit(req, 'budget.update', 'budget', req.valid.params.id, req.valid.body);
  res.json({ budget: mapBud((await db.query(`${BUD_SELECT} WHERE b.id=$1`, [req.valid.params.id])).rows[0]) });
});

router.delete('/budgets/:id', requireRole(...FIN), validate(idParam, 'params'), async (req, res) => {
  const r = await db.query('DELETE FROM budgets WHERE id=$1 RETURNING id', [req.valid.params.id]);
  if (!r.rowCount) throw E.notFound('Budget not found.');
  await audit(req, 'budget.delete', 'budget', req.valid.params.id);
  res.json({ message: 'Budget deleted.' });
});

module.exports = router;
