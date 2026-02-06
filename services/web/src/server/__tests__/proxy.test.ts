import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { proxyToExtraction } from '../services/proxy.js';

// ── Mock global fetch ──────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

function textResponse(text: string, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

describe('proxyToExtraction', () => {
  const baseConfig = {
    config: { baseUrl: 'http://test-extraction:8001', timeoutMs: 5000 },
  };

  // ── Successful requests ──────────────────────────────────────────

  describe('successful requests', () => {
    it('should return parsed JSON on a successful GET', async () => {
      const payload = { results: [1, 2, 3] };
      mockFetch.mockResolvedValueOnce(jsonResponse(payload));

      const result = await proxyToExtraction('/api/stats', baseConfig);

      expect(result).toEqual(payload);
    });

    it('should construct the correct URL from base and path', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));

      await proxyToExtraction('/api/analyse', baseConfig);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toBe('http://test-extraction:8001/api/analyse');
    });

    it('should append query parameters to the URL', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));

      await proxyToExtraction('/api/search', {
        ...baseConfig,
        query: { handle: '+61400000000', limit: '50' },
      });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get('handle')).toBe('+61400000000');
      expect(url.searchParams.get('limit')).toBe('50');
    });

    it('should default to GET method', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));

      await proxyToExtraction('/api/health', baseConfig);

      const fetchOpts = mockFetch.mock.calls[0][1] as RequestInit;
      expect(fetchOpts.method).toBe('GET');
    });

    it('should send a JSON body for POST requests', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

      await proxyToExtraction('/api/ingest', {
        ...baseConfig,
        method: 'POST',
        body: { path: '/data/chat.db' },
      });

      const fetchOpts = mockFetch.mock.calls[0][1] as RequestInit;
      expect(fetchOpts.method).toBe('POST');
      expect(fetchOpts.body).toBe(JSON.stringify({ path: '/data/chat.db' }));
      expect((fetchOpts.headers as Record<string, string>)['Content-Type']).toBe(
        'application/json',
      );
    });

    it('should set Accept: application/json header', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}));

      await proxyToExtraction('/api/health', baseConfig);

      const fetchOpts = mockFetch.mock.calls[0][1] as RequestInit;
      expect((fetchOpts.headers as Record<string, string>)['Accept']).toBe(
        'application/json',
      );
    });
  });

  // ── Error responses from extraction service ──────────────────────

  describe('non-200 responses', () => {
    it('should throw with the error body for a 4xx response', async () => {
      mockFetch.mockResolvedValueOnce(
        textResponse('{"detail":"Not found"}', 404),
      );

      await expect(
        proxyToExtraction('/api/missing', baseConfig),
      ).rejects.toThrow('Extraction service returned 404');
    });

    it('should set code to PROXY_ERROR for 4xx responses', async () => {
      mockFetch.mockResolvedValueOnce(textResponse('Bad request', 400));

      try {
        await proxyToExtraction('/api/bad', baseConfig);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect((err as NodeJS.ErrnoException).code).toBe('PROXY_ERROR');
      }
    });

    it('should set code to EXTRACTION_UNAVAILABLE for 5xx responses', async () => {
      mockFetch.mockResolvedValueOnce(
        textResponse('Internal server error', 500),
      );

      try {
        await proxyToExtraction('/api/broken', baseConfig);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect((err as NodeJS.ErrnoException).code).toBe(
          'EXTRACTION_UNAVAILABLE',
        );
        expect((err as { statusCode?: number }).statusCode).toBe(502);
      }
    });

    it('should include the response body text in the error message', async () => {
      mockFetch.mockResolvedValueOnce(
        textResponse('Service overloaded', 503),
      );

      await expect(
        proxyToExtraction('/api/overloaded', baseConfig),
      ).rejects.toThrow('Service overloaded');
    });
  });

  // ── Network / connection errors ──────────────────────────────────

  describe('network errors', () => {
    it('should wrap connection-refused errors with EXTRACTION_UNAVAILABLE', async () => {
      const connError = new TypeError('fetch failed');
      (connError as NodeJS.ErrnoException).cause = new Error('ECONNREFUSED');
      mockFetch.mockRejectedValueOnce(connError);

      try {
        await proxyToExtraction('/api/health', baseConfig);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect((err as NodeJS.ErrnoException).code).toBe(
          'EXTRACTION_UNAVAILABLE',
        );
        expect((err as { statusCode?: number }).statusCode).toBe(502);
        expect((err as Error).message).toContain(
          'Cannot reach extraction service',
        );
      }
    });

    it('should handle AbortError (timeout) with EXTRACTION_TIMEOUT', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      try {
        await proxyToExtraction('/api/slow', baseConfig);
        expect.unreachable('should have thrown');
      } catch (err) {
        expect((err as NodeJS.ErrnoException).code).toBe('EXTRACTION_TIMEOUT');
        expect((err as { statusCode?: number }).statusCode).toBe(504);
        expect((err as Error).message).toContain('timed out');
      }
    });

    it('should re-throw unexpected errors unchanged', async () => {
      const weird = new Error('something unexpected');
      mockFetch.mockRejectedValueOnce(weird);

      await expect(
        proxyToExtraction('/api/what', baseConfig),
      ).rejects.toBe(weird);
    });
  });
});
