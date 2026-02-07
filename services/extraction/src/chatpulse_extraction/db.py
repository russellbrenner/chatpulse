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

import re

# Pattern that precedes the text string inside a typedstream attributedBody blob.
# The byte after NSString\x01 varies (seen \x94 and \x95) so we match any byte there.
_ATTRIBUTED_BODY_PATTERN = re.compile(rb"NSString\x01.\x84\x01\+", re.DOTALL)

# Apple Core Data epoch offset: seconds between 1970-01-01 and 2001-01-01.
APPLE_EPOCH_OFFSET = 978307200

# Apple stores message.date as nanoseconds since 2001-01-01 (post-High Sierra).
# To convert to Unix seconds: (date / 1_000_000_000) + APPLE_EPOCH_OFFSET
DATE_CONVERSION_EXPR = f"(message.date / 1000000000) + {APPLE_EPOCH_OFFSET}"


def _extract_text_from_attributed_body(blob: bytes | None) -> str | None:
    """Decode the text content from an Apple typedstream attributedBody blob.

    Modern macOS Messages stores text in ``attributedBody`` (an
    NSKeyedArchiver/typedstream blob) instead of the ``text`` column.
    The plain-text string is embedded after an ``NSString`` marker with
    a length prefix.

    Returns *None* if the blob is empty or unparseable.
    """
    if not blob:
        return None

    match = _ATTRIBUTED_BODY_PATTERN.search(blob)
    if match is None:
        return None

    # Position right after the matched pattern
    pos = match.end()
    if pos >= len(blob):
        return None

    # Read the length.  Typedstream uses:
    #   byte < 0x80  → length is that byte
    #   byte == 0x81 → next 2 bytes (big-endian) are the length
    #   byte == 0x82 → next 4 bytes (big-endian) are the length
    length_byte = blob[pos]
    pos += 1

    if length_byte < 0x80:
        length = length_byte
    elif length_byte == 0x81:
        if pos + 2 > len(blob):
            return None
        length = int.from_bytes(blob[pos : pos + 2], "big")
        pos += 2
    elif length_byte == 0x82:
        if pos + 4 > len(blob):
            return None
        length = int.from_bytes(blob[pos : pos + 4], "big")
        pos += 4
    else:
        return None

    if pos + length > len(blob):
        return None

    try:
        return blob[pos : pos + length].decode("utf-8", errors="replace")
    except Exception:
        return None


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
                message.attributedBody,
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

        return [self._resolve_text(dict(row)) for row in rows]

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
                message.attributedBody,
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
        return [self._resolve_text(dict(row)) for row in rows]

    @staticmethod
    def _resolve_text(row: dict[str, Any]) -> dict[str, Any]:
        """Fill in ``text`` from ``attributedBody`` if needed, then drop the blob."""
        if row.get("text") is None and row.get("attributedBody") is not None:
            row["text"] = _extract_text_from_attributed_body(row["attributedBody"])
        row.pop("attributedBody", None)
        return row

    # ------------------------------------------------------------------
    # Raw query helper (used by analysis functions)
    # ------------------------------------------------------------------

    def execute(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
        """Execute arbitrary read-only SQL and return rows as dicts."""
        with self._connect() as conn:
            rows = conn.execute(sql, params or []).fetchall()
        return [dict(row) for row in rows]
