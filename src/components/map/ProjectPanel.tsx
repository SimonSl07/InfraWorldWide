"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Lot, Project, Status } from "@/lib/schema";
import { formatDate, formatMoney } from "@/lib/format";
import { CATEGORY_COLORS } from "@/lib/map-style";
import { expectedOpeningYear } from "@/lib/contract";
import ContractTerms from "@/components/ContractTerms";

const STATUS_BADGE: Record<Status, string> = {
  opened: "bg-green-100 text-green-800",
  under_construction: "bg-amber-100 text-amber-800",
  tendered: "bg-blue-100 text-blue-800",
  planned: "bg-neutral-100 text-neutral-600",
  cancelled: "bg-red-100 text-red-700",
};

interface ProjectPanelProps {
  project: Project;
  lot: Lot;
  onClose: () => void;
}

export default function ProjectPanel({ project, lot, onClose }: ProjectPanelProps) {
  const t = useTranslations();
  const locale = useLocale();
  const name = (s: { en: string; ro?: string }) =>
    locale === "ro" && s.ro ? s.ro : s.en;

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
    <aside className="absolute top-4 right-4 z-10 w-80 max-w-[calc(100%-2rem)] bg-white/95 backdrop-blur rounded-xl shadow-lg border border-neutral-200 p-4 overflow-y-auto max-h-[calc(100%-2rem)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: CATEGORY_COLORS[project.category] }}
          >
            {t(`category.${project.category}`)}
          </div>
          <h3 className="font-bold leading-tight">{name(project.name)}</h3>
          <div className="text-sm text-neutral-600">{name(lot.name)}</div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-neutral-400 hover:text-neutral-900 text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[lot.status]}`}
        >
          {t(`status.${lot.status}`)}
        </span>
        <span className="text-neutral-600">
          {lot.lengthKm} km
        </span>
      </div>

      {(dateRows.length > 0 || derivedYear !== null) && (
        <dl className="mt-3 space-y-1 text-sm">
          {dateRows.map((r) => (
            <div key={r.label} className="flex justify-between gap-2">
              <dt className="text-neutral-500">{r.label}</dt>
              <dd className="font-medium">{formatDate(r.value!, locale)}</dd>
            </div>
          ))}
          {derivedYear !== null && (
            <div className="flex justify-between gap-2">
              <dt className="text-neutral-500">
                {t("project.expectedOpeningDerived")}
              </dt>
              <dd className="font-medium tabular-nums">≈{derivedYear}</dd>
            </div>
          )}
        </dl>
      )}

      {(lot.cost?.estimated || lot.cost?.actual) && (
        <div className="mt-3 text-sm">
          <div className="text-neutral-500">{t("project.cost")}</div>
          <div className="mt-0.5 space-y-0.5">
            {lot.cost.estimated && (
              <div className="flex justify-between">
                <span>{t("project.estimated")}</span>
                <span className="font-medium">
                  {formatMoney(lot.cost.estimated)} ({lot.cost.estimated.year})
                </span>
              </div>
            )}
            {lot.cost.actual && (
              <div className="flex justify-between">
                <span>{t("project.actual")}</span>
                <span className="font-medium">
                  {formatMoney(lot.cost.actual)} ({lot.cost.actual.year})
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {lot.funding && lot.funding.length > 0 && (
        <div className="mt-3 text-sm">
          <div className="text-neutral-500">{t("project.funding")}</div>
          <div className="mt-0.5">
            {lot.funding.map((f, i) => (
              <span key={i}>
                {t(`funding.${f.source}`)}
                {i < lot.funding!.length - 1 ? ", " : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {lot.contract && <ContractTerms contract={lot.contract} />}

      {lot.contractors && lot.contractors.length > 0 && (
        <div className="mt-3 text-sm">
          <div className="text-neutral-500">{t("project.contractors")}</div>
          <div className="mt-0.5">
            {lot.contractors.map((c) => c.name).join(", ")}
          </div>
        </div>
      )}

      <Link
        href={`/projects/${project.id}`}
        className="mt-4 inline-block text-sm font-medium text-neutral-900 underline underline-offset-2 hover:text-neutral-600"
      >
        {t("map.viewProject")} →
      </Link>
    </aside>
  );
}
