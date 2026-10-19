'use strict';

const path = require('path');
const db = require('../src/config/db');
const { as } = require('./helpers');
const config = require(path.join(__dirname, '..', '..', 'shared', 'portal-config.json'));

afterAll(async () => { await db.close(); });

const ROLE_ACCOUNT = { admin: 'admin', dispatcher: 'dispatcher', warehouse: 'warehouse', fleet: 'fleet', procurement: 'procurement', finance: 'finance', driver: 'driver', client: 'client' };
const API = '/api/v1';
const qs = (params) => (params && Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '');
const get = (obj, p) => p.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
const has = (obj, p) => { const parts = p.split('.'); let o = obj; for (const k of parts) { if (o === null || o === undefined) return 'null'; if (!(k in o)) return false; o = o[k]; } return true; };
const withQuery = (url, extra) => url + (extra ? (url.includes('?') ? '&' : '?') + extra : '');

function fieldsOf(col) { return col.field.includes('|') ? col.field.split('|') : [col.field]; }

describe('every screen in portal-config.json is wired to a working endpoint for its role', () => {
  for (const [roleKey, role] of Object.entries(config.roles)) {
    describe(`${roleKey}`, () => {
      for (const pageId of role.nav) {
        const page = config.pages[pageId];
        it(`${pageId} (${page.type})`, async () => {
          const who = as(ROLE_ACCOUNT[roleKey]);
          switch (page.type) {
            case 'dashboard': {
              const r = await who.get(`${API}/dashboard`);
              expect(r.status).toBe(200);
              expect(r.body.role).toBe(roleKey);
              expect(r.body.cards.length).toBeGreaterThan(0);
              return;
            }
            case 'notifications': expect((await who.get(`${API}/notifications`)).status).toBe(200); return;
            case 'profile': expect((await who.get(`${API}/settings/me`)).status).toBe(200); expect((await who.get(`${API}/auth/me`)).status).toBe(200); return;
            case 'company': expect((await who.get(`${API}/companies/me`)).status).toBe(200); return;
            case 'settings-form': expect((await who.get(`${API}${page.endpoint}`)).status).toBe(200); return;
            case 'reports': {
              for (const [name] of page.reports) {
                const r = await who.get(`${API}/reports/${name}`);
                expect([name, r.status]).toEqual([name, 200]);
                expect(r.body.summary.length).toBeGreaterThan(0);
                const csv = await who.get(`${API}/reports/${name}?format=csv`);
                expect([name, csv.status]).toEqual([name, 200]);
              }
              return;
            }
            default: break; // table / tracking
          }
          const r = await who.get(`${API}${page.endpoint}${qs(page.params)}`);
          expect([pageId, r.status]).toEqual([pageId, 200]);
          const rows = get(r.body, page.dataPath || 'data');
          expect(Array.isArray(rows)).toBe(true);
          if (rows.length) {
            for (const c of page.columns) {
              for (const f of fieldsOf(c)) {
                const ok = rows.some((row) => has(row, f) !== false);
                expect([pageId, c.label, f, ok]).toEqual([pageId, c.label, f, true]);
              }
            }
            const row = rows[0];
            for (const a of page.actions || []) {
              if (a.when) for (const k of Object.keys(a.when)) expect([pageId, a.label, k, k in row]).toEqual([pageId, a.label, k, true]);
              for (const k of Object.values(a.bodyFromRow || {})) expect([pageId, a.label, k, k in row]).toEqual([pageId, a.label, k, true]);
              if (a.type === 'navigate') expect([pageId, a.field, a.field in row]).toEqual([pageId, a.field, true]);
              const tpl = [a.url, a.filename, a.detail && a.detail.url].filter(Boolean).join(' ');
              for (const m of tpl.matchAll(/\{(\w+)\}/g)) expect([pageId, a.label, m[1], m[1] in row]).toEqual([pageId, a.label, m[1], true]);
            }
          }
          if (page.export) {
            const e = await who.get(`${API}${page.export.url}`);
            expect([pageId, 'export', e.status]).toEqual([pageId, 'export', 200]);
          }
          for (const f of page.filters || []) expect(f.options.length).toBeGreaterThan(0);
        });
      }
    });
  }

  it('every dynamic dropdown in every form loads for the roles that can see the form', async () => {
    const roleAccount = (pageId) => Object.entries(config.roles).filter(([, r]) => r.nav.includes(pageId)).map(([k]) => k);
    let checked = 0;
    for (const page of Object.values(config.pages)) {
      const forms = [];
      if (page.create) forms.push(page.create.fields);
      for (const a of page.actions || []) if (a.form) forms.push(a.form.fields);
      for (const fields of forms) {
        for (const f of fields) {
          if (!f.optionsFrom) continue;
          for (const role of roleAccount(page.id)) {
            const r = await as(ROLE_ACCOUNT[role]).get(`${API}${f.optionsFrom.url}`);
            expect([page.id, f.name, role, r.status]).toEqual([page.id, f.name, role, 200]);
            const rows = get(r.body, f.optionsFrom.path || 'data');
            expect(Array.isArray(rows)).toBe(true);
            if (rows.length) {
              expect([page.id, f.name, f.optionsFrom.value, f.optionsFrom.value in rows[0]]).toEqual([page.id, f.name, f.optionsFrom.value, true]);
              expect([page.id, f.name, f.optionsFrom.label, f.optionsFrom.label in rows[0]]).toEqual([page.id, f.name, f.optionsFrom.label, true]);
            }
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(25); // number of (form dropdown x role) combinations actually exercised
  });

  it('every page is reachable from at least one role and every role starts on its own dashboard', () => {
    const reachable = new Set(Object.values(config.roles).flatMap((r) => r.nav));
    const orphans = Object.keys(config.pages).filter((id) => !reachable.has(id));
    expect(orphans).toEqual([]);
    for (const [k, r] of Object.entries(config.roles)) { expect(r.nav[0]).toBe(r.home); expect(config.pages[r.home].type).toBe('dashboard'); expect(k.length).toBeGreaterThan(0); }
  });
});

describe('web and Android use the same screen definition', () => {
  it('website/js and android assets are byte-identical copies of shared/portal-config.json', () => {
    const fs = require('fs');
    const shared = fs.readFileSync(path.join(__dirname, '..', '..', 'shared', 'portal-config.json'));
    expect(fs.readFileSync(path.join(__dirname, '..', '..', 'website', 'js', 'portal-config.json')).equals(shared)).toBe(true);
    expect(fs.readFileSync(path.join(__dirname, '..', '..', 'android', 'app', 'src', 'main', 'assets', 'portal-config.json')).equals(shared)).toBe(true);
  });
});

describe('forms send exactly what the API accepts', () => {
  it('a client can submit the Request Quotation form, and staff forms for the main create actions are accepted', async () => {
    const stamp = Date.now();
    const q = config.pages['client-quote'].create;
    const body = {}; for (const f of q.fields) body[f.name] = f.type === 'number' ? 1500 : f.type === 'select' ? f.options[0] : f.type === 'date' ? '2027-01-15' : `Form test ${stamp}`;
    expect((await as('client').post(`${API}${q.url}`, body)).status).toBe(201);
    const inv = config.pages['inventory-management'].create;
    const ib = {}; for (const f of inv.fields) ib[f.name] = f.type === 'number' ? 5 : f.optionsFrom ? 1 : `FORM-${stamp}`;
    expect((await as('warehouse').post(`${API}${inv.url}`, ib)).status).toBe(201);
    const veh = config.pages['vehicle-management'].create;
    const vb = {}; for (const f of veh.fields) vb[f.name] = f.type === 'number' ? 1000 : f.type === 'date' ? '2027-02-01' : `FRM ${stamp}`;
    expect((await as('fleet').post(`${API}${veh.url}`, vb)).status).toBe(201);
    const sup = config.pages.suppliers.create;
    const sb = {}; for (const f of sup.fields) sb[f.name] = f.type === 'email' ? `f${stamp}@supplier-demo.test` : f.name === 'phone' ? '+27 11 555 0101' : `Form ${stamp}`;
    expect((await as('procurement').post(`${API}${sup.url}`, sb)).status).toBe(201);
    const exp = config.pages.expenses.create;
    const eb = {}; for (const f of exp.fields) eb[f.name] = f.type === 'number' ? 99.5 : f.type === 'date' ? '2027-03-01' : f.type === 'select' ? f.options[0] : `Form ${stamp}`;
    expect((await as('finance').post(`${API}${exp.url}`, eb)).status).toBe(201);
    const sup2 = config.pages.support.create;
    const spb = {}; for (const f of sup2.fields) spb[f.name] = f.type === 'select' ? f.options[0] : `Form ${stamp}`;
    expect((await as('client').post(`${API}${sup2.url}`, spb)).status).toBe(201);
  });
});
