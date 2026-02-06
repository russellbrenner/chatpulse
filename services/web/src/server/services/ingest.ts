/**
 * Incremental ingest service — reads an Apple Messages chat.db (SQLite)
 * and inserts new messages into the ChatPulse PostgreSQL database.
 *
 * Designed to run as a standalone script inside a k3s CronJob. The NFS
 * share provides the chat.db file; DATABASE_URL points to PostgreSQL.
 *
 * Watermark strategy: timestamp-based (PLAN.md decision #13). Each run
 * queries chat.db for messages whose `date` column exceeds the stored
 * watermark, converts them, and upserts into PostgreSQL inside a single
 * transaction.
 */

import Database from 'better-sqlite3';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import pino from 'pino';

import { appleToDate, dateToApple } from './dateConvert.js';
import { getWatermark, updateWatermark } from './watermark.js';

// ── Types for chat.db rows ──────────────────────────────────────────

interface ChatDbMessage {
  ROWID: number;
  guid: string;
  text: string | null;
  handle_id: number;
  date: number;
  date_read: number;
  date_delivered: number;
  is_from_me: number;
  cache_has_attachments: number;
  associated_message_type: number;
  service: string | null;
}

interface ChatDbHandle {
  ROWID: number;
  id: string;
  service: string | null;
  uncanonicalized_id: string | null;
}

interface ChatDbChat {
  ROWID: number;
  guid: string;
  chat_identifier: string;
  display_name: string | null;
  service_name: string | null;
  group_id: string | null;
}

interface ChatDbChatHandleJoin {
  chat_id: number;
  handle_id: number;
}

interface ChatDbChatMessageJoin {
  chat_id: number;
  message_id: number;
}

/** Summary returned after a successful ingest run. */
export interface IngestResult {
  messagesIngested: number;
  handlesUpserted: number;
  chatsUpserted: number;
  highWatermark: Date | null;
}

// ── Main ingest function ────────────────────────────────────────────

/**
 * Ingest new messages from a chat.db SQLite file into PostgreSQL.
 *
 * Opens chat.db in read-only mode, determines the watermark, fetches
 * all newer messages (and their associated handles, chats, and join
 * records), then writes everything to PostgreSQL in a single
 * transaction. The watermark is updated as the final step inside the
 * same transaction to guarantee atomicity.
 *
 * @param chatDbPath          Filesystem path to the chat.db SQLite file.
 * @param pgConnectionString  PostgreSQL connection string (DATABASE_URL).
 * @param logger              Optional Pino logger instance.
 * @returns Summary of ingested records.
 */
export async function ingestFromChatDb(
  chatDbPath: string,
  pgConnectionString: string,
  logger?: pino.Logger,
): Promise<IngestResult> {
  const log = logger ?? pino({ name: 'chatpulse-ingest' });

  // ── Open chat.db read-only ──────────────────────────────────────
  log.info({ chatDbPath }, 'Opening chat.db');
  const sqlite = new Database(chatDbPath, { readonly: true, fileMustExist: true });

  // Enable WAL mode reading for best concurrent performance
  sqlite.pragma('journal_mode = WAL');

  const pool = new Pool({ connectionString: pgConnectionString });
  let client: PoolClient | undefined;

  try {
    // ── Determine watermark ─────────────────────────────────────
    client = await pool.connect();
    const watermark = await getWatermark(client);

    const appleWatermark = watermark
      ? dateToApple(watermark.lastMessageDate)
      : 0; // First run: ingest everything

    log.info(
      {
        isFirstRun: watermark === null,
        watermarkDate: watermark?.lastMessageDate.toISOString() ?? null,
        watermarkRowid: watermark?.lastRowid ?? null,
        appleWatermark,
      },
      watermark
        ? 'Resuming from existing watermark'
        : 'First run — ingesting all messages',
    );

    // ── Query new messages from chat.db ─────────────────────────
    const messages = sqlite
      .prepare<[number], ChatDbMessage>(
        `SELECT ROWID, guid, text, handle_id, date, date_read,
                date_delivered, is_from_me, cache_has_attachments,
                associated_message_type, service
           FROM message
          WHERE date > ?
          ORDER BY date ASC`,
      )
      .all(appleWatermark);

    if (messages.length === 0) {
      log.info('No new messages found — nothing to ingest');
      return {
        messagesIngested: 0,
        handlesUpserted: 0,
        chatsUpserted: 0,
        highWatermark: watermark?.lastMessageDate ?? null,
      };
    }

    log.info({ count: messages.length }, 'New messages found in chat.db');

    // ── Collect related handle IDs ──────────────────────────────
    const handleIds = [...new Set(messages.map((m) => m.handle_id).filter((id) => id > 0))];

    const handles: ChatDbHandle[] = handleIds.length > 0
      ? (sqlite
          .prepare(
            `SELECT ROWID, id, service, uncanonicalized_id
               FROM handle
              WHERE ROWID IN (${handleIds.map(() => '?').join(',')})`,
          )
          .all(handleIds) as ChatDbHandle[])
      : [];

    // ── Collect related message ROWIDs for chat lookups ─────────
    const messageRowids = messages.map((m) => m.ROWID);

    const chatMessageJoins: ChatDbChatMessageJoin[] = messageRowids.length > 0
      ? (sqlite
          .prepare(
            `SELECT chat_id, message_id
               FROM chat_message_join
              WHERE message_id IN (${messageRowids.map(() => '?').join(',')})`,
          )
          .all(messageRowids) as ChatDbChatMessageJoin[])
      : [];

    const chatIds = [...new Set(chatMessageJoins.map((j) => j.chat_id))];

    const chats: ChatDbChat[] = chatIds.length > 0
      ? (sqlite
          .prepare(
            `SELECT ROWID, guid, chat_identifier, display_name,
                    service_name, group_id
               FROM chat
              WHERE ROWID IN (${chatIds.map(() => '?').join(',')})`,
          )
          .all(chatIds) as ChatDbChat[])
      : [];

    // ── Collect chat_handle_join rows for the relevant chats ────
    const chatHandleJoins: ChatDbChatHandleJoin[] = chatIds.length > 0
      ? (sqlite
          .prepare(
            `SELECT chat_id, handle_id
               FROM chat_handle_join
              WHERE chat_id IN (${chatIds.map(() => '?').join(',')})`,
          )
          .all(chatIds) as ChatDbChatHandleJoin[])
      : [];

    log.info(
      {
        handles: handles.length,
        chats: chats.length,
        chatMessageJoins: chatMessageJoins.length,
        chatHandleJoins: chatHandleJoins.length,
      },
      'Related records collected from chat.db',
    );

    // ── Begin PostgreSQL transaction ────────────────────────────
    await client.query('BEGIN');

    try {
      // Upsert handles
      let handlesUpserted = 0;
      for (const handle of handles) {
        await client.query(
          `INSERT INTO handles (original_rowid, identifier, service, uncanonicalized_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (original_rowid)
           DO UPDATE SET identifier         = EXCLUDED.identifier,
                         service            = EXCLUDED.service,
                         uncanonicalized_id = EXCLUDED.uncanonicalized_id`,
          [handle.ROWID, handle.id, handle.service, handle.uncanonicalized_id],
        );
        handlesUpserted++;
      }

      // Upsert chats
      let chatsUpserted = 0;
      for (const chat of chats) {
        await client.query(
          `INSERT INTO chats (original_rowid, guid, chat_identifier, display_name,
                              service_name, group_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (original_rowid)
           DO UPDATE SET guid            = EXCLUDED.guid,
                         chat_identifier = EXCLUDED.chat_identifier,
                         display_name    = EXCLUDED.display_name,
                         service_name    = EXCLUDED.service_name,
                         group_id        = EXCLUDED.group_id`,
          [
            chat.ROWID, chat.guid, chat.chat_identifier,
            chat.display_name, chat.service_name, chat.group_id,
          ],
        );
        chatsUpserted++;
      }

      // Insert messages
      let messagesIngested = 0;
      for (const msg of messages) {
        const sentAt = appleToDate(msg.date);
        const readAt = msg.date_read ? appleToDate(msg.date_read) : null;
        const deliveredAt = msg.date_delivered ? appleToDate(msg.date_delivered) : null;

        await client.query(
          `INSERT INTO messages (original_rowid, guid, text, handle_id, date, date_read,
                                 date_delivered, is_from_me, has_attachments,
                                 associated_message_type, service)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (original_rowid) DO NOTHING`,
          [
            msg.ROWID, msg.guid, msg.text, msg.handle_id,
            sentAt, readAt, deliveredAt,
            msg.is_from_me === 1,
            msg.cache_has_attachments === 1,
            msg.associated_message_type || null,
            msg.service,
          ],
        );
        messagesIngested++;
      }

      // Upsert chat_handle_join
      for (const join of chatHandleJoins) {
        await client.query(
          `INSERT INTO chat_handle_join (chat_id, handle_id)
           VALUES ($1, $2)
           ON CONFLICT (chat_id, handle_id) DO NOTHING`,
          [join.chat_id, join.handle_id],
        );
      }

      // Upsert chat_message_join
      for (const join of chatMessageJoins) {
        await client.query(
          `INSERT INTO chat_message_join (chat_id, message_id)
           VALUES ($1, $2)
           ON CONFLICT (chat_id, message_id) DO NOTHING`,
          [join.chat_id, join.message_id],
        );
      }

      // ── Update watermark ────────────────────────────────────
      const lastMessage = messages[messages.length - 1];
      const newWatermarkDate = appleToDate(lastMessage.date);

      await updateWatermark(client, newWatermarkDate, lastMessage.ROWID);

      await client.query('COMMIT');

      log.info(
        {
          messagesIngested,
          handlesUpserted,
          chatsUpserted,
          highWatermark: newWatermarkDate.toISOString(),
        },
        'Ingest completed successfully',
      );

      return {
        messagesIngested,
        handlesUpserted,
        chatsUpserted,
        highWatermark: newWatermarkDate,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
  } finally {
    sqlite.close();
    client?.release();
    await pool.end();
  }
}
