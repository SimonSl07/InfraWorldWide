import { expectedOpeningMonth, monthIndex } from "./contract";
import { shouldShowFuture } from "./map-filters";
import { ALL_CATEGORIES } from "./map-style";
import { countsTowardNetwork } from "./schema";
import type { Category, CountryRef, Lot, Project } from "./schema";

/**
 * Per-country totals for the map's country panel and the country pages.
 *
 * Everything here is evaluated *at a month*, because the map is a time
 * machine: scrubbing to 2005 must reshuffle the figures and the ranks with
 * it. The state rules deliberately mirror the MapLibre expressions in
 * map-filters.ts — if the two ever disagree, the panel is describing a map
 * the user isn't looking at. country-stats.test.ts pins them together.
 */

/**
 * What a lot is doing in a given month.
 *
 * "unknown" is the fourth case the map also refuses to draw: a lot with a
 * known opening date but no recorded construction start, viewed before it
 * opened. Calling that "planned" would be a guess — the section may well
 * have been a building site — so it is counted nowhere rather than counted
 * wrongly.
 */
export type LotState =
  | "opened"
  | "under_construction"
  | "planned"
  | "unknown";

export interface LotMonths {
  openedMonth: number | null;
  constructionStartMonth: number | null;
  expectedOpeningMonth: number | null;
}

/** The date fields the state rules need, as absolute month indices. */
export function lotMonths(lot: Lot): LotMonths {
  return {
    openedMonth: monthIndex(lot.dates?.opened),
    constructionStartMonth: monthIndex(lot.dates?.constructionStart),
    expectedOpeningMonth: expectedOpeningMonth(lot),
  };
}

/**
 * Whether a lot counts as open in the viewed month. Past its expected
 * opening only counts when looking into the future — otherwise a section
 * running late would silently be recorded as delivered.
 */
function effectivelyOpened(
  months: LotMonths,
  month: number,
  nowMonth: number,
): boolean {
  if (months.openedMonth !== null && months.openedMonth <= month) return true;
  return (
    month > nowMonth &&
    months.expectedOpeningMonth !== null &&
    months.expectedOpeningMonth <= month
  );
}

export function lotStateAt(
  months: LotMonths,
  month: number,
  nowMonth: number,
): LotState {
  if (effectivelyOpened(months, month, nowMonth)) return "opened";
  if (
    months.constructionStartMonth !== null &&
    months.constructionStartMonth <= month
  ) {
    return "under_construction";
  }
  // Not open and not building. Either a recorded start is still ahead, or
  // nothing is recorded at all — both are genuinely not started. What is
  // left is the "unknown" case: an opening date is known but the start is
  // not, so how the lot stood this month is unrecorded.
  return months.constructionStartMonth !== null || months.openedMonth === null
    ? "planned"
    : "unknown";
}

export interface CategoryTotals {
  openedKm: number;
  underConstructionKm: number;
  plannedKm: number;
  /** Lots counted in any of the three buckets above. */
  lots: number;
}

export interface CountrySummary {
  /** ISO 3166-1 alpha-2, lowercase. */
  code: string;
  /** Projects with at least one lot in a visible state this month. */
  projects: number;
  byCategory: Record<Category, CategoryTotals>;
  total: CategoryTotals;
}

function emptyTotals(): CategoryTotals {
  return { openedKm: 0, underConstructionKm: 0, plannedKm: 0, lots: 0 };
}

function add(totals: CategoryTotals, state: LotState, km: number) {
  if (state === "opened") totals.openedKm += km;
  else if (state === "under_construction") totals.underConstructionKm += km;
  else if (state === "planned") totals.plannedKm += km;
  else return; // "unknown" — the map draws nothing, so nothing is counted
  totals.lots += 1;
}

/**
 * Totals per country at a month, one entry per country present in the data.
 *
 * Cancelled lots are skipped: MAP_STATUSES leaves them off the map, and a
 * cancelled section that happens to carry an opening date would otherwise be
 * counted as delivered road.
 *
 * Not-yet-started lots are skipped when viewing the past, because the map
 * hides them there too — a road planned in 2026 was not a planned road in
 * 2005, it was nothing at all. Without this the project count reads the same
 * in every year, which is exactly the sort of figure that quietly
 * contradicts the map beside it.
 */
export function summarizeCountries(
  projects: Project[],
  month: number,
  nowMonth: number,
): CountrySummary[] {
  const summaries = new Map<string, CountrySummary>();
  const countPlanned = shouldShowFuture(month, nowMonth);

  for (const project of projects) {
    let summary = summaries.get(project.country);
    if (!summary) {
      summary = {
        code: project.country,
        projects: 0,
        byCategory: Object.fromEntries(
          ALL_CATEGORIES.map((c) => [c, emptyTotals()]),
        ) as Record<Category, CategoryTotals>,
        total: emptyTotals(),
      };
      summaries.set(project.country, summary);
    }

    let visible = false;
    for (const lot of project.lots) {
      if (lot.status === "cancelled") continue;
      // Track shared with another line is already counted there. This is a
      // network total, and the operators publish it the same way.
      if (!countsTowardNetwork(lot)) continue;
      const state = lotStateAt(lotMonths(lot), month, nowMonth);
      if (state === "unknown") continue;
      if (state === "planned" && !countPlanned) continue;
      visible = true;
      add(summary.byCategory[project.category], state, lot.lengthKm);
      add(summary.total, state, lot.lengthKm);
    }
    if (visible) summary.projects += 1;
  }

  return [...summaries.values()].sort((a, b) => a.code.localeCompare(b.code));
}

/* ── Ranking ──────────────────────────────────────────────────────────── */

export interface Rank {
  /** 1-based position; ties share a position. */
  position: number;
  /** How many countries the position is out of — a "#1" of two is not much. */
  of: number;
}

/**
 * Every metric a country can be ranked on. Category ranks are per category
 * ("third for railways"); the rest are country-wide.
 */
export interface CountryRanks {
  /** Opened km, per category and for all categories together. */
  openedKm: Record<Category | "all", Rank | null>;
  underConstructionKm: Rank | null;
  kmPerArea: Rank | null;
  kmPerCapita: Rank | null;
}

export interface RankedCountry {
  summary: CountrySummary;
  /** Area/population row, absent when data/countries.json has no entry. */
  ref: CountryRef | null;
  /** Opened km per 1,000 km² of territory. Null without a reference row. */
  kmPerArea: number | null;
  /** Opened km per million inhabitants. Null without a reference row. */
  kmPerCapita: number | null;
  ranks: CountryRanks;
}

/**
 * Ranks countries on one metric, best first.
 *
 * Only countries with a positive value are ranked: a country with no
 * railways at all is not "third best for railways", it is simply absent, and
 * saying "#3 of 3" about it would dress a zero up as a placing. Ties share a
 * position (two firsts, then a third).
 */
function rankOn(
  entries: Array<{ code: string; value: number | null }>,
): Map<string, Rank> {
  const measured = entries
    .filter((e): e is { code: string; value: number } => (e.value ?? 0) > 0)
    .sort((a, b) => b.value - a.value);

  const ranks = new Map<string, Rank>();
  let position = 0;
  let previous: number | null = null;
  measured.forEach((entry, i) => {
    if (previous === null || entry.value !== previous) position = i + 1;
    previous = entry.value;
    ranks.set(entry.code, { position, of: measured.length });
  });
  return ranks;
}

/**
 * Summaries with their densities and league positions attached, ordered by
 * opened km (longest network first).
 */
export function rankCountries(
  projects: Project[],
  refs: Record<string, CountryRef>,
  month: number,
  nowMonth: number,
): RankedCountry[] {
  const summaries = summarizeCountries(projects, month, nowMonth);

  const density = (summary: CountrySummary, per: (r: CountryRef) => number) => {
    const ref = refs[summary.code];
    return ref ? summary.total.openedKm / per(ref) : null;
  };
  const kmPerArea = (s: CountrySummary) => density(s, (r) => r.areaKm2 / 1000);
  const kmPerCapita = (s: CountrySummary) =>
    density(s, (r) => r.population / 1_000_000);

  const categoryRanks = Object.fromEntries(
    ALL_CATEGORIES.map((category) => [
      category,
      rankOn(
        summaries.map((s) => ({
          code: s.code,
          value: s.byCategory[category].openedKm,
        })),
      ),
    ]),
  ) as Record<Category, Map<string, Rank>>;

  const allRank = rankOn(
    summaries.map((s) => ({ code: s.code, value: s.total.openedKm })),
  );
  const buildingRank = rankOn(
    summaries.map((s) => ({ code: s.code, value: s.total.underConstructionKm })),
  );
  const areaRank = rankOn(
    summaries.map((s) => ({ code: s.code, value: kmPerArea(s) })),
  );
  const capitaRank = rankOn(
    summaries.map((s) => ({ code: s.code, value: kmPerCapita(s) })),
  );

  return summaries
    .map((summary) => ({
      summary,
      ref: refs[summary.code] ?? null,
      kmPerArea: kmPerArea(summary),
      kmPerCapita: kmPerCapita(summary),
      ranks: {
        openedKm: {
          ...(Object.fromEntries(
            ALL_CATEGORIES.map((c) => [
              c,
              categoryRanks[c].get(summary.code) ?? null,
            ]),
          ) as Record<Category, Rank | null>),
          all: allRank.get(summary.code) ?? null,
        },
        underConstructionKm: buildingRank.get(summary.code) ?? null,
        kmPerArea: areaRank.get(summary.code) ?? null,
        kmPerCapita: capitaRank.get(summary.code) ?? null,
      },
    }))
    .sort((a, b) => b.summary.total.openedKm - a.summary.total.openedKm);
}

/** The ranked entry for one country, or null when it has no projects. */
export function findCountry(
  ranked: RankedCountry[],
  code: string,
): RankedCountry | null {
  return ranked.find((r) => r.summary.code === code) ?? null;
}
