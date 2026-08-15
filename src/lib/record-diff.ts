/**
 * Comparing a fresh fetch against what is committed.
 *
 * The fetch scripts used to overwrite reviewed data or print a report and
 * nothing else, which left no way to ask the one question a scheduled job
 * needs answered: has the upstream source changed since a human last looked?
 * Every fetch script now reduces its result to a flat record per key and hands
 * both sides to this, so `--diff` prints added, removed and changed rows and
 * `--check` can exit non-zero on any of them.
 *
 * Records are plain objects of scalars or small arrays. Nested values are
 * compared structurally, so a fetched array that happens to be a new instance
 * of the same numbers is not a change.
 */

/**
 * A record is any object of scalars or small arrays. Deliberately not
 * `Record<string, unknown>`: a TypeScript interface has no implicit index
 * signature, so requiring one would shut out every typed record the fetch
 * scripts already declare.
 */
export type Rec = object;

/** Field access on a record, which is keyed by definition. */
function fields(record: Rec): Record<string, unknown> {
  return record as Record<string, unknown>;
}

export interface ChangedRecord<T extends Rec> {
  key: string;
  prev: T;
  next: T;
  /** Names of the fields that differ, sorted. */
  fields: string[];
}

export interface RecordDiff<T extends Rec> {
  added: Array<{ key: string; next: T }>;
  removed: Array<{ key: string; prev: T }>;
  changed: Array<ChangedRecord<T>>;
  unchanged: number;
}

export interface DiffOptions {
  /** Fields that always differ and never matter, e.g. a fetch timestamp. */
  ignore?: string[];
}

/** Structural equality, deep enough for the shallow records used here. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffRecords<T extends Rec>(
  prev: Record<string, T>,
  next: Record<string, T>,
  options: DiffOptions = {},
): RecordDiff<T> {
  const ignore = new Set(options.ignore ?? []);
  const diff: RecordDiff<T> = { added: [], removed: [], changed: [], unchanged: 0 };

  for (const key of Object.keys(next).sort()) {
    const before = prev[key];
    if (before === undefined) {
      diff.added.push({ key, next: next[key] });
      continue;
    }
    const after = next[key];
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((f) => !ignore.has(f))
      .filter((f) => !same(fields(before)[f], fields(after)[f]))
      .sort();
    if (changed.length > 0) {
      diff.changed.push({ key, prev: before, next: after, fields: changed });
    } else {
      diff.unchanged++;
    }
  }

  for (const key of Object.keys(prev).sort()) {
    if (next[key] === undefined) diff.removed.push({ key, prev: prev[key] });
  }

  return diff;
}

export function hasChanges<T extends Rec>(diff: RecordDiff<T>): boolean {
  return diff.added.length + diff.removed.length + diff.changed.length > 0;
}

export interface FormatOptions {
  /** What the records are, for the summary line: "outline", "award notice". */
  label: string;
  /** Longest value printed before it is cut short. */
  maxValueChars?: number;
  /** Fields printed after the key on an added or removed line. */
  summaryFields?: string[];
}

function show(value: unknown, max: number): string {
  const text =
    value === undefined
      ? "(absent)"
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/** A diff a reviewer can read in a CI log or paste into an issue. */
export function formatDiff<T extends Rec>(
  diff: RecordDiff<T>,
  options: FormatOptions,
): string {
  const max = options.maxValueChars ?? 120;
  if (!hasChanges(diff)) {
    return `No change: ${diff.unchanged} ${options.label}(s) identical to what is committed.`;
  }

  const lines: string[] = [];
  for (const { key, next } of diff.added) {
    lines.push(`+ ${key}${summary(next, options, max)}`);
  }
  for (const { key, prev } of diff.removed) {
    lines.push(`- ${key}${summary(prev, options, max)}`);
  }
  for (const entry of diff.changed) {
    lines.push(`~ ${entry.key}`);
    for (const field of entry.fields) {
      const before = show(fields(entry.prev)[field], max);
      const after = show(fields(entry.next)[field], max);
      lines.push(`    ${field}: ${before} -> ${after}`);
    }
  }
  lines.push(
    "",
    `${diff.added.length} added, ${diff.removed.length} removed, ${diff.changed.length} changed, ${diff.unchanged} unchanged`,
  );
  return lines.join("\n");
}

function summary<T extends Rec>(record: T, options: FormatOptions, max: number): string {
  const parts = (options.summaryFields ?? [])
    .filter((f) => fields(record)[f] !== undefined)
    .map((f) => `${f}=${show(fields(record)[f], max)}`);
  return parts.length > 0 ? `  (${parts.join(", ")})` : "";
}
