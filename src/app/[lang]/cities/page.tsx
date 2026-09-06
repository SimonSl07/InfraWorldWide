import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCityKeys, getCityProjects, getCityTable } from "@/lib/data";
import { countryName, flagEmoji } from "@/lib/country-names";
import { currentMonth } from "@/lib/slip";
import { lotMonths, lotStateAt } from "@/lib/country-stats";
import { formatKm } from "@/lib/format";
import { countsTowardNetwork } from "@/lib/schema";
import { localized } from "@/lib/localized";
import { pageMetadata } from "@/lib/page-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang });
  return pageMetadata({
    locale: lang,
    path: "/cities",
    title: t("city.indexTitle"),
    description: t("city.indexIntro"),
    siteName: t("site.name"),
  });
}

export default async function CitiesPage({
  params,
}: PageProps<"/[lang]/cities">) {
  const { lang } = await params;
  setRequestLocale(lang);

  const t = await getTranslations();
  const table = getCityTable();
  const nowMonth = currentMonth(new Date());

  const cities = getCityKeys()
    .map((key) => {
      const city = table.cities[key];
      const projects = getCityProjects(key);

      // Network totals span projects, so anything another project already
      // counts (shared track, or a structure inside a parent section) is
      // left out here and counted in full under its own line.
      const openedKm = projects
        .flatMap((p) => p.lots)
        .filter(countsTowardNetwork)
        .filter(
          (lot) => lotStateAt(lotMonths(lot), nowMonth, nowMonth) === "opened",
        )
        .reduce((sum, lot) => sum + lot.lengthKm, 0);

      return { key, city, projects: projects.length, openedKm };
    })
    .sort((a, b) => b.openedKm - a.openedKm);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold">{t("city.indexTitle")}</h1>
      <p className="mt-2 max-w-3xl text-ink-soft">{t("city.indexIntro")}</p>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cities.map(({ key, city, projects, openedKm }) => (
          <li key={key}>
            <Link
              href={`/cities/${key}`}
              className="block h-full rounded-xl border border-line p-4 hover:border-line-strong hover:bg-surface-sunken"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-semibold">
                  {localized(city.name, lang)}
                </h2>
                <span className="shrink-0 text-sm text-ink-muted">
                  <span aria-hidden className="mr-1">
                    {flagEmoji(city.country)}
                  </span>
                  {countryName(city.country, lang)}
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold tabular-nums">
                {formatKm(openedKm, lang)}
              </p>
              <p className="text-xs text-ink-muted">
                {t("city.openedKm")} · {t("city.projectsCount", { count: projects })}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
