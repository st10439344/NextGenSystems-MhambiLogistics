'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/env');

function secret() {
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be set to a random string of at least 32 characters.');
  }
  return config.jwtSecret;
}

const signAccessToken = (user) =>
  jwt.sign({ sub: String(user.id), role: user.role }, secret(), {
    algorithm: 'HS256', expiresIn: config.accessTtl, issuer: 'mhambi-logistics',
  });

const verifyAccessToken = (token) => jwt.verify(token, secret(), { algorithms: ['HS256'], issuer: 'mhambi-logistics' });

const randomToken = () => crypto.randomBytes(48).toString('base64url');
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

module.exports = { signAccessToken, verifyAccessToken, randomToken, sha256 };
