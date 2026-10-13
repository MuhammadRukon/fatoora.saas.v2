'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalAppError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // We log to console here; the server-side equivalent already
    // captures via the structured logger in jsonError().
    console.error('app.error.boundary', { error: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
      <h1 className="text-3xl font-semibold">Something went wrong</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        An unexpected error occurred while rendering this page. Our team has been notified;
        please try again, or head back home.
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-muted-foreground/70 font-mono">
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="mt-6 flex gap-2">
        <Button onClick={() => reset()}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}
