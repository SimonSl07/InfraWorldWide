import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import {
  getContractors,
  getCorridorTable,
  getDeflators,
  getFxTable,
  getProject,
  getProjects,
} from "@/lib/data";
import { formatDate, formatKm, formatMoney, formatNumber } from "@/lib/format";
import { categoryVar } from "@/lib/map-theme";
import { Link } from "@/i18n/navigation";
import ProjectMiniMap from "@/components/map/ProjectMiniMap";
import { contractSummaryParts } from "@/lib/contract";
import { currentMonth } from "@/lib/slip";
import { commonLatestYear, createDeflator } from "@/lib/deflator";
import { createConverter } from "@/lib/fx";
import { createContractorResolver } from "@/lib/contractors";
import { collectLotMetrics } from "@/lib/rankings";
import { projectCostRows } from "@/lib/performance";
import {
  constructionProgress,
  lotMilestones,
  type Milestone,
} from "@/lib/lot-timeline";
import { fundingBreakdown, projectTotals } from "@/lib/project-summary";
import { lotCitations, numberSources } from "@/lib/lot-sources";
import { relatedProjects } from "@/lib/related-projects";
import { createLocalizer, localized } from "@/lib/localized";
import { corridorsOfProject } from "@/lib/corridors";
import { pageMetadata } from "@/lib/page-metadata";
import { breadcrumbList, jsonLdScript } from "@/lib/structured-data";
import { siteUrl } from "@/lib/seo";
import { isOnMainMap, mapLotHref } from "@/lib/map-link";
import {
  isSharedTrack,
  lotActualCost,
  lotEstimatedCost,
  type Money,
  type Source,
  type Status,
} from "@/lib/schema";

const STATUS_BADGE: Record<Status, string> = {
  opened: "bg-good-soft text-good",
  under_construction: "bg-warn-soft text-warn",
  tendered: "bg-info-soft text-info",
  planned: "bg-surface-raised text-ink-soft",
  cancelled: "bg-bad-soft text-bad",
};

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

  const deflators = getDeflators();
  const fx = getFxTable();
  const priceYear = commonLatestYear(deflators) ?? deflators.baseYear;
  const costOptions = {
    deflate: createDeflator(deflators),
    convert: createConverter(fx),
    priceYear,
  };
  const resolve = createContractorResolver(getContractors());
  const costRow =
    projectCostRows(
      collectLotMetrics([project], {
        deflate: costOptions.deflate,
        convert: costOptions.convert,
        priceYear,
        resolve,
        nowMonth,
      }),
      costOptions,
    )[0] ?? null;

  const related = relatedProjects(project, getProjects(), { resolve, limit: 6 });
  const corridors = corridorsOfProject(project, getCorridorTable());

  /* ── Citations ───────────────────────────────────────────────────────── */

  const sourceNumbers = numberSources(project.sources);

  const Citations = ({ lot }: { lot: (typeof project.lots)[number] }) => {
    const citations = lotCitations(lot, project.sources);
    if (
      citations.refs.length === 0 &&
      citations.own.length === 0 &&
      citations.unresolved.length === 0
    ) {
      return null;
    }
    return (
      <div
        className="mt-1 flex flex-wrap items-center gap-1 text-xs font-normal"
        aria-label={t("project.lotSourcesLabel", { lot: name(lot.name) })}
        role="group"
      >
        {citations.refs.map((source) => {
          const number = sourceNumbers.get(source.url)!;
          return (
            <a
              key={source.url}
              href={`#source-${number}`}
              aria-label={t("project.citationLabel", {
                number,
                title: source.title,
              })}
              className="rounded bg-surface-raised px-1.5 py-0.5 tabular-nums text-ink-muted hover:text-ink"
            >
              {number}
            </a>
          );
        })}
        {citations.own.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded bg-surface-raised px-1.5 py-0.5 text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            {source.title}
          </a>
        ))}
        {/* A reference resolving to nothing is a data fault, and saying so is
            better than rendering a section that looks uncited. */}
        {citations.unresolved.map((ref) => (
          <span
            key={ref}
            title={t("project.sourceMissing")}
            className="rounded bg-bad-soft px-1.5 py-0.5 text-bad"
          >
            {ref}
          </span>
        ))}
      </div>
    );
  };

  /* ── Milestones ──────────────────────────────────────────────────────── */

  const milestoneLabel = (milestone: Milestone) => {
    if (milestone.date !== null) return formatDate(milestone.date, lang);
    // Derived: a contract implies a month, not a day, and stating one would
    // claim a precision no source published.
    return `≈${Math.floor(milestone.month / 12)}`;
  };

  const Timeline = ({ milestones }: { milestones: Milestone[] }) => {
    if (milestones.length === 0) return <>{"–"}</>;
    return (
      <ol className="space-y-1">
        {milestones.map((milestone) => (
          <li
            key={`${milestone.kind}-${milestone.month}`}
            className="flex items-baseline gap-1.5 whitespace-nowrap"
          >
            <span
              aria-hidden
              className={`inline-block h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${
                milestone.future
                  ? "border border-line-strong"
                  : "bg-ink-faint"
              }`}
            />
            <span className="tabular-nums">{milestoneLabel(milestone)}</span>
            <span
              className={milestone.future ? "text-ink-faint" : "text-ink-soft"}
            >
              {t(`project.${milestone.kind}`)}
            </span>
            {milestone.derived && (
              <span
                className="rounded bg-surface-raised px-1 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted"
                title={t("project.expectedOpeningDerived")}
              >
                {t("project.expectedOpeningDerived")}
              </span>
            )}
          </li>
        ))}
      </ol>
    );
  };

  /**
   * One recorded cost figure, with everything the source qualified it with.
   *
   * The price year is optional, so it is only printed when there is one: a
   * blank pair of brackets, or worse a year that is not the source's, would
   * change what the figure claims. Scope and confidence are shown when they
   * are not the plain case, because a whole-programme total sitting in a
   * per-section column is exactly the figure that gets misread.
   */
  const moneyTag = (text: string) => (
    <span className="ml-1.5 rounded bg-surface-raised px-1 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
      {text}
    </span>
  );

  const moneyLine = (money: Money) => (
    <>
      {formatMoney(money, lang)}
      {money.year !== undefined && (
        <span className="ml-1 text-xs text-ink-faint">({money.year})</span>
      )}
      {money.scope &&
        money.scope !== "total" &&
        moneyTag(t(`project.moneyScope.${money.scope}`))}
      {money.confidence &&
        money.confidence !== "reported" &&
        moneyTag(t(`project.moneyConfidence.${money.confidence}`))}
      {money.note && (
        <span className="block max-w-xs text-xs leading-snug text-ink-muted">
          {money.note}
        </span>
      )}
    </>
  );

  const costLine = (label: string, money: Money) => (
    <li key={label}>
      <span className="font-medium text-ink-soft">{label}</span>{" "}
      {moneyLine(money)}
    </li>
  );

  const SourceEntry = ({ source, number }: { source: Source; number: number }) => (
    <li id={`source-${number}`} className="scroll-mt-24">
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-ink"
      >
        {source.title}
      </a>
      {(source.retrievedOn || source.archiveUrl) && (
        <span className="ml-2 text-xs text-ink-faint">
          {source.retrievedOn &&
            t("project.sourceRetrieved", {
              date: formatDate(source.retrievedOn, lang),
            })}
          {source.retrievedOn && source.archiveUrl && " · "}
          {source.archiveUrl && (
            <a
              href={source.archiveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-ink"
            >
              {t("project.sourceArchive")}
            </a>
          )}
        </span>
      )}
    </li>
  );

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
            {moneyLine(project.cost)}
          </div>
        </div>
      )}

      <div className="mt-6">
        <ProjectMiniMap
          country={project.country}
          projectId={project.id}
          category={project.category}
        />
      </div>

      <h2 className="mt-10 text-xl font-semibold">{t("project.lots")}</h2>
      <div
        className="mt-4 overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        tabIndex={0}
        role="region"
        aria-label={t("project.lotsTableLabel", { project: name(project.name) })}
      >
        <table className="w-full text-sm border-collapse">
          <caption className="sr-only">
            {t("project.lotsTableLabel", { project: name(project.name) })}
          </caption>
          <thead>
            <tr className="text-left text-ink-muted border-b border-line">
              <th scope="col" className="py-2 pr-4 font-medium">
                {t("project.lots")}
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {t("project.status")}
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {t("project.length")}
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {t("project.dates")}
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {t("project.cost")}
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {t("project.funding")}
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                {t("project.contractors")}
              </th>
              <th scope="col" className="py-2 font-medium">
                {t("project.contract")}
              </th>
            </tr>
          </thead>
          <tbody>
            {project.lots.map((lot) => {
              const estimated = lotEstimatedCost(lot);
              const actual = lotActualCost(lot);
              const costLines = [
                estimated ? costLine(t("project.estimated"), estimated) : null,
                actual ? costLine(t("project.actual"), actual) : null,
              ].filter((line) => line !== null);
              const progress = constructionProgress(lot, nowMonth);
              return (
                <tr
                  key={lot.id}
                  className="border-b border-line-soft align-top"
                >
                  {/* The section names the row, so it is a header cell. */}
                  <th
                    scope="row"
                    className="py-3 pr-4 text-left align-top font-medium"
                  >
                    {name(lot.name)}
                    {lot.sharedWith && (
                      <div
                        className="mt-1 text-xs font-normal text-ink-muted"
                        title={t("project.sharedTrackNote")}
                      >
                        <span className="rounded-full bg-surface-raised px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                          {t("project.sharedTrack")}
                        </span>{" "}
                        {t("project.sharedTrackWith", {
                          project: ownerName(lot.sharedWith),
                        })}
                      </div>
                    )}
                    {/* Prose about the section. 160 lots carry one, and until
                        the migration it sat in `contract.noticeReference`
                        where nothing rendered it. */}
                    {lot.note && (
                      <p className="mt-1 max-w-xs text-xs font-normal leading-snug text-ink-muted">
                        {name(lot.note)}
                      </p>
                    )}
                    <Citations lot={lot} />
                    {isOnMainMap(project, lot) && (
                      <div className="mt-1">
                        <Link
                          href={mapLotHref(lot.id)}
                          aria-label={t("project.showOnMapLabel", {
                            lot: name(lot.name),
                          })}
                          className="text-xs font-normal text-ink-muted underline underline-offset-2 hover:text-ink"
                        >
                          {t("project.showOnMap")} →
                        </Link>
                      </div>
                    )}
                  </th>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_BADGE[lot.status]}`}
                    >
                      {t(`status.${lot.status}`)}
                    </span>
                    {progress && (
                      <div className="mt-2 w-32">
                        {/* The bar is decoration: the figures under it say the
                            same thing in words. */}
                        <div
                          aria-hidden
                          className="h-1.5 overflow-hidden rounded-full bg-line"
                        >
                          <div
                            className={`h-full rounded-full ${
                              progress.overdueMonths > 0
                                ? "bg-bad"
                                : "bg-warn"
                            }`}
                            style={{
                              width: `${Math.min(100, progress.ratio * 100)}%`,
                            }}
                          />
                        </div>
                        <div className="mt-1 text-[11px] tabular-nums text-ink-muted">
                          {t("project.progressLabel", {
                            elapsed: progress.elapsedMonths,
                            contracted: progress.contractedMonths,
                          })}
                        </div>
                        {progress.overdueMonths > 0 && (
                          <div className="text-[11px] font-medium text-bad">
                            {t("project.progressOverdue", {
                              months: progress.overdueMonths,
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap tabular-nums">
                    {formatKm(lot.lengthKm, lang)}
                  </td>
                  <td className="py-3 pr-4 text-ink-soft">
                    <Timeline milestones={lotMilestones(lot, nowMonth)} />
                  </td>
                  <td className="py-3 pr-4 text-ink-soft">
                    {costLines.length > 0 ? (
                      <ul className="space-y-1">{costLines}</ul>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="py-3 pr-4 text-ink-soft">
                    {lot.funding && lot.funding.length > 0 ? (
                      <ul className="space-y-1">
                        {lot.funding.map((f, i) => (
                          <li key={`${f.source}-${i}`}>
                            <span className="font-medium text-ink-soft">
                              {t(`funding.${f.source}`)}
                            </span>
                            {/* Some details run to a full paragraph of
                                financing arrangements; without a bound they
                                stretch the whole table. */}
                            {f.detail && (
                              <span className="block max-w-xs text-xs leading-snug text-ink-muted">
                                {name(f.detail)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="py-3 pr-4 text-ink-soft">
                    {lot.contractors && lot.contractors.length > 0 ? (
                      <ul className="space-y-1">
                        {lot.contractors.map((c, i) => (
                          <li key={`${c.name}-${i}`}>
                            {c.name}
                            {c.role && (
                              <span className="ml-1.5 rounded-full bg-surface-raised px-2 py-0.5 text-[11px] text-ink-soft whitespace-nowrap">
                                {t(`contractorRole.${c.role}`)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="py-3 text-ink-soft">
                    {lot.contract
                      ? contractSummaryParts(lot.contract, t, lang).join(" · ") ||
                        "–"
                      : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
