import { setRequestLocale, getTranslations } from "next-intl/server";
import {
  getAnalysisContext,
  getDeflators,
  getFxTable,
  getLotMetrics,
} from "@/lib/data";
import { currentMonth } from "@/lib/slip";
import {
  crossProjectMetrics,
  coverage,
  rankByContractor,
  rankByCountry,
  type GroupRanking,
  type LotMetric,
} from "@/lib/rankings";
import {
  lotCostRows,
  openedLots,
  orderByMedianSlip,
  orderDescNullsLast,
  projectCostRows,
} from "@/lib/performance";
import { formatMonth } from "@/lib/format";
import { createLocalizer } from "@/lib/localized";
import { pageMetadata } from "@/lib/page-metadata";
import { ExternalLink } from "@/components/ui/ExternalLink";
import PerformanceTables, {
  type CostRowData,
  type GroupRow,
  type ProjectCostRowData,
  type SlipRow,
} from "@/components/performance/PerformanceTables";

/** A firm needs a track record, not one anecdote, to be ranked against others. */
const MIN_CONTRACTOR_LOTS = 2;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang });
  return pageMetadata({
    locale: lang,
    path: "/rankings",
    title: t("rankings.title"),
    description: t("rankings.intro"),
    siteName: t("site.name"),
  });
}

export default async function RankingsPage({
  params,
}: PageProps<"/[lang]/rankings">) {
  const { lang } = await params;
  setRequestLocale(lang);
  const t = await getTranslations("rankings");

  const name = createLocalizer(lang);

  // Read here only for the sources list and the base currency; the price
  // basis itself comes from the shared context.
  const deflators = getDeflators();
  const fx = getFxTable();
  const nowMonth = currentMonth(new Date());
  const { costOptions, priceYear } = getAnalysisContext(nowMonth);
  const metrics = getLotMetrics(nowMonth);

  const cov = coverage(metrics);

  /**
   * Every table on this page ranks sections against each other across the
   * whole dataset, so lots whose works another project already measures are
   * dropped: a tunnel bored inside an A1 section, or track two metro lines
   * both run on. Cost and kilometres leave together, never one without the
   * other, or the cost per kilometre of everything around them shifts.
   *
   * The group rankings apply the same rule internally; this is the list the
   * per-section tables are built from.
   */
  const crossProject = crossProjectMetrics(metrics);

  /* ── Serialize into plain rows for the client tables ─────────────────── */

  const lotKey = (m: LotMetric) => `${m.projectId}/${m.lotId}`;

  const slipRows: SlipRow[] = openedLots(metrics).map((m) => ({
    key: lotKey(m),
    projectId: m.projectId,
    projectName: name(m.projectName),
    lotName: name(m.lotName),
    country: m.country,
    category: m.category,
    lengthKm: m.lengthKm,
    openedMonth: m.openedMonth!,
    slipMonths: m.slip?.slipMonths ?? null,
    contractMonths: m.slip?.contractMonths ?? null,
  }));

  const costRows: CostRowData[] = orderDescNullsLast(
    lotCostRows(crossProject, costOptions),
    (r) => r.perKm,
  ).map((r) => ({
    key: lotKey(r.metric),
    projectId: r.metric.projectId,
    projectName: name(r.metric.projectName),
    lotName: name(r.metric.lotName),
    country: r.metric.country,
    category: r.metric.category,
    lengthKm: r.metric.lengthKm,
    basis: r.cost.basis,
    recorded: r.cost.recorded,
    comparable: r.cost.comparable?.amount ?? null,
    perKm: r.perKm,
  }));

  const projectRows: ProjectCostRowData[] = orderDescNullsLast(
    projectCostRows(crossProject, costOptions),
    (r) => r.perKm,
  ).map((r) => ({
    key: r.projectId,
    projectId: r.projectId,
    projectName: name(r.projectName),
    country: r.country,
    category: r.category,
    costedLots: r.costedLots,
    totalLots: r.totalLots,
    costedKm: r.costedKm,
    totalKm: r.totalKm,
    comparable: r.total?.amount ?? null,
    perKm: r.perKm,
    complete: r.complete,
  }));

  const groupRow = (g: GroupRanking, countryCode?: string): GroupRow => ({
    key: g.key,
    label: g.label,
    ...(countryCode ? { countryCode } : {}),
    lots: g.lots,
    km: g.km,
    medianSlip: g.slip.median,
    slipN: g.slip.n,
    onTimeShare: g.onTimeShare,
    medianOverrun: g.overrun.estimate.median,
    overrunN: g.overrun.estimate.n,
  });

  const contractorRows = orderByMedianSlip(
    rankByContractor(metrics),
    MIN_CONTRACTOR_LOTS,
  ).map((g) => groupRow(g));

  const countryRows = orderByMedianSlip(rankByCountry(metrics)).map((g) =>
    groupRow(g, g.key),
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-2 max-w-3xl text-ink-soft">{t("intro")}</p>

      <div className="mt-4 max-w-3xl rounded-md border border-line bg-surface-sunken px-4 py-3 text-sm text-ink-soft">
        <p>
          {t("coverage", {
            lots: cov.lots,
            estimate: cov.overrun.estimate,
            award: cov.overrun.award,
            completedSlip: cov.slip.completed,
            ongoingSlip: cov.slip.ongoing,
          })}
        </p>
        <p className="mt-2 text-ink-muted">{t("coverageGap")}</p>
        <p className="mt-2 text-xs text-ink-faint">
          {t("priceYear", { year: priceYear })}{" "}
          {t("asOf", { month: formatMonth(nowMonth, lang) })}
        </p>
      </div>

      <PerformanceTables
        slipRows={slipRows}
        costRows={costRows}
        projectCostRows={projectRows}
        contractorRows={contractorRows}
        countryRows={countryRows}
        baseCurrency={fx.base}
        priceYear={priceYear}
      />

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t("methodologyTitle")}</h2>
        <div className="mt-4 max-w-3xl space-y-3 text-sm text-ink-soft">
          <p>{t("methodologyCosts")}</p>
          <p>{t("methodologySchedule")}</p>
          <p className="text-ink-muted">
            {t("methodologySource")}:{" "}
            {[...deflators.sources, ...fx.sources].map((s, i) => (
              <span key={s.url}>
                {i > 0 && ", "}
                <ExternalLink
                  href={s.url}
                  className="underline underline-offset-2 hover:text-ink"
                >
                  {s.title}
                </ExternalLink>
              </span>
            ))}
            .
          </p>
        </div>
      </section>
    </div>
  );
}
