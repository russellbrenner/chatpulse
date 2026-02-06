/**
 * Message Explorer — browse conversations and individual messages.
 *
 * Currently a stub. Will be expanded to include:
 * - Chat thread list (sidebar)
 * - Message timeline for selected thread
 * - Search across all messages
 * - Contact details panel
 */
export function Explorer() {
  return (
    <div>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
        Message Explorer
      </h2>
      <p style={{ color: '#666' }}>
        Browse your iMessage conversations here. Select a chat thread from the
        list to view its messages, or search across all conversations.
      </p>
      <div
        style={{
          marginTop: '1.5rem',
          padding: '2rem',
          border: '2px dashed #ddd',
          borderRadius: '8px',
          textAlign: 'center',
          color: '#999',
        }}
      >
        Chat thread list and message viewer will appear here.
      </div>
    </div>
  );
}
