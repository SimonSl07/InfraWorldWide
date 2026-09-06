"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatKm } from "@/lib/format";
import type { DecadeBucket } from "@/lib/country-growth";

/**
 * Km opened per decade as a bare bar strip — no axes, no labels, just the
 * shape of a country's building history.
 *
 * A decade with no openings is drawn as no bar at all rather than a minimum
 * stub, because a pause in construction is one of the more telling things
 * the series has to say.
 */
export default function Sparkline({
  buckets,
  className = "",
}: {
  buckets: DecadeBucket[];
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations();
  const max = Math.max(...buckets.map((b) => b.km), 0);
  if (max <= 0) return null;

  const label = (b: DecadeBucket) =>
    `${t("country.decade", { decade: String(b.decade) })}: ${formatKm(b.km, locale)}`;

  return (
    <>
      {/* The bars are decoration for a sighted mouse user; the list below
          carries the same figures for touch and assistive tech, which never
          see a title attribute. */}
      <div
        aria-hidden
        className={`flex h-8 items-end gap-px border-b border-line ${className}`}
      >
        {buckets.map((b) => (
          <div
            key={b.decade}
            className="flex-1 rounded-t-sm bg-inverse-soft"
            // Nonzero decades keep a visible floor so a small one still reads
            // as "something happened here".
            style={{
              height: b.km === 0 ? 0 : `${Math.max(6, (b.km / max) * 100)}%`,
            }}
            title={label(b)}
          />
        ))}
      </div>
      <ul className="sr-only">
        {buckets.map((b) => (
          <li key={b.decade}>{label(b)}</li>
        ))}
      </ul>
    </>
  );
}
