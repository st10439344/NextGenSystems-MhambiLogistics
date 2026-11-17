'use strict';
/** DEMO ONLY. NO GATEWAY, NO CARD DETAILS, NO DATABASE WRITES, NO REAL RECEIPTS.
 * Development-only and must be explicitly enabled. Transactions are held in
 * process memory and disappear when the server restarts. */
const express = require('express');
const db = require('../config/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { E } = require('../utils/errors');
const { calculateTotal } = require('../services/demoPaymentMath');
const router = express.Router();
const demoEnabled = process.env.NODE_ENV !== 'production' && process.env.DEMO_PAYMENTS_ENABLED === 'true';
router.use(authenticate);
router.use((req, res, next) => {
  if (!demoEnabled) return res.status(404).json({ error: { message: 'Demo payments are disabled on this server.' } });
  res.set('Cache-Control', 'no-store');
  next();
});
const simulatedPayments = new Map();
const publicPayment = p => ({ ...p, isDemo: true, realMoneyReceived: false });

// Client sees only their own quotations; finance and admin can review all demo activity.
router.get('/', requireRole('client','finance','admin'), async (req,res) => {
  const rows = [...simulatedPayments.values()].filter(p => req.user.role !== 'client' || p.companyId === Number(req.user.companyId));
  res.json({ demoMode: true, persistent: false, realMoneyReceived: false, data: rows.map(publicPayment).reverse() });
});
router.post('/:id/simulate', requireRole('client'), async (req,res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw E.unprocessable('Invalid quotation ID.');
  const quote = (await db.query('SELECT id, reference, company_id, quoted_amount, status FROM quotations WHERE id=$1 AND company_id=$2',
    [id, req.user.companyId || 0])).rows[0];
  if (!quote) throw E.notFound('Quotation not found.');
  if (quote.status !== 'accepted') throw E.conflict('Accept the quotation before running a demo payment.', 'INVALID_STATE');
  if (simulatedPayments.has(id)) throw E.conflict('This quotation has already been paid in the current demo session.', 'ALREADY_DEMO_PAID');
  const amount = Number(quote.quoted_amount);
  if (!Number.isFinite(amount) || amount <= 0) throw E.unprocessable('Quotation has no valid price.');
  const charges = calculateTotal(amount);
  const p = { id: `DEMO-${id}`, quotationId: id, quotationReference: quote.reference,
    companyId: Number(quote.company_id), method:'simulated-card', status:'demo_paid',
    amount: charges.total, subtotal: charges.subtotal, vat: charges.vat,
    currency:'ZAR', paidAt:new Date().toISOString(), reference:`DEMO-PAY-${id}` };
  // No DB mutation. This must never unlock production dispatch or generate a real receipt.
  simulatedPayments.set(id,p);
  res.status(201).json({ demoMode:true, realMoneyReceived:false, payment:publicPayment(p),
    message:'DEMO payment simulated. No money was transferred. Not a financial receipt.' });
});
module.exports = router;
