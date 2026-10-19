'use strict';

const nodemailer = require('nodemailer');
const config = require('../config/env');

const outbox = []; // populated only in test/development; lets tests read reset links
let transporter = null;

function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

/** Returns true if the message was handed to an SMTP server, false if it was only logged/stored (no SMTP configured). */
async function sendMail({ to, subject, text }) {
  const t = getTransporter();
  if (t) {
    await t.sendMail({ from: config.smtp.from, to, subject, text });
    return true;
  }
  if (!config.isProd) {
    outbox.push({ to, subject, text });
    if (!config.isTest) console.log(`[mail not sent: SMTP not configured]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
  } else {
    console.warn('SMTP is not configured: email was NOT sent.');
  }
  return false;
}

module.exports = { sendMail, outbox };
