/**
 * Checks on the money figures: whether each can be restated on the common
 * price basis, whether it is the right order of magnitude for its length,
 * and whether a revision chain agrees with the flat field it stands in for.
 */
import type { DeflatorTable, FxTable, Money, Project } from "../schema";
import type { GeometryReport } from "./geometry";

/**
 * Every money figure recorded anywhere on a project, with a label.
 *
 * `lengthKm` travels with the figures that price a section, so the per-km
 * check can read them. A funding share is a slice of whoever pays, not the
 * cost of the section, so it carries none and never enters that check.
 */
export function* moneyOf(
  project: Project,
): Generator<{ where: string; money: Money; lengthKm?: number }> {
  if (project.cost) {
    yield { where: `${project.id}: cost`, money: project.cost };
  }
  for (const lot of project.lots) {
    const at = `${project.id}: lot "${lot.id}"`;
    if (lot.cost?.estimated) {
      yield { where: `${at} cost.estimated`, money: lot.cost.estimated, lengthKm: lot.lengthKm };
    }
    if (lot.cost?.actual) {
      yield { where: `${at} cost.actual`, money: lot.cost.actual, lengthKm: lot.lengthKm };
    }
    const revisions = lot.cost?.revisions ?? [];
    for (let i = 0; i < revisions.length; i++) {
      yield { where: `${at} cost.revisions[${i}]`, money: revisions[i].money, lengthKm: lot.lengthKm };
    }
    if (lot.contract?.value) {
      yield { where: `${at} contract.value`, money: lot.contract.value };
    }
    const funding = lot.funding ?? [];
    for (let i = 0; i < funding.length; i++) {
      const amount = funding[i].amount;
      if (amount) {
        yield { where: `${at} funding[${i}].amount`, money: amount };
      }
    }
  }
}

/**
 * A cost is only comparable if both reference tables reach its price year:
 * the deflator restates it within its currency, then FX converts it at that
 * year's rate. `checkFxCoverage` tests only that the currency key exists, so
 * a 2026 figure in a series that stops at 2025 passed silently and then
 * dropped out of every ranking.
 *
 * Warning, not error: the figure is correctly recorded and correctly
 * sourced. What is missing is a row in a published series nobody has
 * extended yet, and failing the build for that would block unrelated work.
 */
export function checkPriceCoverage(
  deflators: DeflatorTable | null,
  fx: FxTable | null,
  projects: Project[],
): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!deflators || !fx) return { errors, warnings };

  for (const project of projects) {
    for (const { where, money } of moneyOf(project)) {
      // A programme figure is shown as recorded and never ranked, so it
      // needs no year and no conversion path.
      if (money.scope === "programme") continue;

      if (money.year === undefined) {
        warnings.push(
          `${where}: ${money.amount} ${money.currency} has no price year, so it is shown as recorded and never compared`,
        );
        continue;
      }
      const year = String(money.year);
      const missing: string[] = [];
      if (!deflators.series[money.currency]?.index[year]) missing.push("deflator");
      if (money.currency !== fx.base && !fx.rates[money.currency]?.perEur[year]) {
        missing.push("fx");
      }
      if (missing.length > 0) {
        warnings.push(
          `${where}: no ${missing.join(" or ")} entry for ${money.currency} ${year}, so the figure cannot be restated`,
        );
      }
    }
  }
  return { errors, warnings };
}

/**
 * Order-of-magnitude sanity on cost per km.
 *
 * The bands are deliberately loose: a rehabilitated single-track line and a
 * bored metro tunnel are both "railway" and legitimately differ by fifty
 * times, so any band tight enough to judge a sourced figure would be wrong
 * more often than the data. What these catch is a units slip: an amount
 * typed in whole currency rather than millions, or a length in metres, both
 * of which land three orders of magnitude out. Figures with no price year,
 * or in a currency with no rate for that year, are skipped rather than
 * converted at some other year's rate.
 */
const COST_PER_KM_BANDS: Record<string, [number, number]> = {
  highway: [0.5, 100],
  railway: [0.5, 250],
  bridge: [5, 2000],
  tunnel: [5, 2000],
};

export function checkCostPerKm(
  fx: FxTable | null,
  projects: Project[],
): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const project of projects) {
    const band = COST_PER_KM_BANDS[project.category];
    if (!band) continue;
    for (const { where, money, lengthKm } of moneyOf(project)) {
      if (lengthKm === undefined || money.year === undefined) continue;
      if (money.scope === "programme") continue;
      let eur = money.amount;
      if (money.currency !== (fx?.base ?? "EUR")) {
        const rate = fx?.rates[money.currency]?.perEur[String(money.year)];
        if (!rate) continue;
        eur = money.amount / rate;
      }
      const perKm = eur / lengthKm;
      if (perKm < band[0] || perKm > band[1]) {
        warnings.push(
          `${where}: ${perKm.toFixed(1)}M EUR per km is outside the plausible ${band[0]}-${band[1]} band for a ${project.category}; check the units`,
        );
      }
    }
  }
  return { errors, warnings };
}

/**
 * The revision chain has to agree with the flat fields it stands in for.
 * A `sourceRef` that resolves to nothing is an error for the same reason a
 * lot `sourceRef` is. A figure that contradicts the flat field warns rather
 * than fails: both may be sourced, and which one is right is a question for
 * a person, not the build.
 */
export function checkCostRevisions(projects: Project[]): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const project of projects) {
    const ids = new Set(
      project.sources.map((s) => s.id).filter((id): id is string => Boolean(id)),
    );
    for (const lot of project.lots) {
      const revisions = lot.cost?.revisions ?? [];
      for (const revision of revisions) {
        if (revision.sourceRef && !ids.has(revision.sourceRef)) {
          errors.push(
            `${project.id}: lot "${lot.id}" cost revision sourceRef "${revision.sourceRef}" matches no source id`,
          );
        }
      }
      for (const [field, kind] of [
        ["estimated", "estimate"],
        ["actual", "outturn"],
      ] as const) {
        const flat = lot.cost?.[field];
        const chain = revisions.filter((r) => r.kind === kind);
        if (!flat || chain.length === 0) continue;
        const newest = chain.reduce((a, b) => (b.date > a.date ? b : a)).money;
        if (newest.amount !== flat.amount || newest.currency !== flat.currency) {
          warnings.push(
            `${project.id}: lot "${lot.id}" cost.${field} (${flat.amount} ${flat.currency}) disagrees with the newest "${kind}" revision (${newest.amount} ${newest.currency})`,
          );
        }
      }
    }
  }
  return { errors, warnings };
}
