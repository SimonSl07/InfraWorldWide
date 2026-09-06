"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ALL_CATEGORIES,
} from "@/lib/map-style";
import { categoryVar } from "@/lib/map-theme";
import { createCountryNamer, flagEmoji } from "@/lib/country-names";
import { parseCompareParam } from "@/lib/map-filters";
import {
  formatKm,
  formatMonths,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { textMatches } from "@/lib/text";
import { leadersBy, type LeadDirection } from "@/lib/compare-direction";
import CountryPickerMap from "@/components/CountryPickerMap";
import type { Rank, RankedCountry } from "@/lib/country-stats";
import {
  findCountryPerformance,
  type CountryPerformance,
} from "@/lib/country-performance";

/** How many countries fit side by side before the table stops being readable. */
const MAX_COMPARED = 3;

/**
 * Side-by-side country comparison.
 *
 * The chosen countries live in the query string so a comparison can be
 * shared. Reads go through useSearchParams inside the page's Suspense
 * boundary — without one it forces a CSR bailout that would take the whole
 * statically rendered page with it — and writes go through
 * history.replaceState, which updates the link without a navigation.
 */
export default function CountryCompare({
  countries,
  performance,
  priceYear,
  baseCurrency,
}: {
  countries: RankedCountry[];
  /** Delivery record per country, on the same basis as /rankings. */
  performance: CountryPerformance[];
  /** Price year every comparable cost is restated into. */
  priceYear: number;
  /** Currency those costs are converted to. */
  baseCurrency: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const nameOf = useMemo(() => createCountryNamer(locale), [locale]);

  const [selected, setSelected] = useState<string[]>(() =>
    parseCompareParam(
      searchParams.get("compare"),
      countries.map((c) => c.summary.code),
      MAX_COMPARED,
    ),
  );
  const [query, setQuery] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (selected.length > 0) params.set("compare", selected.join(","));
    else params.delete("compare");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`,
    );
  }, [selected]);

  const toggle = (code: string) =>
    setSelected((current) =>
      current.includes(code)
        ? current.filter((c) => c !== code)
        : current.length >= MAX_COMPARED
          ? current
          : [...current, code],
    );

  const compared = selected
    .map((code) => countries.find((c) => c.summary.code === code))
    .filter((c): c is RankedCountry => c !== undefined);

  const rankBadge = (rank: Rank | null) =>
    rank ? (
      <span className="ml-2 rounded-full bg-surface-raised px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink-muted">
        #{rank.position}
      </span>
    ) : null;

  const perf = (c: RankedCountry) =>
    findCountryPerformance(performance, c.summary.code);

  /**
   * A measured figure with the sample size it rests on. Three sections is a
   * different claim from thirty, and the comparison has to be able to say so.
   */
  const withSample = (value: React.ReactNode, n: number) => (
    <>
      {value}
      <span className="ml-1 text-[10px] font-normal text-ink-faint">
        n={n}
      </span>
    </>
  );

  /**
   * `amount` is what the row is compared on. It is kept separate from the
   * rendered value because the cell carries formatting and a rank badge,
   * and the highlight has to be decided on the bare number.
   *
   * `direction` says which end of the row is the good end. Network rows are
   * longer-is-more; on the delivery rows a smaller figure is the better
   * result, and highlighting the largest would praise the worst performer.
   */
  const rows: Array<{
    label: string;
    group: string;
    color?: string;
    direction?: LeadDirection;
    amount: (c: RankedCountry) => number | null;
    value: (c: RankedCountry) => React.ReactNode;
  }> = [
    ...ALL_CATEGORIES.map((category) => ({
      group: t("country.compareGroupNetwork"),
      label: t(`category.${category}`),
      color: categoryVar(category),
      amount: (c: RankedCountry) => c.summary.byCategory[category].openedKm,
      value: (c: RankedCountry) => (
        <>
          {formatKm(c.summary.byCategory[category].openedKm, locale)}
          {rankBadge(c.ranks.openedKm[category])}
        </>
      ),
    })),
    {
      group: t("country.compareGroupNetwork"),
      label: t("country.totalOpened"),
      amount: (c) => c.summary.total.openedKm,
      value: (c) => (
        <>
          <span className="font-semibold">
            {formatKm(c.summary.total.openedKm, locale)}
          </span>
          {rankBadge(c.ranks.openedKm.all)}
        </>
      ),
    },
    {
      group: t("country.compareGroupNetwork"),
      label: t("country.underConstruction"),
      amount: (c) => c.summary.total.underConstructionKm,
      value: (c) => (
        <>
          {formatKm(c.summary.total.underConstructionKm, locale)}
          {rankBadge(c.ranks.underConstructionKm)}
        </>
      ),
    },
    {
      group: t("country.compareGroupNetwork"),
      label: t("country.plannedTitle"),
      amount: (c) => c.summary.total.plannedKm,
      value: (c) => formatKm(c.summary.total.plannedKm, locale),
    },
    {
      group: t("country.compareGroupNetwork"),
      label: t("country.perArea"),
      amount: (c) => c.kmPerArea,
      value: (c) =>
        c.kmPerArea === null ? (
          "–"
        ) : (
          <>
            {formatNumber(c.kmPerArea, locale, 1)}
            {rankBadge(c.ranks.kmPerArea)}
          </>
        ),
    },
    {
      group: t("country.compareGroupNetwork"),
      label: t("country.perCapita"),
      amount: (c) => c.kmPerCapita,
      value: (c) =>
        c.kmPerCapita === null ? (
          "–"
        ) : (
          <>
            {formatNumber(c.kmPerCapita, locale, 1)}
            {rankBadge(c.ranks.kmPerCapita)}
          </>
        ),
    },
    {
      group: t("country.compareGroupNetwork"),
      label: t("country.projects"),
      amount: (c) => c.summary.projects,
      value: (c) => c.summary.projects,
    },
    {
      group: t("country.compareGroupDelivery"),
      label: t("rankings.thMedianSlip"),
      direction: "lowest",
      amount: (c) => perf(c)?.medianSlip ?? null,
      value: (c) => {
        const p = perf(c);
        return p?.medianSlip === null || p === null
          ? "–"
          : withSample(
              formatMonths(p.medianSlip, t("rankings.unitMonths"), locale),
              p.slipN,
            );
      },
    },
    {
      group: t("country.compareGroupDelivery"),
      // Higher is better here, unlike the rest of the delivery block.
      label: t("rankings.thOnTime"),
      amount: (c) => perf(c)?.onTimeShare ?? null,
      value: (c) => {
        const share = perf(c)?.onTimeShare;
        return share === null || share === undefined
          ? "–"
          : `${Math.round(share * 100)}%`;
      },
    },
    {
      group: t("country.compareGroupDelivery"),
      label: t("rankings.thMedianOverrun"),
      direction: "lowest",
      amount: (c) => perf(c)?.medianOverrun ?? null,
      value: (c) => {
        const p = perf(c);
        return p?.medianOverrun === null || p === null
          ? "–"
          : withSample(formatPercent(p.medianOverrun, locale), p.overrunN);
      },
    },
    {
      group: t("country.compareGroupDelivery"),
      label: t("country.costPerKm", {
        currency: baseCurrency,
        year: String(priceYear),
      }),
      direction: "lowest",
      amount: (c) => perf(c)?.costPerKm ?? null,
      value: (c) => {
        const p = perf(c);
        return p?.costPerKm === null || p === null
          ? "–"
          : withSample(formatNumber(p.costPerKm, locale, 1), p.costedLots);
      },
    },
  ];

  const full = selected.length >= MAX_COMPARED;

  // Countries the search box currently offers. Already-picked ones stay in
  // the list so a second click removes them, which is how the map behaves
  // too and keeps the two halves of the picker consistent.
  const results = countries.filter((c) =>
    textMatches(nameOf(c.summary.code), query),
  );

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="country-search"
            className="text-xs font-medium uppercase tracking-wide text-ink-muted"
          >
            {t("country.searchLabel")}
          </label>
          <input
            id="country-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("country.searchPlaceholder")}
            // No outline suppression: a border colour change is not a focus
            // indicator. The ring comes from :focus-visible in globals.css.
            className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-inverse"
          />

          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
            {results.length === 0 && (
              <li className="px-2 py-1.5 text-sm text-ink-faint">
                {t("country.searchEmpty")}
              </li>
            )}
            {results.map(({ summary }) => {
              const code = summary.code;
              const on = selected.includes(code);
              return (
                <li key={code}>
                  <button
                    type="button"
                    onClick={() => toggle(code)}
                    disabled={!on && full}
                    aria-pressed={on}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                      on
                        ? "bg-inverse text-on-inverse"
                        : full
                          ? "text-ink-faint"
                          : "text-ink-soft hover:bg-surface-raised"
                    }`}
                  >
                    <span aria-hidden>{flagEmoji(code)}</span>
                    <span className="flex-1">{nameOf(code)}</span>
                    <span
                      className={
                        on ? "text-on-inverse/70" : "text-xs text-ink-faint"
                      }
                    >
                      {on ? "×" : formatKm(summary.total.openedKm, locale)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {t("country.pickOnMap")}
          </span>
          <div className="mt-1">
            <CountryPickerMap
              picked={selected}
              onToggle={toggle}
              disabled={full}
            />
          </div>
        </div>
      </div>

      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => setSelected([])}
          className="mt-3 text-sm text-ink-muted hover:text-ink"
        >
          {t("country.clearCompare")}
        </button>
      )}

      {compared.length === 0 ? (
        <p className="mt-4 max-w-3xl rounded-md bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
          {t("country.compareHint", { max: MAX_COMPARED })}
        </p>
      ) : (
        // tabIndex and the region role make the columns past the right edge
        // reachable without a mouse.
        <div
          className="mt-6 overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          tabIndex={0}
          role="region"
          aria-label={t("country.compareTitle")}
        >
          <table className="w-full min-w-max text-sm">
            <caption className="sr-only">{t("country.compareTitle")}</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                  {t("country.metric")}
                </th>
                {compared.map((c) => (
                  <th scope="col"
                    key={c.summary.code}
                    className="py-2 pl-4 text-right font-semibold"
                  >
                    <span className="inline-flex items-baseline gap-1.5">
                      <Link
                        href={`/countries/${c.summary.code}`}
                        className="hover:underline underline-offset-2"
                      >
                        <span aria-hidden className="mr-1.5">
                          {flagEmoji(c.summary.code)}
                        </span>
                        {nameOf(c.summary.code)}
                      </Link>
                      <button
                        type="button"
                        onClick={() => toggle(c.summary.code)}
                        aria-label={t("country.removeFromCompare", {
                          country: nameOf(c.summary.code),
                        })}
                        className="text-ink-faint hover:text-ink"
                      >
                        ×
                      </button>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {rows.map((row, index) => {
                const direction = row.direction ?? "highest";
                const lead = leadersBy(compared.map(row.amount), direction);
                const heading =
                  index === 0 || rows[index - 1].group !== row.group
                    ? row.group
                    : null;
                return (
                  <Fragment key={row.label}>
                    {heading && (
                      <tr>
                        <th
                          colSpan={compared.length + 1}
                          scope="colgroup"
                          className="pt-5 pb-1 text-left text-xs font-semibold uppercase tracking-wide text-ink-faint"
                        >
                          {heading}
                        </th>
                      </tr>
                    )}
                    <tr>
                    {/* The metric names the row, so it is a header cell: a
                        screen reader reads "km per million people, 38,3". */}
                    <th
                      scope="row"
                      className="py-2 pr-4 text-left font-normal"
                    >
                      <span className="flex items-baseline gap-2">
                        {row.color && (
                          <span
                            className="inline-block h-1 w-3 shrink-0 translate-y-[-2px] rounded-full"
                            style={{ backgroundColor: row.color }}
                          />
                        )}
                        <span className="text-ink-soft">{row.label}</span>
                      </span>
                    </th>
                    {compared.map((c, i) => {
                      const leading = lead.includes(i);
                      return (
                        <td
                          key={c.summary.code}
                          className={`py-2 pl-4 text-right tabular-nums ${
                            leading
                              ? "bg-good-soft/80 font-semibold text-good"
                              : ""
                          }`}
                        >
                          {/* Weight and colour both change, so the mark does
                              not rest on colour alone, and the label spells
                              it out for a screen reader. */}
                          {leading && (
                            <span className="sr-only">
                              {direction === "lowest"
                                ? t("country.leadsLow")
                                : t("country.leads")}
                              :{" "}
                            </span>
                          )}
                          {row.value(c)}
                        </td>
                      );
                    })}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          <div className="mt-3 max-w-3xl space-y-1 text-xs text-ink-faint">
            <p>{t("country.leadNote")}</p>
            <p>{t("country.leadNoteLow")}</p>
            <p>{t("country.compareDeliveryNote")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
