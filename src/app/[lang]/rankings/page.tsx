import { setRequestLocale, getTranslations } from "next-intl/server";
import {
  getContractors,
  getDeflators,
  getFxTable,
  getProjects,
} from "@/lib/data";
import { commonLatestYear, createDeflator } from "@/lib/deflator";
import { createConverter } from "@/lib/fx";
import { createContractorResolver } from "@/lib/contractors";
import { currentMonth } from "@/lib/slip";
import {
  collectLotMetrics,
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
import PerformanceTables, {
  type CostRowData,
  type GroupRow,
  type ProjectCostRowData,
  type SlipRow,
} from "@/components/performance/PerformanceTables";
import type { LocalizedString } from "@/lib/schema";

/** A firm needs a track record, not one anecdote, to be ranked against others. */
const MIN_CONTRACTOR_LOTS = 2;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: "rankings" });
  return { title: t("title"), description: t("intro") };
}

export default async function RankingsPage({
  params,
}: PageProps<"/[lang]/rankings">) {
  const { lang } = await params;
  setRequestLocale(lang);
  const t = await getTranslations("rankings");

  const name = (s: LocalizedString) => (lang === "ro" && s.ro ? s.ro : s.en);

  const projects = getProjects();
  const deflators = getDeflators();
  const fx = getFxTable();
  // Newest price year every currency covers, so cross-country figures stay
  // mutually comparable.
  const priceYear = commonLatestYear(deflators) ?? deflators.baseYear;
  const nowMonth = currentMonth(new Date());
  const deflate = createDeflator(deflators);

  const metrics = collectLotMetrics(projects, {
    deflate,
    priceYear,
    resolve: createContractorResolver(getContractors()),
    nowMonth,
  });

  const costOptions = {
    deflate,
    convert: createConverter(fx),
    priceYear,
  };

  const cov = coverage(metrics);

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
    lotCostRows(metrics, costOptions),
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
    projectCostRows(metrics, costOptions),
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
      <p className="mt-2 max-w-3xl text-neutral-600">{t("intro")}</p>

      <div className="mt-4 max-w-3xl rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
        <p>
          {t("coverage", {
            lots: cov.lots,
            estimate: cov.overrun.estimate,
            award: cov.overrun.award,
            completedSlip: cov.slip.completed,
            ongoingSlip: cov.slip.ongoing,
          })}
        </p>
        <p className="mt-2 text-neutral-500">{t("coverageGap")}</p>
        <p className="mt-2 text-xs text-neutral-400">
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
        <div className="mt-4 max-w-3xl space-y-3 text-sm text-neutral-600">
          <p>{t("methodologyCosts")}</p>
          <p>{t("methodologySchedule")}</p>
          <p className="text-neutral-500">
            {t("methodologySource")}:{" "}
            {[...deflators.sources, ...fx.sources].map((s, i) => (
              <span key={s.url}>
                {i > 0 && ", "}
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-neutral-900"
                >
                  {s.title}
                </a>
              </span>
            ))}
            .
          </p>
        </div>
      </section>
    </div>
  );
}
