import { useState, lazy, Suspense } from 'react';
import { Explorer } from './components/Explorer/Explorer';
import { Backup } from './components/Backup/Backup';

const Analytics = lazy(() =>
  import('./components/Analytics/Analytics').then((m) => ({ default: m.Analytics })),
);

type View = 'explorer' | 'analytics' | 'backup';

/**
 * Main application shell.
 *
 * Provides top-level navigation between the three primary views:
 * Explorer (message browser), Analytics (charts), and Backup (upload/manage).
 *
 * If no database has been loaded, displays a welcome prompt directing
 * the user to upload a chat.db file via the Backup view.
 */
export function App() {
  const [activeView, setActiveView] = useState<View>('explorer');
  const [databaseLoaded, setDatabaseLoaded] = useState(false);

  const handleUploadComplete = () => {
    setDatabaseLoaded(true);
    setActiveView('explorer');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation bar */}
      <nav style={navStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>
            ChatPulse
          </h1>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['explorer', 'analytics', 'backup'] as const).map((view) => (
              <button
                key={view}
                onClick={() => setActiveView(view)}
                style={activeView === view ? activeTabStyle : tabStyle}
              >
                {VIEW_LABELS[view]}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main content area */}
      <main style={{ flex: 1, padding: '1.5rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        {!databaseLoaded && activeView !== 'backup' ? (
          <WelcomePrompt onNavigateToBackup={() => setActiveView('backup')} />
        ) : (
          <>
            {activeView === 'explorer' && <Explorer />}
            {activeView === 'analytics' && (
              <Suspense fallback={<div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>Loading analytics…</div>}>
                <Analytics />
              </Suspense>
            )}
            {activeView === 'backup' && (
              <Backup onUploadComplete={handleUploadComplete} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

const VIEW_LABELS: Record<View, string> = {
  explorer: 'Explorer',
  analytics: 'Analytics',
  backup: 'Backup',
};

/** Shown when no database has been loaded yet. */
function WelcomePrompt({ onNavigateToBackup }: { onNavigateToBackup: () => void }) {
  return (
    <div style={welcomeStyle}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>
        Welcome to ChatPulse
      </h2>
      <p style={{ marginBottom: '1rem', color: '#555' }}>
        To get started, upload your Apple Messages database (chat.db) via the
        Backup page. Once uploaded, you can explore conversations, view analytics,
        and manage backups.
      </p>
      <button onClick={onNavigateToBackup} style={primaryButtonStyle}>
        Upload chat.db
      </button>
    </div>
  );
}

// --- Inline styles (temporary until a proper CSS solution is added) ---

const navStyle: React.CSSProperties = {
  background: '#1a1a2e',
  padding: '0.75rem 1.5rem',
  display: 'flex',
  alignItems: 'center',
};

const tabStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  borderRadius: '6px',
  color: 'rgba(255, 255, 255, 0.7)',
  padding: '0.4rem 1rem',
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: 500,
};

const activeTabStyle: React.CSSProperties = {
  ...tabStyle,
  background: 'rgba(255, 255, 255, 0.15)',
  borderColor: 'rgba(255, 255, 255, 0.4)',
  color: '#fff',
};

const welcomeStyle: React.CSSProperties = {
  textAlign: 'center',
  marginTop: '4rem',
  padding: '2rem',
};

const primaryButtonStyle: React.CSSProperties = {
  background: '#1a1a2e',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  padding: '0.75rem 1.5rem',
  fontSize: '1rem',
  fontWeight: 600,
  cursor: 'pointer',
};
