import { Link } from "@/i18n/navigation";
import { contractSummaryParts } from "@/lib/contract";
import { formatKm } from "@/lib/format";
import type { createLocalizer } from "@/lib/localized";
import { constructionProgress, lotMilestones } from "@/lib/lot-timeline";
import { isOnMainMap, mapLotHref } from "@/lib/map-link";
import {
  lotActualCost,
  lotEstimatedCost,
  type Money,
  type Project,
} from "@/lib/schema";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LotCitations } from "./LotCitations";
import { LotTimeline } from "./LotTimeline";
import { MoneyLine, type Translate } from "./MoneyLine";

/**
 * The project page's table of sections: one row per lot with its status and
 * progress, timeline, costs, funding, contractors and contract, and the
 * citations behind them.
 *
 * Hook-free: the page hands down its translator, locale and localizer so the
 * table renders on the server with the rest of the page.
 */
export function LotsTable({
  project,
  nowMonth,
  sourceNumbers,
  ownerName,
  name,
  t,
  locale,
}: {
  project: Project;
  nowMonth: number;
  /** From `numberSources(project.sources)`, matching the list at the foot of the page. */
  sourceNumbers: Map<string, number>;
  /** Resolves `lot.sharedWith`, a project id, to that project's name. */
  ownerName: (projectId: string) => string;
  name: ReturnType<typeof createLocalizer>;
  t: Translate;
  locale: string;
}) {
  const costLine = (label: string, money: Money) => (
    <li key={label}>
      <span className="font-medium text-ink-soft">{label}</span>{" "}
      <MoneyLine money={money} locale={locale} t={t} />
    </li>
  );

  return (
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
              <tr key={lot.id} className="border-b border-line-soft align-top">
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
                  <LotCitations
                    lot={lot}
                    lotName={name(lot.name)}
                    sources={project.sources}
                    sourceNumbers={sourceNumbers}
                    t={t}
                  />
                  {isOnMainMap(project, lot) && (
                    <div className="mt-1">
                      <Link
                        href={mapLotHref({
                          projectId: project.id,
                          lotId: lot.id,
                        })}
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
                  <StatusBadge
                    status={lot.status}
                    label={t(`status.${lot.status}`)}
                    className="text-xs whitespace-nowrap"
                  />
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
                            progress.overdueMonths > 0 ? "bg-bad" : "bg-warn"
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
                  {formatKm(lot.lengthKm, locale)}
                </td>
                <td className="py-3 pr-4 text-ink-soft">
                  <LotTimeline
                    milestones={lotMilestones(lot, nowMonth)}
                    t={t}
                    locale={locale}
                  />
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
                    ? contractSummaryParts(lot.contract, t, locale).join(
                        " · ",
                      ) || "–"
                    : "–"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
