/**
 * Sorting and pagination for the delivery-performance tables.
 *
 * Kept free of React so the ordering rules can be tested directly. Two of
 * them are deliberate and easy to get wrong:
 *
 *  - Sorting is TRI-STATE. A third click clears the sort and restores the
 *    order the table was given, which for these tables is meaningful (worst
 *    first) rather than arbitrary.
 *  - A missing value sorts last in BOTH directions. Treating null as zero
 *    would put unmeasured lots at the top of an "on budget" sort, which
 *    reads as a claim the data does not support.
 */

export type SortDirection = "desc" | "asc";

export interface SortState {
  columnId: string;
  direction: SortDirection;
}

/** Value a column contributes to the ordering. Null means "not measured". */
export type SortValue = number | string | null;

/**
 * The next state in the click cycle: unsorted → descending → ascending →
 * unsorted. Clicking a different column starts that column's cycle fresh.
 *
 * Descending comes first because every column here is a "who is worst"
 * question, and the interesting end is the top.
 */
export function nextSort(
  current: SortState | null,
  columnId: string,
): SortState | null {
  if (current === null || current.columnId !== columnId) {
    return { columnId, direction: "desc" };
  }
  return current.direction === "desc" ? { columnId, direction: "asc" } : null;
}

/**
 * Orders two values, nulls last. Returns the comparison for ASCENDING order;
 * `sortRows` negates it for descending, which is why nulls are handled
 * outside that flip.
 */
function compare(a: SortValue, b: SortValue, locale?: string): number {
  if (a === null || b === null) return 0;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), locale);
}

export interface SortOptions<T> {
  /** Pulls the sorted value out of a row for the active column. */
  valueOf: (row: T, columnId: string) => SortValue;
  locale?: string;
}

/**
 * Returns a sorted copy, or the original order when `sort` is null.
 *
 * Rows whose value is null are held at the end in their original relative
 * order, so an unmeasured row never displaces a measured one.
 */
export function sortRows<T>(
  rows: T[],
  sort: SortState | null,
  { valueOf, locale }: SortOptions<T>,
): T[] {
  if (sort === null) return rows;

  const measured: T[] = [];
  const missing: T[] = [];
  for (const row of rows) {
    (valueOf(row, sort.columnId) === null ? missing : measured).push(row);
  }

  // Array.prototype.sort is stable, so equal values keep the incoming order.
  const sorted = [...measured].sort((a, b) => {
    const result = compare(
      valueOf(a, sort.columnId),
      valueOf(b, sort.columnId),
      locale,
    );
    return sort.direction === "asc" ? result : -result;
  });

  return [...sorted, ...missing];
}

/* ── Pagination ───────────────────────────────────────────────────────── */

/** Pages needed for `total` rows. Always at least 1, so an empty table
 *  still has a page 0 to render rather than a division-by-zero of pages. */
export function pageCount(total: number, perPage: number): number {
  if (perPage <= 0) return 1;
  return Math.max(1, Math.ceil(total / perPage));
}

/** Holds a page index inside the available range. */
export function clampPage(
  page: number,
  total: number,
  perPage: number,
): number {
  return Math.min(Math.max(0, page), pageCount(total, perPage) - 1);
}

/** The rows on a page, clamping the index rather than returning nothing. */
export function pageSlice<T>(rows: T[], page: number, perPage: number): T[] {
  const safe = clampPage(page, rows.length, perPage);
  return rows.slice(safe * perPage, safe * perPage + perPage);
}

/**
 * 1-based inclusive row numbers on a page, for a "showing 11–20 of 34"
 * label. `from` and `to` are 0 on an empty table so the label can be hidden
 * on a falsy check.
 */
export function pageBounds(
  page: number,
  total: number,
  perPage: number,
): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 };
  const safe = clampPage(page, total, perPage);
  return {
    from: safe * perPage + 1,
    to: Math.min(total, safe * perPage + perPage),
  };
}
