import type { Rank } from "@/lib/country-stats";

/**
 * A league position, shown as "#2 / 5" rather than a bare "#2": a first
 * place among three countries is worth less than among thirty, and hiding
 * the field size would flatter every early dataset.
 *
 * `compact` drops the field size, for a table whose columns are too narrow
 * to carry it on every cell.
 */
export function RankBadge({
  rank,
  title,
  compact = false,
  className = "px-2 py-0.5 text-xs text-ink-soft",
}: {
  rank: Rank | null;
  title?: string;
  compact?: boolean;
  /** Padding, type size and colour; the map panel sets smaller ones. */
  className?: string;
}) {
  if (!rank) return null;
  return (
    <span
      title={title}
      className={`ml-2 rounded-full bg-surface-raised font-semibold tabular-nums ${className}`}
    >
      #{rank.position}
      {!compact && <span className="text-ink-faint"> / {rank.of}</span>}
    </span>
  );
}
