"""Pydantic response models for the ChatPulse extraction API."""

from __future__ import annotations

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Extraction models
# ---------------------------------------------------------------------------


class MessageRow(BaseModel):
    """A single message extracted from chat.db."""

    rowid: int
    guid: str
    text: str | None = None
    handle_id: int
    date_unix: float = Field(description="Unix timestamp (seconds since 1970-01-01)")
    is_from_me: bool
    cache_roomnames: str | None = None
    associated_message_guid: str | None = None
    associated_message_type: int | None = None


class HandleRow(BaseModel):
    """A contact handle from chat.db."""

    rowid: int
    id: str = Field(description="Phone number or email address")
    service: str
    uncanonicalized_id: str | None = None


class ChatRow(BaseModel):
    """A conversation (chat) from chat.db."""

    rowid: int
    guid: str
    chat_identifier: str
    display_name: str | None = None
    group_id: str | None = None


# ---------------------------------------------------------------------------
# Analysis models
# ---------------------------------------------------------------------------


class ContactMessageCount(BaseModel):
    """Total, sent, and received message counts for a single contact."""

    handle_id: int
    handle: str
    total: int
    sent: int
    received: int


class TimelineBucket(BaseModel):
    """A single bucket in the messages-over-time histogram."""

    period: str = Field(description="ISO date string or label for the bucket")
    count: int


class TopContact(BaseModel):
    """A contact ranked by message volume."""

    handle_id: int
    handle: str
    message_count: int


class ResponseTime(BaseModel):
    """Average response time for a contact."""

    handle_id: int
    handle: str
    avg_response_seconds: float | None = Field(
        default=None,
        description="Average response time in seconds, or null if insufficient data",
    )


class HourBucket(BaseModel):
    """Message count for a single hour of the day (0-23)."""

    hour: int
    count: int


class ReactionCount(BaseModel):
    """Count of a specific reaction (tapback) type."""

    reaction_type: int = Field(description="associated_message_type value (2000-2005)")
    label: str
    count: int


# ---------------------------------------------------------------------------
# Wrapper responses
# ---------------------------------------------------------------------------


class HealthResponse(BaseModel):
    """Health-check response."""

    status: str = "ok"
    version: str


class MessageListResponse(BaseModel):
    """Paginated list of messages."""

    messages: list[MessageRow]
    count: int


class HandleListResponse(BaseModel):
    """List of contact handles."""

    handles: list[HandleRow]
    count: int


class ChatListResponse(BaseModel):
    """List of chats/conversations."""

    chats: list[ChatRow]
    count: int
