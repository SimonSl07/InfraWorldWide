import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import FeedbackDialog from "@/components/FeedbackDialog";
import { CountryLabel } from "@/components/ui/CountryLabel";
import { ExternalLink } from "@/components/ui/ExternalLink";
import { Figure } from "@/components/ui/Figure";
import { countryName } from "@/lib/country-names";
import { getCityKeys, getCountries, getProjects } from "@/lib/data";
import { formatDate, formatKm, formatNumber } from "@/lib/format";
import { EXTERNAL_LINKS } from "@/lib/links";
import { pageMetadata } from "@/lib/page-metadata";
import { computeStats, dataYearRange, summarizeContents } from "@/lib/stats";

const LINKEDIN =
  "https://www.linkedin.com/in/simon-sl%C4%83nin%C4%83-528657333/";
const GITHUB = EXTERNAL_LINKS.github;
const REPO = EXTERNAL_LINKS.repo;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang });
  return pageMetadata({
    locale: lang,
    path: "/about",
    title: t("about.title"),
    description: t("about.lead"),
    siteName: t("site.name"),
  });
}

export default async function AboutPage({
  params,
}: PageProps<"/[lang]/about">) {
  const { lang } = await params;
  setRequestLocale(lang);
  const t = await getTranslations("about");
  const tCategory = await getTranslations("category");

  // Everything in this section is counted from the data files at build time,
  // so a merged project shows up here on the next deploy without anyone
  // editing prose.
  const projects = getProjects();
  const countries = getCountries();
  const today = new Date();
  const contents = summarizeContents(projects);
  const stats = computeStats(projects, today.getFullYear());
  const years = dataYearRange(projects, today.getFullYear());
  const builtOn = formatDate(today.toISOString().slice(0, 10), lang);

  const figures = [
    {
      label: t("figuresProjects"),
      value: formatNumber(stats.projectCount, lang),
    },
    {
      label: t("figuresSections"),
      value: formatNumber(contents.sectionCount, lang),
    },
    {
      label: t("figuresCountries"),
      value: formatNumber(countries.length, lang),
    },
    {
      label: t("figuresCities"),
      value: formatNumber(getCityKeys().length, lang),
    },
    { label: t("figuresOpenedKm"), value: formatKm(stats.openedKm, lang) },
    {
      label: t("figuresUnderConstructionKm"),
      value: formatKm(stats.underConstructionKm, lang),
    },
    {
      label: t("figuresSources"),
      value: formatNumber(contents.sourceCount, lang),
    },
    { label: t("figuresYears"), value: `${years.first}–${years.last}` },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-3 text-lg text-ink-soft">{t("lead")}</p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("dataTitle")}</h2>
        <p className="mt-2 text-ink-soft">{t("dataBody")}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {figures.map((f) => (
            <Figure key={f.label} label={f.label} value={f.value} />
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
          <li className="text-ink-muted">{t("byType")}</li>
          {contents.byCategory.map(({ category, count }) => (
            <li key={category}>
              {tCategory(category)}{" "}
              <span className="font-medium tabular-nums text-ink">
                {formatNumber(count, lang)}
              </span>
            </li>
          ))}
        </ul>
        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {t("countriesTitle")}
        </h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {countries.map((code) => (
            <li key={code}>
              <Link
                href={`/countries/${code}`}
                className="inline-flex items-center rounded-lg border border-line px-3 py-1.5 text-sm transition-colors hover:border-inverse"
              >
                <CountryLabel code={code} name={countryName(code, lang)} />
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-ink-soft">{t("dataSources")}</p>
        <p className="mt-3 text-xs text-ink-faint">
          {t("builtNote", { date: builtOn })}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("helpTitle")}</h2>
        <p className="mt-2 text-ink-soft">{t("helpBody")}</p>
        <ul className="mt-4 space-y-3 text-ink-soft">
          <li className="flex gap-3">
            <span aria-hidden className="text-ink-faint">
              1.
            </span>
            {/* A div, not a span: FeedbackDialog renders a <dialog>, which is
                flow content and has no business inside phrasing content. */}
            <div>
              {t("helpReport")}{" "}
              <FeedbackDialog
                triggerClassName="font-medium text-ink underline underline-offset-2 hover:text-ink-soft"
                triggerLabel={t("helpReportCta")}
              />
            </div>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="text-ink-faint">
              2.
            </span>
            <span>
              {t("helpData")}{" "}
              <ExternalLink
                href={REPO}
                className="underline underline-offset-2 hover:text-ink"
              >
                {t("helpRepoCta")}
              </ExternalLink>
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="text-ink-faint">
              3.
            </span>
            <span>{t("helpSpread")}</span>
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("builderTitle")}</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <ExternalLink
            href={LINKEDIN}
            className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium transition-colors hover:border-inverse"
          >
            LinkedIn
          </ExternalLink>
          <ExternalLink
            href={GITHUB}
            className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium transition-colors hover:border-inverse"
          >
            GitHub
          </ExternalLink>
        </div>
      </section>

      <section className="mt-10 rounded-xl border border-line bg-surface-sunken p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {t("startTitle")}
        </h2>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link
            href="/map"
            className="rounded-lg bg-inverse px-4 py-2 font-medium text-on-inverse hover:bg-inverse-soft"
          >
            {t("startMap")}
          </Link>
          <Link
            href="/rankings"
            className="rounded-lg border border-line-strong px-4 py-2 font-medium hover:border-inverse"
          >
            {t("startPerformance")}
          </Link>
        </div>
      </section>
    </div>
  );
}
