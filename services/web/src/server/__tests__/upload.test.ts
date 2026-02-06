import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fastifyMultipart from '@fastify/multipart';

// Mock better-sqlite3 before importing the upload route, so the
// dynamic import inside upload.ts picks up our mock.
vi.mock('better-sqlite3', () => {
  return {
    default: vi.fn(),
  };
});

// Mock fs/promises so the route doesn't touch the real filesystem
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ size: 1024 }),
}));

import uploadRoutes from '../routes/upload.js';
import { errorHandler } from '../middleware/errorHandler.js';

// ── Helpers ────────────────────────────────────────────────────────

/** Create a minimal multipart payload for fastify.inject */
function buildMultipartPayload(
  filename: string,
  content: Buffer,
): { body: Buffer; contentType: string } {
  const boundary = '----TestBoundary' + Date.now();
  const header = [
    `------${boundary.replace('----', '')}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    'Content-Type: application/octet-stream',
    '',
    '',
  ].join('\r\n');
  const footer = `\r\n------${boundary.replace('----', '')}--\r\n`;

  const headerBuf = Buffer.from(header, 'utf-8');
  const footerBuf = Buffer.from(footer, 'utf-8');
  const body = Buffer.concat([headerBuf, content, footerBuf]);

  return {
    body,
    contentType: `multipart/form-data; boundary=----${boundary.replace('----', '')}`,
  };
}

describe('upload route', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(fastifyMultipart, {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    });
    app.setErrorHandler(errorHandler);
    await app.register(uploadRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return 400 when no file is provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: {
        'content-type': 'multipart/form-data; boundary=----EmptyBoundary',
      },
      payload: Buffer.from('------EmptyBoundary--\r\n'),
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.message).toContain('No file provided');
  });

  it('should accept a valid file upload and return 201', async () => {
    // Mock better-sqlite3 to simulate a valid database
    const { default: MockDatabase } = await import('better-sqlite3');
    (MockDatabase as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      prepare: () => ({
        get: () => ({ count: 42 }),
      }),
      close: vi.fn(),
    }));

    const fakeContent = Buffer.from('SQLite format 3\x00fake database content');
    const { body, contentType } = buildMultipartPayload('chat.db', fakeContent);

    const response = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: { 'content-type': contentType },
      payload: body,
    });

    expect(response.statusCode).toBe(201);
    const json = response.json();
    expect(json).toHaveProperty('path');
    expect(json).toHaveProperty('size', 1024); // from mocked stat
    expect(json).toHaveProperty('messageCount', 42);
  });

  it('should return 422 when the file is not a valid Messages database', async () => {
    // Mock better-sqlite3 to throw (simulating an invalid database)
    const { default: MockDatabase } = await import('better-sqlite3');
    (MockDatabase as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('not a database');
    });

    const fakeContent = Buffer.from('this is not a database');
    const { body, contentType } = buildMultipartPayload('chat.db', fakeContent);

    const response = await app.inject({
      method: 'POST',
      url: '/api/upload',
      headers: { 'content-type': contentType },
      payload: body,
    });

    expect(response.statusCode).toBe(422);
    const json = response.json();
    expect(json.error.code).toBe('UPLOAD_INVALID');
    expect(json.error.message).toContain('not a valid Apple Messages database');
  });
});
