"""SQLite reader for Apple Messages chat.db.

Opens the database in read-only mode and provides typed query methods.
All date conversions from Apple Core Data timestamps (nanoseconds since
2001-01-01) to Unix timestamps are handled transparently.
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any

# Apple Core Data epoch offset: seconds between 1970-01-01 and 2001-01-01.
APPLE_EPOCH_OFFSET = 978307200

# Apple stores message.date as nanoseconds since 2001-01-01 (post-High Sierra).
# To convert to Unix seconds: (date / 1_000_000_000) + APPLE_EPOCH_OFFSET
DATE_CONVERSION_EXPR = f"(message.date / 1000000000) + {APPLE_EPOCH_OFFSET}"


class ChatDB:
    """Read-only accessor for an Apple Messages ``chat.db`` file.

    Parameters
    ----------
    db_path:
        Path to the chat.db SQLite file.  Opened in read-only mode via a
        URI connection string so the original file is never modified.
    """

    def __init__(self, db_path: str | Path) -> None:
        self._path = Path(db_path)
        if not self._path.is_file():
            raise FileNotFoundError(f"Database file not found: {self._path}")

    @contextmanager
    def _connect(self):
        """Yield a read-only SQLite connection."""
        uri = f"file:{self._path}?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Extraction queries
    # ------------------------------------------------------------------

    def get_messages(
        self,
        since_date: float | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        """Return messages, optionally filtered by Unix timestamp and limited.

        Parameters
        ----------
        since_date:
            If provided, only return messages with a Unix timestamp >= this value.
        limit:
            Maximum number of rows to return (newest first).
        """
        sql = f"""
            SELECT
                message.ROWID   AS rowid,
                message.guid,
                message.text,
                message.handle_id,
                {DATE_CONVERSION_EXPR} AS date_unix,
                message.is_from_me,
                message.cache_roomnames,
                message.associated_message_guid,
                message.associated_message_type
            FROM message
        """
        params: list[Any] = []

        if since_date is not None:
            # Convert the Unix timestamp back to Apple nanosecond timestamp
            # for comparison against the raw column.
            apple_ns = int((since_date - APPLE_EPOCH_OFFSET) * 1_000_000_000)
            sql += " WHERE message.date >= ?"
            params.append(apple_ns)

        sql += " ORDER BY message.date DESC"

        if limit is not None:
            sql += " LIMIT ?"
            params.append(limit)

        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()

        return [dict(row) for row in rows]

    def get_handles(self) -> list[dict[str, Any]]:
        """Return all contact handles."""
        sql = """
            SELECT
                handle.ROWID AS rowid,
                handle.id,
                handle.service,
                handle.uncanonicalized_id
            FROM handle
            ORDER BY handle.id
        """
        with self._connect() as conn:
            rows = conn.execute(sql).fetchall()
        return [dict(row) for row in rows]

    def get_chats(self) -> list[dict[str, Any]]:
        """Return all chats (conversations)."""
        sql = """
            SELECT
                chat.ROWID AS rowid,
                chat.guid,
                chat.chat_identifier,
                chat.display_name,
                chat.group_id
            FROM chat
            ORDER BY chat.ROWID
        """
        with self._connect() as conn:
            rows = conn.execute(sql).fetchall()
        return [dict(row) for row in rows]

    def get_chat_messages(self, chat_id: int) -> list[dict[str, Any]]:
        """Return all messages belonging to a specific chat.

        Parameters
        ----------
        chat_id:
            The ``ROWID`` of the chat in the ``chat`` table.
        """
        sql = f"""
            SELECT
                message.ROWID   AS rowid,
                message.guid,
                message.text,
                message.handle_id,
                {DATE_CONVERSION_EXPR} AS date_unix,
                message.is_from_me,
                message.cache_roomnames,
                message.associated_message_guid,
                message.associated_message_type
            FROM message
            JOIN chat_message_join ON chat_message_join.message_id = message.ROWID
            WHERE chat_message_join.chat_id = ?
            ORDER BY message.date ASC
        """
        with self._connect() as conn:
            rows = conn.execute(sql, [chat_id]).fetchall()
        return [dict(row) for row in rows]

    # ------------------------------------------------------------------
    # Raw query helper (used by analysis functions)
    # ------------------------------------------------------------------

    def execute(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
        """Execute arbitrary read-only SQL and return rows as dicts."""
        with self._connect() as conn:
            rows = conn.execute(sql, params or []).fetchall()
        return [dict(row) for row in rows]
