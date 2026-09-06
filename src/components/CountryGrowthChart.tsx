import { ALL_CATEGORIES } from "@/lib/map-style";
import { categoryVar } from "@/lib/map-theme";
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
  title,
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
  /**
   * Accessible name, also the caption of the hidden data table. Without it
   * the chart's numbers exist only in `title` attributes, which do not appear
   * on touch devices and are not announced by a screen reader.
   */
  title?: string;
}) {
  const max = Math.max(...buckets.map((b) => b.km), 0);
  if (buckets.length === 0 || max <= 0) return null;

  // Categories that appear at all, so the legend does not list empty ones.
  const present = ALL_CATEGORIES.filter((c) =>
    buckets.some((b) => b.byCategory[c] > 0),
  );

  return (
    <div>
      {/* Full class names on both branches: Tailwind scans source text, so
          an interpolated `gap-${...}` would never make it into the bundle. */}
      <div className={compact ? "" : "relative"}>
        {/* The bars were uncalibrated: no axis and no stated maximum, so a
            tall bar meant nothing in particular. */}
        {!compact && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-56 text-[10px] tabular-nums text-ink-muted"
          >
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-line">
              <span className="bg-surface pr-1">{formatKm(max, locale)}</span>
            </div>
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line">
              <span className="bg-surface pr-1">
                {formatKm(max / 2, locale)}
              </span>
            </div>
          </div>
        )}
        <div
          role="img"
          aria-label={title}
          className={`flex items-end border-b border-line ${compact ? "h-12 gap-px" : "h-56 gap-2"}`}
        >
          {buckets.map((bucket) => (
            <div
              key={bucket.decade}
              className="group flex h-full flex-1 flex-col justify-end"
              title={`${decadeLabel(bucket.decade)}: ${formatKm(bucket.km, locale)}`}
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
                        backgroundColor: categoryVar(category),
                      }}
                      title={`${decadeLabel(bucket.decade)} · ${categoryLabel(category)}: ${formatKm(km, locale)}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* The same figures as text, for touch and for assistive tech. */}
      <table className="sr-only">
        {title && <caption>{title}</caption>}
        <thead>
          <tr>
            {/* Corner cell: the row headers below are the decades. */}
            <td />
            <th scope="col">km</th>
            {present.map((category) => (
              <th key={category} scope="col">
                {categoryLabel(category)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.decade}>
              <th scope="row">{decadeLabel(bucket.decade)}</th>
              <td>{formatKm(bucket.km, locale)}</td>
              {present.map((category) => (
                <td key={category}>
                  {formatKm(bucket.byCategory[category], locale)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {compact ? (
        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-ink-faint">
          <span>{decadeLabel(buckets[0].decade)}</span>
          <span>{decadeLabel(buckets[buckets.length - 1].decade)}</span>
        </div>
      ) : (
        <>
          <div className="mt-1 flex gap-2">
            {buckets.map((bucket) => (
              <div
                key={bucket.decade}
                className="flex-1 text-center text-[11px] tabular-nums text-ink-muted"
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

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
            {present.map((category) => (
              <span key={category} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: categoryVar(category) }}
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
