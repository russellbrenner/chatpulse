-- ChatPulse initial PostgreSQL schema
-- Stores archived iMessage data ingested from macOS chat.db

-- Handles (contacts/phone numbers)
CREATE TABLE handles (
  id SERIAL PRIMARY KEY,
  original_rowid INTEGER NOT NULL,         -- ROWID from chat.db
  identifier TEXT NOT NULL,                -- phone number or email
  service TEXT NOT NULL DEFAULT 'iMessage', -- iMessage or SMS
  display_name TEXT,
  UNIQUE(identifier, service)
);

-- Chats (conversations/threads)
CREATE TABLE chats (
  id SERIAL PRIMARY KEY,
  original_rowid INTEGER NOT NULL,
  guid TEXT NOT NULL UNIQUE,
  chat_identifier TEXT,
  display_name TEXT,
  is_group BOOLEAN DEFAULT FALSE
);

-- Messages
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  original_rowid INTEGER NOT NULL UNIQUE,   -- ROWID from chat.db for dedup
  guid TEXT NOT NULL UNIQUE,
  text TEXT,
  handle_id INTEGER REFERENCES handles(id),
  chat_id INTEGER REFERENCES chats(id),
  date TIMESTAMPTZ NOT NULL,                -- converted from Apple Core Data format
  date_read TIMESTAMPTZ,
  is_from_me BOOLEAN NOT NULL DEFAULT FALSE,
  is_delivered BOOLEAN DEFAULT FALSE,
  is_read BOOLEAN DEFAULT FALSE,
  is_sent BOOLEAN DEFAULT FALSE,
  associated_message_guid TEXT,             -- for reactions/tapbacks
  associated_message_type INTEGER DEFAULT 0, -- 0=normal, 2000-2005=reactions
  cache_roomnames TEXT,                     -- group chat identifier
  balloon_bundle_id TEXT,                   -- message effects, apps
  expressive_send_style_id TEXT,            -- slam, loud, gentle, etc.
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chat-Handle join (which contacts are in which chats)
CREATE TABLE chat_handle_join (
  chat_id INTEGER NOT NULL REFERENCES chats(id),
  handle_id INTEGER NOT NULL REFERENCES handles(id),
  PRIMARY KEY (chat_id, handle_id)
);

-- Attachments
CREATE TABLE attachments (
  id SERIAL PRIMARY KEY,
  original_rowid INTEGER NOT NULL,
  guid TEXT NOT NULL UNIQUE,
  filename TEXT,
  mime_type TEXT,
  total_bytes BIGINT,
  message_id INTEGER REFERENCES messages(id)
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
CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_is_from_me ON messages(is_from_me);
CREATE INDEX idx_messages_associated_type ON messages(associated_message_type);
CREATE INDEX idx_handles_identifier ON handles(identifier);
