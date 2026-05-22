'use client';

/**
 * Offline page — shown by service worker when user is offline
 * and no cached version of the requested page exists.
 */

export default function OfflinePage() {
  return (
    <div style={{
      background: '#0f172a', color: 'white',
      fontFamily: 'system-ui, sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', margin: 0, padding: '1rem',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '320px' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🌐</div>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>You&apos;re offline</h1>
        <p style={{ color: '#94a3b8', lineHeight: 1.6 }}>
          LifeSync needs a connection to translate and sync your conversations.
          Check your internet connection and try again.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '1.5rem', padding: '0.75rem 2rem',
            background: '#6366f1', border: 'none', borderRadius: '12px',
            color: 'white', fontSize: '1rem', cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
