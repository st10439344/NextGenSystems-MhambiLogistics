'use strict';

const db = require('../config/db');
const config = require('../config/env');
const { randomToken, sha256, signAccessToken } = require('../utils/tokens');
const { E } = require('../utils/errors');
const { toPublic, getUserById } = require('./users');

async function createSession(client, userId, req) {
  const token = randomToken();
  const expires = new Date(Date.now() + config.refreshDays * 86400000);
  const r = await client.query(
    `INSERT INTO refresh_sessions (user_id, token_hash, expires_at, user_agent, ip)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [userId, sha256(token), expires, String(req.get('user-agent') || '').slice(0, 300), req.ip]
  );
  return { token, id: r.rows[0].id };
}

/** Builds the standard auth response (access + refresh token + public user). */
async function issueTokens(client, userRow, req) {
  const session = await createSession(client, userRow.id, req);
  return {
    accessToken: signAccessToken({ id: userRow.id, role: userRow.role }),
    refreshToken: session.token,
    tokenType: 'Bearer',
    user: toPublic(userRow),
  };
}

/** Rotating refresh: old token is revoked; presenting a revoked token revokes every session of that user. */
async function rotate(refreshToken, req) {
  const result = await db.tx(async (client) => {
    const hash = sha256(refreshToken);
    const r = await client.query('SELECT * FROM refresh_sessions WHERE token_hash=$1 FOR UPDATE', [hash]);
    const s = r.rows[0];
    if (!s) throw E.unauthorized('Session is not valid. Please sign in again.', 'SESSION_INVALID');
    if (s.revoked_at) return { reusedUserId: s.user_id }; // handled after the transaction so the revoke is not rolled back
    if (new Date(s.expires_at) < new Date()) throw E.unauthorized('Session expired. Please sign in again.', 'SESSION_EXPIRED');
    const user = await getUserById(s.user_id, client);
    if (!user || user.status !== 'active') throw E.unauthorized('Account is not active.', 'ACCOUNT_INACTIVE');
    const next = await createSession(client, user.id, req);
    await client.query('UPDATE refresh_sessions SET revoked_at=now(), replaced_by=$2 WHERE id=$1', [s.id, next.id]);
    return {
      accessToken: signAccessToken({ id: user.id, role: user.role }),
      refreshToken: next.token,
      tokenType: 'Bearer',
      user: toPublic(user),
    };
  });
  if (result.reusedUserId) {
    await revokeAll(result.reusedUserId);
    throw E.unauthorized('Session was already used. Please sign in again.', 'SESSION_REUSED');
  }
  return result;
}

const revoke = (refreshToken) =>
  db.query('UPDATE refresh_sessions SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL', [sha256(refreshToken)]);
const revokeAll = (userId, client = db) =>
  client.query('UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [userId]);

module.exports = { issueTokens, rotate, revoke, revokeAll };
