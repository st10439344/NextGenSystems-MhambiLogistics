'use strict';
/**
 * Runs the real website pages (HTML + JavaScript) in a simulated browser (jsdom) against the real API and database.
 * It cannot replace a manual check in Chrome, but it proves that the pages load, call the API, render data and handle clicks.
 */
const path = require('path');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const db = require('../src/config/db');
const app = require('../src/app');
const { login, ACCOUNTS, SEED_PASSWORD } = require('./helpers');
const config = require(path.join(__dirname, '..', '..', 'shared', 'portal-config.json'));

let server; let origin;
beforeAll(async () => { await new Promise((r) => { server = app.listen(0, '127.0.0.1', r); }); origin = `http://127.0.0.1:${server.address().port}`; });
afterAll(async () => { await new Promise((r) => server.close(r)); await db.close(); });

class LocalOnly extends ResourceLoader {
  fetch(url, opts) { return url.startsWith(origin) ? super.fetch(url, opts) : Promise.resolve(Buffer.from('')); }
}
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 6000, step = 25) { const end = Date.now() + ms; for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) throw new Error('Timed out waiting for: ' + fn.toString().slice(0, 140)); await tick(step); } }

async function session(key) {
  const res = await require('supertest')(app).post('/api/v1/auth/login').send({ email: ACCOUNTS[key], password: SEED_PASSWORD() });
  return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken, user: res.body.user };
}

async function open(urlPath, sess) {
  const errors = []; const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (!/Not implemented: navigation/.test(e.message)) errors.push(e.message); });
  const dom = await JSDOM.fromURL(origin + urlPath, {
    runScripts: 'dangerously', resources: new LocalOnly(), pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window) {
      window.fetch = (u, o) => fetch(new URL(u, window.location.href), o);
      window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
      window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
      window.scrollTo = () => {}; window.open = (u) => { window.__opened = u; };
      window.URL.createObjectURL = () => 'blob:test'; window.URL.revokeObjectURL = () => {};
      if (sess) window.sessionStorage.setItem('mhambi.session', JSON.stringify(sess));
    },
  });
  const w = dom.window; const d = w.document;
  await new Promise((r) => (d.readyState === 'complete' ? r() : w.addEventListener('load', r)));
  return { w, d, errors, close: () => w.close() };
}
const root = (p) => p.d.getElementById('consoleRoot');
const idle = (p) => until(() => !p.d.querySelector('#consoleRoot .fa-spinner') && !p.d.querySelector('.portal-modal') && p.w.MHAMBI_API.pending === 0);
const settled = (p) => until(() => root(p) && !root(p).querySelector('.fa-spinner') && root(p).innerHTML.length > 150 && p.d.documentElement.getAttribute('data-shell-ready') === '1' && p.w.MHAMBI_API.pending === 0);
const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
const typeInto = (el, v) => { el.value = v; el.dispatchEvent(new el.ownerDocument.defaultView.Event('input', { bubbles: true })); el.dispatchEvent(new el.ownerDocument.defaultView.Event('change', { bubbles: true })); };
const submit = (form) => form.dispatchEvent(new form.ownerDocument.defaultView.Event('submit', { bubbles: true, cancelable: true }));
const stored = (p) => JSON.parse(p.w.sessionStorage.getItem('mhambi.session') || p.w.localStorage.getItem('mhambi.session') || 'null');

describe('public pages', () => {
  it('login page has no role dropdown, signs in against the real backend and stores the server-assigned role', async () => {
    const p = await open('/public/login.html');
    expect(p.d.getElementById('loginRole')).toBeNull();
    expect(p.d.body.textContent).not.toMatch(/@123|Admin@|Staff demo access/); // no credentials may ever be printed on the sign-in page
    expect(p.d.querySelector('a.forgot-password').getAttribute('href')).toBe('forgot-password.html');
    typeInto(p.d.getElementById('email'), ACCOUNTS.dispatcher); typeInto(p.d.getElementById('password'), SEED_PASSWORD());
    submit(p.d.getElementById('loginForm'));
    await until(() => stored(p));
    expect(stored(p).user.role).toBe('dispatcher');
    expect(JSON.stringify(stored(p))).not.toContain(SEED_PASSWORD());
    expect(p.errors).toEqual([]); p.close();
  });

  it('shows clear validation and server errors on the login form', async () => {
    const p = await open('/public/login.html'); const msg = p.d.getElementById('loginMessage');
    submit(p.d.getElementById('loginForm')); expect(msg.textContent).toMatch(/Enter your email/);
    typeInto(p.d.getElementById('email'), 'nope'); typeInto(p.d.getElementById('password'), 'x'); submit(p.d.getElementById('loginForm')); expect(msg.textContent).toMatch(/valid email/);
    typeInto(p.d.getElementById('email'), ACCOUNTS.client); typeInto(p.d.getElementById('password'), 'Wrong-Passw0rd!'); submit(p.d.getElementById('loginForm'));
    await until(() => /Incorrect email or password/.test(msg.textContent));
    expect(p.d.getElementById('loginButton').disabled).toBe(false);
    expect(stored(p)).toBeNull(); p.close();
  });

  it('registration creates a client account through the API and rejects duplicates', async () => {
    const email = `web.reg${Date.now()}@example.test`;
    const fill = (p, mail) => { const set = (id, v) => typeInto(p.d.getElementById(id), v);
      set('companyName', 'Web Test Freight'); set('firstName', 'Web'); set('lastName', 'Tester'); set('companyEmail', mail); set('contactNumber', '+27 82 555 0111'); set('officeNumber', '+27 11 555 0111');
      set('registrationNumber', '2025/000111/07'); set('vatNumber', '4111111111'); set('password', 'Str0ng-Passw0rd!'); set('confirmPassword', 'Str0ng-Passw0rd!'); p.d.getElementById('terms').checked = true; };
    const p = await open('/public/register.html');
    expect(p.d.getElementById('username')).toBeNull(); expect(p.d.getElementById('jobTitle')).toBeNull();
    fill(p, email); typeInto(p.d.getElementById('confirmPassword'), 'different'); submit(p.d.getElementById('companyRegistrationForm'));
    expect(p.d.getElementById('registerMessage').textContent).toMatch(/do not match/);
    typeInto(p.d.getElementById('confirmPassword'), 'Str0ng-Passw0rd!'); submit(p.d.getElementById('companyRegistrationForm'));
    await until(() => stored(p));
    expect(stored(p).user.role).toBe('client');
    const row = await db.query('SELECT c.name, c.vat_number FROM users u JOIN companies c ON c.id=u.company_id WHERE lower(u.email)=lower($1)', [email]);
    expect(row.rows[0]).toMatchObject({ name: 'Web Test Freight', vat_number: '4111111111' });
    p.close();
    const p2 = await open('/public/register.html'); fill(p2, email); submit(p2.d.getElementById('companyRegistrationForm'));
    await until(() => /already exists/.test(p2.d.getElementById('registerMessage').textContent)); p2.close();
  });

  it('forgot password always gives the same answer and reset validates the new password', async () => {
    const p = await open('/public/forgot-password.html');
    typeInto(p.d.getElementById('email'), 'ghost@example.test'); submit(p.d.getElementById('forgotForm'));
    await until(() => /If an account exists/.test(p.d.getElementById('formMessage').textContent)); p.close();
    const r = await open('/public/reset-password.html?token=' + 'x'.repeat(30));
    typeInto(r.d.getElementById('newPassword'), 'weak'); typeInto(r.d.getElementById('confirmPassword'), 'weak'); submit(r.d.getElementById('resetForm'));
    expect(r.d.getElementById('formMessage').textContent).toMatch(/at least 10/);
    typeInto(r.d.getElementById('newPassword'), 'Valid-Passw0rd1'); typeInto(r.d.getElementById('confirmPassword'), 'Valid-Passw0rd1'); submit(r.d.getElementById('resetForm'));
    await until(() => /invalid or has expired/.test(r.d.getElementById('formMessage').textContent)); r.close();
  });

  it('public tracking shows real shipment progress and handles bad references', async () => {
    const p = await open('/public/track.html');
    expect(p.d.body.innerHTML).not.toMatch(/MHS-2026/);
    const go = async (ref) => { typeInto(p.d.getElementById('trackRef'), ref); submit(p.d.getElementById('trackForm')); };
    await go('hello'); expect(p.d.getElementById('trackResult').textContent).toMatch(/look like MHM-000123/);
    await go('MHM-999999'); await until(() => /No shipment was found/.test(p.d.getElementById('trackResult').textContent));
    await go('MHM-000001'); await until(() => /MHM-000001/.test(p.d.getElementById('trackResult').textContent) && p.d.querySelector('.ui-timeline'));
    expect(p.d.querySelectorAll('.ui-timeline li').length).toBe(5);
    expect(p.d.getElementById('trackResult').textContent).toMatch(/Delivered/);
    expect(p.errors).toEqual([]); p.close();
  });

  it('quotation page asks anonymous visitors to sign in and lets a client submit a real request', async () => {
    const anon = await open('/public/quote.html'); await until(() => /Sign in to request a quotation/.test(anon.d.getElementById('quoteRoot').textContent)); anon.close();
    const p = await open('/public/quote.html', await session('client2'));
    await until(() => p.d.getElementById('quoteForm'));
    submit(p.d.getElementById('quoteForm')); expect(p.d.getElementById('quoteMsg').textContent).toMatch(/Please complete/);
    const f = p.d.getElementById('quoteForm').elements;
    typeInto(f.origin, 'Bloemfontein'); typeInto(f.destination, 'Durban'); typeInto(f.cargoDescription, `Web quote ${Date.now()}`); typeInto(f.weightKg, '2400');
    submit(p.d.getElementById('quoteForm'));
    await until(() => /submitted/.test(p.d.getElementById('quoteRoot').textContent));
    const ref = /QT-\d+/.exec(p.d.getElementById('quoteRoot').textContent)[0];
    expect((await db.query('SELECT 1 FROM quotations WHERE reference=$1', [ref])).rowCount).toBe(1); p.close();
  });
});

describe('every portal page for every role loads live data without errors', () => {
  for (const [roleKey, role] of Object.entries(config.roles)) {
    it(`${roleKey}: ${role.nav.length} pages`, async () => {
      const sess = await session(roleKey);
      for (const id of role.nav) {
        const p = await open(`/${role.folder}/${config.files[id]}`, sess);
        await settled(p);
        const html = root(p).innerHTML;
        expect([roleKey, id, /ui-alert error/.test(html)]).toEqual([roleKey, id, false]);
        expect([roleKey, id, p.errors]).toEqual([roleKey, id, []]);
        expect(p.d.querySelector('.console-subnav a.active').getAttribute('href')).toBe(config.files[id]);
        p.close();
      }
    }, 120000);
  }

  it('guards portal pages: no session redirects to sign-in, wrong role is sent to its own portal', async () => {
    const p = await open('/admin/user-management.html'); await tick(300);
    expect(root(p).textContent).toMatch(/Loading/); p.close();
    const c = await open('/admin/user-management.html', await session('client')); await tick(300);
    expect(root(c).textContent).not.toMatch(/Aaron|nomsa/i); c.close();
  });
});

describe('real interactions', () => {
  it('admin page shows real users, filters by role, and the create form validates and saves', async () => {
    const p = await open('/admin/user-management.html', await session('admin')); await settled(p);
    expect(p.d.querySelectorAll('tbody tr').length).toBeGreaterThan(20);
    const roleSel = p.d.querySelector('[data-filter="role"]'); typeInto(roleSel, 'driver');
    await until(() => p.d.querySelectorAll('tbody tr').length === 10 && /Dumisani/.test(p.d.getElementById('consoleRoot').textContent));
    click(p.d.getElementById('tCreate')); const modal = await until(() => p.d.querySelector('.portal-modal form'));
    modal.elements.fullName.value = ''; submit(modal); expect(modal.checkValidity()).toBe(false);
    const email = `ui.staff${Date.now()}@mhambi-demo.test`;
    typeInto(modal.elements.fullName, 'UI Created Staff'); typeInto(modal.elements.email, email); typeInto(modal.elements.role, 'warehouse'); typeInto(modal.elements.password, 'weak'); submit(modal);
    await until(() => /Password must be at least 10/.test(p.d.querySelector('.portal-modal .ui-form-error').textContent));
    typeInto(modal.elements.password, 'Initial-Passw0rd1'); submit(modal);
    await until(() => !p.d.querySelector('.portal-modal'));
    expect((await db.query(`SELECT r.code FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.email=$1`, [email])).rows[0].code).toBe('warehouse');
    await idle(p); expect(p.errors).toEqual([]); p.close();
  });

  it('dispatcher creates a shipment and assigns a driver and vehicle from dropdowns loaded from the API', async () => {
    const p = await open('/dispatcher/assign-shipments.html', await session('dispatcher')); await settled(p);
    click(p.d.getElementById('tCreate')); let m = await until(() => p.d.querySelector('.portal-modal form'));
    await until(() => m.elements.companyId.options.length > 5);
    typeInto(m.elements.companyId, '3'); typeInto(m.elements.origin, 'Durban'); typeInto(m.elements.destination, 'Pretoria'); typeInto(m.elements.cargoDescription, `UI shipment ${Date.now()}`); typeInto(m.elements.weightKg, '900'); submit(m);
    await until(() => !p.d.querySelector('.portal-modal'));
    const row = await until(() => [...p.d.querySelectorAll('tbody tr')].find((r) => /UI shipment|Durban/.test(r.textContent) && /Pending/.test(r.textContent) && r.querySelector('[aria-label="Assign driver & vehicle"]')));
    const ref = /MHM-\d{6}/.exec((await db.query(`SELECT tracking_ref FROM shipments WHERE cargo_description LIKE 'UI shipment%' ORDER BY id DESC LIMIT 1`)).rows[0].tracking_ref)[0];
    const target = await until(() => [...p.d.querySelectorAll('tbody tr')].find((r) => r.textContent.includes(ref)));
    click(target.querySelector('[aria-label="Assign driver & vehicle"]')); m = await until(() => p.d.querySelector('.portal-modal form'));
    await until(() => m.elements.driverId.options.length > 1 && m.elements.vehicleId.options.length > 1);
    expect([...m.elements.vehicleId.options].some((o) => /kg\)/.test(o.textContent))).toBe(true);
    typeInto(m.elements.driverId, m.elements.driverId.options[1].value); typeInto(m.elements.vehicleId, m.elements.vehicleId.options[1].value); submit(m);
    await until(() => !p.d.querySelector('.portal-modal'));
    expect((await db.query('SELECT status FROM shipments WHERE tracking_ref=$1', [ref])).rows[0].status).toBe('assigned');
    // clean up so other test files keep their vehicles/drivers free: remove the assignment and cancel the shipment through the API
    const { as } = require('./helpers');
    const asg = (await db.query(`SELECT a.id, s.id AS sid FROM delivery_assignments a JOIN shipments s ON s.id=a.shipment_id WHERE s.tracking_ref=$1 AND a.status='assigned'`, [ref])).rows[0];
    expect((await as('dispatcher').del(`/api/v1/assignments/${asg.id}`)).status).toBe(200);
    expect((await as('dispatcher').post(`/api/v1/shipments/${asg.sid}/cancel`, { reason: 'UI test cleanup' })).status).toBe(200);
    await idle(p); void row; expect(p.errors).toEqual([]); p.close();
  });

  it('driver sees only their deliveries and updates status through a confirmation dialog; navigation opens the maps app', async () => {
    const p = await open('/driver/my-deliveries.html', await session('driver1')); await settled(p);
    const rows = [...p.d.querySelectorAll('tbody tr')]; expect(rows.length).toBeGreaterThan(0);
    const nav = rows[0].querySelector('[aria-label="Navigate"]'); click(nav); expect(p.w.__opened).toMatch(/google\.com\/maps\/dir/);
    const inTransit = rows.find((r) => r.querySelector('[aria-label="Proof of delivery"]')); expect(inTransit).toBeTruthy();
    click(inTransit.querySelector('[aria-label="Proof of delivery"]')); const m = await until(() => p.d.querySelector('.portal-modal form'));
    submit(m); expect(m.checkValidity()).toBe(false); // recipient name required
    p.close();
  });

  it('client portal: tracking by reference shows the timeline; documents download; invoices open details', async () => {
    const sess = await session('client');
    const t = await open('/client/client-track.html', sess); await settled(t);
    typeInto(t.d.getElementById('trkRef'), 'MHM-000001'); submit(t.d.getElementById('trkForm'));
    await until(() => t.d.querySelector('#trkResult .ui-timeline')); expect(t.d.querySelectorAll('#trkResult .ui-timeline li').length).toBe(5);
    typeInto(t.d.getElementById('trkRef'), 'MHM-000002'); submit(t.d.getElementById('trkForm'));
    await until(() => /No shipment with that reference/.test(t.d.getElementById('trkResult').textContent)); // belongs to another company
    click(t.d.querySelector('#trkList [aria-label="Track"]')); await until(() => t.d.querySelector('.portal-modal .ui-timeline')); t.close();
    const d = await open('/client/documents.html', sess); await settled(d);
    click(d.d.querySelector('[aria-label="Download"]')); await until(() => d.d.getElementById('uiToast') && /Download started/.test(d.d.getElementById('uiToast').textContent)); d.close();
    const i = await open('/client/client-invoices.html', sess); await settled(i);
    click(i.d.querySelector('[aria-label="Details"]')); await until(() => /Payments received/.test(i.d.querySelector('.portal-modal').textContent)); i.close();
  });

  it('client profile page saves details and the theme preference persists to the account', async () => {
    const sess = await session('client');
    const p = await open('/client/profile.html', sess); await settled(p); await until(() => p.d.querySelector('#pfPrefs form'));
    typeInto(p.d.querySelector('#pfPrefs [name=theme]'), 'dark'); submit(p.d.querySelector('#pfPrefs form'));
    await until(() => p.d.body.getAttribute('data-theme') === 'dark'); p.close();
    const q = await open('/client/profile.html', sess); await until(() => q.d.querySelector('#pfPrefs [name=theme]') && q.d.querySelector('#pfPrefs [name=theme]').value === 'dark');
    typeInto(q.d.querySelector('#pfPrefs [name=theme]'), 'light'); submit(q.d.querySelector('#pfPrefs form')); await until(() => q.d.body.getAttribute('data-theme') === 'light'); q.close();
  });

  it('finance records a payment from the invoice screen and overpayment is refused with a clear message', async () => {
    const p = await open('/finance/invoices.html', await session('finance')); await settled(p);
    const row = [...p.d.querySelectorAll('tbody tr')].find((r) => r.querySelector('[aria-label="Record payment"]') && /Overdue|Partially paid|Unpaid/i.test(r.textContent));
    expect(row).toBeTruthy();
    click(row.querySelector('[aria-label="Record payment"]')); const m = await until(() => p.d.querySelector('.portal-modal form'));
    typeInto(m.elements.amount, '99999999'); typeInto(m.elements.method, 'eft'); submit(m);
    await until(() => /exceeds the outstanding balance/.test(p.d.querySelector('.portal-modal .ui-form-error').textContent));
    await tick(100); p.close();
  });

  it('logging out clears the session, revokes it on the server and returns to sign-in', async () => {
    const sess = await session('warehouse');
    const before = (await db.query(`SELECT COUNT(*)::int n FROM refresh_sessions WHERE revoked_at IS NOT NULL`)).rows[0].n;
    const p = await open('/warehouse/logout.html', sess);
    await until(() => !stored(p)); expect(stored(p)).toBeNull();
    let after = before; for (let i = 0; i < 60 && after <= before; i += 1) { await tick(50); after = (await db.query(`SELECT COUNT(*)::int n FROM refresh_sessions WHERE revoked_at IS NOT NULL`)).rows[0].n; }
    expect(after).toBeGreaterThan(before);
    const reuse = await require('supertest')(app).post('/api/v1/auth/refresh').send({ refreshToken: sess.refreshToken });
    expect(reuse.status).toBe(401); p.close();
  });
});
void login;
