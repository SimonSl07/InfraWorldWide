"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Last resort: an error thrown by the locale layout itself, which the
 * [lang]/error.tsx boundary sits inside and therefore cannot catch. It
 * replaces the whole document, so it renders its own <html> and <body>.
 *
 * The strings are not translated because next-intl's provider lives in
 * the layout this file is replacing. Anything that reaches here has lost
 * the locale along with everything else.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col items-center justify-center bg-surface px-4 py-24 text-center text-ink antialiased">
        <title>Something went wrong</title>
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-3 text-ink-soft">
          This page could not be displayed. Reloading usually fixes it.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-ink-faint">
            {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={() => retry()}
          className="mt-8 cursor-pointer rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-on-inverse hover:bg-inverse-soft"
        >
          Reload
        </button>
      </body>
    </html>
  );
}
