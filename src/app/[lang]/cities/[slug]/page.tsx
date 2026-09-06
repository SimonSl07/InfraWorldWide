import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCityKeys, getCityProjects, getCityTable } from "@/lib/data";
import { countryName, flagEmoji } from "@/lib/country-names";
import { currentMonth } from "@/lib/slip";
import { lotMonths, lotStateAt } from "@/lib/country-stats";
import { formatDate, formatKm, formatNumber } from "@/lib/format";
import { createLocalizer, localized } from "@/lib/localized";
import { pageMetadata } from "@/lib/page-metadata";
import { breadcrumbList, jsonLdScript } from "@/lib/structured-data";
import { siteUrl } from "@/lib/seo";
import CityView, { type CityProjectCard } from "@/components/city/CityView";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { Figure } from "@/components/ui/Figure";
import { countsTowardNetwork, type City } from "@/lib/schema";

export function generateStaticParams() {
  // Locales are enumerated by the parent [lang] layout.
  return getCityKeys().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  const city: City | undefined = getCityTable().cities[slug];
  if (!city) return {};
  const t = await getTranslations({ locale: lang });
  const name = localized(city.name, lang);
  return pageMetadata({
    locale: lang,
    path: `/cities/${slug}`,
    title: name,
    description: t("city.metaDescription", { city: name }),
    siteName: t("site.name"),
  });
}

export default async function CityPage({
  params,
}: PageProps<"/[lang]/cities/[slug]">) {
  const { lang, slug } = await params;
  setRequestLocale(lang);

  const city = getCityTable().cities[slug];
  if (!city) notFound();

  const t = await getTranslations();
  const projects = getCityProjects(slug);
  const nowMonth = currentMonth(new Date());

  // Same state machine the map uses, so the page and the map agree about
  // what counts as open today.
  const lots = projects.flatMap((project) =>
    project.lots.map((lot) => ({
      project,
      lot,
      state: lotStateAt(lotMonths(lot), nowMonth, nowMonth),
    })),
  );
  // The headline figures are a network total, so a tunnel two lines run
  // through counts once. Each line's own length below still includes it.
  const networkLots = lots.filter((l) => countsTowardNetwork(l.lot));
  const openedKm = networkLots
    .filter((l) => l.state === "opened")
    .reduce((sum, l) => sum + l.lot.lengthKm, 0);
  const buildingKm = networkLots
    .filter((l) => l.state === "under_construction")
    .reduce((sum, l) => sum + l.lot.lengthKm, 0);

  const text = createLocalizer(lang);
  const name = text(city.name);
  const note = city.note ? text(city.note) : null;

  const breadcrumbs = breadcrumbList({
    baseUrl: siteUrl(process.env),
    locale: lang,
    items: [
      { name: t("site.name"), path: "/" },
      { name: t("city.indexTitle"), path: "/cities" },
      { name, path: `/cities/${slug}` },
    ],
  });

  // Localized and totalled here, so the client component ships plain data
  // and does no locale formatting of its own. A line's own length includes
  // any track it shares, unlike the network figures above.
  const cards: CityProjectCard[] = projects.map((project) => {
    const projectLots = lots.filter((l) => l.project.id === project.id);
    const opened = projectLots.filter((l) => l.state === "opened");
    return {
      id: project.id,
      name: text(project.name),
      description: text(project.description),
      category: project.category,
      openedKm: formatKm(
        opened.reduce((s, l) => s + l.lot.lengthKm, 0),
        lang,
      ),
      totalKm: formatKm(
        projectLots.reduce((s, l) => s + l.lot.lengthKm, 0),
        lang,
      ),
      lots: projectLots.length,
    };
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbs) }}
      />
      <Link
        href="/map"
        className="text-sm text-ink-muted hover:text-ink"
      >
        {t("city.backToMap")}
      </Link>

      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <h1 className="text-3xl font-bold">{name}</h1>
        <span className="text-ink-muted">
          <span aria-hidden className="mr-1.5">
            {flagEmoji(city.country)}
          </span>
          <Link
            href={`/countries/${city.country}`}
            className="hover:underline underline-offset-2"
          >
            {countryName(city.country, lang)}
          </Link>
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-ink-soft">
        {t("city.intro", { city: name })}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label={t("city.population")}
          value={formatNumber(city.population, lang)}
          note={formatDate(city.populationDate, lang)}
        />
        {city.gdpPerCapita && (
          <Figure
            label={t("city.gdpPerCapita")}
            value={city.gdpPerCapita.amount.toLocaleString(lang, {
              style: "currency",
              currency: city.gdpPerCapita.currency,
              maximumFractionDigits: 0,
            })}
            note={String(city.gdpPerCapita.year)}
          />
        )}
        <Figure
          label={t("city.openedKm")}
          value={formatKm(openedKm, lang)}
          note={t("city.acrossProjects", { projects: projects.length })}
        />
        <Figure
          label={t("country.underConstruction")}
          value={formatKm(buildingKm, lang)}
          note={t("city.lotsCount", { lots: networkLots.length })}
        />
      </div>

      {/* Map and list share a selection, so they are one client component. */}
      <CityView cityKey={slug} projects={cards} />

      <section className="mt-10 max-w-3xl text-sm text-ink-muted">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {t("city.sourcesTitle")}
        </h2>
        {note && <p className="mt-2">{note}</p>}
        <p className="mt-2">
          {city.sources.map((source, i) => (
            <span key={source.url}>
              {i > 0 && ", "}
              <ExternalLink
                href={source.url}
                className="underline underline-offset-2 hover:text-ink"
              >
                {source.title}
              </ExternalLink>
            </span>
          ))}
          .
        </p>
        {city.link && (
          <p className="mt-2">
            <ExternalLink
              href={city.link}
              className="underline underline-offset-2 hover:text-ink"
            >
              {t("city.officialSite")}
            </ExternalLink>
          </p>
        )}
      </section>
    </div>
  );
}
