"""Analysis functions for Apple Messages data.

Each function accepts a :class:`ChatDB` instance and returns structured
results suitable for JSON serialisation.  No direct SQL is embedded here;
instead we use ``ChatDB.execute()`` for analytical queries.
"""

from __future__ import annotations

from chatpulse_extraction.db import APPLE_EPOCH_OFFSET, ChatDB

# Tapback / reaction type labels as stored in associated_message_type.
# Types 2000-2005 are "add" reactions; 3000-3005 are "remove" (undo).
REACTION_LABELS: dict[int, str] = {
    2000: "Loved",
    2001: "Liked",
    2002: "Disliked",
    2003: "Laughed",
    2004: "Emphasised",
    2005: "Questioned",
}


def message_counts_by_contact(db: ChatDB) -> list[dict]:
    """Total, sent, and received message counts per contact handle.

    Excludes reaction messages (associated_message_type IS NULL or 0).
    """
    sql = """
        SELECT
            handle.ROWID                          AS handle_id,
            handle.id                             AS handle,
            COUNT(*)                              AS total,
            SUM(CASE WHEN message.is_from_me = 1 THEN 1 ELSE 0 END) AS sent,
            SUM(CASE WHEN message.is_from_me = 0 THEN 1 ELSE 0 END) AS received
        FROM message
        JOIN handle ON handle.ROWID = message.handle_id
        WHERE (message.associated_message_type IS NULL
               OR message.associated_message_type = 0)
        GROUP BY handle.ROWID
        ORDER BY total DESC
    """
    return db.execute(sql)


def messages_over_time(db: ChatDB, interval: str = "day") -> list[dict]:
    """Histogram of message counts bucketed by *interval*.

    Parameters
    ----------
    interval:
        One of ``"day"``, ``"week"``, or ``"month"``.
    """
    # strftime format for each supported bucket granularity.
    fmt_map = {
        "day": "%Y-%m-%d",
        "week": "%Y-W%W",
        "month": "%Y-%m",
    }
    fmt = fmt_map.get(interval, "%Y-%m-%d")

    sql = f"""
        SELECT
            strftime('{fmt}',
                     datetime(message.date / 1000000000 + {APPLE_EPOCH_OFFSET},
                              'unixepoch')) AS period,
            COUNT(*) AS count
        FROM message
        WHERE (message.associated_message_type IS NULL
               OR message.associated_message_type = 0)
        GROUP BY period
        ORDER BY period ASC
    """
    return db.execute(sql)


def top_contacts(db: ChatDB, limit: int = 20) -> list[dict]:
    """Return contacts ranked by total message count (excluding reactions)."""
    sql = """
        SELECT
            handle.ROWID  AS handle_id,
            handle.id     AS handle,
            COUNT(*)      AS message_count
        FROM message
        JOIN handle ON handle.ROWID = message.handle_id
        WHERE (message.associated_message_type IS NULL
               OR message.associated_message_type = 0)
        GROUP BY handle.ROWID
        ORDER BY message_count DESC
        LIMIT ?
    """
    return db.execute(sql, [limit])


def average_response_time(db: ChatDB) -> list[dict]:
    """Estimate average response time per contact.

    For each incoming message followed by an outgoing message (or vice versa)
    in the same chat, compute the time delta.  Returns the mean delta per
    handle.

    Only considers consecutive message pairs within the same chat to avoid
    cross-chat contamination.  Pairs with a gap > 24 hours are excluded to
    filter out conversation restarts.
    """
    # Use a window function to pair each message with its predecessor in the
    # same chat.  Then filter for direction changes (incoming -> outgoing).
    sql = f"""
        WITH ordered AS (
            SELECT
                message.handle_id,
                message.is_from_me,
                (message.date / 1000000000) + {APPLE_EPOCH_OFFSET} AS ts,
                chat_message_join.chat_id,
                LAG(message.is_from_me) OVER (
                    PARTITION BY chat_message_join.chat_id
                    ORDER BY message.date
                ) AS prev_from_me,
                LAG((message.date / 1000000000) + {APPLE_EPOCH_OFFSET}) OVER (
                    PARTITION BY chat_message_join.chat_id
                    ORDER BY message.date
                ) AS prev_ts
            FROM message
            JOIN chat_message_join ON chat_message_join.message_id = message.ROWID
            WHERE (message.associated_message_type IS NULL
                   OR message.associated_message_type = 0)
        ),
        responses AS (
            SELECT
                handle_id,
                (ts - prev_ts) AS delta
            FROM ordered
            WHERE is_from_me = 1
              AND prev_from_me = 0
              AND prev_ts IS NOT NULL
              AND (ts - prev_ts) BETWEEN 1 AND 86400
        )
        SELECT
            handle.ROWID AS handle_id,
            handle.id    AS handle,
            AVG(responses.delta) AS avg_response_seconds
        FROM responses
        JOIN handle ON handle.ROWID = responses.handle_id
        GROUP BY handle.ROWID
        ORDER BY avg_response_seconds ASC
    """
    return db.execute(sql)


def busiest_hours(db: ChatDB) -> list[dict]:
    """Message counts by hour of day (0-23) for a 24-hour heatmap."""
    sql = f"""
        SELECT
            CAST(strftime('%H',
                          datetime(message.date / 1000000000 + {APPLE_EPOCH_OFFSET},
                                   'unixepoch', 'localtime')) AS INTEGER) AS hour,
            COUNT(*) AS count
        FROM message
        WHERE (message.associated_message_type IS NULL
               OR message.associated_message_type = 0)
        GROUP BY hour
        ORDER BY hour ASC
    """
    return db.execute(sql)


def reaction_summary(db: ChatDB) -> list[dict]:
    """Tapback (reaction) counts grouped by type.

    Only considers "add" reactions (associated_message_type 2000-2005).
    """
    sql = """
        SELECT
            message.associated_message_type AS reaction_type,
            COUNT(*) AS count
        FROM message
        WHERE message.associated_message_type BETWEEN 2000 AND 2005
        GROUP BY message.associated_message_type
        ORDER BY count DESC
    """
    rows = db.execute(sql)
    # Attach human-readable labels.
    for row in rows:
        row["label"] = REACTION_LABELS.get(row["reaction_type"], "Unknown")
    return rows
