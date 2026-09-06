"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Lot, Project } from "@/lib/schema";
import { formatDate, formatKm } from "@/lib/format";
import { createLocalizer } from "@/lib/localized";
import MapPanel from "./MapPanel";
import { categoryVar } from "@/lib/map-theme";
import { expectedOpeningYear } from "@/lib/contract";
import { mapLotHref } from "@/lib/map-link";
import ContractTerms from "@/components/ContractTerms";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MoneyLine } from "@/components/project/MoneyLine";

interface ProjectPanelProps {
  project: Project;
  lot: Lot;
  onClose: () => void;
}

export default function ProjectPanel({ project, lot, onClose }: ProjectPanelProps) {
  const t = useTranslations();
  const locale = useLocale();
  const name = createLocalizer(locale);

  const dateRows: Array<{ label: string; value?: string }> = [
    { label: t("project.announced"), value: lot.dates?.announced },
    { label: t("project.tenderAwarded"), value: lot.dates?.tenderAwarded },
    { label: t("project.constructionStart"), value: lot.dates?.constructionStart },
    { label: t("project.opened"), value: lot.dates?.opened },
    {
      label: t("project.expectedOpening"),
      value: lot.dates?.opened ? undefined : lot.dates?.expectedOpening,
    },
  ].filter((r) => r.value);

  // No sourced expected date, but the contract terms imply one.
  const derivedYear =
    !lot.dates?.opened && !lot.dates?.expectedOpening
      ? expectedOpeningYear(lot)
      : null;

  return (
    <MapPanel onClose={onClose} labelledBy="map-panel-project-heading">
      <div className="pr-8">
        <div
          className="text-[10px] font-semibold uppercase tracking-wide"
          style={{ color: categoryVar(project.category) }}
        >
          {t(`category.${project.category}`)}
        </div>
        <h3 id="map-panel-project-heading" className="font-bold leading-tight">
          {name(project.name)}
        </h3>
        <div className="text-sm text-ink-soft">{name(lot.name)}</div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <StatusBadge status={lot.status} label={t(`status.${lot.status}`)} />
        <span className="text-ink-soft">{formatKm(lot.lengthKm, locale)}</span>
      </div>

      {/* The panel cannot name the owning line: it is handed one project, and
          the pointer is a project id it has no way to resolve. The project
          page, which can, names it there. */}
      {lot.sharedWith && (
        <div className="mt-3 rounded-lg bg-surface-sunken px-3 py-2">
          <div className="text-xs font-semibold text-ink-soft">
            {t("project.sharedTrack")}
          </div>
          <p className="mt-0.5 text-xs leading-snug text-ink-muted">
            {t("project.sharedTrackNote")}
          </p>
        </div>
      )}

      {(dateRows.length > 0 || derivedYear !== null) && (
        <dl className="mt-3 space-y-1 text-sm">
          {dateRows.map((r) => (
            <div key={r.label} className="flex justify-between gap-2">
              <dt className="text-ink-muted">{r.label}</dt>
              <dd className="font-medium">{formatDate(r.value!, locale)}</dd>
            </div>
          ))}
          {derivedYear !== null && (
            <div className="flex justify-between gap-2">
              <dt className="text-ink-muted">
                {t("project.expectedOpeningDerived")}
              </dt>
              <dd className="font-medium tabular-nums">≈{derivedYear}</dd>
            </div>
          )}
        </dl>
      )}

      {(lot.cost?.estimated || lot.cost?.actual) && (
        <div className="mt-3 text-sm">
          <div className="text-ink-muted">{t("project.cost")}</div>
          <div className="mt-0.5 space-y-0.5">
            {lot.cost.estimated && (
              <div className="flex justify-between">
                <span>{t("project.estimated")}</span>
                <span className="font-medium">
                  <MoneyLine money={lot.cost.estimated} locale={locale} t={t} />
                </span>
              </div>
            )}
            {lot.cost.actual && (
              <div className="flex justify-between">
                <span>{t("project.actual")}</span>
                <span className="font-medium">
                  <MoneyLine money={lot.cost.actual} locale={locale} t={t} />
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {lot.funding && lot.funding.length > 0 && (
        <div className="mt-3 text-sm">
          <div className="text-ink-muted">{t("project.funding")}</div>
          <ul className="mt-0.5 space-y-0.5">
            {lot.funding.map((f, i) => (
              <li key={i}>
                {t(`funding.${f.source}`)}
                {f.detail && (
                  <span className="block text-xs leading-snug text-ink-muted">
                    {name(f.detail)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lot.contract && <ContractTerms contract={lot.contract} />}

      {lot.contractors && lot.contractors.length > 0 && (
        <div className="mt-3 text-sm">
          <div className="text-ink-muted">{t("project.contractors")}</div>
          <ul className="mt-0.5 space-y-0.5">
            {lot.contractors.map((c, i) => (
              <li key={`${c.name}-${i}`}>
                {c.name}
                {c.role && (
                  <span className="ml-1.5 rounded-full bg-surface-raised px-1.5 py-0.5 text-[11px] text-ink-soft whitespace-nowrap">
                    {t(`contractorRole.${c.role}`)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Link
          href={`/projects/${project.id}`}
          className="text-sm font-medium text-ink underline underline-offset-2 hover:text-ink-soft"
        >
          {t("map.viewProject")} →
        </Link>
        {/* The address bar already carries ?sel= while a section is open;
            this is the same link in a form that can be copied or opened in a
            new tab without reading it out of the URL. */}
        <Link
          href={mapLotHref({ projectId: project.id, lotId: lot.id })}
          className="text-xs text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          {t("map.linkToSection")}
        </Link>
      </div>
    </MapPanel>
  );
}
