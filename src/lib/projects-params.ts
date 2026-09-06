import { ALL_CATEGORIES } from "./map-style";
import { statusSchema, type Category, type Status } from "./schema";
import {
  DEFAULT_PROJECT_SORT,
  parseProjectSort,
  type ProjectSort,
} from "./projects-sort";

/**
 * The project browser's state as a query string.
 *
 * The map and the country comparison both put their state in the URL, so a
 * view can be linked; the browser kept its filters in component state, and a
 * filtered list could not be shared or reloaded. Param names follow the map's
 * (`c`, `cat`, `st`) so the two pages read alike.
 *
 * Everything here treats the URL as untrusted input: an unknown value is
 * dropped rather than filtering the list down to nothing.
 */

export interface ProjectsParams {
  query: string;
  country: string | null;
  category: Category | null;
  status: Status | null;
  sort: ProjectSort;
}

export function parseProjectsParams(
  search: string,
  options: {
    /** Country codes the list actually contains. */
    countries: Iterable<string>;
    /** Set on a country page, where there is no country picker to answer to. */
    lockedCountry?: string | null;
  },
): ProjectsParams {
  const params = new URLSearchParams(search);
  const known = new Set(options.countries);

  const rawCountry = params.get("c")?.toLowerCase() ?? null;
  const country = options.lockedCountry
    ? options.lockedCountry
    : rawCountry && known.has(rawCountry)
      ? rawCountry
      : null;

  const rawCategory = params.get("cat");
  const rawStatus = params.get("st");

  return {
    query: params.get("q")?.trim() ?? "",
    country,
    category: (ALL_CATEGORIES as readonly string[]).includes(rawCategory ?? "")
      ? (rawCategory as Category)
      : null,
    status: (statusSchema.options as readonly string[]).includes(rawStatus ?? "")
      ? (rawStatus as Status)
      : null,
    sort: parseProjectSort(params.get("sort")),
  };
}

/** The query string for a state, empty when nothing is filtered or sorted. */
export function serializeProjectsParams(
  state: ProjectsParams,
  options: { lockedCountry?: string | null } = {},
): string {
  const params = new URLSearchParams();
  const query = state.query.trim();
  if (query) params.set("q", query);
  // The locked country is in the path already, so repeating it in the query
  // would only make two ways to say the same thing.
  if (state.country && !options.lockedCountry) params.set("c", state.country);
  if (state.category) params.set("cat", state.category);
  if (state.status) params.set("st", state.status);
  if (state.sort !== DEFAULT_PROJECT_SORT) params.set("sort", state.sort);
  return params.toString();
}
