import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { errorHandler } from '../middleware/errorHandler.js';
import type { ErrorResponse } from '../types/index.js';

// ── Mock Fastify request and reply ─────────────────────────────────

function createMockReply() {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply;
}

function createMockRequest() {
  return {} as never;
}

// ── Helper to extract the sent ErrorResponse ───────────────────────

function getSentResponse(reply: ReturnType<typeof createMockReply>): ErrorResponse {
  return reply.send.mock.calls[0][0] as ErrorResponse;
}

describe('errorHandler', () => {
  let reply: ReturnType<typeof createMockReply>;
  let request: ReturnType<typeof createMockRequest>;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    reply = createMockReply();
    request = createMockRequest();
    process.env.NODE_ENV = 'test';
  });

  // Restore NODE_ENV after each test to avoid leaking
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  // ── Status code mapping ──────────────────────────────────────────

  describe('status code mapping', () => {
    it('should use the statusCode from the error if present', () => {
      const error = Object.assign(new Error('not found'), {
        code: 'NOT_FOUND',
        statusCode: 404,
      });

      errorHandler(error as never, request, reply as never);

      expect(reply.status).toHaveBeenCalledWith(404);
    });

    it('should map VALIDATION_ERROR to 400', () => {
      const error = Object.assign(new Error('bad input'), {
        code: 'VALIDATION_ERROR',
      });

      errorHandler(error as never, request, reply as never);

      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it('should map BAD_REQUEST to 400', () => {
      const error = Object.assign(new Error('missing field'), {
        code: 'BAD_REQUEST',
      });

      errorHandler(error as never, request, reply as never);

      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it('should map UPLOAD_TOO_LARGE to 413', () => {
      const error = Object.assign(new Error('file too big'), {
        code: 'UPLOAD_TOO_LARGE',
      });

      errorHandler(error as never, request, reply as never);

      expect(reply.status).toHaveBeenCalledWith(413);
    });

    it('should map UPLOAD_INVALID to 422', () => {
      const error = Object.assign(new Error('bad db'), {
        code: 'UPLOAD_INVALID',
      });

      errorHandler(error as never, request, reply as never);

      expect(reply.status).toHaveBeenCalledWith(422);
    });

    it('should map NOT_FOUND to 404', () => {
      const error = Object.assign(new Error('gone'), {
        code: 'NOT_FOUND',
      });

      errorHandler(error as never, request, reply as never);

      expect(reply.status).toHaveBeenCalledWith(404);
    });

    it('should map EXTRACTION_UNAVAILABLE to 502', () => {
      const error = Object.assign(new Error('down'), {
        code: 'EXTRACTION_UNAVAILABLE',
      });

      errorHandler(error as never, request, reply as never);

      expect(reply.status).toHaveBeenCalledWith(502);
    });

    it('should map EXTRACTION_TIMEOUT to 504', () => {
      const error = Object.assign(new Error('slow'), {
        code: 'EXTRACTION_TIMEOUT',
      });

      errorHandler(error as never, request, reply as never);

      expect(reply.status).toHaveBeenCalledWith(504);
    });

    it('should map PROXY_ERROR to 502', () => {
      const error = Object.assign(new Error('proxy fail'), {
        code: 'PROXY_ERROR',
      });

      errorHandler(error as never, request, reply as never);

      expect(reply.status).toHaveBeenCalledWith(502);
    });

    it('should default to 500 for unknown error codes', () => {
      const error = Object.assign(new Error('something broke'), {
        code: 'UNKNOWN_CODE',
      });

      errorHandler(error as never, request, reply as never);

      expect(reply.status).toHaveBeenCalledWith(500);
    });

    it('should default to 500 when no code is present', () => {
      const error = new Error('mysterious failure');

      errorHandler(error as never, request, reply as never);

      expect(reply.status).toHaveBeenCalledWith(500);
    });
  });

  // ── Response body structure ──────────────────────────────────────

  describe('response body', () => {
    it('should return a structured error response', () => {
      const error = Object.assign(new Error('test error'), {
        code: 'BAD_REQUEST',
      });

      errorHandler(error as never, request, reply as never);

      const body = getSentResponse(reply);
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('code', 'BAD_REQUEST');
      expect(body.error).toHaveProperty('message', 'test error');
    });

    it('should use "An unexpected error occurred" when message is empty', () => {
      const error = Object.assign(new Error(''), {
        code: 'INTERNAL_ERROR',
      });

      errorHandler(error as never, request, reply as never);

      const body = getSentResponse(reply);
      expect(body.error.message).toBe('An unexpected error occurred');
    });

    it('should derive INTERNAL_ERROR code when error has no code', () => {
      const error = new Error('bare error');

      errorHandler(error as never, request, reply as never);

      const body = getSentResponse(reply);
      expect(body.error.code).toBe('INTERNAL_ERROR');
    });
  });

  // ── Fastify-specific error code mapping ──────────────────────────

  describe('Fastify error codes', () => {
    it('should map FST_ERR_VALIDATION_* codes to VALIDATION_ERROR', () => {
      const error = Object.assign(new Error('validation failed'), {
        code: 'FST_ERR_VALIDATION_BODY',
        validation: [{ message: 'must be string' }],
      });

      errorHandler(error as never, request, reply as never);

      const body = getSentResponse(reply);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(reply.status).toHaveBeenCalledWith(400);
    });

    it('should map FST_REQ_FILE_TOO_LARGE to UPLOAD_TOO_LARGE', () => {
      const error = Object.assign(new Error('file too large'), {
        code: 'FST_REQ_FILE_TOO_LARGE',
      });

      errorHandler(error as never, request, reply as never);

      const body = getSentResponse(reply);
      expect(body.error.code).toBe('UPLOAD_TOO_LARGE');
      expect(reply.status).toHaveBeenCalledWith(413);
    });
  });

  // ── Validation details in non-production ──────────────────────────

  describe('validation details', () => {
    it('should include validation details in non-production environments', () => {
      process.env.NODE_ENV = 'test';

      const validationDetails = [
        { message: 'must be string', dataPath: '.name' },
      ];
      const error = Object.assign(new Error('validation'), {
        code: 'FST_ERR_VALIDATION_BODY',
        validation: validationDetails,
      });

      errorHandler(error as never, request, reply as never);

      const body = getSentResponse(reply);
      expect(body.error.details).toEqual(validationDetails);
    });

    it('should omit validation details in production', () => {
      process.env.NODE_ENV = 'production';

      const error = Object.assign(new Error('validation'), {
        code: 'FST_ERR_VALIDATION_BODY',
        validation: [{ message: 'must be string' }],
      });

      errorHandler(error as never, request, reply as never);

      const body = getSentResponse(reply);
      expect(body.error.details).toBeUndefined();
    });
  });
});
