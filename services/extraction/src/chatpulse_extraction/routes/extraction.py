"""Extraction routes -- raw data access to chat.db contents."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from chatpulse_extraction.db import ChatDB
from chatpulse_extraction.models import (
    ChatListResponse,
    ChatRow,
    HandleListResponse,
    HandleRow,
    MessageListResponse,
    MessageRow,
)

router = APIRouter(prefix="/extract", tags=["extraction"])


def _open_db(db_path: str) -> ChatDB:
    """Open a ChatDB, raising 404 if the file doesn't exist."""
    try:
        return ChatDB(db_path)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/messages", response_model=MessageListResponse)
def list_messages(
    db_path: str = Query(..., description="Path to the chat.db file on disk"),
    since: float | None = Query(None, description="Unix timestamp; only messages after this"),
    limit: int | None = Query(None, ge=1, description="Maximum number of messages to return"),
) -> MessageListResponse:
    """Retrieve messages from a chat.db, optionally filtered by date."""
    db = _open_db(db_path)
    rows = db.get_messages(since_date=since, limit=limit)
    messages = [MessageRow(**r) for r in rows]
    return MessageListResponse(messages=messages, count=len(messages))


@router.get("/contacts", response_model=HandleListResponse)
def list_contacts(
    db_path: str = Query(..., description="Path to the chat.db file on disk"),
) -> HandleListResponse:
    """Retrieve all contact handles from a chat.db."""
    db = _open_db(db_path)
    rows = db.get_handles()
    handles = [HandleRow(**r) for r in rows]
    return HandleListResponse(handles=handles, count=len(handles))


@router.get("/chats", response_model=ChatListResponse)
def list_chats(
    db_path: str = Query(..., description="Path to the chat.db file on disk"),
) -> ChatListResponse:
    """Retrieve all chats/conversations from a chat.db."""
    db = _open_db(db_path)
    rows = db.get_chats()
    chats = [ChatRow(**r) for r in rows]
    return ChatListResponse(chats=chats, count=len(chats))


@router.get("/chats/{chat_id}/messages", response_model=MessageListResponse)
def list_chat_messages(
    chat_id: int,
    db_path: str = Query(..., description="Path to the chat.db file on disk"),
) -> MessageListResponse:
    """Retrieve all messages for a specific chat."""
    db = _open_db(db_path)
    rows = db.get_chat_messages(chat_id)
    messages = [MessageRow(**r) for r in rows]
    return MessageListResponse(messages=messages, count=len(messages))
