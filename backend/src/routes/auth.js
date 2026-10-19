'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../config/db');
const config = require('../config/env');
const { E } = require('../utils/errors');
const { validate, z, passwordSchema, emailSchema, reqText } = require('../utils/validate');
const { authenticate } = require('../middleware/auth');
const { getUserById, getUserByEmail, getUserByGoogleSub, getPasswordHash, toPublic } = require('../services/users');
const { issueTokens, rotate, revoke, revokeAll } = require('../services/sessions');
const { audit } = require('../services/audit');
const { notifyRoles } = require('../services/notify');
const { randomToken, sha256 } = require('../utils/tokens');
const { sendMail } = require('../utils/mailer');
const google = require('../utils/google');

const router = express.Router();

const limiter = (max) => rateLimit({
  windowMs: 15 * 60 * 1000, max, standardHeaders: true, legacyHeaders: false, skip: () => config.isTest,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again in a few minutes.' } },
});

const phoneSchema = z.string({ error: 'Phone number is required.' }).trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number.');

const registerSchema = z.object({
  fullName: reqText(120, 'Full name'),
  email: emailSchema,
  phone: phoneSchema,
  companyName: reqText(160, 'Company name'),
  password: passwordSchema,
  confirmPassword: z.string({ error: 'Please confirm your password.' }),
  registrationNumber: z.string().trim().max(40).optional(), vatNumber: z.string().trim().max(20).optional(), industry: z.string().trim().max(80).optional(),
  address: z.string().trim().max(255).optional(), city: z.string().trim().max(80).optional(), province: z.string().trim().max(60).optional(),
  postalCode: z.string().trim().max(10).optional(), companyPhone: z.string().trim().max(30).optional(),
}).refine((d) => d.password === d.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' });

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 4);

/** Creates company + client user + client role. The role is ALWAYS client here; no input can change it. */
async function createClientAccount(client, { fullName, email, phone, companyName, passwordHash, googleSub, registrationNumber, vatNumber, industry, address, city, province, postalCode, companyPhone }) {
  const code = 'CL-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const comp = await client.query(
    `INSERT INTO companies (client_code, name, registration_number, vat_number, industry, address, city, province, postal_code, phone, email)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [code, companyName, registrationNumber || null, vatNumber || null, industry || null, address || null, city || null, province || null, postalCode || null, companyPhone || phone, email]);
  const u = await client.query(
    `INSERT INTO users (email, password_hash, full_name, phone, company_id, google_sub, last_login_at)
     VALUES ($1,$2,$3,$4,$5,$6, now()) RETURNING id`,
    [email, passwordHash || null, fullName, phone, comp.rows[0].id, googleSub || null]);
  await client.query(`INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code='client'`, [u.rows[0].id]);
  return getUserById(u.rows[0].id, client);
}

router.post('/register', limiter(20), validate(registerSchema), async (req, res) => {
  const d = req.valid.body;
  if (await getUserByEmail(d.email)) throw E.conflict('An account with this email address already exists.', 'EMAIL_EXISTS');
  const hash = await bcrypt.hash(d.password, config.bcryptRounds);
  let body;
  try {
    body = await db.tx(async (client) => {
      const user = await createClientAccount(client, { ...d, passwordHash: hash });
      return issueTokens(client, user, req);
    });
  } catch (err) {
    if (err.code === '23505') throw E.conflict('An account with this email address already exists.', 'EMAIL_EXISTS');
    throw err;
  }
  req.user = body.user;
  await audit(req, 'auth.register', 'user', body.user.id);
  await notifyRoles(['admin'], { title: 'New client registered', message: `${d.companyName} (${d.email}) registered a client account.`, type: 'info', entityType: 'user', entityId: body.user.id });
  res.status(201).json(body);
});

const loginSchema = z.object({ email: emailSchema, password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.').max(128) });

router.post('/login', limiter(30), validate(loginSchema), async (req, res) => {
  const { email, password } = req.valid.body;
  const user = await getUserByEmail(email);
  const hash = user ? await getPasswordHash(user.id) : null;
  const ok = await bcrypt.compare(password, hash || DUMMY_HASH);
  if (!user || !hash || !ok) throw E.unauthorized('Incorrect email or password.', 'INVALID_CREDENTIALS');
  if (user.status !== 'active') throw new (require('../utils/errors').ApiError)(403, 'ACCOUNT_INACTIVE', 'This account has been deactivated. Contact an administrator.');
  const body = await db.tx(async (client) => {
    await client.query('UPDATE users SET last_login_at = now() WHERE id=$1', [user.id]);
    return issueTokens(client, user, req);
  });
  req.user = body.user;
  await audit(req, 'auth.login', 'user', user.id);
  res.json(body);
});

router.post('/refresh', limiter(60), validate(z.object({ refreshToken: z.string().min(10) })), async (req, res) => {
  res.json(await rotate(req.valid.body.refreshToken, req));
});

router.post('/logout', validate(z.object({ refreshToken: z.string().min(10).optional() })), async (req, res) => {
  if (req.valid.body.refreshToken) await revoke(req.valid.body.refreshToken);
  res.json({ message: 'Signed out.' });
});

router.post('/logout-all', authenticate, async (req, res) => {
  await revokeAll(req.user.id);
  await audit(req, 'auth.logout_all', 'user', req.user.id);
  res.json({ message: 'All sessions were signed out.' });
});

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

router.patch('/me', authenticate, validate(z.object({
  fullName: reqText(120, 'Full name').optional(), phone: phoneSchema.optional(),
})), async (req, res) => {
  const { fullName, phone } = req.valid.body;
  await db.query('UPDATE users SET full_name=COALESCE($2,full_name), phone=COALESCE($3,phone), updated_at=now() WHERE id=$1', [req.user.id, fullName ?? null, phone ?? null]);
  await audit(req, 'profile.update', 'user', req.user.id);
  res.json({ user: toPublic(await getUserById(req.user.id)) });
});

/* ---------- Password reset / change ---------- */
router.post('/forgot-password', limiter(10), validate(z.object({ email: emailSchema })), async (req, res) => {
  const generic = { message: 'If an account exists for that email, a password reset link has been sent.' };
  const user = await getUserByEmail(req.valid.body.email);
  if (user && user.status === 'active') {
    const token = randomToken();
    await db.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id=$1 AND used_at IS NULL', [user.id]);
    await db.query('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2, now() + interval \'1 hour\')', [user.id, sha256(token)]);
    const link = `${config.appBaseUrl}/public/reset-password.html?token=${token}`;
    await sendMail({ to: user.email, subject: 'Reset your Mhambi Logistics password',
      text: `Hello ${user.full_name},\n\nUse this link to choose a new password (valid for 1 hour):\n${link}\n\nIf you did not request this, ignore this email.` });
    await audit({ user: null, ip: req.ip }, 'auth.forgot_password', 'user', user.id);
  }
  res.json(generic);
});

router.post('/reset-password', limiter(10), validate(z.object({ token: z.string().min(10), newPassword: passwordSchema })), async (req, res) => {
  const { token, newPassword } = req.valid.body;
  const hash = await bcrypt.hash(newPassword, config.bcryptRounds);
  await db.tx(async (client) => {
    const r = await client.query(
      `SELECT id, user_id FROM password_reset_tokens WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`, [sha256(token)]);
    if (!r.rows[0]) throw E.badRequest('This reset link is invalid or has expired.', undefined);
    await client.query('UPDATE users SET password_hash=$2, must_change_password=FALSE, updated_at=now() WHERE id=$1', [r.rows[0].user_id, hash]);
    await client.query('UPDATE password_reset_tokens SET used_at=now() WHERE id=$1', [r.rows[0].id]);
    await revokeAll(r.rows[0].user_id, client);
  });
  res.json({ message: 'Password updated. Please sign in with your new password.' });
});

router.post('/change-password', authenticate, validate(z.object({ currentPassword: z.string().min(1, 'Current password is required.'), newPassword: passwordSchema })), async (req, res) => {
  const { currentPassword, newPassword } = req.valid.body;
  const hash = await getPasswordHash(req.user.id);
  if (!hash || !(await bcrypt.compare(currentPassword, hash))) throw E.unprocessable('Current password is incorrect.', 'INVALID_CREDENTIALS');
  const next = await bcrypt.hash(newPassword, config.bcryptRounds);
  const body = await db.tx(async (client) => {
    await client.query('UPDATE users SET password_hash=$2, must_change_password=FALSE, updated_at=now() WHERE id=$1', [req.user.id, next]);
    await revokeAll(req.user.id, client);
    return issueTokens(client, await getUserById(req.user.id, client), req);
  });
  await audit(req, 'auth.change_password', 'user', req.user.id);
  res.json(body);
});

/* ---------- Google Sign-In (ID token verified server-side) ---------- */
router.get('/google/config', (req, res) => res.json({ enabled: google.isConfigured(), clientId: config.googleClientIds[0] || null }));

const idTokenSchema = z.object({ idToken: z.string({ error: 'Google ID token is required.' }).min(20) });

router.post('/google', limiter(30), validate(idTokenSchema), async (req, res) => {
  const g = await google.verifyGoogleIdToken(req.valid.body.idToken);
  const linked = await getUserByGoogleSub(g.sub);
  if (linked) {
    if (linked.status !== 'active') throw new (require('../utils/errors').ApiError)(403, 'ACCOUNT_INACTIVE', 'This account has been deactivated.');
    const body = await db.tx(async (client) => {
      await client.query('UPDATE users SET last_login_at=now() WHERE id=$1', [linked.id]);
      return issueTokens(client, linked, req);
    });
    req.user = body.user;
    await audit(req, 'auth.google_login', 'user', linked.id);
    return res.json(body);
  }
  // Never match staff by email alone: an unlinked existing account must sign in with its password and link Google.
  if (await getUserByEmail(g.email)) {
    throw E.conflict('An account with this email already exists. Sign in with your password, then link Google from Settings.', 'GOOGLE_NOT_LINKED');
  }
  const err = E.notFound('No Mhambi account is linked to this Google account. You can register as a client.');
  err.code = 'GOOGLE_NOT_REGISTERED';
  err.details = { email: g.email, name: g.name };
  throw err;
});

router.post('/google/register', limiter(20), validate(idTokenSchema.extend({ companyName: reqText(160, 'Company name'), phone: phoneSchema })), async (req, res) => {
  const g = await google.verifyGoogleIdToken(req.valid.body.idToken);
  if (await getUserByEmail(g.email) || await getUserByGoogleSub(g.sub)) throw E.conflict('An account for this Google user already exists.', 'EMAIL_EXISTS');
  let body;
  try {
    body = await db.tx(async (client) => {
      const user = await createClientAccount(client, { fullName: g.name, email: g.email, phone: req.valid.body.phone, companyName: req.valid.body.companyName, googleSub: g.sub });
      return issueTokens(client, user, req);
    });
  } catch (err) {
    if (err.code === '23505') throw E.conflict('An account for this Google user already exists.', 'EMAIL_EXISTS');
    throw err;
  }
  req.user = body.user;
  await audit(req, 'auth.google_register', 'user', body.user.id);
  res.status(201).json(body);
});

router.post('/google/link', authenticate, validate(idTokenSchema), async (req, res) => {
  const g = await google.verifyGoogleIdToken(req.valid.body.idToken);
  const other = await getUserByGoogleSub(g.sub);
  if (other && other.id !== req.user.id) throw E.conflict('This Google account is already linked to another user.', 'GOOGLE_IN_USE');
  await db.query('UPDATE users SET google_sub=$2, updated_at=now() WHERE id=$1', [req.user.id, g.sub]);
  await audit(req, 'auth.google_link', 'user', req.user.id);
  res.json({ user: toPublic(await getUserById(req.user.id)) });
});

router.delete('/google/link', authenticate, async (req, res) => {
  if (!req.user.hasPassword) throw E.unprocessable('Set a password before unlinking Google, otherwise you could not sign in.', 'NO_PASSWORD');
  await db.query('UPDATE users SET google_sub=NULL, updated_at=now() WHERE id=$1', [req.user.id]);
  res.json({ user: toPublic(await getUserById(req.user.id)) });
});

module.exports = router;
