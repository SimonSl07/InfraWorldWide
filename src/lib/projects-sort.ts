/**
 * Ordering for the project browser.
 *
 * The sort runs on the localized name and the localized country name, so it
 * is the reader's collation that decides ("Ș" after "S" in Romanian, not
 * after "Z" as a byte comparison would have it). Both are passed in, which
 * keeps this free of next-intl and testable on its own.
 */

export const PROJECT_SORTS = ["name", "length", "country"] as const;
export type ProjectSort = (typeof PROJECT_SORTS)[number];

export const DEFAULT_PROJECT_SORT: ProjectSort = "name";

/** What a row is ordered on, already localized by the caller. */
export interface ProjectSortKey {
  name: string;
  /** Display name, not the code: the reader sorts by what they can read. */
  country: string;
  /**
   * The project's own length. Track shared with another line counts here,
   * because it is genuinely part of this line; only totals that span
   * projects drop it.
   */
  lengthKm: number;
}

export function parseProjectSort(raw: string | null | undefined): ProjectSort {
  return (PROJECT_SORTS as readonly string[]).includes(raw ?? "")
    ? (raw as ProjectSort)
    : DEFAULT_PROJECT_SORT;
}

export function sortProjects<T>(
  rows: readonly T[],
  sort: ProjectSort,
  options: { keyOf: (row: T) => ProjectSortKey; locale: string },
): T[] {
  const { keyOf, locale } = options;
  // Keys are computed once per row rather than once per comparison, and the
  // copy leaves the caller's array untouched.
  const decorated = rows.map((row) => ({ row, key: keyOf(row) }));
  const byName = (a: ProjectSortKey, b: ProjectSortKey) =>
    a.name.localeCompare(b.name, locale);

  decorated.sort((a, b) => {
    if (sort === "length") {
      // Longest first: the question a length sort asks is which is biggest.
      const diff = b.key.lengthKm - a.key.lengthKm;
      if (diff !== 0) return diff;
    }
    if (sort === "country") {
      const diff = a.key.country.localeCompare(b.key.country, locale);
      if (diff !== 0) return diff;
    }
    // Also the tie-break for the other two, so equal lengths never swap
    // places between renders.
    return byName(a.key, b.key);
  });

  return decorated.map((d) => d.row);
}
