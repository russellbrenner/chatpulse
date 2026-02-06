import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import type { ErrorResponse } from '@server/types/index.js';

/**
 * Maps known error codes to HTTP status codes.
 * Unrecognised codes default to 500.
 */
const STATUS_MAP: Record<string, number> = {
  VALIDATION_ERROR: 400,
  BAD_REQUEST: 400,
  UPLOAD_TOO_LARGE: 413,
  UPLOAD_INVALID: 422,
  NOT_FOUND: 404,
  EXTRACTION_UNAVAILABLE: 502,
  EXTRACTION_TIMEOUT: 504,
  PROXY_ERROR: 502,
};

/**
 * Derives an error code from a Fastify error or falls back to INTERNAL_ERROR.
 */
function deriveErrorCode(error: FastifyError | Error): string {
  if ('code' in error && typeof error.code === 'string') {
    // Fastify validation errors use FST_ERR_VALIDATION
    if (error.code.startsWith('FST_ERR_VALIDATION')) return 'VALIDATION_ERROR';
    // Multipart limit exceeded
    if (error.code === 'FST_REQ_FILE_TOO_LARGE') return 'UPLOAD_TOO_LARGE';
    return error.code;
  }
  return 'INTERNAL_ERROR';
}

/**
 * Structured error handler for the Fastify server.
 * Returns consistent JSON error responses.
 */
export function errorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  const code = deriveErrorCode(error);
  const statusCode = ('statusCode' in error && error.statusCode)
    ? error.statusCode
    : STATUS_MAP[code] ?? 500;

  const response: ErrorResponse = {
    error: {
      code,
      message: error.message || 'An unexpected error occurred',
    },
  };

  // Include validation details in non-production environments
  if (process.env.NODE_ENV !== 'production' && 'validation' in error) {
    response.error.details = (error as FastifyError).validation;
  }

  reply.status(statusCode).send(response);
}
