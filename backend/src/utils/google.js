'use strict';

const { OAuth2Client } = require('google-auth-library');
const config = require('../config/env');
const { ApiError, E } = require('./errors');

let client = null;

const isConfigured = () => config.googleClientIds.length > 0;

/** Verifies a Google ID token with Google's public keys. Throws ApiError if invalid. */
async function verifyGoogleIdToken(idToken) {
  if (!isConfigured()) throw new ApiError(503, 'GOOGLE_NOT_CONFIGURED', 'Google Sign-In is not configured on this server.');
  if (!client) client = new OAuth2Client();
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: config.googleClientIds });
    payload = ticket.getPayload();
  } catch (err) {
    throw E.unauthorized('Google sign-in could not be verified.', 'GOOGLE_TOKEN_INVALID');
  }
  if (!payload || !payload.sub || !payload.email) throw E.unauthorized('Google account has no email.', 'GOOGLE_TOKEN_INVALID');
  if (!payload.email_verified) throw E.unauthorized('Your Google email address is not verified.', 'GOOGLE_EMAIL_UNVERIFIED');
  return { sub: payload.sub, email: String(payload.email).toLowerCase(), name: payload.name || payload.email };
}

module.exports = { verifyGoogleIdToken, isConfigured };
