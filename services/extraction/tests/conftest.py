"""Shared pytest fixtures for the ChatPulse extraction test suite.

Creates an in-memory SQLite database that mirrors the Apple Messages
chat.db schema and populates it with deterministic sample data.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from chatpulse_extraction.db import APPLE_EPOCH_OFFSET, ChatDB

# ---------------------------------------------------------------------------
# Schema DDL -- simplified version of macOS Messages chat.db tables.
# ---------------------------------------------------------------------------

_SCHEMA = """
CREATE TABLE handle (
    ROWID INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL,
    service TEXT NOT NULL DEFAULT 'iMessage',
    uncanonicalized_id TEXT
);

CREATE TABLE chat (
    ROWID INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT NOT NULL,
    chat_identifier TEXT NOT NULL,
    display_name TEXT,
    group_id TEXT
);

CREATE TABLE message (
    ROWID INTEGER PRIMARY KEY AUTOINCREMENT,
    guid TEXT NOT NULL,
    text TEXT,
    handle_id INTEGER,
    date INTEGER NOT NULL DEFAULT 0,
    is_from_me INTEGER NOT NULL DEFAULT 0,
    cache_roomnames TEXT,
    associated_message_guid TEXT,
    associated_message_type INTEGER DEFAULT 0
);

CREATE TABLE chat_handle_join (
    chat_id INTEGER NOT NULL,
    handle_id INTEGER NOT NULL
);

CREATE TABLE chat_message_join (
    chat_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL
);
"""


def _unix_to_apple_ns(unix_ts: float) -> int:
    """Convert a Unix timestamp to Apple Core Data nanoseconds."""
    return int((unix_ts - APPLE_EPOCH_OFFSET) * 1_000_000_000)


def _populate(conn: sqlite3.Connection) -> None:
    """Insert deterministic sample rows."""
    # Handles
    conn.execute("INSERT INTO handle (id, service) VALUES ('+61400111222', 'iMessage')")
    conn.execute("INSERT INTO handle (id, service) VALUES ('+61400333444', 'iMessage')")
    conn.execute("INSERT INTO handle (id, service) VALUES ('mate@example.com', 'iMessage')")

    # Chats
    conn.execute(
        "INSERT INTO chat (guid, chat_identifier, display_name) "
        "VALUES ('chat1', 'iMessage;+;+61400111222', 'Alice')"
    )
    conn.execute(
        "INSERT INTO chat (guid, chat_identifier, display_name) "
        "VALUES ('chat2', 'iMessage;+;+61400333444', 'Bob')"
    )

    # Messages -- using fixed Unix timestamps (2024-06-15 10:00:00 UTC onwards).
    base_ts = 1718445600  # 2024-06-15 10:00:00 UTC

    messages = [
        # (text, handle_id, unix_ts, is_from_me, assoc_type)  -- chat 1
        ("G'day Alice", 1, base_ts, 0, 0),
        ("Hey there!", 1, base_ts + 60, 1, 0),
        ("How's it going?", 1, base_ts + 120, 0, 0),
        ("All good, cheers", 1, base_ts + 300, 1, 0),
        # Reaction on the first message
        (None, 1, base_ts + 310, 1, 2001),  # Liked
        # Chat 2
        ("Morning Bob", 2, base_ts + 3600, 1, 0),
        ("Morning!", 2, base_ts + 3660, 0, 0),
        # Another reaction
        (None, 2, base_ts + 3670, 0, 2000),  # Loved
        # Message from email handle in chat 1
        ("Quick question", 3, base_ts + 7200, 0, 0),
        ("Sure, ask away", 3, base_ts + 7500, 1, 0),
    ]

    for i, (text, handle_id, ts, is_from_me, assoc_type) in enumerate(messages, start=1):
        apple_ns = _unix_to_apple_ns(ts)
        conn.execute(
            "INSERT INTO message (guid, text, handle_id, date, is_from_me, "
            "associated_message_type) VALUES (?, ?, ?, ?, ?, ?)",
            (f"msg-{i}", text, handle_id, apple_ns, is_from_me, assoc_type),
        )

    # chat_message_join -- first 5 messages in chat 1, next 3 in chat 2,
    # last 2 in chat 1 again.
    chat_joins = [
        (1, 1),
        (1, 2),
        (1, 3),
        (1, 4),
        (1, 5),
        (2, 6),
        (2, 7),
        (2, 8),
        (1, 9),
        (1, 10),
    ]
    conn.executemany(
        "INSERT INTO chat_message_join (chat_id, message_id) VALUES (?, ?)",
        chat_joins,
    )

    # chat_handle_join
    conn.executemany(
        "INSERT INTO chat_handle_join (chat_id, handle_id) VALUES (?, ?)",
        [(1, 1), (1, 3), (2, 2)],
    )

    conn.commit()


@pytest.fixture()
def sample_db(tmp_path: Path) -> ChatDB:
    """Create a temporary chat.db with sample data and return a ChatDB instance."""
    db_file = tmp_path / "chat.db"
    conn = sqlite3.connect(str(db_file))
    conn.executescript(_SCHEMA)
    _populate(conn)
    conn.close()
    return ChatDB(db_file)


@pytest.fixture()
def sample_db_path(sample_db: ChatDB) -> str:
    """Return the filesystem path to the sample chat.db."""
    return str(sample_db._path)
