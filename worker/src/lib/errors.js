export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const BadRequest = (message, details) => new ApiError(400, 'BAD_REQUEST', message, details);
export const Unauthorized = (message = 'Unauthorized') => new ApiError(401, 'UNAUTHORIZED', message);
export const Forbidden = (message = 'Forbidden') => new ApiError(403, 'FORBIDDEN', message);
export const NotFound = (message = 'Not found') => new ApiError(404, 'NOT_FOUND', message);
export const Conflict = (message) => new ApiError(409, 'CONFLICT', message);
export const TooManyRequests = (message) => new ApiError(429, 'RATE_LIMITED', message);
