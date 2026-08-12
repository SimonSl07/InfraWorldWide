import { Suspense } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCountryTable, getProjects } from "@/lib/data";
import { currentMonth } from "@/lib/slip";
import { rankCountries } from "@/lib/country-stats";
import { openedKmByDecade } from "@/lib/country-growth";
import { countryName, flagEmoji } from "@/lib/country-names";
import { formatKm } from "@/lib/format";
import { ALL_CATEGORIES, CATEGORY_COLORS } from "@/lib/map-style";
import CountryCompare from "@/components/CountryCompare";
import CountryGrowthChart from "@/components/CountryGrowthChart";
import type { Category } from "@/lib/schema";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: "country" });
  return { title: t("indexTitle"), description: t("indexIntro") };
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
  const categoryLabel = (category: Category) => t(`category.${category}`);
  // A string, so ICU does not group the year into "1,970".
  const decadeLabel = (decade: number) =>
    t("country.decade", { decade: String(decade) });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold">{t("country.indexTitle")}</h1>
      <p className="mt-2 max-w-3xl text-neutral-600">
        {t("country.indexIntro")}
      </p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ranked.map((country) => {
          const code = country.summary.code;
          const categories = ALL_CATEGORIES.filter(
            (c) => country.summary.byCategory[c].openedKm > 0,
          );
          return (
            <li key={code}>
              <Link
                href={`/countries/${code}`}
                className="block h-full rounded-xl border border-neutral-200 p-5 transition-colors hover:border-neutral-900"
              >
                <div className="flex items-center gap-2">
                  <span aria-hidden className="text-xl">
                    {flagEmoji(code)}
                  </span>
                  <span className="text-lg font-bold">
                    {countryName(code, lang)}
                  </span>
                </div>

                <div className="mt-3 text-2xl font-bold tabular-nums">
                  {formatKm(country.summary.total.openedKm, lang)}
                </div>
                <div className="text-xs text-neutral-500">
                  {t("country.totalOpened")}
                  {country.summary.total.underConstructionKm > 0 && (
                    <>
                      {" · "}
                      {t("country.building")}{" "}
                      <span className="tabular-nums">
                        {formatKm(
                          country.summary.total.underConstructionKm,
                          lang,
                        )}
                      </span>
                    </>
                  )}
                </div>

                <div className="mt-3 space-y-1">
                  {categories.map((category) => (
                    <div
                      key={category}
                      className="flex items-baseline justify-between gap-2 text-sm"
                    >
                      <span className="flex items-baseline gap-2 text-neutral-600">
                        <span
                          className="inline-block h-1 w-3 shrink-0 translate-y-[-2px] rounded-full"
                          style={{ backgroundColor: CATEGORY_COLORS[category] }}
                        />
                        {categoryLabel(category)}
                      </span>
                      <span className="tabular-nums">
                        {formatKm(
                          country.summary.byCategory[category].openedKm,
                          lang,
                        )}
                        <span className="ml-1.5 text-xs text-neutral-400">
                          #{country.ranks.openedKm[category]?.position ?? "—"}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <CountryGrowthChart
                    buckets={openedKmByDecade(projects, code)}
                    locale={lang}
                    categoryLabel={categoryLabel}
                    decadeLabel={decadeLabel}
                    compact
                  />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t("country.compareTitle")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-neutral-500">
          {t("country.compareIntro")}
        </p>
        {/* CountryCompare reads ?compare= with useSearchParams; without this
            boundary the whole page would fall back to client rendering. */}
        <div className="mt-4">
          <Suspense>
            <CountryCompare countries={ranked} />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
