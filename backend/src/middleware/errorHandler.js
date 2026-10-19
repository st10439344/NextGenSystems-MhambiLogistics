'use strict';

const { ApiError } = require('../utils/errors');

function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' } });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request is too large.' } });
  }
  // PostgreSQL error codes
  switch (err.code) {
    case '23505': return res.status(409).json({ error: { code: 'DUPLICATE', message: 'A record with these details already exists.' } });
    case '23503': return res.status(409).json({ error: { code: 'REFERENCE_ERROR', message: 'This record is linked to other data or refers to a record that does not exist.' } });
    case '23514': return res.status(422).json({ error: { code: 'CONSTRAINT_VIOLATION', message: 'The data violates a business rule (for example a negative quantity).' } });
    case '22P02': case '22003': case '22007': return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'A value has an invalid format.' } });
    default: break;
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server.' } });
}

module.exports = { notFound, errorHandler };
