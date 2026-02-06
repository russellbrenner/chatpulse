-- Rollback: drop all ChatPulse tables in reverse dependency order

DROP INDEX IF EXISTS idx_chat_message_join_message;
DROP INDEX IF EXISTS idx_handles_identifier;
DROP INDEX IF EXISTS idx_messages_associated_type;
DROP INDEX IF EXISTS idx_messages_is_from_me;
DROP INDEX IF EXISTS idx_messages_handle_id;
DROP INDEX IF EXISTS idx_messages_date;

DROP TABLE IF EXISTS ingest_watermark;
DROP TABLE IF EXISTS attachments;
DROP TABLE IF EXISTS chat_message_join;
DROP TABLE IF EXISTS chat_handle_join;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS chats;
DROP TABLE IF EXISTS handles;
