import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  getCountries,
  getCountryTable,
  getLotMetrics,
  getProjects,
} from "@/lib/data";
import { currentMonth } from "@/lib/slip";
import {
  deliveredOnTime,
  rankByCountry,
  underBudget,
  worstOverruns,
  worstSlips,
  type LotMetric,
  type OverrunEntry,
  type SlipEntry,
} from "@/lib/rankings";
import { summarizeSharedTrack } from "@/lib/shared-track";
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
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { createLocalizer } from "@/lib/localized";
import { pageMetadata } from "@/lib/page-metadata";
import { breadcrumbList, jsonLdScript } from "@/lib/structured-data";
import { siteUrl } from "@/lib/seo";
import {
  ALL_CATEGORIES,
} from "@/lib/map-style";
import { categoryVar } from "@/lib/map-theme";
import type { Category } from "@/lib/schema";
import CountryGrowthChart from "@/components/CountryGrowthChart";
import TimeTravelMap from "@/components/map/TimeTravelMap";
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
  const t = await getTranslations({ locale: lang });
  const label = countryName(code, lang);
  return pageMetadata({
    locale: lang,
    path: `/countries/${code}`,
    title: label,
    description: t("country.metaDescription", { country: label }),
    siteName: t("site.name"),
  });
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
      {help && <p className="mt-1 max-w-3xl text-sm text-ink-muted">{help}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-3xl rounded-md bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
      {children}
    </p>
  );
}

/**
 * One ranked list of sections: a heading, the rows, or a line saying why
 * there are none. An empty list is a result here, not a rendering failure:
 * "no section came in under its estimate" is what the data says.
 */
function PerfList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{ key: string; label: React.ReactNode; value: React.ReactNode }>;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-faint">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5 text-sm">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="min-w-0">{row.label}</span>
              <span className="shrink-0 tabular-nums">{row.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "#2 / 5" — see the note on RankChip in CountryPanel. */
function RankBadge({ rank }: { rank: Rank | null }) {
  if (!rank) return null;
  return (
    <span className="ml-2 rounded-full bg-surface-raised px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-soft">
      #{rank.position}
      <span className="text-ink-faint"> / {rank.of}</span>
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

  const name = createLocalizer(lang);
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
  const metrics = getLotMetrics(nowMonth);
  const countryMetrics = metrics.filter((m) => m.country === code);
  const league = rankByCountry(metrics).find((g) => g.key === code) ?? null;

  // Track two lines both list. The totals below count it once, so the gap
  // between them and the sum of the lines needs saying out loud.
  const shared = summarizeSharedTrack(countryProjects);

  const { past, scheduled } = getOpenings(countryProjects);

  const breadcrumbs = breadcrumbList({
    baseUrl: siteUrl(process.env),
    locale: lang,
    items: [
      { name: t("site.name"), path: "/" },
      { name: t("country.indexTitle"), path: "/countries" },
      { name: label, path: `/countries/${code}` },
    ],
  });

  const sectionLabel = (m: LotMetric) => (
    <Link
      href={`/projects/${m.projectId}`}
      className="flex items-baseline gap-2 hover:underline underline-offset-2"
    >
      <span
        className="inline-block h-1 w-3 shrink-0 translate-y-[-2px] rounded-full"
        style={{ backgroundColor: categoryVar(m.category) }}
      />
      <span>
        <span className="text-ink-muted">{name(m.projectName)}</span>
        <span className="text-ink-faint"> / </span>
        <span className="font-medium">{name(m.lotName)}</span>
      </span>
    </Link>
  );

  const slipRows = (entries: SlipEntry[]) =>
    entries.map((e) => ({
      key: `${e.metric.projectId}/${e.metric.lotId}`,
      label: sectionLabel(e.metric),
      value: (
        <span
          className={`font-semibold ${e.slip.slipMonths > 0 ? "text-bad" : "text-good"}`}
        >
          {formatMonths(e.slip.slipMonths, t("rankings.unitMonths"), lang)}
        </span>
      ),
    }));

  const overrunRows = (entries: OverrunEntry[]) =>
    entries.map((e) => ({
      key: `${e.metric.projectId}/${e.metric.lotId}`,
      label: sectionLabel(e.metric),
      value: (
        <>
          <span className="text-ink-faint">
            {formatMoney(e.overrun.baseline, lang)} →{" "}
          </span>
          <span
            className={`font-semibold ${e.overrun.pct > 0 ? "text-bad" : "text-good"}`}
          >
            {formatPercent(e.overrun.pct, lang)}
          </span>
        </>
      ),
    }));

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbs) }}
      />
      <Link
        href="/countries"
        className="text-sm text-ink-muted hover:text-ink"
      >
        ← {t("country.backToCountries")}
      </Link>

      <h1 className="mt-4 flex items-center gap-3 text-3xl font-bold">
        <span aria-hidden>{flagEmoji(code)}</span>
        {label}
      </h1>
      <p className="mt-2 text-sm text-ink-muted">
        {t("country.asOf", { month: formatMonth(nowMonth, lang) })}
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {headline.map((item) => (
          <div key={item.label}>
            <dt className="text-sm text-ink-muted">{item.label}</dt>
            <dd className="mt-1 flex items-baseline text-2xl font-bold tabular-nums">
              {item.value}
              <RankBadge rank={item.rank} />
            </dd>
          </div>
        ))}
      </dl>

      {shared.lots > 0 && (
        <p className="mt-4 max-w-3xl text-xs text-ink-muted">
          {t("country.sharedTrackNote", { km: formatKm(shared.km, lang) })}
        </p>
      )}

      {(country.kmPerArea !== null || country.kmPerCapita !== null) && (
        <div className="mt-6 max-w-3xl rounded-md border border-line bg-surface-sunken px-4 py-3 text-sm text-ink-soft">
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {country.kmPerArea !== null && (
              <span>
                {t("country.perArea")}:{" "}
                <span className="font-semibold tabular-nums">
                  {formatNumber(country.kmPerArea, lang, 1)}
                </span>
                <RankBadge rank={ranks.kmPerArea} />
              </span>
            )}
            {country.kmPerCapita !== null && (
              <span>
                {t("country.perCapita")}:{" "}
                <span className="font-semibold tabular-nums">
                  {formatNumber(country.kmPerCapita, lang, 1)}
                </span>
                <RankBadge rank={ranks.kmPerCapita} />
              </span>
            )}
          </div>
          {ref && (
            <p className="mt-2 text-xs text-ink-muted">
              {t("country.densityBasis", {
                area: formatNumber(ref.areaKm2, lang),
                population: formatNumber(ref.population, lang),
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
              className="rounded-xl border border-line p-4"
            >
              <div
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: categoryVar(category) }}
              >
                {categoryLabel(category)}
              </div>
              <div className="mt-1 flex items-baseline text-xl font-bold tabular-nums">
                {formatKm(totals.openedKm, lang)}
                <RankBadge rank={rank} />
              </div>
              <div className="mt-1 space-y-0.5 text-xs text-ink-muted">
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
            // Names the chart and captions its hidden data table: without it
            // the figures live only in `title` attributes, which a touch
            // device never shows and a screen reader does not read out.
            title={t("country.growthChartLabel", { country: label })}
          />
        )}
      </Section>

      <Section title={t("country.mapTitle")}>
        {/* The same artifact the static mini-map drew, plus a slider. The
            country's network assembling itself decade by decade is the thing
            this dataset is for, and it was reachable from /map alone. */}
        <TimeTravelMap
          url={`/data/geo/${code}.geojson`}
          locale={lang}
          heightClass="h-80"
          padding={32}
          fallback={{ longitude: 24.97, latitude: 45.9, zoom: 5 }}
          showLegend
        />
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
                <dt className="text-sm text-ink-muted">
                  {t("rankings.thMedianSlip")}
                </dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">
                  {league.slip.median === null
                    ? "–"
                    : formatMonths(
                        league.slip.median,
                        t("rankings.unitMonths"),
                        lang,
                      )}
                  <span className="ml-1 text-xs font-normal text-ink-faint">
                    n={league.slip.n}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-ink-muted">
                  {t("rankings.thOnTime")}
                </dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">
                  {league.onTimeShare === null
                    ? "–"
                    : `${Math.round(league.onTimeShare * 100)}%`}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-ink-muted">
                  {t("rankings.thMedianOverrun")}
                </dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">
                  {league.overrun.estimate.median === null
                    ? "–"
                    : formatPercent(league.overrun.estimate.median, lang)}
                  <span className="ml-1 text-xs font-normal text-ink-faint">
                    n={league.overrun.estimate.n}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-ink-muted">
                  {t("rankings.thLots")}
                </dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">
                  {league.lots}
                </dd>
              </div>
            </dl>

            {/* Both ends of each ranking. "On time" and "under budget" are
                not simply the far end of the ordering: a section qualifies by
                actually meeting its date or its estimate, so when everything
                here ran late or over, the column is empty and says so. */}
            <div className="mt-8 grid gap-8 lg:grid-cols-2">
              <PerfList
                title={t("country.worstSlips")}
                empty="–"
                rows={slipRows(worstSlips(countryMetrics, { limit: TOP_N }))}
              />
              <PerfList
                title={t("country.onTimeSlips")}
                empty={t("country.noOnTimeData")}
                rows={slipRows(deliveredOnTime(countryMetrics, TOP_N))}
              />
              <PerfList
                title={t("country.worstOverruns")}
                empty={t("country.noOverrunData")}
                rows={overrunRows(
                  worstOverruns(countryMetrics, "estimate", TOP_N),
                )}
              />
              <PerfList
                title={t("country.underBudget")}
                empty={t("country.noUnderBudgetData")}
                rows={overrunRows(
                  underBudget(countryMetrics, "estimate", TOP_N),
                )}
              />
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
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                {title}
              </h3>
              {items.length === 0 ? (
                <p className="mt-2 text-sm text-ink-faint">–</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {items.slice(0, 10).map((o) => (
                    <li key={`${o.projectId}/${o.lotId}`} className="text-sm">
                      <Link
                        href={`/projects/${o.projectId}`}
                        className="flex items-baseline gap-2 hover:underline underline-offset-2"
                      >
                        <span className="w-20 shrink-0 tabular-nums text-ink-muted">
                          {formatDate(o.date, lang)}
                        </span>
                        <span
                          className="inline-block h-1 w-3 shrink-0 translate-y-[-2px] rounded-full"
                          style={{ backgroundColor: categoryVar(o.category) }}
                        />
                        <span className="min-w-0 truncate">
                          {name(o.projectName)} / {name(o.lotName)}
                        </span>
                        <span className="shrink-0 text-ink-faint">
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
          <ul className="space-y-1 text-sm text-ink-soft">
            {ref.sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2 hover:text-ink"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-3xl text-xs text-ink-muted">
            {t("country.projectSourcesNote")}
          </p>
        </Section>
      )}

      <div className="mt-12">
        <Link
          href={`/map?c=${code}`}
          className="rounded-full bg-inverse px-5 py-2.5 text-sm font-medium text-on-inverse hover:bg-inverse-soft"
        >
          {t("country.viewOnMap", { country: label })}
        </Link>
      </div>
    </div>
  );
}
