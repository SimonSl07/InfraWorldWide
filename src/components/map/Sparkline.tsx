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

  return (
    <div
      className={`flex h-8 items-end gap-px border-b border-neutral-200 ${className}`}
    >
      {buckets.map((b) => (
        <div
          key={b.decade}
          className="flex-1 rounded-t-sm bg-neutral-700"
          // Nonzero decades keep a visible floor so a small one still reads
          // as "something happened here".
          style={{ height: b.km === 0 ? 0 : `${Math.max(6, (b.km / max) * 100)}%` }}
          title={`${t("country.decade", { decade: String(b.decade) })}: ${formatKm(b.km, locale)}`}
        />
      ))}
    </div>
  );
}
