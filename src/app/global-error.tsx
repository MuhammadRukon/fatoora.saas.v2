'use client';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Last-resort boundary for errors that escape `app/error.tsx`
 * (typically issues with the root layout itself). Must include
 * its own <html> + <body> per Next.js spec.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          padding: 40,
          color: '#111',
          background: '#f7f7f9',
        }}
      >
        <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: '#555', lineHeight: 1.5 }}>
            We hit an unexpected error. Please reload the page, or come back in a few minutes.
          </p>
          {error.digest ? (
            <p style={{ marginTop: 8, fontFamily: 'monospace', fontSize: 12, opacity: 0.7 }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            onClick={() => reset()}
            style={{
              marginTop: 24,
              padding: '10px 16px',
              borderRadius: 8,
              background: '#111',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
