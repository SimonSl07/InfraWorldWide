import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCityKeys, getCityProjects, getCityTable } from "@/lib/data";
import { countryName, flagEmoji } from "@/lib/country-names";
import { currentMonth } from "@/lib/slip";
import { lotMonths, lotStateAt } from "@/lib/country-stats";
import { formatDate, formatKm } from "@/lib/format";
import CityView, { type CityProjectCard } from "@/components/city/CityView";
import { isSharedTrack, type City, type LocalizedString } from "@/lib/schema";

export function generateStaticParams() {
  // Locales are enumerated by the parent [lang] layout.
  return getCityKeys().map((slug) => ({ slug }));
}

function localized(value: LocalizedString, lang: string): string {
  return lang === "ro" && value.ro ? value.ro : value.en;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  const city: City | undefined = getCityTable().cities[slug];
  if (!city) return {};
  const t = await getTranslations({ locale: lang, namespace: "city" });
  const name = localized(city.name, lang);
  return {
    title: name,
    description: t("metaDescription", { city: name }),
  };
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {note && <div className="mt-0.5 text-xs text-neutral-400">{note}</div>}
    </div>
  );
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
  const networkLots = lots.filter((l) => !isSharedTrack(l.lot));
  const openedKm = networkLots
    .filter((l) => l.state === "opened")
    .reduce((sum, l) => sum + l.lot.lengthKm, 0);
  const buildingKm = networkLots
    .filter((l) => l.state === "under_construction")
    .reduce((sum, l) => sum + l.lot.lengthKm, 0);

  const name = localized(city.name, lang);
  const note = city.note ? localized(city.note, lang) : null;

  // Localized and totalled here, so the client component ships plain data
  // and does no locale formatting of its own. A line's own length includes
  // any track it shares, unlike the network figures above.
  const cards: CityProjectCard[] = projects.map((project) => {
    const projectLots = lots.filter((l) => l.project.id === project.id);
    const opened = projectLots.filter((l) => l.state === "opened");
    return {
      id: project.id,
      name: localized(project.name, lang),
      description: localized(project.description, lang),
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
      <Link
        href="/map"
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        {t("city.backToMap")}
      </Link>

      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <h1 className="text-3xl font-bold">{name}</h1>
        <span className="text-neutral-500">
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
      <p className="mt-2 max-w-3xl text-neutral-600">
        {t("city.intro", { city: name })}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label={t("city.population")}
          value={city.population.toLocaleString(lang)}
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

      <section className="mt-10 max-w-3xl text-sm text-neutral-500">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {t("city.sourcesTitle")}
        </h2>
        {note && <p className="mt-2">{note}</p>}
        <p className="mt-2">
          {city.sources.map((source, i) => (
            <span key={source.url}>
              {i > 0 && ", "}
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-neutral-900"
              >
                {source.title}
              </a>
            </span>
          ))}
          .
        </p>
        {city.link && (
          <p className="mt-2">
            <a
              href={city.link}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-neutral-900"
            >
              {t("city.officialSite")}
            </a>
          </p>
        )}
      </section>
    </div>
  );
}
