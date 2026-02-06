"""Analysis routes -- computed analytics over chat.db data."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from chatpulse_extraction import analysis
from chatpulse_extraction.db import ChatDB
from chatpulse_extraction.models import (
    ContactMessageCount,
    HourBucket,
    ReactionCount,
    ResponseTime,
    TimelineBucket,
    TopContact,
)

router = APIRouter(prefix="/analysis", tags=["analysis"])


def _open_db(db_path: str) -> ChatDB:
    """Open a ChatDB, raising 404 if the file doesn't exist."""
    try:
        return ChatDB(db_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/message-counts", response_model=list[ContactMessageCount])
def message_counts(
    db_path: str = Query(..., description="Path to the chat.db file on disk"),
) -> list[ContactMessageCount]:
    """Total, sent, and received message counts per contact."""
    db = _open_db(db_path)
    rows = analysis.message_counts_by_contact(db)
    return [ContactMessageCount(**r) for r in rows]


@router.get("/timeline", response_model=list[TimelineBucket])
def timeline(
    db_path: str = Query(..., description="Path to the chat.db file on disk"),
    interval: str = Query("day", description="Bucket interval: day, week, or month"),
) -> list[TimelineBucket]:
    """Message-count histogram over time."""
    if interval not in ("day", "week", "month"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid interval '{interval}'. Must be day, week, or month.",
        )
    db = _open_db(db_path)
    rows = analysis.messages_over_time(db, interval=interval)
    return [TimelineBucket(**r) for r in rows]


@router.get("/top-contacts", response_model=list[TopContact])
def top_contacts_endpoint(
    db_path: str = Query(..., description="Path to the chat.db file on disk"),
    limit: int = Query(20, ge=1, le=500, description="Number of contacts to return"),
) -> list[TopContact]:
    """Contacts ranked by message volume."""
    db = _open_db(db_path)
    rows = analysis.top_contacts(db, limit=limit)
    return [TopContact(**r) for r in rows]


@router.get("/response-times", response_model=list[ResponseTime])
def response_times(
    db_path: str = Query(..., description="Path to the chat.db file on disk"),
) -> list[ResponseTime]:
    """Average response time per contact."""
    db = _open_db(db_path)
    rows = analysis.average_response_time(db)
    return [ResponseTime(**r) for r in rows]


@router.get("/heatmap", response_model=list[HourBucket])
def heatmap(
    db_path: str = Query(..., description="Path to the chat.db file on disk"),
) -> list[HourBucket]:
    """Message counts by hour of day (24-hour heatmap data)."""
    db = _open_db(db_path)
    rows = analysis.busiest_hours(db)
    return [HourBucket(**r) for r in rows]


@router.get("/reactions", response_model=list[ReactionCount])
def reactions(
    db_path: str = Query(..., description="Path to the chat.db file on disk"),
) -> list[ReactionCount]:
    """Tapback (reaction) counts grouped by type."""
    db = _open_db(db_path)
    rows = analysis.reaction_summary(db)
    return [ReactionCount(**r) for r in rows]
