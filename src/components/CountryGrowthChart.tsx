import { ALL_CATEGORIES, CATEGORY_COLORS } from "@/lib/map-style";
import { formatKm } from "@/lib/format";
import type { DecadeBucket } from "@/lib/country-growth";
import type { Category } from "@/lib/schema";

/**
 * Km opened per decade, stacked by category, as plain CSS boxes.
 *
 * Deliberately not a charting library: the shape is a handful of stacked
 * bars, and a dependency that ships a layout engine to draw them would cost
 * more than the feature. Renders on the server with no client JS.
 */
export default function CountryGrowthChart({
  buckets,
  locale,
  categoryLabel,
  decadeLabel,
  compact = false,
}: {
  buckets: DecadeBucket[];
  locale: string;
  /** Localized category name, passed in so this stays a server component. */
  categoryLabel: (category: Category) => string;
  /**
   * Localized decade name. Romanian says "anii 1990", not "1990s", so the
   * suffix cannot be concatenated in JSX.
   */
  decadeLabel: (decade: number) => string;
  /** Card-sized: shorter, no legend, and only the end decades labelled. */
  compact?: boolean;
}) {
  const max = Math.max(...buckets.map((b) => b.km), 0);
  if (buckets.length === 0 || max <= 0) return null;

  // Categories that appear at all, so the legend does not list empty ones.
  const present = ALL_CATEGORIES.filter((c) =>
    buckets.some((b) => b.byCategory[c] > 0),
  );

  return (
    <div>
      {/* Full class names on both branches — Tailwind scans source text, so
          an interpolated `gap-${...}` would never make it into the bundle. */}
      <div
        className={`flex items-end border-b border-neutral-200 ${compact ? "h-12 gap-px" : "h-56 gap-2"}`}
      >
        {buckets.map((bucket) => (
          <div
            key={bucket.decade}
            className="group flex h-full flex-1 flex-col justify-end"
            title={`${decadeLabel(bucket.decade)} — ${formatKm(bucket.km, locale)}`}
          >
            <div
              className="flex w-full flex-col-reverse justify-start"
              style={{ height: `${(bucket.km / max) * 100}%` }}
            >
              {present.map((category) => {
                const km = bucket.byCategory[category];
                if (km <= 0) return null;
                return (
                  <div
                    key={category}
                    style={{
                      height: `${(km / bucket.km) * 100}%`,
                      backgroundColor: CATEGORY_COLORS[category],
                    }}
                    title={`${decadeLabel(bucket.decade)} · ${categoryLabel(category)} — ${formatKm(km, locale)}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {compact ? (
        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-neutral-400">
          <span>{decadeLabel(buckets[0].decade)}</span>
          <span>{decadeLabel(buckets[buckets.length - 1].decade)}</span>
        </div>
      ) : (
        <>
          <div className="mt-1 flex gap-2">
            {buckets.map((bucket) => (
              <div
                key={bucket.decade}
                className="flex-1 text-center text-[11px] tabular-nums text-neutral-500"
              >
                {/* Every other label on long series, so they never collide,
                    and the full year because these series cross 1900 — a
                    two-digit "00s" would name both that decade and 2000. */}
                {buckets.length > 8 && bucket.decade % 20 !== 0
                  ? ""
                  : bucket.decade}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
            {present.map((category) => (
              <span key={category} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: CATEGORY_COLORS[category] }}
                />
                {categoryLabel(category)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
