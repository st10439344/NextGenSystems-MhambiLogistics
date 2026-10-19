'use strict';

const { z } = require('zod');
const { E } = require('./errors');

/** Express middleware: validates req[source] with a zod schema, stores the parsed value in req.valid[source]. */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source] === undefined ? {} : req[source]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join('.') || '(root)', message: i.message }));
      return next(E.validation(details));
    }
    req.valid = req.valid || {};
    req.valid[source] = result.data;
    return next();
  };
}

const passwordSchema = z
  .string({ error: 'Password is required.' })
  .min(10, 'Password must be at least 10 characters.')
  .max(128, 'Password is too long.')
  .regex(/[a-z]/, 'Password must contain a lowercase letter.')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter.')
  .regex(/[0-9]/, 'Password must contain a number.');

const emailSchema = z
  .string({ error: 'Email is required.' })
  .trim()
  .toLowerCase()
  .max(255)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Enter a valid email address.');

const idParam = z.object({ id: z.coerce.number().int().positive('Invalid id.') });
const money = z.coerce.number().finite().min(0).max(999999999);
const positiveMoney = z.coerce.number().finite().positive().max(999999999);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.');
const optionalText = (max = 500) => z.string().trim().max(max).optional().nullable();
const reqText = (max = 255, label = 'This field') => z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max);

module.exports = { validate, z, passwordSchema, emailSchema, idParam, money, positiveMoney, isoDate, optionalText, reqText };
