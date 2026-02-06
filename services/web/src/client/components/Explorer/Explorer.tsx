/**
 * Message Explorer — browse conversations and individual messages.
 *
 * Two-panel layout:
 * - Left sidebar: searchable list of chat threads
 * - Right panel: scrollable message viewer for the selected chat
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchChats, fetchChatMessages, fetchContacts } from '@client/lib/api';

// ---------------------------------------------------------------------------
// Types (mirror the extraction API response shapes)
// ---------------------------------------------------------------------------

interface ChatRow {
  rowid: number;
  guid: string;
  chat_identifier: string;
  display_name: string | null;
  group_id: string | null;
}

interface ChatListResponse {
  chats: ChatRow[];
  count: number;
}

interface MessageRow {
  rowid: number;
  guid: string;
  text: string | null;
  handle_id: number;
  date_unix: number;
  is_from_me: boolean;
  cache_roomnames: string | null;
  associated_message_guid: string | null;
  associated_message_type: number | null;
}

interface MessageListResponse {
  messages: MessageRow[];
  count: number;
}

interface HandleRow {
  rowid: number;
  id: string;
  service: string;
  uncanonicalized_id: string | null;
}

interface HandleListResponse {
  handles: HandleRow[];
  count: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map handle ROWID -> display identifier (phone number or email). */
type HandleMap = Record<number, string>;

/**
 * Format a Unix timestamp into a human-readable string.
 * Recent messages (< 24 h) show relative time; older messages show a date.
 */
function formatTimestamp(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  // Older than a week — show full date
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

/**
 * Return the display label for a chat row.
 * Prefers display_name; falls back to chat_identifier.
 */
function chatLabel(chat: ChatRow): string {
  return chat.display_name?.trim() || chat.chat_identifier;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Explorer() {
  // Data state
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [handleMap, setHandleMap] = useState<HandleMap>({});

  // UI state
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref for auto-scrolling to the latest message
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // -----------------------------------------------------------
  // Fetch chat list & contacts on mount
  // -----------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadingChats(true);
      setError(null);
      try {
        const [chatData, contactData] = await Promise.all([
          fetchChats<ChatListResponse>(),
          fetchContacts<HandleListResponse>(),
        ]);

        if (cancelled) return;

        setChats(chatData.chats);

        // Build handle lookup
        const map: HandleMap = {};
        for (const h of contactData.handles) {
          map[h.rowid] = h.id;
        }
        setHandleMap(map);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load chats');
        }
      } finally {
        if (!cancelled) setLoadingChats(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // -----------------------------------------------------------
  // Fetch messages when a chat is selected
  // -----------------------------------------------------------

  useEffect(() => {
    if (selectedChatId === null) {
      setMessages([]);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoadingMessages(true);
      setError(null);
      try {
        const data = await fetchChatMessages<MessageListResponse>(selectedChatId!);
        if (!cancelled) {
          setMessages(data.messages);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load messages');
        }
      } finally {
        if (!cancelled) setLoadingMessages(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedChatId]);

  // -----------------------------------------------------------
  // Auto-scroll to bottom when messages load
  // -----------------------------------------------------------

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // -----------------------------------------------------------
  // Filtered chat list
  // -----------------------------------------------------------

  const filteredChats = searchQuery.trim()
    ? chats.filter((c) =>
        chatLabel(c).toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : chats;

  // -----------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------

  const handleSelectChat = useCallback((chatId: number) => {
    setSelectedChatId(chatId);
  }, []);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    [],
  );

  // -----------------------------------------------------------
  // Resolve sender name for a message
  // -----------------------------------------------------------

  function senderName(msg: MessageRow): string {
    if (msg.is_from_me) return 'Me';
    return handleMap[msg.handle_id] ?? `Unknown (${msg.handle_id})`;
  }

  // -----------------------------------------------------------
  // Check whether we should show a date separator between messages
  // -----------------------------------------------------------

  function shouldShowDateSeparator(
    current: MessageRow,
    previous: MessageRow | undefined,
  ): boolean {
    if (!previous) return true;
    const currDate = new Date(current.date_unix * 1000);
    const prevDate = new Date(previous.date_unix * 1000);
    return (
      currDate.getFullYear() !== prevDate.getFullYear() ||
      currDate.getMonth() !== prevDate.getMonth() ||
      currDate.getDate() !== prevDate.getDate()
    );
  }

  function dateSeparatorLabel(msg: MessageRow): string {
    const d = new Date(msg.date_unix * 1000);
    const today = new Date();
    if (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    ) {
      return 'Today';
    }
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (
      d.getFullYear() === yesterday.getFullYear() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getDate() === yesterday.getDate()
    ) {
      return 'Yesterday';
    }
    return d.toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  }

  // -----------------------------------------------------------
  // Selected chat for the header
  // -----------------------------------------------------------

  const selectedChat = chats.find((c) => c.rowid === selectedChatId) ?? null;

  // -----------------------------------------------------------
  // Render
  // -----------------------------------------------------------

  return (
    <div style={styles.container}>
      {/* ------ Sidebar ------ */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h2 style={styles.sidebarTitle}>Conversations</h2>
          <input
            type="text"
            placeholder="Search chats\u2026"
            value={searchQuery}
            onChange={handleSearchChange}
            style={styles.searchInput}
          />
        </div>

        <div style={styles.chatList}>
          {loadingChats ? (
            <div style={styles.centredHint}>Loading chats\u2026</div>
          ) : error && chats.length === 0 ? (
            <div style={styles.centredHint}>{error}</div>
          ) : filteredChats.length === 0 ? (
            <div style={styles.centredHint}>
              {searchQuery ? 'No matching chats' : 'No chats found'}
            </div>
          ) : (
            filteredChats.map((chat) => (
              <button
                key={chat.rowid}
                onClick={() => handleSelectChat(chat.rowid)}
                style={
                  chat.rowid === selectedChatId
                    ? { ...styles.chatItem, ...styles.chatItemActive }
                    : styles.chatItem
                }
              >
                <div style={styles.chatAvatar}>
                  {chatLabel(chat).charAt(0).toUpperCase()}
                </div>
                <div style={styles.chatItemText}>
                  <div style={styles.chatItemName}>{chatLabel(chat)}</div>
                  <div style={styles.chatItemSub}>
                    {chat.chat_identifier}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ------ Message Viewer ------ */}
      <section style={styles.messagePanel}>
        {selectedChat === null ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>💬</div>
            <h3 style={styles.emptyTitle}>No conversation selected</h3>
            <p style={styles.emptySubtitle}>
              Choose a chat from the sidebar to view its messages.
            </p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div style={styles.messageHeader}>
              <div style={styles.headerAvatar}>
                {chatLabel(selectedChat).charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={styles.headerName}>
                  {chatLabel(selectedChat)}
                </div>
                <div style={styles.headerSub}>
                  {selectedChat.chat_identifier}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div style={styles.messageList}>
              {loadingMessages ? (
                <div style={styles.centredHint}>Loading messages\u2026</div>
              ) : error ? (
                <div style={styles.centredHint}>{error}</div>
              ) : messages.length === 0 ? (
                <div style={styles.centredHint}>
                  No messages in this conversation.
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const prevMsg = idx > 0 ? messages[idx - 1] : undefined;
                  const showSeparator = shouldShowDateSeparator(msg, prevMsg);
                  const fromMe = msg.is_from_me;

                  return (
                    <div key={msg.rowid}>
                      {showSeparator && (
                        <div style={styles.dateSeparator}>
                          <span style={styles.dateSeparatorLabel}>
                            {dateSeparatorLabel(msg)}
                          </span>
                        </div>
                      )}
                      <div
                        style={{
                          ...styles.messageRow,
                          justifyContent: fromMe ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <div
                          style={{
                            maxWidth: '70%',
                          }}
                        >
                          {/* Sender label for group chats (non-me messages) */}
                          {!fromMe && selectedChat.group_id && (
                            <div style={styles.senderLabel}>
                              {senderName(msg)}
                            </div>
                          )}
                          <div
                            style={
                              fromMe
                                ? styles.bubbleMe
                                : styles.bubbleOther
                            }
                          >
                            {msg.text ?? (
                              <span style={styles.attachmentPlaceholder}>
                                [Attachment]
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              ...styles.timestamp,
                              textAlign: fromMe ? 'right' : 'left',
                            }}
                          >
                            {formatTimestamp(msg.date_unix)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  // Layout
  container: {
    display: 'flex',
    height: 'calc(100vh - 80px)',
    background: '#f5f5f5',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },

  // Sidebar
  sidebar: {
    width: 280,
    minWidth: 280,
    background: '#fff',
    borderRight: '1px solid #e0e0e0',
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarHeader: {
    padding: '1rem',
    borderBottom: '1px solid #e0e0e0',
  },
  sidebarTitle: {
    fontSize: '1.1rem',
    fontWeight: 700,
    margin: '0 0 0.75rem 0',
    color: '#1a1a2e',
  },
  searchInput: {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '0.875rem',
    outline: 'none',
    boxSizing: 'border-box',
    background: '#f5f5f5',
  },
  chatList: {
    flex: 1,
    overflowY: 'auto',
  },

  // Chat list items
  chatItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    width: '100%',
    padding: '0.75rem 1rem',
    border: 'none',
    borderBottom: '1px solid #f0f0f0',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.15s',
  },
  chatItemActive: {
    background: '#e8eaf6',
  },
  chatAvatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    background: '#1a1a2e',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '0.875rem',
    flexShrink: 0,
  },
  chatItemText: {
    overflow: 'hidden',
    flex: 1,
    minWidth: 0,
  },
  chatItemName: {
    fontWeight: 600,
    fontSize: '0.875rem',
    color: '#222',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  chatItemSub: {
    fontSize: '0.75rem',
    color: '#888',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  // Message panel
  messagePanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: '#f5f5f5',
    minWidth: 0,
  },
  messageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    background: '#fff',
    borderBottom: '1px solid #e0e0e0',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: '#1a1a2e',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '1rem',
    flexShrink: 0,
  },
  headerName: {
    fontWeight: 700,
    fontSize: '1rem',
    color: '#222',
  },
  headerSub: {
    fontSize: '0.8rem',
    color: '#888',
  },

  // Message list
  messageList: {
    flex: 1,
    overflowY: 'auto',
    padding: '1rem',
  },
  messageRow: {
    display: 'flex',
    marginBottom: '0.25rem',
  },

  // Bubbles
  bubbleMe: {
    background: '#007AFF',
    color: '#fff',
    padding: '0.5rem 0.875rem',
    borderRadius: '18px 18px 4px 18px',
    fontSize: '0.9rem',
    lineHeight: 1.4,
    wordBreak: 'break-word',
  },
  bubbleOther: {
    background: '#E5E5EA',
    color: '#000',
    padding: '0.5rem 0.875rem',
    borderRadius: '18px 18px 18px 4px',
    fontSize: '0.9rem',
    lineHeight: 1.4,
    wordBreak: 'break-word',
  },

  // Sender label (group chats)
  senderLabel: {
    fontSize: '0.75rem',
    color: '#666',
    marginBottom: '0.15rem',
    paddingLeft: '0.5rem',
  },

  // Timestamp
  timestamp: {
    fontSize: '0.7rem',
    color: '#999',
    marginTop: '0.15rem',
    paddingLeft: '0.25rem',
    paddingRight: '0.25rem',
  },

  // Date separator
  dateSeparator: {
    display: 'flex',
    justifyContent: 'center',
    margin: '1rem 0',
  },
  dateSeparatorLabel: {
    background: '#e0e0e0',
    color: '#666',
    fontSize: '0.75rem',
    fontWeight: 600,
    padding: '0.2rem 0.75rem',
    borderRadius: '10px',
  },

  // Attachment placeholder
  attachmentPlaceholder: {
    fontStyle: 'italic',
    opacity: 0.7,
  },

  // Empty / loading states
  centredHint: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#999',
    fontSize: '0.9rem',
    padding: '2rem',
    textAlign: 'center',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#999',
  },
  emptyIcon: {
    fontSize: '3rem',
    marginBottom: '1rem',
  },
  emptyTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#555',
    margin: '0 0 0.5rem 0',
  },
  emptySubtitle: {
    fontSize: '0.9rem',
    color: '#888',
    margin: 0,
  },
};
