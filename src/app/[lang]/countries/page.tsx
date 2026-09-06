import { Suspense } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  getAnalysisContext,
  getCountryTable,
  getFxTable,
  getLotMetrics,
  getProjects,
} from "@/lib/data";
import { currentMonth } from "@/lib/slip";
import { rankCountries } from "@/lib/country-stats";
import { countryPerformance } from "@/lib/country-performance";
import { summarizeSharedTrack } from "@/lib/shared-track";
import { countryName, flagEmoji } from "@/lib/country-names";
import { formatKm } from "@/lib/format";
import { pageMetadata } from "@/lib/page-metadata";
import CountryCompare from "@/components/CountryCompare";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang });
  return pageMetadata({
    locale: lang,
    path: "/countries",
    title: t("country.indexTitle"),
    description: t("country.indexIntro"),
    siteName: t("site.name"),
  });
}

/**
 * Reserves the picker's footprint while CountryCompare hydrates: a search
 * box over a list on the left, the picker map on the right. Without it the
 * comparison block popped in after the static HTML and moved everything
 * below it.
 */
function CompareFallback() {
  return (
    <div aria-hidden className="grid gap-4 sm:grid-cols-2">
      <div>
        <div className="h-4 w-16 rounded bg-surface-raised" />
        <div className="mt-1 h-10 rounded-lg border border-line-strong bg-surface-sunken" />
        <div className="mt-2 h-48 rounded-lg bg-surface-sunken" />
      </div>
      <div>
        <div className="h-4 w-24 rounded bg-surface-raised" />
        <div className="mt-1 h-64 rounded-xl border border-line bg-surface-sunken" />
      </div>
    </div>
  );
}

export default async function CountriesPage({
  params,
}: PageProps<"/[lang]/countries">) {
  const { lang } = await params;
  setRequestLocale(lang);
  const t = await getTranslations();

  const projects = getProjects();
  const nowMonth = currentMonth(new Date());
  const ranked = rankCountries(
    projects,
    getCountryTable().countries,
    nowMonth,
    nowMonth,
  );

  // Delivery figures on exactly the basis /rankings uses, so the comparison
  // table cannot disagree with the performance page about a country.
  const { costOptions, priceYear } = getAnalysisContext(nowMonth);
  const performance = countryPerformance(getLotMetrics(nowMonth), costOptions);
  const baseCurrency = getFxTable().base;

  const shared = summarizeSharedTrack(projects);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold">{t("country.indexTitle")}</h1>
      <p className="mt-2 max-w-3xl text-ink-soft">
        {t("country.indexIntro")}
      </p>

      <div
        className="mt-6 overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        tabIndex={0}
        role="region"
        aria-label={t("country.indexTitle")}
      >
        <table className="w-full min-w-max text-sm">
          <caption className="sr-only">{t("country.indexIntro")}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
              <th scope="col" className="py-2 pr-3 font-medium">{t("country.thRank")}</th>
              <th scope="col" className="py-2 pr-4 font-medium">{t("country.thCountry")}</th>
              <th scope="col" className="py-2 pl-4 text-right font-medium">
                {t("country.totalOpened")}
              </th>
              <th scope="col" className="py-2 pl-4 text-right font-medium">
                {t("country.underConstruction")}
              </th>
              <th scope="col" className="py-2 pl-4 text-right font-medium">
                {t("country.plannedTitle")}
              </th>
              <th scope="col" className="py-2 pl-4 text-right font-medium">
                {t("country.projects")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {ranked.map((c, i) => {
              const code = c.summary.code;
              return (
                <tr key={code}>
                  <td className="py-2 pr-3 tabular-nums text-ink-faint">
                    {i + 1}
                  </td>
                  {/* The country names the row. */}
                  <th scope="row" className="py-2 pr-4 text-left font-normal">
                    <Link
                      href={`/countries/${code}`}
                      className="font-medium hover:underline underline-offset-2"
                    >
                      <span aria-hidden className="mr-2">
                        {flagEmoji(code)}
                      </span>
                      {countryName(code, lang)}
                    </Link>
                  </th>
                  <td className="py-2 pl-4 text-right font-semibold tabular-nums">
                    {formatKm(c.summary.total.openedKm, lang)}
                  </td>
                  <td className="py-2 pl-4 text-right tabular-nums text-ink-soft">
                    {formatKm(c.summary.total.underConstructionKm, lang)}
                  </td>
                  <td className="py-2 pl-4 text-right tabular-nums text-ink-soft">
                    {formatKm(c.summary.total.plannedKm, lang)}
                  </td>
                  <td className="py-2 pl-4 text-right tabular-nums text-ink-soft">
                    {c.summary.projects}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {shared.lots > 0 && (
        <p className="mt-3 max-w-3xl text-xs text-ink-muted">
          {t("country.sharedTrackNote", { km: formatKm(shared.km, lang) })}
        </p>
      )}

      <section className="mt-12">
        <h2 className="text-2xl font-bold">{t("country.compareTitle")}</h2>
        <p className="mt-2 max-w-3xl text-ink-soft">
          {t("country.compareIntro")}
        </p>

        {/* CountryCompare reads ?compare= with useSearchParams; without this
            boundary the whole page would fall back to client rendering. */}
        <div className="mt-6">
          <Suspense fallback={<CompareFallback />}>
            <CountryCompare
              countries={ranked}
              performance={performance}
              priceYear={priceYear}
              baseCurrency={baseCurrency}
            />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
