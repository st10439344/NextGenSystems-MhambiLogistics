'use strict';

jest.mock('../src/utils/google', () => ({ isConfigured: jest.fn(() => true), verifyGoogleIdToken: jest.fn() }));

const jwt = require('jsonwebtoken');
const db = require('../src/config/db');
const google = require('../src/utils/google');
const { outbox } = require('../src/utils/mailer');
const { api, as, ACCOUNTS, SEED_PASSWORD } = require('./helpers');

const strong = 'Str0ng-Passw0rd!';
let n = 0;
const newUser = (extra = {}) => ({ fullName: 'Test Client', email: `new.client${Date.now()}${n++}@example.test`, phone: '+27 82 555 0100', companyName: 'Test Freight (Pty) Ltd', password: strong, confirmPassword: strong, ...extra });

afterAll(async () => { await db.close(); });

describe('registration', () => {
  it('creates a database-backed Client account and signs the user in', async () => {
    const body = newUser();
    const res = await api().post('/api/v1/auth/register').send(body);
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('client');
    expect(res.body.user.companyId).toBeGreaterThan(0);
    expect(res.body.accessToken).toBeTruthy();
    const row = await db.query('SELECT u.password_hash, r.code FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE lower(u.email)=lower($1)', [body.email]);
    expect(row.rows[0].code).toBe('client');
    expect(row.rows[0].password_hash).not.toContain(strong); // hashed, never plaintext
    expect(row.rows[0].password_hash.startsWith('$2')).toBe(true);
  });

  it('stores the company details captured on the registration form', async () => {
    const body = newUser({ registrationNumber: '2024/123456/07', vatNumber: '4123456789', industry: 'Mining', address: '1 Reef Road', city: 'Newcastle', province: 'KwaZulu-Natal', postalCode: '2940', companyPhone: '+27 34 555 0100' });
    const res = await api().post('/api/v1/auth/register').send(body);
    expect(res.status).toBe(201);
    const row = await db.query('SELECT * FROM companies WHERE id=$1', [res.body.user.companyId]);
    expect(row.rows[0]).toMatchObject({ name: body.companyName, registration_number: '2024/123456/07', vat_number: '4123456789', industry: 'Mining', city: 'Newcastle', province: 'KwaZulu-Natal', postal_code: '2940', phone: '+27 34 555 0100' });
    const me = await api().get('/api/v1/companies/me').set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.body.company.vatNumber).toBe('4123456789');
  });

  it('cannot be used to obtain a staff role', async () => {
    for (const role of ['admin', 'dispatcher', 'finance', 'driver']) {
      const res = await api().post('/api/v1/auth/register').send({ ...newUser(), role, roles: [role], roleId: 1 });
      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('client');
    }
  });

  it('rejects duplicate emails regardless of letter case', async () => {
    const body = newUser();
    expect((await api().post('/api/v1/auth/register').send(body)).status).toBe(201);
    const dup = await api().post('/api/v1/auth/register').send({ ...body, email: body.email.toUpperCase() });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_EXISTS');
    const staffDup = await api().post('/api/v1/auth/register').send({ ...newUser(), email: ACCOUNTS.admin });
    expect(staffDup.status).toBe(409);
  });

  it('validates every field and reports which one is wrong', async () => {
    const res = await api().post('/api/v1/auth/register').send({ fullName: '', email: 'not-an-email', phone: 'abc', companyName: '', password: 'short', confirmPassword: 'different' });
    expect(res.status).toBe(422);
    const fields = res.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['fullName', 'email', 'phone', 'companyName', 'password', 'confirmPassword']));
    const mismatch = await api().post('/api/v1/auth/register').send({ ...newUser(), confirmPassword: 'Other-Passw0rd!' });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.error.details[0].field).toBe('confirmPassword');
    const weak = await api().post('/api/v1/auth/register').send({ ...newUser(), password: 'alllowercase1', confirmPassword: 'alllowercase1' });
    expect(weak.status).toBe(422);
  });

  it('returns a clear JSON error for malformed request bodies', async () => {
    const res = await api().post('/api/v1/auth/register').set('Content-Type', 'application/json').send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('login and role routing', () => {
  const expected = { admin: 'admin', dispatcher: 'dispatcher', warehouse: 'warehouse', fleet: 'fleet', procurement: 'procurement', finance: 'finance', driver: 'driver', client: 'client' };
  it.each(Object.entries(expected))('%s account receives the %s role from the backend', async (key, role) => {
    const res = await api().post('/api/v1/auth/login').send({ email: ACCOUNTS[key], password: SEED_PASSWORD() });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe(role);
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.body.user.role).toBe(role);
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash|passwordHash/);
  });

  it('ignores any role supplied by the client at login', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: ACCOUNTS.client, password: SEED_PASSWORD(), role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('client');
  });

  it('rejects wrong passwords and unknown emails with the same message', async () => {
    const wrong = await api().post('/api/v1/auth/login').send({ email: ACCOUNTS.admin, password: 'Wrong-Passw0rd!' });
    const unknown = await api().post('/api/v1/auth/login').send({ email: 'nobody@example.test', password: 'Wrong-Passw0rd!' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('validates missing fields', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: '', password: '' });
    expect(res.status).toBe(422);
  });

  it('blocks deactivated accounts at login and invalidates their live tokens and sessions', async () => {
    const reg = await api().post('/api/v1/auth/register').send(newUser());
    const { accessToken, refreshToken, user } = reg.body;
    const off = await as('admin').patch(`/api/v1/users/${user.id}/status`, { status: 'inactive' });
    expect(off.status).toBe(200);
    expect((await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`)).body.error.code).toBe('ACCOUNT_INACTIVE');
    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken })).status).toBe(401);
    const login = await api().post('/api/v1/auth/login').send({ email: user.email, password: strong });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe('ACCOUNT_INACTIVE');
    await as('admin').patch(`/api/v1/users/${user.id}/status`, { status: 'active' });
    expect((await api().post('/api/v1/auth/login').send({ email: user.email, password: strong })).status).toBe(200);
  });
});

describe('sessions', () => {
  it('rejects missing, malformed and expired access tokens', async () => {
    expect((await api().get('/api/v1/auth/me')).body.error.code).toBe('UNAUTHORIZED');
    expect((await api().get('/api/v1/auth/me').set('Authorization', 'Bearer garbage')).body.error.code).toBe('TOKEN_INVALID');
    const expired = jwt.sign({ sub: '1', role: 'admin' }, process.env.JWT_ACCESS_SECRET, { expiresIn: -60, issuer: 'mhambi-logistics' });
    expect((await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`)).body.error.code).toBe('TOKEN_EXPIRED');
    const wrongSecret = jwt.sign({ sub: '1', role: 'admin' }, 'some-other-secret-some-other-secret-1234', { issuer: 'mhambi-logistics' });
    expect((await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${wrongSecret}`)).status).toBe(401);
  });

  it('does not trust the role inside a token: the database role is used', async () => {
    const reg = await api().post('/api/v1/auth/register').send(newUser());
    const forged = jwt.sign({ sub: String(reg.body.user.id), role: 'admin' }, process.env.JWT_ACCESS_SECRET, { issuer: 'mhambi-logistics', expiresIn: 300 });
    const res = await api().get('/api/v1/users').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(403);
  });

  it('rotates refresh tokens and revokes everything if an old token is replayed', async () => {
    const login = await api().post('/api/v1/auth/login').send({ email: ACCOUNTS.warehouse, password: SEED_PASSWORD() });
    const first = login.body.refreshToken;
    const r1 = await api().post('/api/v1/auth/refresh').send({ refreshToken: first });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(first);
    const replay = await api().post('/api/v1/auth/refresh').send({ refreshToken: first });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('SESSION_REUSED');
    const afterReplay = await api().post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken });
    expect(afterReplay.status).toBe(401); // whole family revoked
  });

  it('logout revokes the refresh session', async () => {
    const login = await api().post('/api/v1/auth/login').send({ email: ACCOUNTS.fleet, password: SEED_PASSWORD() });
    const out = await api().post('/api/v1/auth/logout').send({ refreshToken: login.body.refreshToken });
    expect(out.status).toBe(200);
    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken })).status).toBe(401);
  });

  it('logout-all revokes every session of the user', async () => {
    const a = await api().post('/api/v1/auth/login').send({ email: ACCOUNTS.procurement, password: SEED_PASSWORD() });
    const b = await api().post('/api/v1/auth/login').send({ email: ACCOUNTS.procurement, password: SEED_PASSWORD() });
    expect((await api().post('/api/v1/auth/logout-all').set('Authorization', `Bearer ${a.body.accessToken}`)).status).toBe(200);
    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: b.body.refreshToken })).status).toBe(401);
  });
});

describe('password reset and change', () => {
  it('completes a reset using the emailed single-use link', async () => {
    const reg = await api().post('/api/v1/auth/register').send(newUser());
    const email = reg.body.user.email;
    outbox.length = 0;
    const res = await api().post('/api/v1/auth/forgot-password').send({ email });
    expect(res.status).toBe(200);
    expect(outbox).toHaveLength(1);
    const token = /token=([\w-]+)/.exec(outbox[0].text)[1];
    const next = 'Brand-New-Passw0rd';
    expect((await api().post('/api/v1/auth/reset-password').send({ token, newPassword: 'weak' })).status).toBe(422);
    expect((await api().post('/api/v1/auth/reset-password').send({ token, newPassword: next })).status).toBe(200);
    expect((await api().post('/api/v1/auth/login').send({ email, password: strong })).status).toBe(401);
    expect((await api().post('/api/v1/auth/login').send({ email, password: next })).status).toBe(200);
    expect((await api().post('/api/v1/auth/reset-password').send({ token, newPassword: 'Another-Passw0rd1' })).status).toBe(400); // already used
    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: reg.body.refreshToken })).status).toBe(401); // old sessions revoked
  });

  it('does not reveal whether an email exists', async () => {
    outbox.length = 0;
    const res = await api().post('/api/v1/auth/forgot-password').send({ email: 'ghost@example.test' });
    expect(res.status).toBe(200);
    expect(outbox).toHaveLength(0);
    expect((await api().post('/api/v1/auth/forgot-password').send({ email: 'bad' })).status).toBe(422);
  });

  it('changes the password only with the correct current password', async () => {
    const reg = await api().post('/api/v1/auth/register').send(newUser());
    const h = { Authorization: `Bearer ${reg.body.accessToken}` };
    expect((await api().post('/api/v1/auth/change-password').set(h).send({ currentPassword: 'Nope-Passw0rd!', newPassword: 'Changed-Passw0rd1' })).status).toBe(422);
    const ok = await api().post('/api/v1/auth/change-password').set(h).send({ currentPassword: strong, newPassword: 'Changed-Passw0rd1' });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();
    expect((await api().post('/api/v1/auth/login').send({ email: reg.body.user.email, password: strong })).status).toBe(401);
  });
});

describe('Google sign-in (token verification mocked; the real verifier needs your Google Cloud client ID)', () => {
  const idToken = 'x'.repeat(40);
  const gUser = (over = {}) => ({ sub: `sub-${Date.now()}${n++}`, email: `g.user${Date.now()}${n}@example.test`, name: 'Google Person', ...over });

  it('reports whether Google is configured', async () => {
    const res = await api().get('/api/v1/auth/google/config');
    expect(res.body).toEqual({ enabled: true, clientId: 'test-client-id.apps.googleusercontent.com' });
  });

  it('asks unregistered users to register explicitly instead of creating an account silently', async () => {
    google.verifyGoogleIdToken.mockResolvedValueOnce(gUser());
    const res = await api().post('/api/v1/auth/google').send({ idToken });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('GOOGLE_NOT_REGISTERED');
  });

  it('registers a Client through the explicit flow, then signs in; role is always client', async () => {
    const g = gUser();
    google.verifyGoogleIdToken.mockResolvedValue(g);
    const reg = await api().post('/api/v1/auth/google/register').send({ idToken, companyName: 'Google Freight', phone: '+27 82 555 0199' });
    expect(reg.status).toBe(201);
    expect(reg.body.user.role).toBe('client');
    const login = await api().post('/api/v1/auth/google').send({ idToken });
    expect(login.status).toBe(200);
    expect(login.body.user.id).toBe(reg.body.user.id);
    const again = await api().post('/api/v1/auth/google/register').send({ idToken, companyName: 'Google Freight', phone: '+27 82 555 0199' });
    expect(again.status).toBe(409);
    google.verifyGoogleIdToken.mockReset();
  });

  it('never grants staff access just because a Google email matches a staff email', async () => {
    google.verifyGoogleIdToken.mockResolvedValueOnce(gUser({ email: ACCOUNTS.admin }));
    const res = await api().post('/api/v1/auth/google').send({ idToken });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('GOOGLE_NOT_LINKED');
    expect(res.body.accessToken).toBeUndefined();
    google.verifyGoogleIdToken.mockResolvedValueOnce(gUser({ email: ACCOUNTS.dispatcher }));
    const reg = await api().post('/api/v1/auth/google/register').send({ idToken, companyName: 'X', phone: '+27 82 555 0199' });
    expect(reg.status).toBe(409);
  });

  it('lets an already signed-in user link Google, after which Google sign-in uses their stored role', async () => {
    const g = gUser();
    google.verifyGoogleIdToken.mockResolvedValue(g);
    const link = await as('finance').post('/api/v1/auth/google/link', { idToken });
    expect(link.status).toBe(200);
    expect(link.body.user.googleLinked).toBe(true);
    const login = await api().post('/api/v1/auth/google').send({ idToken });
    expect(login.status).toBe(200);
    expect(login.body.user.role).toBe('finance');
    const other = await as('fleet').post('/api/v1/auth/google/link', { idToken });
    expect(other.status).toBe(409); // already linked to another user
    google.verifyGoogleIdToken.mockReset();
  });

  it('rejects tokens that fail verification', async () => {
    const { E } = require('../src/utils/errors');
    google.verifyGoogleIdToken.mockRejectedValueOnce(E.unauthorized('Google sign-in could not be verified.', 'GOOGLE_TOKEN_INVALID'));
    const res = await api().post('/api/v1/auth/google').send({ idToken });
    expect(res.status).toBe(401);
    expect((await api().post('/api/v1/auth/google').send({ idToken: 'short' })).status).toBe(422);
  });
});
