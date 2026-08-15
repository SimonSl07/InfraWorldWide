"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Renders inside the locale layout, so the header, the footer and the
 * language switcher stay on screen. Without it a thrown error replaced the
 * whole page with the framework default and left no way back.
 */
export default function LocaleError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">{t("error.title")}</h1>
      <p className="mt-3 text-ink-soft">{t("error.body")}</p>
      {/* The digest is the only handle on the server-side log line. */}
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-ink-faint">
          {error.digest}
        </p>
      )}
      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="cursor-pointer rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-on-inverse hover:bg-inverse-soft"
        >
          {t("error.retry")}
        </button>
        <Link
          href="/map"
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-soft hover:border-inverse hover:text-ink"
        >
          {t("error.backHome")}
        </Link>
      </div>
    </div>
  );
}
