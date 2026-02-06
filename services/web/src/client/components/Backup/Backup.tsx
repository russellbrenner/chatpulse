import { useState } from 'react';
import { uploadDatabase } from '@client/lib/api';

interface BackupProps {
  onUploadComplete?: () => void;
}

/**
 * Backup Manager — upload and manage chat.db files.
 *
 * Currently provides a basic file upload form. Will be expanded to include:
 * - Upload history
 * - Backup scheduling status
 * - Database file management (delete old uploads)
 * - Sync status with the NAS/k3s ingest pipeline
 */
export function Backup({ onUploadComplete }: BackupProps) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    path: string;
    size: number;
    messageCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const response = await uploadDatabase(file);
      setResult(response);
      onUploadComplete?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred during upload',
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
        Backup Manager
      </h2>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        Upload your Apple Messages database (chat.db) to begin exploring and
        analysing your conversations.
      </p>

      {/* Upload form */}
      <div
        style={{
          padding: '2rem',
          border: '2px dashed #ccc',
          borderRadius: '8px',
          textAlign: 'center',
          background: '#fff',
        }}
      >
        <label
          htmlFor="chatdb-upload"
          style={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            background: uploading ? '#999' : '#1a1a2e',
            color: '#fff',
            borderRadius: '8px',
            cursor: uploading ? 'wait' : 'pointer',
            fontWeight: 600,
          }}
        >
          {uploading ? 'Uploading...' : 'Choose chat.db file'}
        </label>
        <input
          id="chatdb-upload"
          type="file"
          accept=".db"
          onChange={handleFileChange}
          disabled={uploading}
          style={{ display: 'none' }}
        />
        <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#888' }}>
          Located at ~/Library/Messages/chat.db on macOS (requires Full Disk
          Access). Maximum file size: 10 MB.
        </p>
      </div>

      {/* Upload result */}
      {result && (
        <div
          style={{
            marginTop: '1rem',
            padding: '1rem',
            background: '#e8f5e9',
            borderRadius: '8px',
            color: '#2e7d32',
          }}
        >
          <strong>Upload successful.</strong>{' '}
          {result.messageCount.toLocaleString('en-AU')} messages found.
          File size: {(result.size / 1024 / 1024).toFixed(2)} MB.
        </div>
      )}

      {/* Error display */}
      {error && (
        <div
          style={{
            marginTop: '1rem',
            padding: '1rem',
            background: '#ffebee',
            borderRadius: '8px',
            color: '#c62828',
          }}
        >
          <strong>Upload failed:</strong> {error}
        </div>
      )}
    </div>
  );
}
