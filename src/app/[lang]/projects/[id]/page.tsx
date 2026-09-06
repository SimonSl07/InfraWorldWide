import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import {
  getAnalysisContext,
  getCorridorTable,
  getLotMetrics,
  getProject,
  getProjects,
} from "@/lib/data";
import { formatDate, formatKm, formatMoney, formatNumber } from "@/lib/format";
import { categoryVar } from "@/lib/map-theme";
import { Link } from "@/i18n/navigation";
import ProjectMiniMap from "@/components/map/ProjectMiniMap";
import { LotsTable } from "@/components/project/LotsTable";
import { MoneyLine } from "@/components/project/MoneyLine";
import { SourceEntry } from "@/components/project/SourceEntry";
import { currentMonth } from "@/lib/slip";
import { projectCostRows } from "@/lib/performance";
import { fundingBreakdown, projectTotals } from "@/lib/project-summary";
import { numberSources } from "@/lib/lot-sources";
import { relatedProjects } from "@/lib/related-projects";
import { createLocalizer, localized } from "@/lib/localized";
import { corridorsOfProject } from "@/lib/corridors";
import { pageMetadata } from "@/lib/page-metadata";
import { breadcrumbList, jsonLdScript } from "@/lib/structured-data";
import { siteUrl } from "@/lib/seo";
import { isSharedTrack } from "@/lib/schema";

export function generateStaticParams() {
  // Locales are enumerated by the parent [lang] layout.
  return getProjects().map((p) => ({ id: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const project = getProject(id);
  if (!project) return {};
  const t = await getTranslations({ locale: lang, namespace: "site" });
  return pageMetadata({
    locale: lang,
    path: `/projects/${project.id}`,
    title: localized(project.name, lang),
    // The description is localized and already on the page; leaving it out
    // meant every project shared the site-wide one in search results.
    description: localized(project.description, lang),
    siteName: t("name"),
  });
}

export default async function ProjectPage({
  params,
}: PageProps<"/[lang]/projects/[id]">) {
  const { lang, id } = await params;
  setRequestLocale(lang);
  const t = await getTranslations();

  const project = getProject(id);
  if (!project) notFound();

  const name = createLocalizer(lang);
  const nowMonth = currentMonth(new Date());

  const breadcrumbs = breadcrumbList({
    baseUrl: siteUrl(process.env),
    locale: lang,
    items: [
      { name: t("site.name"), path: "/" },
      { name: t("projects.title"), path: "/projects" },
      { name: name(project.name), path: `/projects/${project.id}` },
    ],
  });

  // Track shared with another line names the project that owns it. Resolve it
  // to that project's name, so the reader is told which line rather than an
  // internal id.
  const ownerName = (projectId: string) => {
    const owner = getProject(projectId);
    return owner ? name(owner.name) : projectId;
  };

  const hasSharedTrack = project.lots.some(isSharedTrack);
  const hasContractorRoles = project.lots.some((l) =>
    l.contractors?.some((c) => c.role),
  );

  const totals = projectTotals(project, nowMonth);
  const funding = fundingBreakdown(project);

  /* ── Cost on the same axis the performance pages use ─────────────────── */

  const { costOptions, priceYear, resolve } = getAnalysisContext(nowMonth);
  const costRow =
    projectCostRows(
      getLotMetrics(nowMonth).filter((m) => m.projectId === project.id),
      costOptions,
    )[0] ?? null;

  const related = relatedProjects(project, getProjects(), { resolve, limit: 6 });
  const corridors = corridorsOfProject(project, getCorridorTable());

  /* ── Citations ───────────────────────────────────────────────────────── */

  const sourceNumbers = numberSources(project.sources);

  const headline = [
    { label: t("project.totalLength"), value: formatKm(totals.totalKm, lang) },
    { label: t("project.openedLength"), value: formatKm(totals.openedKm, lang) },
    ...(totals.underConstructionKm > 0
      ? [
          {
            label: t("country.underConstruction"),
            value: formatKm(totals.underConstructionKm, lang),
          },
        ]
      : []),
    { label: t("project.lots"), value: formatNumber(totals.lots, lang) },
  ];

  return (
    <div className="mx-auto max-w-5xl w-full px-4 py-8">
      {/* The same hierarchy the back-link states, in a form a search engine
          can read. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbs) }}
      />
      <Link
        href="/projects"
        className="text-sm text-ink-muted hover:text-ink"
      >
        ← {t("project.backToProjects")}
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <span
          aria-hidden
          className="inline-block w-6 h-1.5 rounded-full"
          style={{ backgroundColor: categoryVar(project.category) }}
        />
        <span className="text-sm text-ink-muted uppercase">
          {t(`category.${project.category}`)}
        </span>
      </div>
      <h1 className="mt-1 text-3xl font-bold">{name(project.name)}</h1>
      <p className="mt-3 text-ink-soft max-w-3xl">
        {name(project.description)}
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {headline.map((item) => (
          <div key={item.label}>
            <dt className="text-sm text-ink-muted">{item.label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">
              {item.value}
            </dd>
          </div>
        ))}
        {costRow?.total && (
          <div>
            <dt className="text-sm text-ink-muted">{t("project.totalCost")}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">
              {formatMoney(costRow.total, lang)}
            </dd>
            {/* A partial total read as a complete price is the single most
                misleading thing this page could show. */}
            <dd className="mt-0.5 text-xs text-ink-muted">
              {t("project.costCoverage", {
                costed: costRow.costedLots,
                total: costRow.totalLots,
              })}
            </dd>
          </div>
        )}
      </dl>

      {(costRow?.total || totals.alsoCountedElsewhereKm > 0) && (
        <div className="mt-3 max-w-3xl space-y-1 text-xs text-ink-muted">
          {costRow?.total && (
            <p>
              {t("project.costBasis", {
                currency: costRow.total.currency,
                year: String(priceYear),
              })}
            </p>
          )}
          {totals.alsoCountedElsewhereKm > 0 && (
            <p>
              {t("project.alsoCountedElsewhere", {
                km: formatKm(totals.alsoCountedElsewhereKm, lang),
              })}
            </p>
          )}
        </div>
      )}

      {/* One figure for the whole endeavour, where the source never broke it
          out per section. Kept out of the table so it can never be read as
          the cost of any one section. */}
      {project.cost && (
        <div className="mt-6 max-w-3xl rounded-xl border border-line bg-surface-sunken px-4 py-3">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {t("project.projectCostTitle")}
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            <MoneyLine money={project.cost} locale={lang} t={t} />
          </div>
        </div>
      )}

      <div className="mt-6">
        <ProjectMiniMap projectId={project.id} category={project.category} />
      </div>

      <h2 className="mt-10 text-xl font-semibold">{t("project.lots")}</h2>
      <LotsTable
        project={project}
        nowMonth={nowMonth}
        sourceNumbers={sourceNumbers}
        ownerName={ownerName}
        name={name}
        t={t}
        locale={lang}
      />

      {(hasSharedTrack || hasContractorRoles) && (
        <div className="mt-3 max-w-3xl space-y-1 text-xs text-ink-muted">
          {hasSharedTrack && <p>{t("project.sharedTrackNote")}</p>}
          {hasContractorRoles && <p>{t("project.rolesNote")}</p>}
        </div>
      )}

      {funding.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">{t("project.funding")}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {funding.map((share) => (
              <li
                key={share.source}
                className="rounded-xl border border-line p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">
                    {t(`funding.${share.source}`)}
                  </span>
                  <span className="shrink-0 tabular-nums text-ink-soft">
                    {formatKm(share.km, lang)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-ink-muted">
                  {t("country.lots", { count: share.lots })}
                </div>
                {share.details.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs leading-snug text-ink-muted">
                    {share.details.map((detail) => (
                      <li key={detail.en}>{name(detail)}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-3xl text-xs text-ink-muted">
            {t("project.fundingBreakdownNote")}
          </p>
        </section>
      )}

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">{t("project.relatedTitle")}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {related.map(({ project: other, reason, shared }) => (
              <li key={other.id}>
                <Link
                  href={`/projects/${other.id}`}
                  className="block h-full rounded-xl border border-line p-4 transition-colors hover:border-inverse"
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block h-1 w-4 rounded-full"
                      style={{
                        backgroundColor: categoryVar(other.category),
                      }}
                    />
                    <span className="text-xs uppercase text-ink-muted">
                      {t(`category.${other.category}`)}
                    </span>
                  </div>
                  <div className="mt-1 font-semibold leading-snug">
                    {name(other.name)}
                  </div>
                  <div className="mt-1 text-xs text-ink-muted">
                    {reason === "contractor"
                      ? t("project.relatedContractor", {
                          contractors: shared.join(", "),
                        })
                      : t("project.relatedSameKind")}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {corridors.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold">{t("project.corridorsTitle")}</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-muted">
            {t("project.corridorsNote")}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {corridors.map(({ id, corridor }) => (
              <li
                key={id}
                className="rounded-full border border-line bg-surface-sunken px-3 py-1 text-sm"
              >
                <span className="font-medium">{name(corridor.name)}</span>
                <span className="ml-2 text-xs text-ink-muted">
                  {t(`corridorScheme.${corridor.scheme}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="mt-10 text-xl font-semibold">{t("project.sources")}</h2>
      {/* Numbered, because the sections above cite them by number. */}
      <ol className="mt-3 list-decimal pl-5 text-sm text-ink-soft space-y-1">
        {project.sources.map((source) => (
          <SourceEntry
            key={source.url}
            source={source}
            number={sourceNumbers.get(source.url)!}
            t={t}
            locale={lang}
          />
        ))}
      </ol>
      {project.lastVerified && (
        <p className="mt-3 text-xs text-ink-muted">
          {t("project.lastVerified", {
            date: formatDate(project.lastVerified, lang),
          })}
        </p>
      )}
    </div>
  );
}
