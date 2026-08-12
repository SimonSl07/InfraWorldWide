import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  getContractors,
  getCountries,
  getCountryTable,
  getDeflators,
  getProjects,
} from "@/lib/data";
import { commonLatestYear, createDeflator } from "@/lib/deflator";
import { createContractorResolver } from "@/lib/contractors";
import { currentMonth } from "@/lib/slip";
import {
  collectLotMetrics,
  rankByCountry,
  worstOverruns,
  worstSlips,
  type LotMetric,
} from "@/lib/rankings";
import { findCountry, rankCountries, type Rank } from "@/lib/country-stats";
import { openedKmByDecade, peakDecade } from "@/lib/country-growth";
import { countryName, flagEmoji } from "@/lib/country-names";
import { getOpenings } from "@/lib/timeline";
import {
  formatDate,
  formatKm,
  formatMonth,
  formatMonths,
  formatMoney,
  formatPercent,
} from "@/lib/format";
import { ALL_CATEGORIES, CATEGORY_COLORS } from "@/lib/map-style";
import type { Category, LocalizedString } from "@/lib/schema";
import CountryGrowthChart from "@/components/CountryGrowthChart";
import CountryMiniMap from "@/components/map/CountryMiniMap";
import ProjectsBrowser from "@/components/ProjectsBrowser";

const TOP_N = 5;

export function generateStaticParams() {
  // Locales are enumerated by the parent [lang] layout.
  return getCountries().map((code) => ({ code }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; code: string }>;
}) {
  const { lang, code } = await params;
  if (!getCountries().includes(code)) return {};
  const t = await getTranslations({ locale: lang, namespace: "country" });
  return {
    title: countryName(code, lang),
    description: t("metaDescription", { country: countryName(code, lang) }),
  };
}

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
      {help && <p className="mt-1 max-w-3xl text-sm text-neutral-500">{help}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-3xl rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
      {children}
    </p>
  );
}

/** "#2 / 5" — see the note on RankChip in CountryPanel. */
function RankBadge({ rank }: { rank: Rank | null }) {
  if (!rank) return null;
  return (
    <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-neutral-600">
      #{rank.position}
      <span className="text-neutral-400"> / {rank.of}</span>
    </span>
  );
}

export default async function CountryPage({
  params,
}: PageProps<"/[lang]/countries/[code]">) {
  const { lang, code } = await params;
  setRequestLocale(lang);
  const t = await getTranslations();

  if (!getCountries().includes(code)) notFound();

  const name = (s: LocalizedString) => (lang === "ro" && s.ro ? s.ro : s.en);
  const categoryLabel = (category: Category) => t(`category.${category}`);
  // A string, so ICU does not group the year into "1,970".
  const decadeLabel = (decade: number) =>
    t("country.decade", { decade: String(decade) });
  const label = countryName(code, lang);

  const projects = getProjects();
  const countryProjects = projects.filter((p) => p.country === code);
  const table = getCountryTable();
  const nowMonth = currentMonth(new Date());

  const ranked = rankCountries(projects, table.countries, nowMonth, nowMonth);
  const country = findCountry(ranked, code);
  if (!country) notFound();
  const { summary, ranks, ref } = country;

  const growth = openedKmByDecade(projects, code);
  const peak = peakDecade(growth);

  // Delivery performance, on the same basis as /rankings so the two pages
  // cannot disagree about the same lot.
  const deflators = getDeflators();
  const priceYear = commonLatestYear(deflators) ?? deflators.baseYear;
  const metrics = collectLotMetrics(projects, {
    deflate: createDeflator(deflators),
    priceYear,
    resolve: createContractorResolver(getContractors()),
    nowMonth,
  });
  const countryMetrics = metrics.filter((m) => m.country === code);
  const league = rankByCountry(metrics).find((g) => g.key === code) ?? null;

  const { past, scheduled } = getOpenings(countryProjects);

  const sectionLabel = (m: LotMetric) => (
    <Link
      href={`/projects/${m.projectId}`}
      className="flex items-baseline gap-2 hover:underline underline-offset-2"
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
  );

  const headline = [
    {
      label: t("country.totalOpened"),
      value: formatKm(summary.total.openedKm, lang),
      rank: ranks.openedKm.all,
    },
    {
      label: t("country.underConstruction"),
      value: formatKm(summary.total.underConstructionKm, lang),
      rank: ranks.underConstructionKm,
    },
    {
      // Title-cased: this sits beside "Total open", not inline in a sentence.
      label: t("country.plannedTitle"),
      value: formatKm(summary.total.plannedKm, lang),
      rank: null,
    },
    {
      label: t("country.projects"),
      value: String(summary.projects),
      rank: null,
    },
  ];

  const categories = ALL_CATEGORIES.map((category) => ({
    category,
    totals: summary.byCategory[category],
    rank: ranks.openedKm[category],
  })).filter((c) => c.totals.lots > 0);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <Link
        href="/countries"
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        ← {t("country.backToCountries")}
      </Link>

      <h1 className="mt-4 flex items-center gap-3 text-3xl font-bold">
        <span aria-hidden>{flagEmoji(code)}</span>
        {label}
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        {t("country.asOf", { month: formatMonth(nowMonth, lang) })}
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {headline.map((item) => (
          <div key={item.label}>
            <dt className="text-sm text-neutral-500">{item.label}</dt>
            <dd className="mt-1 flex items-baseline text-2xl font-bold tabular-nums">
              {item.value}
              <RankBadge rank={item.rank} />
            </dd>
          </div>
        ))}
      </dl>

      {(country.kmPerArea !== null || country.kmPerCapita !== null) && (
        <div className="mt-6 max-w-3xl rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {country.kmPerArea !== null && (
              <span>
                {t("country.perArea")}:{" "}
                <span className="font-semibold tabular-nums">
                  {country.kmPerArea.toFixed(1)}
                </span>
                <RankBadge rank={ranks.kmPerArea} />
              </span>
            )}
            {country.kmPerCapita !== null && (
              <span>
                {t("country.perCapita")}:{" "}
                <span className="font-semibold tabular-nums">
                  {country.kmPerCapita.toFixed(1)}
                </span>
                <RankBadge rank={ranks.kmPerCapita} />
              </span>
            )}
          </div>
          {ref && (
            <p className="mt-2 text-xs text-neutral-500">
              {t("country.densityBasis", {
                area: ref.areaKm2.toLocaleString(lang),
                population: ref.population.toLocaleString(lang),
                date: formatDate(ref.populationDate, lang),
              })}
              {ref.note ? ` ${name(ref.note)}` : ""}
            </p>
          )}
        </div>
      )}

      <Section title={t("country.byCategory")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map(({ category, totals, rank }) => (
            <div
              key={category}
              className="rounded-xl border border-neutral-200 p-4"
            >
              <div
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: CATEGORY_COLORS[category] }}
              >
                {categoryLabel(category)}
              </div>
              <div className="mt-1 flex items-baseline text-xl font-bold tabular-nums">
                {formatKm(totals.openedKm, lang)}
                <RankBadge rank={rank} />
              </div>
              <div className="mt-1 space-y-0.5 text-xs text-neutral-500">
                {totals.underConstructionKm > 0 && (
                  <div>
                    {t("country.building")}{" "}
                    <span className="tabular-nums">
                      {formatKm(totals.underConstructionKm, lang)}
                    </span>
                  </div>
                )}
                {totals.plannedKm > 0 && (
                  <div>
                    {t("country.planned")}{" "}
                    <span className="tabular-nums">
                      {formatKm(totals.plannedKm, lang)}
                    </span>
                  </div>
                )}
                <div>{t("country.lots", { count: totals.lots })}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title={t("country.growthTitle")}
        help={
          peak
            ? t("country.growthPeak", {
                decade: String(peak.decade),
                km: formatKm(peak.km, lang),
              })
            : undefined
        }
      >
        {growth.length === 0 ? (
          <Empty>{t("country.growthEmpty")}</Empty>
        ) : (
          <CountryGrowthChart
            buckets={growth}
            locale={lang}
            categoryLabel={categoryLabel}
            decadeLabel={decadeLabel}
          />
        )}
      </Section>

      <Section title={t("country.mapTitle")}>
        <CountryMiniMap country={code} />
      </Section>

      <Section
        title={t("country.deliveryTitle")}
        help={t("country.deliveryIntro")}
      >
        {league === null ? (
          <Empty>{t("country.deliveryEmpty")}</Empty>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <div>
                <dt className="text-sm text-neutral-500">
                  {t("rankings.thMedianSlip")}
                </dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">
                  {league.slip.median === null
                    ? "—"
                    : formatMonths(league.slip.median, t("rankings.unitMonths"))}
                  <span className="ml-1 text-xs font-normal text-neutral-400">
                    n={league.slip.n}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-neutral-500">
                  {t("rankings.thOnTime")}
                </dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">
                  {league.onTimeShare === null
                    ? "—"
                    : `${Math.round(league.onTimeShare * 100)}%`}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-neutral-500">
                  {t("rankings.thMedianOverrun")}
                </dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">
                  {league.overrun.estimate.median === null
                    ? "—"
                    : formatPercent(league.overrun.estimate.median)}
                  <span className="ml-1 text-xs font-normal text-neutral-400">
                    n={league.overrun.estimate.n}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-neutral-500">
                  {t("rankings.thLots")}
                </dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">
                  {league.lots}
                </dd>
              </div>
            </dl>

            <div className="mt-8 grid gap-8 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  {t("country.worstSlips")}
                </h3>
                {worstSlips(countryMetrics, { limit: TOP_N }).length === 0 ? (
                  <p className="mt-2 text-sm text-neutral-400">—</p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {worstSlips(countryMetrics, { limit: TOP_N }).map((e) => (
                      <li
                        key={`${e.metric.projectId}/${e.metric.lotId}`}
                        className="flex items-baseline justify-between gap-3"
                      >
                        <span className="min-w-0">
                          {sectionLabel(e.metric)}
                        </span>
                        <span
                          className={`shrink-0 tabular-nums font-semibold ${e.slip.slipMonths > 0 ? "text-red-700" : "text-emerald-700"}`}
                        >
                          {formatMonths(
                            e.slip.slipMonths,
                            t("rankings.unitMonths"),
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                  {t("country.worstOverruns")}
                </h3>
                {worstOverruns(countryMetrics, "estimate", TOP_N).length ===
                0 ? (
                  <p className="mt-2 text-sm text-neutral-400">
                    {t("country.noOverrunData")}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-1.5 text-sm">
                    {worstOverruns(countryMetrics, "estimate", TOP_N).map(
                      (e) => (
                        <li
                          key={`${e.metric.projectId}/${e.metric.lotId}`}
                          className="flex items-baseline justify-between gap-3"
                        >
                          <span className="min-w-0">
                            {sectionLabel(e.metric)}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            <span className="text-neutral-400">
                              {formatMoney(e.overrun.baseline)} →{" "}
                            </span>
                            <span
                              className={`font-semibold ${e.overrun.pct > 0 ? "text-red-700" : "text-emerald-700"}`}
                            >
                              {formatPercent(e.overrun.pct)}
                            </span>
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </Section>

      <Section title={t("projects.openings")}>
        <div className="grid gap-8 sm:grid-cols-2">
          {[
            { title: t("projects.pastOpenings"), items: past },
            { title: t("projects.scheduledOpenings"), items: scheduled },
          ].map(({ title, items }) => (
            <div key={title}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                {title}
              </h3>
              {items.length === 0 ? (
                <p className="mt-2 text-sm text-neutral-400">—</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {items.slice(0, 10).map((o) => (
                    <li key={`${o.projectId}/${o.lotId}`} className="text-sm">
                      <Link
                        href={`/projects/${o.projectId}`}
                        className="flex items-baseline gap-2 hover:underline underline-offset-2"
                      >
                        <span className="w-20 shrink-0 tabular-nums text-neutral-500">
                          {formatDate(o.date, lang)}
                        </span>
                        <span
                          className="inline-block h-1 w-3 shrink-0 translate-y-[-2px] rounded-full"
                          style={{ backgroundColor: CATEGORY_COLORS[o.category] }}
                        />
                        <span className="min-w-0 truncate">
                          {name(o.projectName)} — {name(o.lotName)}
                        </span>
                        <span className="shrink-0 text-neutral-400">
                          {formatKm(o.lengthKm, lang)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title={t("country.projectsTitle", { country: label })}>
        <ProjectsBrowser projects={countryProjects} lockedCountry={code} />
      </Section>

      {ref && (
        <Section title={t("project.sources")}>
          <ul className="space-y-1 text-sm text-neutral-600">
            {ref.sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-neutral-900"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-3xl text-xs text-neutral-500">
            {t("country.projectSourcesNote")}
          </p>
        </Section>
      )}

      <div className="mt-12">
        <Link
          href={`/map?c=${code}`}
          className="rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          {t("country.viewOnMap", { country: label })}
        </Link>
      </div>
    </div>
  );
}
