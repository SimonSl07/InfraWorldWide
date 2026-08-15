import { z } from "zod";
import { priorityRank, type Gap, type GapPriority } from "./gaps";

/**
 * Turning a gap list into something to read, and keeping settled dead ends out
 * of it.
 *
 * A gap report is only useful if every row on it is still worth an hour of
 * research. Some are not: Serbian outturn costs are unobtainable for reasons
 * that will not change, and re-listing them every week trains the reader to
 * skim. data/known-gaps.json records those with a reason and a date, and the
 * report hides them unless asked.
 */

export const knownGapSchema = z.object({
  /**
   * A Gap.id of four segments, country/project/lot/code, where a whole segment
   * may be a star to mean "any". A star in the project and lot positions with
   * "rs" in front covers every Serbian lot.
   */
  id: z
    .string()
    .regex(/^[^/]+\/[^/]+\/[^/]+\/[^/]+$/, "expected <country>/<project>/<lot>/<code>"),
  /** Why it is settled. Long enough that nobody has to ask again. */
  reason: z.string().min(20),
  /** Date the dead end was established, YYYY-MM-DD. */
  settledOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Where the finding is written up, when it is written up somewhere. */
  source: z.url().optional(),
});
export type KnownGap = z.infer<typeof knownGapSchema>;

export const knownGapsSchema = z.object({
  note: z.string().min(1),
  entries: z.array(knownGapSchema),
});
export type KnownGaps = z.infer<typeof knownGapsSchema>;

/**
 * Whether a gap id is covered by a known-gap pattern. "*" matches one whole
 * segment and nothing less, so a pattern can never quietly swallow more of the
 * report than it reads as covering.
 */
export function matchesKnownGap(id: string, pattern: string): boolean {
  const idParts = id.split("/");
  const patternParts = pattern.split("/");
  if (idParts.length !== patternParts.length) return false;
  return patternParts.every((part, i) => part === "*" || part === idParts[i]);
}

export interface SuppressedGap {
  gap: Gap;
  known: KnownGap;
}

export interface Partitioned {
  open: Gap[];
  suppressed: SuppressedGap[];
  /** Patterns that matched nothing: either fixed, or the id was reworded. */
  stale: string[];
}

/** Splits the gaps into those still worth chasing and those already settled. */
export function partitionKnown(gaps: Gap[], known: KnownGap[]): Partitioned {
  const open: Gap[] = [];
  const suppressed: SuppressedGap[] = [];
  const used = new Set<string>();

  for (const gap of gaps) {
    const entry = known.find((k) => matchesKnownGap(gap.id, k.id));
    if (entry) {
      used.add(entry.id);
      suppressed.push({ gap, known: entry });
    } else {
      open.push(gap);
    }
  }

  return {
    open,
    suppressed,
    stale: known.filter((k) => !used.has(k.id)).map((k) => k.id),
  };
}

/** Gaps at least as severe as `priority`; everything when it is undefined. */
export function atLeastPriority(gaps: Gap[], priority: GapPriority | undefined): Gap[] {
  if (!priority) return gaps;
  const limit = priorityRank(priority);
  return gaps.filter((gap) => priorityRank(gap.priority) <= limit);
}

const CSV_COLUMNS = [
  "priority",
  "country",
  "project",
  "lot",
  "field",
  "issue",
  "detail",
  "whereToLook",
  "id",
] as const;

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The columns the hand-made data-gaps.csv had, in that order, plus the id a
 * known-gaps entry is written against.
 */
export function toCsv(gaps: Gap[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const gap of gaps) {
    lines.push(CSV_COLUMNS.map((c) => csvCell(gap[c])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export interface JsonReport {
  generatedAt: string;
  gaps: Gap[];
  suppressed?: Array<{ gap: Gap; reason: string }>;
}

export function toJson(report: JsonReport): string {
  const byPriority: Partial<Record<GapPriority, number>> = {};
  for (const gap of report.gaps) {
    byPriority[gap.priority] = (byPriority[gap.priority] ?? 0) + 1;
  }
  return `${JSON.stringify(
    {
      generatedAt: report.generatedAt,
      total: report.gaps.length,
      byPriority,
      gaps: report.gaps,
      suppressed: report.suppressed ?? [],
    },
    null,
    2,
  )}\n`;
}

const PRIORITY_ORDER: GapPriority[] = ["high", "medium", "low", "info"];

/** A fixed-width block per priority, for reading in a terminal. */
export function toTable(gaps: Gap[]): string {
  if (gaps.length === 0) return "No gaps found.";

  const blocks: string[] = [];
  for (const priority of PRIORITY_ORDER) {
    const rows = gaps.filter((g) => g.priority === priority);
    if (rows.length === 0) continue;

    const cells = rows.map((g) => [
      `${g.project}${g.lot ? `/${g.lot}` : ""}`,
      g.field,
      g.issue,
      g.detail,
    ]);
    const widths = [0, 1, 2].map((i) =>
      Math.min(48, Math.max(...cells.map((c) => c[i].length))),
    );
    const lines = cells.map((c) =>
      [
        c[0].padEnd(widths[0]),
        c[1].padEnd(widths[1]),
        c[2].padEnd(widths[2]),
        c[3],
      ]
        .join("  ")
        .trimEnd(),
    );
    blocks.push(`${priority.toUpperCase()} (${rows.length})\n${lines.map((l) => `  ${l}`).join("\n")}`);
  }
  return blocks.join("\n\n");
}

export interface SummaryRow {
  priority: GapPriority;
  field: string;
  issue: string;
  count: number;
}

/** Counts by priority, field and issue, biggest bucket first. */
export function summarise(gaps: Gap[]): SummaryRow[] {
  const buckets = new Map<string, SummaryRow>();
  for (const gap of gaps) {
    const key = `${gap.priority}|${gap.field}|${gap.issue}`;
    const row = buckets.get(key);
    if (row) row.count++;
    else {
      buckets.set(key, {
        priority: gap.priority,
        field: gap.field,
        issue: gap.issue,
        count: 1,
      });
    }
  }
  return [...buckets.values()].sort(
    (a, b) => b.count - a.count || priorityRank(a.priority) - priorityRank(b.priority),
  );
}
