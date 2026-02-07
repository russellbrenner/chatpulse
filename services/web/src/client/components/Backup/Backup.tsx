import { useState, useRef, useCallback } from 'react';

interface BackupProps {
  onUploadComplete?: (dbPath: string) => void;
}

interface UploadResult {
  path: string;
  size: number;
  messageCount: number;
}

/** Format bytes into a human-readable string (KB, MB, GB). */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Backup Manager — upload and manage chat.db files.
 *
 * Provides a drag-and-drop upload form with progress tracking,
 * success/error feedback, and file size display.
 */
export function Backup({ onUploadComplete }: BackupProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setProgress(0);
    setResult(null);
    setError(null);
  }, []);

  const handleFileSelected = useCallback((file: File) => {
    resetState();
    setSelectedFile(file);
  }, [resetState]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleFileSelected(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);

    const file = event.dataTransfer.files[0];
    if (!file) return;

    if (!file.name.endsWith('.db')) {
      setError('Please select a .db file (e.g. chat.db).');
      return;
    }

    handleFileSelected(file);
  };

  const handleUpload = () => {
    if (!selectedFile) return;

    setUploading(true);
    setError(null);
    setResult(null);
    setProgress(0);

    const formData = new FormData();
    formData.append('file', selectedFile);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const pct = Math.round((event.loaded / event.total) * 100);
        setProgress(pct);
      }
    });

    xhr.addEventListener('load', () => {
      setUploading(false);

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText) as UploadResult;
          setResult(response);
          onUploadComplete?.(response.path);
        } catch {
          setError('Received an invalid response from the server.');
        }
      } else {
        let message = `Upload failed: ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText) as {
            error?: { message?: string };
          };
          if (body.error?.message) {
            message = body.error.message;
          }
        } catch {
          // Non-JSON error response
        }
        setError(message);
      }
    });

    xhr.addEventListener('error', () => {
      setUploading(false);
      setError('Network error — could not reach the server. Please try again.');
    });

    xhr.addEventListener('abort', () => {
      setUploading(false);
      setError('Upload was cancelled.');
    });

    xhr.open('POST', '/api/upload');
    xhr.send(formData);
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
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

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          ...dropZoneStyle,
          borderColor: dragOver ? '#1a1a2e' : '#ccc',
          background: dragOver ? '#f0f0f8' : '#fff',
        }}
      >
        <div style={{ marginBottom: '1rem', fontSize: '2rem', color: '#999' }}>
          {selectedFile ? '\u2713' : '\u21E7'}
        </div>

        {selectedFile ? (
          <div>
            <p style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
              {selectedFile.name}
            </p>
            <p style={{ fontSize: '0.875rem', color: '#666' }}>
              {formatFileSize(selectedFile.size)}
            </p>
          </div>
        ) : (
          <p style={{ color: '#666' }}>
            Drag and drop your chat.db file here, or click below to browse.
          </p>
        )}

        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            onClick={handleChooseFile}
            disabled={uploading}
            style={{
              ...buttonStyle,
              background: uploading ? '#999' : '#1a1a2e',
              cursor: uploading ? 'not-allowed' : 'pointer',
            }}
          >
            {selectedFile ? 'Choose a different file' : 'Choose chat.db file'}
          </button>

          {selectedFile && !result && (
            <button
              onClick={handleUpload}
              disabled={uploading}
              style={{
                ...buttonStyle,
                background: uploading ? '#999' : '#28a745',
                cursor: uploading ? 'not-allowed' : 'pointer',
              }}
            >
              {uploading ? 'Uploading\u2026' : 'Upload'}
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".db"
          onChange={handleFileChange}
          disabled={uploading}
          style={{ display: 'none' }}
        />

        <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#999' }}>
          Located at ~/Library/Messages/chat.db on macOS (requires Full Disk
          Access). Maximum file size: 1 GB.
        </p>
      </div>

      {/* Progress bar */}
      {uploading && (
        <div style={{ marginTop: '1rem' }}>
          <div style={progressTrackStyle}>
            <div
              style={{
                ...progressBarStyle,
                width: `${progress}%`,
              }}
            />
          </div>
          <p
            style={{
              textAlign: 'center',
              fontSize: '0.875rem',
              color: '#666',
              marginTop: '0.5rem',
            }}
          >
            Uploading\u2026 {progress}%
          </p>
        </div>
      )}

      {/* Upload result */}
      {result && (
        <div style={successStyle}>
          <strong>Upload successful.</strong>{' '}
          {selectedFile && (
            <span>
              File: {selectedFile.name} ({formatFileSize(result.size)}).{' '}
            </span>
          )}
          {result.messageCount >= 0
            ? `${result.messageCount.toLocaleString('en-AU')} messages found.`
            : 'Message count will be determined during processing.'}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div style={errorStyle}>
          <strong>Upload failed:</strong> {error}
        </div>
      )}
    </div>
  );
}

// --- Inline styles ---

const dropZoneStyle: React.CSSProperties = {
  padding: '2rem',
  border: '2px dashed #ccc',
  borderRadius: '8px',
  textAlign: 'center',
  background: '#fff',
  transition: 'border-color 0.2s, background 0.2s',
};

const buttonStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.75rem 1.5rem',
  background: '#1a1a2e',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontWeight: 600,
  fontSize: '0.9rem',
};

const progressTrackStyle: React.CSSProperties = {
  height: '8px',
  background: '#e0e0e0',
  borderRadius: '4px',
  overflow: 'hidden',
};

const progressBarStyle: React.CSSProperties = {
  height: '100%',
  background: '#1a1a2e',
  borderRadius: '4px',
  transition: 'width 0.3s ease',
};

const successStyle: React.CSSProperties = {
  marginTop: '1rem',
  padding: '1rem',
  background: '#e8f5e9',
  borderRadius: '8px',
  color: '#28a745',
};

const errorStyle: React.CSSProperties = {
  marginTop: '1rem',
  padding: '1rem',
  background: '#ffebee',
  borderRadius: '8px',
  color: '#dc3545',
};
