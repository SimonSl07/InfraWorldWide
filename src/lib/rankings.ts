import {
  attributeLotContractors,
  type AttributedContractor,
  type AttributionOptions,
  type ContractorKind,
  type ContractorResolver,
} from "./contractors";
import {
  computeOverruns,
  type Overrun,
  type OverrunBasis,
  type OverrunOptions,
} from "./overrun";
import { computeSlip, type Slip } from "./slip";
import { monthIndex } from "./contract";
import type {
  Category,
  LocalizedString,
  Money,
  Project,
  Status,
} from "./schema";

/**
 * Delivery-performance rankings: which lots ran over budget or late, and
 * which firms and countries that adds up to.
 *
 * Everything here is derived — a lot only appears in a ranking when the
 * underlying data actually supports the claim, and `coverage()` reports how
 * many lots that was out of how many. Sparse input produces short tables,
 * never filled-in guesses.
 */

export interface LotMetric {
  projectId: string;
  projectName: LocalizedString;
  lotId: string;
  lotName: LocalizedString;
  country: string;
  category: Category;
  status: Status;
  lengthKm: number;
  /**
   * Project that owns this track when it is shared with another line, else
   * null. Such a lot is excluded from every total that spans projects.
   */
  sharedWith: string | null;
  /** Absolute month index the lot opened, null while it has not. */
  openedMonth: number | null;
  /** Null on a basis whose inputs are missing or incomparable. */
  overrun: Record<OverrunBasis, Overrun | null>;
  /**
   * Cost figures exactly as recorded, each in its own currency and price
   * year. The cost tables restate these; the overrun figures above are a
   * different question and are computed separately.
   */
  costs: Record<CostBasis, Money | null>;
  slip: Slip | null;
  contractors: AttributedContractor[];
}

/**
 * Where a cost figure came from, most authoritative first. "award" is the
 * signed contract value, which is a firmer number than a pre-tender
 * estimate but is not what was ultimately paid.
 */
export type CostBasis = "actual" | "award" | "estimate";

export const COST_BASES: CostBasis[] = ["actual", "award", "estimate"];

export interface MetricsOptions extends OverrunOptions {
  resolve: ContractorResolver;
  /** "Now" as an absolute month index, for in-progress slip. */
  nowMonth: number;
  attribution?: AttributionOptions;
}

/** Flattens every lot into its measured outcomes. */
export function collectLotMetrics(
  projects: Project[],
  opts: MetricsOptions,
): LotMetric[] {
  const out: LotMetric[] = [];
  for (const project of projects) {
    for (const lot of project.lots) {
      const overruns = computeOverruns(lot, opts);
      out.push({
        projectId: project.id,
        projectName: project.name,
        lotId: lot.id,
        lotName: lot.name,
        country: project.country,
        category: project.category,
        status: lot.status,
        lengthKm: lot.lengthKm,
        /** Project owning this track, when it is shared with another line. */
        sharedWith: lot.sharedWith ?? null,
        openedMonth: monthIndex(lot.dates?.opened) ?? null,
        overrun: {
          estimate: overruns.estimate.ok ? overruns.estimate.overrun : null,
          award: overruns.award.ok ? overruns.award.overrun : null,
        },
        costs: {
          actual: lot.cost?.actual ?? null,
          award: lot.contract?.value ?? null,
          estimate: lot.cost?.estimated ?? null,
        },
        slip: computeSlip(lot, opts.nowMonth),
        contractors: attributeLotContractors(
          lot.contractors,
          opts.resolve,
          opts.attribution,
        ),
      });
    }
  }
  return out;
}

/** How much of the dataset each metric could actually be computed for. */
export interface Coverage {
  lots: number;
  overrun: Record<OverrunBasis, number>;
  slip: { completed: number; ongoing: number };
}

export function coverage(metrics: LotMetric[]): Coverage {
  return {
    lots: metrics.length,
    overrun: {
      estimate: metrics.filter((m) => m.overrun.estimate).length,
      award: metrics.filter((m) => m.overrun.award).length,
    },
    slip: {
      completed: metrics.filter((m) => m.slip?.kind === "completed").length,
      ongoing: metrics.filter((m) => m.slip?.kind === "ongoing").length,
    },
  };
}

/* ── Lot-level rankings ───────────────────────────────────────────────── */

export interface OverrunEntry {
  metric: LotMetric;
  overrun: Overrun;
}

export interface SlipEntry {
  metric: LotMetric;
  slip: Slip;
}

function overrunEntries(
  metrics: LotMetric[],
  basis: OverrunBasis,
): OverrunEntry[] {
  return metrics.flatMap((metric) => {
    const overrun = metric.overrun[basis];
    return overrun ? [{ metric, overrun }] : [];
  });
}

/** Lots that ran furthest over budget, worst first. */
export function worstOverruns(
  metrics: LotMetric[],
  basis: OverrunBasis,
  limit?: number,
): OverrunEntry[] {
  const sorted = overrunEntries(metrics, basis).sort(
    (a, b) => b.overrun.pct - a.overrun.pct,
  );
  return limit === undefined ? sorted : sorted.slice(0, limit);
}

/** Lots that came in furthest under budget, best first. */
export function bestOverruns(
  metrics: LotMetric[],
  basis: OverrunBasis,
  limit?: number,
): OverrunEntry[] {
  const sorted = overrunEntries(metrics, basis).sort(
    (a, b) => a.overrun.pct - b.overrun.pct,
  );
  return limit === undefined ? sorted : sorted.slice(0, limit);
}

export interface SlipFilter {
  /** Restrict to delivered lots or to lots still running. */
  kind?: Slip["kind"];
  limit?: number;
}

function slipEntries(metrics: LotMetric[], kind?: Slip["kind"]): SlipEntry[] {
  return metrics.flatMap((metric) =>
    metric.slip && (kind === undefined || metric.slip.kind === kind)
      ? [{ metric, slip: metric.slip }]
      : [],
  );
}

/** Lots running furthest past their contract date, worst first. */
export function worstSlips(
  metrics: LotMetric[],
  { kind, limit }: SlipFilter = {},
): SlipEntry[] {
  const sorted = slipEntries(metrics, kind).sort(
    (a, b) => b.slip.slipMonths - a.slip.slipMonths,
  );
  return limit === undefined ? sorted : sorted.slice(0, limit);
}

/**
 * Lots delivered soonest relative to their contract, best first.
 *
 * Defaults to delivered lots: an in-progress lot cannot be called early
 * until it actually opens.
 */
export function bestSlips(
  metrics: LotMetric[],
  { kind = "completed", limit }: SlipFilter = {},
): SlipEntry[] {
  const sorted = slipEntries(metrics, kind).sort(
    (a, b) => a.slip.slipMonths - b.slip.slipMonths,
  );
  return limit === undefined ? sorted : sorted.slice(0, limit);
}

/**
 * Lots that actually met their contract date, soonest first.
 *
 * Unlike `bestSlips` this is not merely the other end of the ordering: a lot
 * only qualifies by being on time or early. When every measured lot ran
 * late this is empty, which is the honest answer.
 */
export function deliveredOnTime(
  metrics: LotMetric[],
  limit?: number,
): SlipEntry[] {
  return bestSlips(
    metrics.filter((m) => m.slip !== null && m.slip.slipMonths <= 0),
    { limit },
  );
}

/** Lots that actually came in at or under budget, cheapest first. */
export function underBudget(
  metrics: LotMetric[],
  basis: OverrunBasis,
  limit?: number,
): OverrunEntry[] {
  return bestOverruns(
    metrics.filter((m) => (m.overrun[basis]?.pct ?? 1) <= 0),
    basis,
    limit,
  );
}

/* ── Group rankings ───────────────────────────────────────────────────── */

export interface GroupStat {
  n: number;
  median: number | null;
  worst: number | null;
  best: number | null;
}

export interface GroupRanking {
  key: string;
  label: string;
  /** Present for contractor groups only. */
  kind?: ContractorKind;
  /** Lots credited to this group. */
  lots: number;
  km: number;
  overrun: Record<OverrunBasis, GroupStat>;
  slip: GroupStat;
  /** Share of delivered lots that opened on or before the contract date. */
  onTimeShare: number | null;
}

/** Median of a numeric list, null when empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stat(values: number[]): GroupStat {
  return {
    n: values.length,
    median: median(values),
    worst: values.length > 0 ? Math.max(...values) : null,
    best: values.length > 0 ? Math.min(...values) : null,
  };
}

function summarize(
  key: string,
  label: string,
  members: LotMetric[],
  kind?: ContractorKind,
): GroupRanking {
  const completed = members.filter((m) => m.slip?.kind === "completed");
  const onTime = completed.filter((m) => m.slip!.slipMonths <= 0);
  return {
    key,
    label,
    ...(kind ? { kind } : {}),
    lots: members.length,
    km: members.reduce((sum, m) => sum + m.lengthKm, 0),
    overrun: {
      estimate: stat(
        members.flatMap((m) => (m.overrun.estimate ? [m.overrun.estimate.pct] : [])),
      ),
      award: stat(
        members.flatMap((m) => (m.overrun.award ? [m.overrun.award.pct] : [])),
      ),
    },
    slip: stat(members.flatMap((m) => (m.slip ? [m.slip.slipMonths] : []))),
    onTimeShare: completed.length > 0 ? onTime.length / completed.length : null,
  };
}

/**
 * Aggregates lots by the firms that built them.
 *
 * A lot counts toward every firm credited with it, so joint-venture work
 * appears under each partner. Firms are returned by default; pass
 * `includeJointVentures` through `collectLotMetrics` to rank pairings too.
 */
export function rankByContractor(metrics: LotMetric[]): GroupRanking[] {
  const groups = new Map<
    string,
    { label: string; kind: ContractorKind; members: LotMetric[] }
  >();

  for (const metric of metrics) {
    for (const contractor of metric.contractors) {
      const group = groups.get(contractor.id) ?? {
        label: contractor.name,
        kind: contractor.kind,
        members: [],
      };
      group.members.push(metric);
      groups.set(contractor.id, group);
    }
  }

  return [...groups].map(([key, g]) =>
    summarize(key, g.label, g.members, g.kind),
  );
}

/**
 * Aggregates lots by country. Labels are ISO codes; the UI localizes them.
 *
 * Shared track is dropped: this is a total across projects, so a tunnel two
 * metro lines run through would otherwise add its length twice.
 */
export function rankByCountry(metrics: LotMetric[]): GroupRanking[] {
  const groups = new Map<string, LotMetric[]>();
  for (const metric of metrics) {
    if (metric.sharedWith !== null) continue;
    const members = groups.get(metric.country) ?? [];
    members.push(metric);
    groups.set(metric.country, members);
  }
  return [...groups].map(([key, members]) => summarize(key, key, members));
}

/* ── Sorting groups ───────────────────────────────────────────────────── */

export type GroupMetric = "slip" | "overrunEstimate" | "overrunAward";

export interface GroupSortOptions {
  metric: GroupMetric;
  /** "worst" puts the largest overrun/delay first; "best" the smallest. */
  direction: "worst" | "best";
  /**
   * Groups measured on fewer lots than this are dropped. A firm with one
   * measured lot is an anecdote, not a track record — but the default is 1
   * so that sparse data still produces a table rather than a blank page.
   */
  minLots?: number;
  limit?: number;
}

function statFor(group: GroupRanking, metric: GroupMetric): GroupStat {
  if (metric === "slip") return group.slip;
  return metric === "overrunEstimate" ? group.overrun.estimate : group.overrun.award;
}

/**
 * Orders groups by a metric's median, dropping those it cannot be measured
 * for. Ties break on sample size, so a firm judged on more lots outranks one
 * judged on fewer.
 */
export function sortGroups(
  groups: GroupRanking[],
  { metric, direction, minLots = 1, limit }: GroupSortOptions,
): GroupRanking[] {
  const measured = groups.filter((g) => {
    const s = statFor(g, metric);
    return s.median !== null && s.n >= minLots;
  });

  const sorted = measured.sort((a, b) => {
    const av = statFor(a, metric).median!;
    const bv = statFor(b, metric).median!;
    if (av !== bv) return direction === "worst" ? bv - av : av - bv;
    return statFor(b, metric).n - statFor(a, metric).n;
  });

  return limit === undefined ? sorted : sorted.slice(0, limit);
}
