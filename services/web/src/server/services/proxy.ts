import type { FastifyBaseLogger } from 'fastify';
import type { ProxyConfig } from '@server/types/index.js';

/** Default proxy configuration. */
const DEFAULT_CONFIG: ProxyConfig = {
  baseUrl: process.env.EXTRACTION_SERVICE_URL ?? 'http://localhost:8001',
  timeoutMs: 30_000,
};

/**
 * Proxy a request to the Python extraction service.
 *
 * Uses the native Fetch API (available in Node 18+). Returns the parsed JSON
 * response on success, or throws a structured error on failure.
 */
export async function proxyToExtraction<T = unknown>(
  path: string,
  options: {
    method?: string;
    query?: Record<string, string>;
    body?: unknown;
    config?: Partial<ProxyConfig>;
    logger?: FastifyBaseLogger;
  } = {},
): Promise<T> {
  const config = { ...DEFAULT_CONFIG, ...options.config };
  const method = options.method ?? 'GET';

  // Build the target URL
  const url = new URL(path, config.baseUrl);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      url.searchParams.set(key, value);
    }
  }

  options.logger?.debug({ url: url.toString(), method }, 'Proxying request to extraction service');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const fetchOptions: RequestInit = {
      method,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    };

    if (options.body) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url.toString(), fetchOptions);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'No response body');
      const error = new Error(
        `Extraction service returned ${response.status}: ${errorBody}`,
      );
      (error as NodeJS.ErrnoException).code = response.status >= 500
        ? 'EXTRACTION_UNAVAILABLE'
        : 'PROXY_ERROR';
      (error as { statusCode?: number }).statusCode = response.status >= 500
        ? 502
        : response.status;
      throw error;
    }

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      const timeoutError = new Error(
        `Extraction service request timed out after ${config.timeoutMs}ms`,
      );
      (timeoutError as NodeJS.ErrnoException).code = 'EXTRACTION_TIMEOUT';
      (timeoutError as { statusCode?: number }).statusCode = 504;
      throw timeoutError;
    }

    // Connection refused or DNS failure
    if (err instanceof TypeError && (err as NodeJS.ErrnoException).cause) {
      const connError = new Error(
        `Cannot reach extraction service at ${config.baseUrl}: ${err.message}`,
      );
      (connError as NodeJS.ErrnoException).code = 'EXTRACTION_UNAVAILABLE';
      (connError as { statusCode?: number }).statusCode = 502;
      throw connError;
    }

    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
