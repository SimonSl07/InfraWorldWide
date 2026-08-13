"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ALL_CATEGORIES, CATEGORY_COLORS } from "@/lib/map-style";
import { createCountryNamer, flagEmoji } from "@/lib/country-names";
import { parseCompareParam } from "@/lib/map-filters";
import { formatKm } from "@/lib/format";
import { textMatches } from "@/lib/text";
import { leaders } from "@/lib/compare";
import CountryPickerMap from "@/components/CountryPickerMap";
import type { Rank, RankedCountry } from "@/lib/country-stats";

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
}: {
  countries: RankedCountry[];
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
      <span className="ml-2 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-neutral-500">
        #{rank.position}
      </span>
    ) : null;

  /**
   * `amount` is what the row is compared on. It is kept separate from the
   * rendered value because the cell carries formatting and a rank badge,
   * and the highlight has to be decided on the bare number.
   */
  const rows: Array<{
    label: string;
    color?: string;
    amount: (c: RankedCountry) => number | null;
    value: (c: RankedCountry) => React.ReactNode;
  }> = [
    ...ALL_CATEGORIES.map((category) => ({
      label: t(`category.${category}`),
      color: CATEGORY_COLORS[category],
      amount: (c: RankedCountry) => c.summary.byCategory[category].openedKm,
      value: (c: RankedCountry) => (
        <>
          {formatKm(c.summary.byCategory[category].openedKm, locale)}
          {rankBadge(c.ranks.openedKm[category])}
        </>
      ),
    })),
    {
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
      label: t("country.plannedTitle"),
      amount: (c) => c.summary.total.plannedKm,
      value: (c) => formatKm(c.summary.total.plannedKm, locale),
    },
    {
      label: t("country.perArea"),
      amount: (c) => c.kmPerArea,
      value: (c) =>
        c.kmPerArea === null ? (
          "–"
        ) : (
          <>
            {c.kmPerArea.toFixed(1)}
            {rankBadge(c.ranks.kmPerArea)}
          </>
        ),
    },
    {
      label: t("country.perCapita"),
      amount: (c) => c.kmPerCapita,
      value: (c) =>
        c.kmPerCapita === null ? (
          "–"
        ) : (
          <>
            {c.kmPerCapita.toFixed(1)}
            {rankBadge(c.ranks.kmPerCapita)}
          </>
        ),
    },
    {
      label: t("country.projects"),
      amount: (c) => c.summary.projects,
      value: (c) => c.summary.projects,
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
            className="text-xs font-medium uppercase tracking-wide text-neutral-500"
          >
            {t("country.searchLabel")}
          </label>
          <input
            id="country-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("country.searchPlaceholder")}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />

          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto pr-1">
            {results.length === 0 && (
              <li className="px-2 py-1.5 text-sm text-neutral-400">
                {t("country.searchEmpty")}
              </li>
            )}
            {results.map(({ summary }) => {
              const code = summary.code;
              const on = selected.includes(code);
              return (
                <li key={code}>
                  <button
                    onClick={() => toggle(code)}
                    disabled={!on && full}
                    aria-pressed={on}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                      on
                        ? "bg-neutral-900 text-white"
                        : full
                          ? "text-neutral-300"
                          : "text-neutral-700 hover:bg-neutral-100"
                    }`}
                  >
                    <span aria-hidden>{flagEmoji(code)}</span>
                    <span className="flex-1">{nameOf(code)}</span>
                    <span
                      className={
                        on ? "text-white/70" : "text-xs text-neutral-400"
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
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
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
          onClick={() => setSelected([])}
          className="mt-3 text-sm text-neutral-500 hover:text-neutral-900"
        >
          {t("country.clearCompare")}
        </button>
      )}

      {compared.length === 0 ? (
        <p className="mt-4 max-w-3xl rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
          {t("country.compareHint", { max: MAX_COMPARED })}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                  {t("country.metric")}
                </th>
                {compared.map((c) => (
                  <th
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
                        onClick={() => toggle(c.summary.code)}
                        aria-label={t("country.removeFromCompare", {
                          country: nameOf(c.summary.code),
                        })}
                        className="text-neutral-400 hover:text-neutral-900"
                      >
                        ×
                      </button>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((row) => {
                const lead = leaders(compared.map(row.amount));
                return (
                  <tr key={row.label}>
                    <td className="py-2 pr-4">
                      <span className="flex items-baseline gap-2">
                        {row.color && (
                          <span
                            className="inline-block h-1 w-3 shrink-0 translate-y-[-2px] rounded-full"
                            style={{ backgroundColor: row.color }}
                          />
                        )}
                        <span className="text-neutral-600">{row.label}</span>
                      </span>
                    </td>
                    {compared.map((c, i) => {
                      const leading = lead.includes(i);
                      return (
                        <td
                          key={c.summary.code}
                          className={`py-2 pl-4 text-right tabular-nums ${
                            leading
                              ? "bg-emerald-50/80 font-semibold text-emerald-900"
                              : ""
                          }`}
                        >
                          {/* Weight and colour both change, so the mark does
                              not rest on colour alone, and the label spells
                              it out for a screen reader. */}
                          {leading && (
                            <span className="sr-only">{t("country.leads")}: </span>
                          )}
                          {row.value(c)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="mt-3 max-w-3xl text-xs text-neutral-400">
            {t("country.leadNote")}
          </p>
        </div>
      )}
    </div>
  );
}
