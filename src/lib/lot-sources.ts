import type { Lot, Source } from "./schema";

/**
 * Which source backs which section.
 *
 * A project page used to end in a bag of up to sixteen URLs with nothing
 * saying which figure came from which. `lot.sourceRefs` points at entries in
 * the project's own list by id, and `lot.sources` carries anything that
 * belongs to one section alone, so a reader can check a single date without
 * opening everything.
 */

/** Project sources numbered from one, keyed by URL, in the order listed. */
export function numberSources(sources: Source[]): Map<string, number> {
  return new Map(sources.map((source, index) => [source.url, index + 1]));
}

export interface LotCitations {
  /** Project sources this lot points at, in the project's own order. */
  refs: Source[];
  /** Sources recorded on the lot and nowhere else. */
  own: Source[];
  /**
   * Ids that match no project source. Surfaced rather than dropped: a
   * citation pointing nowhere would otherwise be indistinguishable from a
   * section that cites nothing.
   */
  unresolved: string[];
}

export function lotCitations(lot: Lot, projectSources: Source[]): LotCitations {
  const byId = new Map(
    projectSources.filter((s) => s.id !== undefined).map((s) => [s.id!, s]),
  );
  const wanted = new Set(lot.sourceRefs ?? []);

  // Project order, not the order the refs were written in: the list on the
  // page is numbered, and citations have to read in the same sequence.
  const refs = projectSources.filter(
    (s) => s.id !== undefined && wanted.has(s.id),
  );
  const unresolved = [...wanted].filter((id) => !byId.has(id));

  const citedUrls = new Set([
    ...refs.map((s) => s.url),
    ...projectSources.map((s) => s.url),
  ]);
  const own = (lot.sources ?? []).filter((s) => !citedUrls.has(s.url));

  return { refs, own, unresolved };
}
