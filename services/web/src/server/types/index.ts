/** Core domain types for the ChatPulse web service. */

/** A single iMessage/SMS message. */
export interface Message {
  id: number;
  /** The unique identifier for the message row (ROWID in chat.db). */
  rowId: number;
  /** Message body text. May be null for attachment-only messages. */
  text: string | null;
  /** ISO 8601 timestamp of when the message was sent or received. */
  date: string;
  /** Whether this message was sent by the local user. */
  isFromMe: boolean;
  /** The handle (phone number or email) of the other party. */
  handleId: string;
  /** Chat identifier this message belongs to. */
  chatId: number;
  /** Whether the message has attachments. */
  hasAttachments: boolean;
  /** Associated message type (for tapbacks/reactions). Null if not a reaction. */
  associatedMessageType: number | null;
}

/** A contact (handle) from the Messages database. */
export interface Contact {
  id: number;
  /** Phone number, email, or other identifier. */
  handleId: string;
  /** Display name resolved from Contacts.app, if available. */
  displayName: string | null;
  /** Total message count for this contact. */
  messageCount: number;
}

/** A chat thread (individual or group). */
export interface Chat {
  id: number;
  /** Chat identifier string (e.g. iMessage;+;chat12345). */
  chatIdentifier: string;
  /** Display name for group chats. Null for 1:1 conversations. */
  displayName: string | null;
  /** Number of participants in the chat. */
  participantCount: number;
  /** ISO 8601 timestamp of the most recent message. */
  lastMessageDate: string | null;
}

/** Result envelope for analysis endpoints. */
export interface AnalysisResult<T = unknown> {
  /** The analysis endpoint that produced this result. */
  endpoint: string;
  /** ISO 8601 timestamp of when the analysis was performed. */
  generatedAt: string;
  /** The analysis payload. */
  data: T;
}

/** Response returned after a successful chat.db upload. */
export interface UploadResponse {
  /** Server-side path where the file was saved. */
  path: string;
  /** File size in bytes. */
  size: number;
  /** Number of messages found in the uploaded database (basic validation). */
  messageCount: number;
}

/** Structured error response format. */
export interface ErrorResponse {
  error: {
    /** Machine-readable error code (e.g. UPLOAD_TOO_LARGE, EXTRACTION_UNAVAILABLE). */
    code: string;
    /** Human-readable error message. */
    message: string;
    /** Optional additional details for debugging. */
    details?: unknown;
  };
}

/** Proxy target configuration for the extraction service. */
export interface ProxyConfig {
  /** Base URL of the extraction service (e.g. http://localhost:8001). */
  baseUrl: string;
  /** Request timeout in milliseconds. */
  timeoutMs: number;
}
