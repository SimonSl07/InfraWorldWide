import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getContractors, getDeflators, getProjects } from "@/lib/data";
import { commonLatestYear, createDeflator } from "@/lib/deflator";
import { createContractorResolver } from "@/lib/contractors";
import { currentMonth } from "@/lib/slip";
import {
  collectLotMetrics,
  coverage,
  deliveredOnTime,
  rankByContractor,
  rankByCountry,
  sortGroups,
  underBudget,
  worstOverruns,
  worstSlips,
  type GroupRanking,
  type LotMetric,
  type OverrunEntry,
  type SlipEntry,
} from "@/lib/rankings";
import {
  formatMonth,
  formatMonths,
  formatMoney,
  formatPercent,
} from "@/lib/format";
import { CATEGORY_COLORS } from "@/lib/map-style";
import type { LocalizedString } from "@/lib/schema";

/** A firm needs a track record, not one anecdote, to be ranked against others. */
const MIN_CONTRACTOR_LOTS = 2;
const TOP_N = 10;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: "rankings" });
  return { title: t("title"), description: t("intro") };
}

/* ── presentation helpers ─────────────────────────────────────────────── */

function Section({
  title,
  help,
  children,
}: {
  title: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <h2 className="text-lg font-semibold">{title}</h2>
      {help && (
        <p className="mt-1 max-w-3xl text-sm text-neutral-500">{help}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SubHeading({ title, help }: { title: string; help?: string }) {
  return (
    <>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h3>
      {help && <p className="mt-1 max-w-3xl text-sm text-neutral-500">{help}</p>}
    </>
  );
}

function Table({
  headers,
  numeric,
  children,
}: {
  headers: string[];
  /** Column indices rendered right-aligned and tabular. */
  numeric?: number[];
  children: React.ReactNode;
}) {
  const right = new Set(numeric ?? []);
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
            {headers.map((h, i) => (
              <th
                key={h + i}
                className={`py-2 pr-4 font-medium ${right.has(i) ? "text-right" : "text-left"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">{children}</tbody>
      </table>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 max-w-3xl rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
      {children}
    </p>
  );
}

/** Right-aligned numeric cell. */
function Num({
  children,
  emphasis,
}: {
  children: React.ReactNode;
  emphasis?: "bad" | "good";
}) {
  const tone =
    emphasis === "bad"
      ? "text-red-700"
      : emphasis === "good"
        ? "text-emerald-700"
        : "";
  return (
    <td className={`py-2 pr-4 text-right tabular-nums ${tone}`}>{children}</td>
  );
}

/* ── page ─────────────────────────────────────────────────────────────── */

export default async function RankingsPage({
  params,
}: PageProps<"/[lang]/rankings">) {
  const { lang } = await params;
  setRequestLocale(lang);
  const t = await getTranslations("rankings");

  const name = (s: LocalizedString) =>
    lang === "ro" && s.ro ? s.ro : s.en;

  const regions = new Intl.DisplayNames([lang], { type: "region" });
  const countryName = (code: string) => {
    try {
      return regions.of(code.toUpperCase()) ?? code.toUpperCase();
    } catch {
      return code.toUpperCase();
    }
  };

  const projects = getProjects();
  const deflators = getDeflators();
  // Newest price year every currency covers, so cross-country figures stay
  // mutually comparable.
  const priceYear = commonLatestYear(deflators) ?? deflators.baseYear;
  const nowMonth = currentMonth(new Date());

  const metrics = collectLotMetrics(projects, {
    deflate: createDeflator(deflators),
    priceYear,
    resolve: createContractorResolver(getContractors()),
    nowMonth,
  });

  const cov = coverage(metrics);
  const contractorGroups = rankByContractor(metrics);
  const countryGroups = rankByCountry(metrics);

  const sectionLink = (m: LotMetric) => (
    <td className="py-2 pr-4">
      <Link
        href={`/projects/${m.projectId}`}
        className="group flex items-baseline gap-2 hover:underline underline-offset-2"
      >
        <span
          className="inline-block h-1 w-3 shrink-0 translate-y-[-2px] rounded-full"
          style={{ backgroundColor: CATEGORY_COLORS[m.category] }}
        />
        <span>
          <span className="text-neutral-500">{name(m.projectName)}</span>
          <span className="text-neutral-400"> — </span>
          <span className="font-medium">{name(m.lotName)}</span>
        </span>
      </Link>
    </td>
  );

  // Both figures are shown as recorded, with their own price year — that is
  // what makes the gap between the real and nominal columns legible.
  const money = (m: { amount: number; currency: string; year: number }) => (
    <>
      {formatMoney(m)}
      <span className="ml-1 text-xs text-neutral-400">{m.year}</span>
    </>
  );

  const overrunRow = (e: OverrunEntry) => (
    <tr key={`${e.metric.projectId}/${e.metric.lotId}`}>
      {sectionLink(e.metric)}
      <Num>{money(e.overrun.baseline)}</Num>
      <Num>{money(e.overrun.actual)}</Num>
      <Num emphasis={e.overrun.pct > 0 ? "bad" : "good"}>
        <span className="font-semibold">{formatPercent(e.overrun.pct)}</span>
      </Num>
      <Num>
        <span className="text-neutral-400">
          {formatPercent(e.overrun.nominalPct)}
        </span>
      </Num>
    </tr>
  );

  const overrunTable = (entries: OverrunEntry[], emptyMessage: string) =>
    entries.length === 0 ? (
      <Empty>{emptyMessage}</Empty>
    ) : (
      <Table
        headers={[
          t("thSection"),
          t("thBaseline"),
          t("thActual"),
          t("thReal"),
          t("thNominal"),
        ]}
        numeric={[1, 2, 3, 4]}
      >
        {entries.map(overrunRow)}
      </Table>
    );

  const slipRow = (e: SlipEntry) => (
    <tr key={`${e.metric.projectId}/${e.metric.lotId}`}>
      {sectionLink(e.metric)}
      <Num>
        {/* The months actually counted from the anchor, so the column reads
            consistently with the contract date beside it. */}
        <span className="text-neutral-500">
          {t("contractMonths", { months: e.slip.baselineMonths })}
        </span>
      </Num>
      <Num>{formatMonth(e.slip.plannedMonth, lang)}</Num>
      <Num>
        {formatMonth(e.slip.referenceMonth, lang)}
        <span className="ml-1 text-xs text-neutral-400">
          {t(
            e.slip.reference === "opened"
              ? "refOpened"
              : e.slip.reference === "expectedOpening"
                ? "refExpectedOpening"
                : "refNow",
          )}
        </span>
      </Num>
      <Num emphasis={e.slip.slipMonths > 0 ? "bad" : "good"}>
        <span className="font-semibold">
          {formatMonths(e.slip.slipMonths, t("unitMonths"))}
        </span>
      </Num>
    </tr>
  );

  const slipTable = (entries: SlipEntry[], emptyMessage = t("emptySlip")) =>
    entries.length === 0 ? (
      <Empty>{emptyMessage}</Empty>
    ) : (
      <Table
        headers={[
          t("thSection"),
          t("thContract"),
          t("thPlanned"),
          t("thCompared"),
          t("thSlip"),
        ]}
        numeric={[1, 2, 3, 4]}
      >
        {entries.map(slipRow)}
      </Table>
    );

  const groupRow = (g: GroupRanking, label: string) => (
    <tr key={g.key}>
      <td className="py-2 pr-4 font-medium">{label}</td>
      <Num>{g.lots}</Num>
      <Num>{Math.round(g.km).toLocaleString(lang)} km</Num>
      <Num emphasis={(g.slip.median ?? 0) > 0 ? "bad" : "good"}>
        {g.slip.median === null
          ? "—"
          : formatMonths(g.slip.median, t("unitMonths"))}
        <span className="ml-1 text-xs text-neutral-400">n={g.slip.n}</span>
      </Num>
      <Num>
        {g.onTimeShare === null
          ? "—"
          : `${Math.round(g.onTimeShare * 100)}%`}
      </Num>
      <Num>
        {g.overrun.estimate.median === null ? (
          "—"
        ) : (
          <>
            {formatPercent(g.overrun.estimate.median)}
            <span className="ml-1 text-xs text-neutral-400">
              n={g.overrun.estimate.n}
            </span>
          </>
        )}
      </Num>
    </tr>
  );

  const groupTable = (
    groups: GroupRanking[],
    firstHeader: string,
    label: (g: GroupRanking) => string,
  ) =>
    groups.length === 0 ? (
      <Empty>{t("emptyGroup")}</Empty>
    ) : (
      <Table
        headers={[
          firstHeader,
          t("thLots"),
          t("thKm"),
          t("thMedianSlip"),
          t("thOnTime"),
          t("thMedianOverrun"),
        ]}
        numeric={[1, 2, 3, 4, 5]}
      >
        {groups.map((g) => groupRow(g, label(g)))}
      </Table>
    );

  // One league table rather than a worst/best pair: with every measured firm
  // currently running late, a "best" table would just be this one reversed
  // and would flatter firms that are merely less late than the rest.
  const contractorLeague = sortGroups(contractorGroups, {
    metric: "slip",
    direction: "worst",
    minLots: MIN_CONTRACTOR_LOTS,
  });

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

      <Section title={t("overrunTitle")}>
        <SubHeading title={t("basisEstimate")} help={t("basisEstimateHelp")} />
        {overrunTable(
          worstOverruns(metrics, "estimate", TOP_N),
          t("emptyOverrunEstimate"),
        )}

        <div className="mt-8">
          <SubHeading title={t("basisAward")} help={t("basisAwardHelp")} />
          {overrunTable(
            worstOverruns(metrics, "award", TOP_N),
            t("emptyOverrunAward"),
          )}
        </div>
      </Section>

      <Section title={t("slipTitle")} help={t("slipIntro")}>
        <SubHeading title={t("slipDelivered")} />
        {slipTable(worstSlips(metrics, { kind: "completed", limit: TOP_N }))}

        <div className="mt-8">
          <SubHeading
            title={t("slipInProgress")}
            help={t("slipInProgressHelp")}
          />
          {slipTable(worstSlips(metrics, { kind: "ongoing", limit: TOP_N }))}
        </div>
      </Section>

      <Section title={t("bestTitle")} help={t("bestIntro")}>
        <SubHeading title={t("bestSlipTitle")} />
        {slipTable(deliveredOnTime(metrics, TOP_N), t("emptyOnTime"))}

        <div className="mt-8">
          <SubHeading title={t("bestOverrunTitle")} />
          {overrunTable(
            underBudget(metrics, "estimate", TOP_N),
            t("emptyUnderBudget"),
          )}
        </div>
      </Section>

      <Section
        title={t("byContractorTitle")}
        help={`${t("byContractorIntro", { min: MIN_CONTRACTOR_LOTS })} ${t("leagueNote")}`}
      >
        {groupTable(contractorLeague, t("thFirm"), (g) => g.label)}
      </Section>

      <Section title={t("byCountryTitle")} help={t("leagueNote")}>
        {groupTable(
          sortGroups(countryGroups, { metric: "slip", direction: "worst" }),
          t("thCountry"),
          (g) => countryName(g.key),
        )}
      </Section>

      <Section title={t("methodologyTitle")}>
        <div className="max-w-3xl space-y-3 text-sm text-neutral-600">
          <p>{t("methodologyCosts")}</p>
          <p>{t("methodologySchedule")}</p>
          <p className="text-neutral-500">
            {t("methodologySource")}:{" "}
            {deflators.sources.map((s, i) => (
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
      </Section>
    </div>
  );
}
