import { contractMonths, monthIndex } from "./contract";
import type {
  Category,
  DeflatorTable,
  FxTable,
  Lot,
  Money,
  Project,
} from "./schema";

/**
 * Finding the holes in the curated data.
 *
 * Every figure in data/projects comes from a cited source, so a missing one is
 * a research task rather than a bug: nothing here fails a build. What this does
 * is make the list of open research tasks reproducible, which a hand-run
 * spreadsheet never was.
 *
 * The rules are the ones the hand-made data-gaps.csv encoded, plus three the
 * dataset now needs: a price year no deflator or fx series covers (three costs
 * are priced in 2026 and no published series reaches it), a figure with no
 * price year at all, and an expected opening that has come and gone with the
 * lot still unfinished.
 */

export type GapPriority = "high" | "medium" | "low" | "info";

export interface Gap {
  /**
   * Stable key, "<country>/<project>/<lot>/<code>", with "-" where a row is
   * project- or table-level. Entries in data/known-gaps.json match against it,
   * so the code part must not be reworded once published.
   */
  id: string;
  priority: GapPriority;
  country: string;
  project: string;
  lot: string;
  /** Data path the gap is about, e.g. "cost.actual". */
  field: string;
  issue: string;
  detail: string;
  /** File to open, or the reference table that would have to grow. */
  whereToLook: string;
}

export interface GapScanInput {
  projects: Project[];
  deflators: DeflatorTable;
  fx: FxTable;
  /**
   * Today, as "YYYY-MM". Injected rather than read from the clock so the
   * overdue check is a pure function of its inputs.
   */
  today: string;
}

/**
 * Cost-per-km sanity bands, in millions of euro per kilometre of the cost's
 * own price year (nominal, not deflated: a band this wide does not need the
 * precision, and deflating would drop every figure whose year is missing).
 *
 * The bands are order-of-magnitude filters for data-entry errors, not
 * benchmarks. They were calibrated against the 47 committed costs so that the
 * four figures the hand audit had already queried still stand out and nothing
 * else does.
 */
export interface CostBand {
  label: string;
  minPerKm: number;
  maxPerKm: number;
}

export const COST_PER_KM_BANDS: Record<string, CostBand> = {
  // Motorway lots run 2 to 24 M EUR/km here; the Carpathian crossings sit at
  // the top of that.
  highway: { label: "highway", minPerKm: 2, maxPerKm: 40 },
  // Mainline rail rehabilitation is far cheaper per km than new metro, so the
  // two cannot share a band: 1.9 M EUR/km on a line-300 section is normal.
  railway: { label: "railway", minPerKm: 1, maxPerKm: 40 },
  // Tunnelled urban metro. A figure below this is usually a part payment or a
  // single station rather than the section.
  metro: { label: "metro", minPerKm: 20, maxPerKm: 250 },
  // Bridges and tunnels are priced per structure; per km is only a smell test.
  bridge: { label: "bridge", minPerKm: 20, maxPerKm: 600 },
  tunnel: { label: "tunnel", minPerKm: 20, maxPerKm: 600 },
};

/**
 * Which band applies. A railway with a `city` key is a metro line, and costs
 * an order of magnitude more per km than the mainline it is grouped with.
 */
export function bandForProject(project: Project): CostBand {
  if (project.category === "railway" && project.city) {
    return COST_PER_KM_BANDS.metro;
  }
  return COST_PER_KM_BANDS[project.category as Category];
}

/**
 * Last month a partial date still covers, as an absolute month index: "2026"
 * runs to December 2026, "2026-03" to March. A deadline recorded as a bare
 * year is not missed until the year is out, so reading it as January would
 * report every lot due this year as late.
 */
export function periodEndMonth(date: string): number | null {
  const start = monthIndex(date);
  if (start === null) return null;
  return date.length === 4 ? start + 11 : start;
}

/** Path of a project's data file, as the report tells the reader to open it. */
function projectFile(project: Project): string {
  return `data/projects/${project.country}/${project.id.slice(3)}.json`;
}

function formatMoney(money: Money): string {
  const year = money.year === undefined ? "" : ` ${money.year}`;
  const scope = money.scope === undefined ? "" : ` (${money.scope})`;
  return `${money.amount}M ${money.currency}${year}${scope}`;
}

const PRIORITY_RANK: Record<GapPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
  info: 3,
};

/** Ranks a priority for sorting and for "at least this severe" filters. */
export function priorityRank(priority: GapPriority): number {
  return PRIORITY_RANK[priority];
}

interface GapDraft {
  priority: GapPriority;
  country: string;
  project: string;
  lot?: string;
  field: string;
  code: string;
  issue: string;
  detail?: string;
  whereToLook: string;
}

function toGap(draft: GapDraft): Gap {
  const lot = draft.lot ?? "";
  return {
    id: `${draft.country || "-"}/${draft.project}/${lot || "-"}/${draft.code}`,
    priority: draft.priority,
    country: draft.country,
    project: draft.project,
    lot,
    field: draft.field,
    issue: draft.issue,
    detail: draft.detail ?? "",
    whereToLook: draft.whereToLook,
  };
}

/** Every gap in the dataset, sorted by priority then country, project, lot. */
export function findGaps(input: GapScanInput): Gap[] {
  const drafts: GapDraft[] = [];
  const now = monthIndex(input.today);

  for (const project of input.projects) {
    drafts.push(...projectGaps(project));
    for (const lot of project.lots) {
      drafts.push(...lotGaps(project, lot, input, now));
    }
  }
  drafts.push(...coverageGaps(input));

  const gaps = drafts.map(toGap);
  // Stable sort, so the order the checks run in decides the order within a lot.
  return gaps
    .map((gap, i) => ({ gap, i }))
    .sort(
      (a, b) =>
        priorityRank(a.gap.priority) - priorityRank(b.gap.priority) ||
        a.gap.country.localeCompare(b.gap.country) ||
        a.gap.project.localeCompare(b.gap.project) ||
        a.gap.lot.localeCompare(b.gap.lot) ||
        a.i - b.i,
    )
    .map((e) => e.gap);
}

function projectGaps(project: Project): GapDraft[] {
  const out: GapDraft[] = [];
  const where = projectFile(project);
  const base = {
    country: project.country,
    project: project.id,
    whereToLook: where,
  };

  // No outturn anywhere means the whole project is invisible to the delivery
  // rankings, which is worth one row rather than one per lot.
  if (!project.lots.some((lot) => lot.cost?.actual)) {
    out.push({
      ...base,
      priority: "high",
      field: "cost.actual",
      code: "project-no-actual",
      issue: "NO lot in this project has an outturn cost",
      detail: `${project.lots.length} lots`,
    });
  }

  if (project.sources.length === 1) {
    out.push({
      ...base,
      priority: "medium",
      field: "sources",
      code: "single-source",
      issue: "single source only",
      detail: project.sources[0].url,
    });
  }

  if (!project.name.ro) {
    out.push({
      ...base,
      priority: "low",
      field: "name.ro",
      code: "name-ro-missing",
      issue: "missing Romanian name",
    });
  }

  if (!project.description.ro) {
    out.push({
      ...base,
      priority: "low",
      field: "description.ro",
      code: "description-ro-missing",
      issue: "missing Romanian description",
    });
  }

  return out;
}

function lotGaps(
  project: Project,
  lot: Lot,
  input: GapScanInput,
  now: number | null,
): GapDraft[] {
  const out: GapDraft[] = [];
  const base = {
    country: project.country,
    project: project.id,
    lot: lot.id,
    whereToLook: projectFile(project),
  };
  const dates = lot.dates ?? {};
  const cost = lot.cost ?? {};

  // --- dates -------------------------------------------------------------
  if (lot.status === "opened" && !dates.constructionStart) {
    out.push({
      ...base,
      priority: "high",
      field: "dates.constructionStart",
      code: "opened-no-construction-start",
      issue: "opened lot has no construction start",
      detail: dates.opened ? `opened ${dates.opened}` : "",
    });
  }
  if (lot.status === "under_construction" && !dates.constructionStart) {
    out.push({
      ...base,
      priority: "high",
      field: "dates.constructionStart",
      code: "building-no-construction-start",
      issue: "under construction with no start date",
    });
  }
  if (lot.status === "under_construction" && !dates.expectedOpening) {
    out.push({
      ...base,
      priority: "medium",
      field: "dates.expectedOpening",
      code: "building-no-expected-opening",
      issue: "under construction with no expected opening",
      detail: `start ${dates.constructionStart ?? "?"}`,
    });
  }

  // A date that has passed with the work unfinished. Nothing in the committed
  // data is late today, which is exactly why this has to be automatic: eight
  // lots come due during 2026 and the first slip should surface by itself.
  if (
    now !== null &&
    dates.expectedOpening &&
    (lot.status === "under_construction" || lot.status === "tendered")
  ) {
    const due = periodEndMonth(dates.expectedOpening);
    if (due !== null && due < now) {
      out.push({
        ...base,
        priority: "high",
        field: "dates.expectedOpening",
        code: "overdue-expected-opening",
        issue: "expected opening has passed with the lot unfinished",
        detail: `expected ${dates.expectedOpening}, ${now - due} months ago, still ${lot.status}`,
      });
    }
  }

  if (
    (lot.status === "planned" || lot.status === "tendered") &&
    !dates.announced &&
    !dates.expectedOpening
  ) {
    out.push({
      ...base,
      priority: "low",
      field: "dates",
      code: "no-schedule-date",
      issue: `${lot.status} lot has no announced or expected date`,
    });
  }

  if (lot.status === "opened" && !dates.tenderAwarded) {
    out.push({
      ...base,
      priority: "low",
      field: "dates.tenderAwarded",
      code: "no-tender-award",
      issue: "no tender award date",
      detail: dates.opened ? `opened ${dates.opened}` : "",
    });
  }

  // --- cost --------------------------------------------------------------
  if (!cost.estimated && !cost.actual) {
    out.push({
      ...base,
      priority: "high",
      field: "cost",
      code: "no-cost",
      issue: "no cost at all",
      detail: `${lot.lengthKm} km, ${lot.status}`,
    });
  }
  if (lot.status === "opened" && cost.estimated && !cost.actual) {
    out.push({
      ...base,
      priority: "high",
      field: "cost.actual",
      code: "opened-no-actual",
      issue: "opened lot has no outturn cost (blocks overrun ranking)",
      detail: `est ${formatMoney(cost.estimated)}`,
    });
  }
  if (cost.actual && !cost.estimated) {
    out.push({
      ...base,
      priority: "medium",
      field: "cost.estimated",
      code: "no-estimate",
      issue: "actual known but no estimate (blocks overrun ranking)",
      detail: `actual ${formatMoney(cost.actual)}`,
    });
  }

  // An outturn priced years away from the opening is usually the year the
  // contract was signed, mislabelled as the year the money was spent.
  const outturn = cost.actual;
  const pricedIn = outturn?.year;
  if (pricedIn !== undefined && dates.opened) {
    const openedYear = parseInt(dates.opened.slice(0, 4), 10);
    if (Number.isInteger(openedYear) && Math.abs(openedYear - pricedIn) >= 3) {
      out.push({
        ...base,
        priority: "low",
        field: "cost.actual.year",
        code: "price-year-far-from-opening",
        issue:
          "outturn price year far from opening year (check which year the figure is in)",
        detail: `price year ${pricedIn}, opened ${openedYear}`,
      });
    }
  }

  // --- reference-table coverage -----------------------------------------
  const amounts: Array<[string, Money | undefined]> = [
    ["cost.estimated", cost.estimated],
    ["cost.actual", cost.actual],
    ["contract.value", lot.contract?.value],
  ];
  for (const [field, money] of amounts) {
    if (!money) continue;

    // No price year is its own gap, and it blocks both tables at once: there
    // is no year to look an index or a rate up under.
    if (money.year === undefined) {
      out.push({
        ...base,
        priority: "high",
        field,
        code: "no-price-year",
        issue: "cost has no price year (cannot be restated or converted)",
        detail: formatMoney(money),
      });
      continue;
    }

    if (
      input.deflators.series[money.currency]?.index[String(money.year)] ===
      undefined
    ) {
      out.push({
        ...base,
        priority: "high",
        field,
        code: `no-deflator`,
        issue:
          "price year/currency not in deflators.json (cost cannot be restated)",
        detail: formatMoney(money),
        whereToLook: "data/deflators.json",
      });
    }
    if (
      money.currency !== input.fx.base &&
      input.fx.rates[money.currency]?.perEur[String(money.year)] === undefined
    ) {
      out.push({
        ...base,
        priority: "high",
        field,
        code: `no-fx`,
        issue:
          "currency/year missing from fx.json (cost cannot be shown in EUR)",
        detail: formatMoney(money),
        whereToLook: "data/fx.json",
      });
    }
  }

  // --- cost per km -------------------------------------------------------
  // The outturn wins when both are recorded: it is what was actually paid.
  const headline: [string, Money] | null = cost.actual
    ? ["cost.actual", cost.actual]
    : cost.estimated
      ? ["cost.estimated", cost.estimated]
      : null;
  if (headline && bandApplies(headline[1])) {
    const [field, money] = headline;
    const eur = toEuro(money, input.fx);
    const band = bandForProject(project);
    if (eur !== null && band && lot.lengthKm > 0) {
      const perKm = eur / lot.lengthKm;
      const bandText = `${band.label} band ${band.minPerKm}-${band.maxPerKm}`;
      const detail = `${perKm.toFixed(1)} M EUR/km over ${lot.lengthKm} km (${bandText})`;
      if (perKm > band.maxPerKm) {
        out.push({
          ...base,
          priority: "medium",
          field,
          code: "cost-per-km-high",
          issue:
            "cost per km implausibly HIGH for category (may be a whole-programme figure)",
          detail,
        });
      } else if (perKm < band.minPerKm) {
        out.push({
          ...base,
          priority: "medium",
          field,
          code: "cost-per-km-low",
          issue:
            "cost per km implausibly LOW for category (may be a partial figure or a units error)",
          detail,
        });
      }
    }
  }

  // --- attribution -------------------------------------------------------
  if (!lot.contractors?.length) {
    out.push({
      ...base,
      priority: "medium",
      field: "contractors",
      code: "no-contractors",
      issue: "no contractors recorded",
      detail: `${lot.status}, ${lot.lengthKm} km`,
    });
  }
  if (!lot.funding?.length) {
    out.push({
      ...base,
      priority: "medium",
      field: "funding",
      code: "no-funding",
      issue: "no funding source recorded",
      detail: lot.status,
    });
  }
  // Terms, not paperwork: a contract block carrying only a link to the award
  // report explains nothing about how long the lot was given or what it cost,
  // and the delivery figures need both.
  const hasTerms =
    lot.contract !== undefined &&
    (contractMonths(lot.contract) !== null || lot.contract.value !== undefined);
  if (
    !hasTerms &&
    (lot.status === "tendered" || lot.status === "under_construction")
  ) {
    out.push({
      ...base,
      priority: "low",
      field: "contract",
      code: "no-contract-terms",
      issue: "no contract terms (duration/value) for an awarded or ongoing lot",
    });
  }

  if (!lot.name.ro) {
    out.push({
      ...base,
      priority: "low",
      field: "name.ro",
      code: "lot-name-ro-missing",
      issue: "missing Romanian lot name",
    });
  }

  return out;
}

/** Nominal euro of the amount's own price year, or null when unconvertible. */
function toEuro(money: Money, fx: FxTable): number | null {
  if (money.currency === fx.base) return money.amount;
  if (money.year === undefined) return null;
  const rate = fx.rates[money.currency]?.perEur[String(money.year)];
  return rate === undefined ? null : money.amount / rate;
}

/**
 * Whether a per-km band means anything for this figure. A programme total is
 * not the cost of one lot, and a design-only or land-only figure is a fraction
 * of one: both would be flagged for being what they say they are. The scope
 * field records exactly that, so the check defers to it.
 */
function bandApplies(money: Money): boolean {
  return (
    money.scope === undefined ||
    money.scope === "works" ||
    money.scope === "total"
  );
}

/**
 * One row per reference series, recording how far it reaches. These are the
 * rows that make a coverage hole visible before a cost lands on the far side
 * of it, and they are `info`: nothing is missing, the series is just finite.
 */
function coverageGaps(input: GapScanInput): GapDraft[] {
  const out: GapDraft[] = [];

  for (const [currency, series] of Object.entries(input.deflators.series)) {
    const years = Object.keys(series.index)
      .map(Number)
      .sort((a, b) => a - b);
    if (years.length === 0) continue;
    out.push({
      priority: "info",
      country: series.geo,
      project: `deflator:${currency}`,
      field: "index",
      code: "deflator-coverage",
      issue: "series coverage",
      detail: `${years[0]}-${years[years.length - 1]}`,
      whereToLook: "data/deflators.json",
    });
  }

  for (const [currency, series] of Object.entries(input.fx.rates)) {
    const years = Object.keys(series.perEur)
      .map(Number)
      .sort((a, b) => a - b);
    if (years.length === 0) continue;
    out.push({
      priority: "info",
      country: "",
      project: `fx:${currency}`,
      field: "perEur",
      code: "fx-coverage",
      issue: "series coverage",
      detail: `${years[0]}-${years[years.length - 1]}`,
      whereToLook: "data/fx.json",
    });
  }

  return out;
}
