'use strict';
const request = require('supertest');
const app = require('../src/app');

const SEED_PASSWORD = () => process.env.TEST_SEED_PASSWORD;
const api = () => request(app);

const ACCOUNTS = {
  admin: 'nomsa.dlamini@mhambi-demo.test',
  admin2: 'pieter.vanwyk@mhambi-demo.test',
  dispatcher: 'sipho.nkosi@mhambi-demo.test',
  warehouse: 'thandi.mokoena@mhambi-demo.test',
  fleet: 'lerato.khumalo@mhambi-demo.test',
  procurement: 'zanele.mthembu@mhambi-demo.test',
  finance: 'naledi.pillay@mhambi-demo.test',
  driver: 'bongani.radebe@mhambi-demo.test',       // driver id 6
  driver1: 'dumisani.mokoena@mhambi-demo.test',    // driver id 1
  driver2: 'themba.zulu@mhambi-demo.test',         // driver id 2
  client: 'anele.gumede@bluegumsteel.test',        // company 1
  client2: 'retha.louw@karoofresh.test',           // company 2
};

const cache = {};
async function login(key) {
  if (cache[key] && cache[key].exp > Date.now()) return cache[key].token;
  const res = await api().post('/api/v1/auth/login').send({ email: ACCOUNTS[key] || key, password: SEED_PASSWORD() });
  if (res.status !== 200) throw new Error(`Login failed for ${key}: ${res.status} ${JSON.stringify(res.body)}`);
  cache[key] = { token: res.body.accessToken, exp: Date.now() + 10 * 60 * 1000 };
  return cache[key].token;
}
const auth = async (key) => ({ Authorization: `Bearer ${await login(key)}` });
const as = (key) => ({
  get: async (url) => api().get(url).set(await auth(key)),
  post: async (url, body) => api().post(url).set(await auth(key)).send(body || {}),
  put: async (url, body) => api().put(url).set(await auth(key)).send(body || {}),
  patch: async (url, body) => api().patch(url).set(await auth(key)).send(body || {}),
  del: async (url) => api().delete(url).set(await auth(key)),
});

module.exports = { api, login, auth, as, ACCOUNTS, SEED_PASSWORD };
