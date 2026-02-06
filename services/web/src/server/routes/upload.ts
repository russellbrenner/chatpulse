import type { FastifyInstance } from 'fastify';
import { mkdir, writeFile, stat } from 'fs/promises';
import { join, resolve } from 'path';
import type { UploadResponse } from '@server/types/index.js';

/** Directory where uploaded chat.db files are stored. */
const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? './uploads');

/**
 * A minimal interface matching the subset of better-sqlite3's Database
 * we actually use. Avoids tight coupling to the optional dependency's types.
 */
interface SqliteDb {
  prepare(sql: string): { get(...params: unknown[]): unknown };
  close(): void;
}

interface SqliteConstructor {
  new (filename: string, options?: { readonly?: boolean }): SqliteDb;
}

/**
 * Attempt to load better-sqlite3 dynamically.
 * It's an optional dependency — may not be available on all Node versions
 * (notably Node 25+ where the native bindings haven't been updated).
 */
let DatabaseConstructor: SqliteConstructor | null = null;
try {
  const mod = await import('better-sqlite3');
  DatabaseConstructor = mod.default ?? mod;
} catch {
  // better-sqlite3 unavailable — validation will be skipped
}

/**
 * Validates that a file is a legitimate SQLite database containing
 * the Messages schema. Returns the message count, or -1 if validation
 * is unavailable (better-sqlite3 not installed).
 */
function validateChatDb(filePath: string, log: { warn: (obj: unknown, msg: string) => void }): number {
  if (!DatabaseConstructor) {
    log.warn(
      { filePath },
      'better-sqlite3 unavailable — skipping chat.db validation. ' +
      'The extraction service will validate the file when processing.',
    );
    return -1;
  }

  let db: SqliteDb | undefined;
  try {
    db = new DatabaseConstructor(filePath, { readonly: true });
    // Verify the message table exists and count rows
    const row = db.prepare('SELECT COUNT(*) AS count FROM message').get() as { count: number };
    return row.count;
  } catch {
    const error = new Error(
      'The uploaded file is not a valid Apple Messages database (chat.db)',
    );
    (error as NodeJS.ErrnoException).code = 'UPLOAD_INVALID';
    (error as { statusCode?: number }).statusCode = 422;
    throw error;
  } finally {
    db?.close();
  }
}

/**
 * Upload route plugin.
 *
 * POST /api/upload — accepts a multipart chat.db file, validates it,
 * saves it to the upload directory, and returns metadata.
 */
export default async function uploadRoutes(fastify: FastifyInstance): Promise<void> {
  // Ensure the upload directory exists
  await mkdir(UPLOAD_DIR, { recursive: true });

  fastify.post<{ Reply: UploadResponse }>('/api/upload', async (request, reply) => {
    const data = await request.file();

    if (!data) {
      const error = new Error('No file provided. Please upload a chat.db file.');
      (error as NodeJS.ErrnoException).code = 'BAD_REQUEST';
      (error as { statusCode?: number }).statusCode = 400;
      throw error;
    }

    // Generate a timestamped filename to avoid collisions
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `chat-${timestamp}.db`;
    const filePath = join(UPLOAD_DIR, filename);

    // Buffer the upload and write to disc
    const buffer = await data.toBuffer();
    await writeFile(filePath, buffer);

    request.log.info(
      { filename, size: buffer.length },
      'chat.db file uploaded',
    );

    // Validate the uploaded file is a real Messages database
    const messageCount = validateChatDb(filePath, request.log);

    if (messageCount >= 0) {
      request.log.info(
        { filename, messageCount },
        'chat.db validated successfully',
      );
    }

    const fileStats = await stat(filePath);

    return reply.status(201).send({
      path: filePath,
      size: fileStats.size,
      messageCount,
    });
  });
}
