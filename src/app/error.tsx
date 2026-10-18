'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surfaces in Vercel function logs; the user only sees the friendly message.
    console.error(error);
  }, [error]);

  return (
    <div className="card mx-auto mt-16 max-w-md p-8 text-center">
      <h1 className="text-lg font-semibold text-ink">This view could not be loaded</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Something went wrong while calculating the numbers. Try again, or go back to the overview.
        {error.digest && <span className="mt-2 block font-mono text-xs">Reference: {error.digest}</span>}
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <button type="button" onClick={reset} className="btn">
          Try again
        </button>
        <Link href="/" className="btn">
          Go to overview
        </Link>
      </div>
    </div>
  );
}
