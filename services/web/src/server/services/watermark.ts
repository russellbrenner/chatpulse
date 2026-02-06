/**
 * Watermark management for incremental chat.db ingestion.
 *
 * The ingest_watermark table stores a singleton row tracking the most
 * recent message date and ROWID that have been successfully ingested
 * into PostgreSQL. This allows subsequent runs to process only new
 * messages.
 */

import type { Pool, PoolClient } from 'pg';

/** Shape of the watermark record. */
export interface Watermark {
  /** Timestamp of the most recently ingested message. */
  lastMessageDate: Date;
  /** ROWID of the most recently ingested message (for tie-breaking). */
  lastRowid: number;
}

/**
 * Retrieve the current ingest watermark from PostgreSQL.
 *
 * Returns null on the first ever run (no watermark row exists).
 * Accepts either a Pool or a PoolClient so it can participate in an
 * existing transaction.
 */
export async function getWatermark(
  pg: Pool | PoolClient,
): Promise<Watermark | null> {
  const result = await pg.query<{
    last_message_date: Date;
    last_rowid: string; // bigint comes back as string from pg
  }>(
    `SELECT last_message_date, last_rowid
       FROM ingest_watermark
      LIMIT 1`,
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    lastMessageDate: row.last_message_date,
    lastRowid: Number(row.last_rowid),
  };
}

/**
 * Create or update the singleton watermark row.
 *
 * Uses INSERT ... ON CONFLICT to handle both the initial insert and
 * subsequent updates. The ingest_watermark table should have a single
 * row identified by id = 1.
 *
 * Accepts either a Pool or a PoolClient so it can participate in an
 * existing transaction.
 */
export async function updateWatermark(
  pg: Pool | PoolClient,
  date: Date,
  rowid: number,
): Promise<void> {
  await pg.query(
    `INSERT INTO ingest_watermark (id, last_message_date, last_rowid, updated_at)
     VALUES (1, $1, $2, NOW())
     ON CONFLICT (id)
     DO UPDATE SET last_message_date = EXCLUDED.last_message_date,
                   last_rowid       = EXCLUDED.last_rowid,
                   updated_at       = NOW()`,
    [date, rowid],
  );
}
