-- ChatPulse initial PostgreSQL schema
-- Stores archived iMessage data ingested from macOS chat.db
--
-- Primary keys use the original ROWID from chat.db rather than SERIAL
-- auto-increment IDs. This preserves the natural key space from the
-- source database, simplifies the ingest pipeline (no ID mapping
-- needed), and guarantees deduplication via ON CONFLICT.

-- Handles (contacts/phone numbers)
CREATE TABLE handles (
  original_rowid INTEGER PRIMARY KEY,         -- ROWID from chat.db
  identifier TEXT NOT NULL,                   -- phone number or email
  service TEXT NOT NULL DEFAULT 'iMessage',   -- iMessage or SMS
  uncanonicalized_id TEXT,
  display_name TEXT,
  UNIQUE(identifier, service)
);

-- Chats (conversations/threads)
CREATE TABLE chats (
  original_rowid INTEGER PRIMARY KEY,
  guid TEXT NOT NULL UNIQUE,
  chat_identifier TEXT,
  display_name TEXT,
  service_name TEXT,
  group_id TEXT,
  is_group BOOLEAN DEFAULT FALSE
);

-- Messages
CREATE TABLE messages (
  original_rowid INTEGER PRIMARY KEY,          -- ROWID from chat.db for dedup
  guid TEXT NOT NULL UNIQUE,
  text TEXT,
  handle_id INTEGER REFERENCES handles(original_rowid),
  date TIMESTAMPTZ NOT NULL,                   -- converted from Apple Core Data format
  date_read TIMESTAMPTZ,
  date_delivered TIMESTAMPTZ,
  is_from_me BOOLEAN NOT NULL DEFAULT FALSE,
  has_attachments BOOLEAN DEFAULT FALSE,
  associated_message_type INTEGER DEFAULT 0,   -- 0=normal, 2000-2005=reactions
  associated_message_guid TEXT,                -- for reactions/tapbacks
  cache_roomnames TEXT,                        -- group chat identifier
  service TEXT,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chat-Handle join (which contacts are in which chats)
CREATE TABLE chat_handle_join (
  chat_id INTEGER NOT NULL REFERENCES chats(original_rowid),
  handle_id INTEGER NOT NULL REFERENCES handles(original_rowid),
  PRIMARY KEY (chat_id, handle_id)
);

-- Chat-Message join (which messages belong to which chats)
CREATE TABLE chat_message_join (
  chat_id INTEGER NOT NULL REFERENCES chats(original_rowid),
  message_id INTEGER NOT NULL REFERENCES messages(original_rowid),
  PRIMARY KEY (chat_id, message_id)
);

-- Attachments
CREATE TABLE attachments (
  original_rowid INTEGER PRIMARY KEY,
  guid TEXT NOT NULL UNIQUE,
  filename TEXT,
  mime_type TEXT,
  total_bytes BIGINT,
  message_id INTEGER REFERENCES messages(original_rowid)
);

-- Ingest watermark (tracks sync progress — singleton row)
CREATE TABLE ingest_watermark (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_message_date TIMESTAMPTZ NOT NULL,
  last_rowid INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (id = 1)
);

-- Indexes for analytics queries
CREATE INDEX idx_messages_date ON messages(date);
CREATE INDEX idx_messages_handle_id ON messages(handle_id);
CREATE INDEX idx_messages_is_from_me ON messages(is_from_me);
CREATE INDEX idx_messages_associated_type ON messages(associated_message_type);
CREATE INDEX idx_handles_identifier ON handles(identifier);
CREATE INDEX idx_chat_message_join_message ON chat_message_join(message_id);
