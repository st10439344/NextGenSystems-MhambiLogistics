'use strict';

const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth'));
router.use('/quotations', require('./quotations'));
router.use(require('./shipments'));   // /shipments, /track/:ref, /assignments, /drivers, /driver/deliveries, /incidents
router.use(require('./warehouse'));   // /warehouses, /inventory, /stock-movements, /stock-transfers
router.use(require('./fleet'));       // /vehicles, /maintenance, /fuel, /fleet/overview
router.use(require('./procurement')); // /suppliers, /purchase-requests, /purchase-orders, /goods-received, /supplier-invoices
router.use(require('./finance'));     // /invoices, /payments, /receipts, /expenses, /budgets, /finance/*
router.use(require('./common'));      // /notifications, /settings, /documents, /support, /dashboard, /reports
router.use(require('./admin'));       // /users, /roles, /companies, /audit-logs, /admin/*

module.exports = router;
