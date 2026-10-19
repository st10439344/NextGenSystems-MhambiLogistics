'use strict';

const { verifyAccessToken } = require('../utils/tokens');
const { E } = require('../utils/errors');
const { getUserById, toPublic } = require('../services/users');

/** Verifies the bearer token, then re-loads the user and role from the database on every request. */
async function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const match = /^Bearer (.+)$/i.exec(header);
  if (!match) throw E.unauthorized('Missing access token.');
  let payload;
  try {
    payload = verifyAccessToken(match[1]);
  } catch (err) {
    throw E.unauthorized(err.name === 'TokenExpiredError' ? 'Access token expired.' : 'Invalid access token.',
      err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID');
  }
  const row = await getUserById(payload.sub);
  if (!row) throw E.unauthorized('Account no longer exists.', 'TOKEN_INVALID');
  if (row.status !== 'active') throw E.unauthorized('This account has been deactivated.', 'ACCOUNT_INACTIVE');
  req.user = toPublic(row);
  next();
}

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) throw E.unauthorized();
  if (!roles.includes(req.user.role)) throw E.forbidden();
  next();
};

const STAFF = ['admin', 'dispatcher', 'warehouse', 'fleet', 'procurement', 'finance'];

module.exports = { authenticate, requireRole, STAFF };
