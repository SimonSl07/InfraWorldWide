import { setRequestLocale, getTranslations } from "next-intl/server";
import {
  dataEndpoints,
  odblEndpoints,
  readGeoManifest,
} from "@/lib/data-endpoints";
import { EXTERNAL_LINKS } from "@/lib/links";
import { formatDate } from "@/lib/format";
import { pageMetadata } from "@/lib/page-metadata";
import { ExternalLink } from "@/components/ui/ExternalLink";

/** Where the generated JSON Schema files live in the repository. */
const SCHEMA_DIR = `${EXTERNAL_LINKS.repo}/blob/main/schema`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang });
  return pageMetadata({
    locale: lang,
    path: "/data",
    title: t("dataPage.title"),
    description: t("dataPage.metaDescription"),
    siteName: t("site.name"),
  });
}

export default async function DataPage({
  params,
}: PageProps<"/[lang]/data">) {
  const { lang } = await params;
  setRequestLocale(lang);
  const t = await getTranslations();

  const manifest = readGeoManifest();
  const endpoints = dataEndpoints({
    country: manifest?.countries[0],
    city: manifest?.cities[0],
    project: manifest?.projects[0],
  });
  const odbl = odblEndpoints(endpoints);
  // Computed once for both branches of the stamp below. The empty string is
  // unreachable: the block that reads it only renders when manifest is set.
  const buildDate = manifest
    ? formatDate(manifest.generated.slice(0, 10), lang)
    : "";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold">{t("dataPage.title")}</h1>
      <p className="mt-2 max-w-3xl text-ink-soft">{t("dataPage.intro")}</p>

      {manifest && (
        <div className="mt-6 max-w-3xl rounded-md border border-line bg-surface-sunken px-4 py-3 text-sm text-ink-soft">
          <p className="font-semibold text-ink-soft">
            {t("dataPage.buildTitle")}
          </p>
          <p className="mt-1">
            {/* A build from a source tarball, or from an image without the
                .git directory, has no commit to name. That is not a failure
                and the rest of the stamp is still worth printing. */}
            {manifest.commit
              ? t("dataPage.buildStamp", {
                  date: buildDate,
                  commit: manifest.commit.slice(0, 7),
                })
              : t("dataPage.buildStampNoCommit", { date: buildDate })}
          </p>
          <p className="mt-1 text-ink-muted">
            {t("dataPage.buildContents", {
              projects: manifest.projects.length,
              countries: manifest.countries.length,
              cities: manifest.cities.length,
            })}
          </p>
        </div>
      )}

      <section className="mt-12">
        <h2 className="text-lg font-semibold">
          {t("dataPage.endpointsTitle")}
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          {t("dataPage.endpointsHelp")}
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t("dataPage.thPath")}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {t("dataPage.thContents")}
                </th>
                <th scope="col" className="py-2 font-medium">{t("dataPage.thSchema")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft align-top">
              {endpoints.map((endpoint) => (
                <tr key={endpoint.path}>
                  <td className="py-3 pr-4">
                    <code className="whitespace-nowrap rounded bg-surface-raised px-1.5 py-0.5 text-[13px]">
                      {endpoint.path}
                    </code>
                    {endpoint.odbl && (
                      <span className="ml-2 rounded-full bg-good-soft px-1.5 py-0.5 text-[10px] font-semibold text-good">
                        ODbL
                      </span>
                    )}
                    {endpoint.example && (
                      <div className="mt-1 text-xs">
                        <a
                          href={endpoint.example}
                          className="text-ink-muted underline underline-offset-2 hover:text-ink"
                        >
                          {t("dataPage.example")}: {endpoint.example}
                        </a>
                      </div>
                    )}
                  </td>
                  <td className="max-w-md py-3 pr-4 text-ink-soft">
                    {t(`dataPage.endpoints.${endpoint.key}`)}
                  </td>
                  <td className="py-3 text-ink-soft">
                    {endpoint.schema ? (
                      <ExternalLink
                        href={`${SCHEMA_DIR}/${endpoint.schema}`}
                        className="whitespace-nowrap underline underline-offset-2 hover:text-ink"
                      >
                        {endpoint.schema}
                      </ExternalLink>
                    ) : (
                      <span className="text-ink-faint">
                        {t("dataPage.schemaNone")}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t("dataPage.csvTitle")}</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          {t("dataPage.csvHelp")}
        </p>
        {/* Plain anchors: these are file downloads served by a route handler,
            not pages, so a client-side navigation has nothing to render. */}
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={`/${lang}/data/contractors.csv`}
            download
            className="rounded-lg border border-line-strong px-3 py-2 text-sm font-medium hover:border-inverse"
          >
            {t("dataPage.csvContractors")}
          </a>
          <a
            href={`/${lang}/data/countries.csv`}
            download
            className="rounded-lg border border-line-strong px-3 py-2 text-sm font-medium hover:border-inverse"
          >
            {t("dataPage.csvCountries")}
          </a>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t("dataPage.schemaTitle")}</h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-soft">
          {t("dataPage.schemaHelp")}
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">{t("dataPage.licenceTitle")}</h2>
        <div className="mt-2 max-w-3xl space-y-3 text-sm text-ink-soft">
          <p>{t("dataPage.licenceGeometry")}</p>
          <ul className="flex flex-wrap gap-2">
            {odbl.map((endpoint) => (
              <li key={endpoint.path}>
                <code className="rounded bg-surface-raised px-1.5 py-0.5 text-[13px]">
                  {endpoint.path}
                </code>
              </li>
            ))}
          </ul>
          <p>
            <ExternalLink
              href={EXTERNAL_LINKS.openStreetMap}
              className="underline underline-offset-2 hover:text-ink"
            >
              {t("dataPage.licenceAttribution")}
            </ExternalLink>
            {" · "}
            <ExternalLink
              href={EXTERNAL_LINKS.odbl}
              className="underline underline-offset-2 hover:text-ink"
            >
              ODbL
            </ExternalLink>
          </p>
          <p>
            {t("dataPage.licenceTables")}{" "}
            <ExternalLink
              href={EXTERNAL_LINKS.ccBy}
              className="underline underline-offset-2 hover:text-ink"
            >
              CC BY 4.0
            </ExternalLink>
          </p>
          <p className="text-ink-muted">{t("dataPage.licenceSources")}</p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">
          {t("dataPage.stabilityTitle")}
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-ink-soft">
          {t("dataPage.stabilityBody")}
        </p>
      </section>
    </div>
  );
}
