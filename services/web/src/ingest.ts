#!/usr/bin/env node
/**
 * CLI entry point for the ChatPulse ingest CronJob.
 *
 * Reads a chat.db SQLite file from an NFS mount and incrementally
 * inserts new messages into PostgreSQL. Designed to run inside a k3s
 * CronJob container.
 *
 * Required environment variables:
 *   CHAT_DB_PATH   — Filesystem path to the chat.db file (NFS mount).
 *   DATABASE_URL   — PostgreSQL connection string.
 *
 * Optional environment variables:
 *   LOG_LEVEL      — Pino log level (default: "info").
 */

import { existsSync } from 'node:fs';
import process from 'node:process';
import pino from 'pino';

import { ingestFromChatDb } from './server/services/ingest.js';

const logger = pino({
  name: 'chatpulse-ingest',
  level: process.env.LOG_LEVEL ?? 'info',
});

/** Validate that a required environment variable is set and non-empty. */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    logger.fatal({ variable: name }, 'Required environment variable is not set');
    process.exit(1);
  }
  return value;
}

// ── Graceful shutdown ─────────────────────────────────────────────────

let shutdownRequested = false;

function handleShutdown(signal: string): void {
  logger.info({ signal }, 'Shutdown signal received — finishing current work');
  shutdownRequested = true;
  // Give the ingest function a moment to complete its transaction,
  // then force exit if it hasn't finished.
  setTimeout(() => {
    logger.warn('Forced exit after shutdown timeout');
    process.exit(1);
  }, 30_000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const chatDbPath = requireEnv('CHAT_DB_PATH');
  const databaseUrl = requireEnv('DATABASE_URL');

  // Sanity check: does the chat.db file exist?
  if (!existsSync(chatDbPath)) {
    logger.fatal(
      { chatDbPath },
      'chat.db file not found — is the NFS share mounted?',
    );
    process.exit(1);
  }

  if (shutdownRequested) {
    logger.info('Shutdown requested before ingest started — exiting');
    process.exit(0);
  }

  logger.info({ chatDbPath }, 'Starting ingest run');

  const result = await ingestFromChatDb(chatDbPath, databaseUrl, logger);

  logger.info(
    {
      messagesIngested: result.messagesIngested,
      handlesUpserted: result.handlesUpserted,
      chatsUpserted: result.chatsUpserted,
      highWatermark: result.highWatermark?.toISOString() ?? null,
    },
    'Ingest run complete',
  );
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Ingest failed');
  process.exit(1);
});
