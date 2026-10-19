'use strict';

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const E = {
  badRequest: (m = 'Bad request.', d) => new ApiError(400, 'BAD_REQUEST', m, d),
  validation: (d, m = 'Some fields are invalid.') => new ApiError(422, 'VALIDATION_ERROR', m, d),
  unauthorized: (m = 'Authentication required.', code = 'UNAUTHORIZED') => new ApiError(401, code, m),
  forbidden: (m = 'You do not have permission to perform this action.') => new ApiError(403, 'FORBIDDEN', m),
  notFound: (m = 'Record not found.') => new ApiError(404, 'NOT_FOUND', m),
  conflict: (m = 'Conflict with existing data.', code = 'CONFLICT') => new ApiError(409, code, m),
  unprocessable: (m, code = 'UNPROCESSABLE') => new ApiError(422, code, m),
};

module.exports = { ApiError, E };
