"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import DataTable, { type Column } from "@/components/DataTable";
import { CountryLabel } from "@/components/ui/CountryLabel";
import { SectionLink } from "@/components/ui/SectionLink";
import { createCountryNamer } from "@/lib/country-names";
import {
  formatKm,
  formatMonth,
  formatMonths,
  formatPercent,
} from "@/lib/format";
import type { Category } from "@/lib/schema";
import type { CostBasis } from "@/lib/rankings";

/**
 * The four performance tables.
 *
 * Rows arrive already localized and already ordered into something
 * meaningful, because clearing the sort (the third click on a header) falls
 * back to that order. Everything here is plain JSON: the page computes on
 * the server and this component only presents.
 */

export interface SlipRow {
  key: string;
  projectId: string;
  projectName: string;
  lotName: string;
  country: string;
  category: Category;
  lengthKm: number;
  openedMonth: number;
  slipMonths: number | null;
  contractMonths: number | null;
}

export interface CostRowData {
  key: string;
  projectId: string;
  projectName: string;
  lotName: string;
  country: string;
  category: Category;
  lengthKm: number;
  basis: CostBasis;
  // The price year is optional: a sourced figure whose year the source never
  // states is still recorded, and is shown without one.
  recorded: { amount: number; currency: string; year?: number };
  comparable: number | null;
  perKm: number | null;
}

export interface ProjectCostRowData {
  key: string;
  projectId: string;
  projectName: string;
  country: string;
  category: Category;
  costedLots: number;
  totalLots: number;
  costedKm: number;
  totalKm: number;
  comparable: number | null;
  perKm: number | null;
  complete: boolean;
}

export interface GroupRow {
  key: string;
  label: string;
  /** Set on country rows so the label can carry a flag and a link. */
  countryCode?: string;
  lots: number;
  km: number;
  medianSlip: number | null;
  slipN: number;
  onTimeShare: number | null;
  medianOverrun: number | null;
  overrunN: number;
}

interface Props {
  slipRows: SlipRow[];
  costRows: CostRowData[];
  projectCostRows: ProjectCostRowData[];
  contractorRows: GroupRow[];
  countryRows: GroupRow[];
  /** Currency and price year every comparable figure is expressed in. */
  baseCurrency: string;
  priceYear: number;
}

function Tone({
  value,
  children,
}: {
  value: number | null;
  children: React.ReactNode;
}) {
  if (value === null) return <span className="text-ink-faint">{"–"}</span>;
  return (
    <span className={value > 0 ? "text-bad" : value < 0 ? "text-good" : ""}>
      {children}
    </span>
  );
}

function Sample({ n }: { n: number }) {
  return <span className="ml-1 text-xs text-ink-faint">n={n}</span>;
}

export default function PerformanceTables({
  slipRows,
  costRows,
  projectCostRows,
  contractorRows,
  countryRows,
  baseCurrency,
  priceYear,
}: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const nameOf = useMemo(() => createCountryNamer(locale), [locale]);
  const [costScope, setCostScope] = useState<"section" | "project">("section");

  const money = (amount: number | null) =>
    amount === null ? (
      <span className="text-ink-faint">{"–"}</span>
    ) : (
      `${amount.toLocaleString(locale, { maximumFractionDigits: amount < 100 ? 1 : 0 })}`
    );

  const sectionCell = (row: {
    projectId: string;
    projectName: string;
    lotName?: string;
    category: Category;
  }) => (
    <SectionLink
      projectId={row.projectId}
      projectName={row.projectName}
      lotName={row.lotName}
      category={row.category}
    />
  );

  const countryCell = (code: string) => (
    <CountryLabel
      code={code}
      name={nameOf(code)}
      className="whitespace-nowrap"
      flagClassName="mr-1.5"
    />
  );

  /* ── 1. Opened sections ─────────────────────────────────────────────── */

  const slipColumns: Column<SlipRow>[] = [
    {
      id: "section",
      header: t("rankings.thSection"),
      // Names the row, so a screen reader reads "Sebeș–Turda, slip, +14 mo"
      // rather than a bare number with no subject.
      rowHeader: true,
      sortValue: (r) => `${r.projectName} ${r.lotName}`,
      cell: sectionCell,
    },
    {
      id: "country",
      header: t("rankings.thCountry"),
      sortValue: (r) => nameOf(r.country),
      cell: (r) => countryCell(r.country),
    },
    {
      id: "category",
      header: t("performance.thCategory"),
      // Singular: this cell describes one section, not the whole filter
      // group the plural `category.*` labels name.
      sortValue: (r) => t(`categorySingular.${r.category}`),
      cell: (r) => (
        <span className="text-ink-soft">
          {t(`categorySingular.${r.category}`)}
        </span>
      ),
    },
    {
      id: "length",
      header: t("rankings.thKm"),
      numeric: true,
      sortValue: (r) => r.lengthKm,
      cell: (r) => formatKm(r.lengthKm, locale),
    },
    {
      id: "opened",
      header: t("rankings.thOpened"),
      numeric: true,
      sortValue: (r) => r.openedMonth,
      cell: (r) => formatMonth(r.openedMonth, locale),
    },
    {
      id: "slip",
      header: t("rankings.thSlip"),
      numeric: true,
      sortValue: (r) => r.slipMonths,
      cell: (r) => (
        <Tone value={r.slipMonths}>
          <span className="font-semibold">
            {r.slipMonths !== null &&
              formatMonths(r.slipMonths, t("rankings.unitMonths"), locale)}
          </span>
        </Tone>
      ),
    },
  ];

  /* ── 2. Costs ───────────────────────────────────────────────────────── */

  const basisTag = (basis: CostBasis) => (
    <span className="ml-1.5 rounded bg-surface-raised px-1 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
      {t(`performance.basis.${basis}`)}
    </span>
  );

  const costColumns: Column<CostRowData>[] = [
    {
      id: "section",
      header: t("rankings.thSection"),
      rowHeader: true,
      sortValue: (r) => `${r.projectName} ${r.lotName}`,
      cell: sectionCell,
    },
    {
      id: "country",
      header: t("rankings.thCountry"),
      sortValue: (r) => nameOf(r.country),
      cell: (r) => countryCell(r.country),
    },
    {
      id: "length",
      header: t("rankings.thKm"),
      numeric: true,
      sortValue: (r) => r.lengthKm,
      cell: (r) => formatKm(r.lengthKm, locale),
    },
    {
      id: "recorded",
      header: t("performance.thRecorded"),
      numeric: true,
      // Not sortable: these are four different currencies, so an ordering
      // across them would compare numbers that are not the same thing.
      cell: (r) => (
        <span className="whitespace-nowrap">
          {r.recorded.amount.toLocaleString(locale, {
            maximumFractionDigits: 0,
          })}{" "}
          {r.recorded.currency}
          {r.recorded.year !== undefined && (
            <span className="ml-1 text-xs text-ink-faint">
              {r.recorded.year}
            </span>
          )}
          {basisTag(r.basis)}
        </span>
      ),
    },
    {
      id: "comparable",
      header: t("performance.thComparable", {
        currency: baseCurrency,
        year: priceYear,
      }),
      numeric: true,
      sortValue: (r) => r.comparable,
      cell: (r) => money(r.comparable),
    },
    {
      id: "perKm",
      header: t("performance.thPerKm", { currency: baseCurrency }),
      numeric: true,
      sortValue: (r) => r.perKm,
      cell: (r) => <span className="font-semibold">{money(r.perKm)}</span>,
    },
  ];

  const projectCostColumns: Column<ProjectCostRowData>[] = [
    {
      id: "project",
      header: t("performance.thProject"),
      rowHeader: true,
      sortValue: (r) => r.projectName,
      cell: sectionCell,
    },
    {
      id: "country",
      header: t("rankings.thCountry"),
      sortValue: (r) => nameOf(r.country),
      cell: (r) => countryCell(r.country),
    },
    {
      id: "length",
      header: t("rankings.thKm"),
      numeric: true,
      sortValue: (r) => r.totalKm,
      cell: (r) => formatKm(r.totalKm, locale),
    },
    {
      id: "coverage",
      header: t("performance.thCovered"),
      numeric: true,
      sortValue: (r) => (r.totalLots > 0 ? r.costedLots / r.totalLots : null),
      cell: (r) => (
        <span className={r.complete ? "" : "text-warn"}>
          {t("performance.covered", {
            costed: r.costedLots,
            total: r.totalLots,
          })}
        </span>
      ),
    },
    {
      id: "comparable",
      header: t("performance.thComparable", {
        currency: baseCurrency,
        year: priceYear,
      }),
      numeric: true,
      sortValue: (r) => r.comparable,
      cell: (r) => money(r.comparable),
    },
    {
      id: "perKm",
      header: t("performance.thPerKm", { currency: baseCurrency }),
      numeric: true,
      sortValue: (r) => r.perKm,
      cell: (r) => <span className="font-semibold">{money(r.perKm)}</span>,
    },
  ];

  /* ── 3 & 4. Groups ──────────────────────────────────────────────────── */

  /**
   * `links` says where the first column points. It is explicit rather than
   * inferred from the row, because a firm and a country are two different
   * destinations and a row that guessed wrong would send readers to a page
   * that does not exist.
   */
  const groupColumns = (
    firstHeader: string,
    links: "country" | "contractor",
  ): Column<GroupRow>[] => [
    {
      id: "label",
      header: firstHeader,
      rowHeader: true,
      sortValue: (r) => r.label,
      cell: (r) =>
        links === "country" && r.countryCode ? (
          <Link
            href={`/countries/${r.countryCode}`}
            className="font-medium hover:underline underline-offset-2"
          >
            {countryCell(r.countryCode)}
          </Link>
        ) : links === "contractor" ? (
          // GroupRow.key is the firm's profile id, so the league row is a
          // link to that firm's own page rather than dead text.
          <Link
            href={`/contractors/${r.key}`}
            className="font-medium hover:underline underline-offset-2"
          >
            {r.label}
          </Link>
        ) : (
          <span className="font-medium">{r.label}</span>
        ),
    },
    {
      id: "lots",
      header: t("rankings.thLots"),
      numeric: true,
      sortValue: (r) => r.lots,
      cell: (r) => r.lots,
    },
    {
      id: "km",
      header: t("rankings.thKm"),
      numeric: true,
      sortValue: (r) => r.km,
      cell: (r) => formatKm(r.km, locale),
    },
    {
      id: "slip",
      header: t("rankings.thMedianSlip"),
      numeric: true,
      sortValue: (r) => r.medianSlip,
      cell: (r) => (
        <>
          <Tone value={r.medianSlip}>
            {r.medianSlip !== null &&
              formatMonths(r.medianSlip, t("rankings.unitMonths"), locale)}
          </Tone>
          {r.medianSlip !== null && <Sample n={r.slipN} />}
        </>
      ),
    },
    {
      id: "onTime",
      header: t("rankings.thOnTime"),
      numeric: true,
      sortValue: (r) => r.onTimeShare,
      cell: (r) =>
        r.onTimeShare === null ? (
          <span className="text-ink-faint">{"–"}</span>
        ) : (
          `${Math.round(r.onTimeShare * 100)}%`
        ),
    },
    {
      id: "overrun",
      header: t("rankings.thMedianOverrun"),
      numeric: true,
      sortValue: (r) => r.medianOverrun,
      cell: (r) => (
        <>
          <Tone value={r.medianOverrun}>
            {r.medianOverrun !== null && formatPercent(r.medianOverrun, locale)}
          </Tone>
          {r.medianOverrun !== null && <Sample n={r.overrunN} />}
        </>
      ),
    },
  ];

  const heading = (title: string, help: string) => (
    <>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-muted">{help}</p>
    </>
  );

  return (
    <>
      <section className="mt-12">
        {heading(t("performance.openedTitle"), t("performance.openedHelp"))}
        <DataTable
          columns={slipColumns}
          rows={slipRows}
          rowKey={(r) => r.key}
          emptyMessage={t("rankings.emptySlip")}
          footnote={t("performance.orderOpened")}
          caption={t("performance.openedTitle")}
        />
      </section>

      <section className="mt-12">
        {heading(t("performance.costTitle"), t("performance.costHelp"))}
        <div className="mt-3 inline-flex rounded-lg border border-line-strong p-0.5 text-sm">
          {(["section", "project"] as const).map((scope) => (
            <button
              key={scope}
              type="button"
              onClick={() => setCostScope(scope)}
              aria-pressed={costScope === scope}
              className={`rounded-md px-3 py-1 transition-colors ${
                costScope === scope
                  ? "bg-inverse text-on-inverse"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {t(`performance.scope.${scope}`)}
            </button>
          ))}
        </div>
        {costScope === "section" ? (
          <DataTable
            key="cost-section"
            columns={costColumns}
            rows={costRows}
            rowKey={(r) => r.key}
            emptyMessage={t("performance.emptyCost")}
            footnote={t("performance.orderCost")}
            caption={t("performance.captionCostSection")}
          />
        ) : (
          <DataTable
            key="cost-project"
            columns={projectCostColumns}
            rows={projectCostRows}
            rowKey={(r) => r.key}
            emptyMessage={t("performance.emptyCost")}
            footnote={t("performance.orderCost")}
            caption={t("performance.captionCostProject")}
          />
        )}
      </section>

      <section className="mt-12">
        {heading(
          t("rankings.byContractorTitle"),
          t("performance.contractorHelp"),
        )}
        <DataTable
          columns={groupColumns(t("rankings.thFirm"), "contractor")}
          rows={contractorRows}
          rowKey={(r) => r.key}
          emptyMessage={t("rankings.emptyGroup")}
          footnote={t("performance.orderGroup")}
          caption={t("rankings.byContractorTitle")}
        />
        {/* The league ranks firms that clear a minimum; the index carries
            every one of them, including those with a single section. */}
        <p className="mt-2 text-sm">
          <Link
            href="/contractors"
            className="text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            {t("rankings.allContractors")} →
          </Link>
        </p>
      </section>

      <section className="mt-12">
        {heading(t("rankings.byCountryTitle"), t("performance.countryHelp"))}
        <DataTable
          columns={groupColumns(t("rankings.thCountry"), "country")}
          rows={countryRows}
          rowKey={(r) => r.key}
          emptyMessage={t("rankings.emptyGroup")}
          footnote={t("performance.orderGroup")}
          caption={t("rankings.byCountryTitle")}
        />
      </section>
    </>
  );
}
