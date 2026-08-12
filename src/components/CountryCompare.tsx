"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ALL_CATEGORIES, CATEGORY_COLORS } from "@/lib/map-style";
import { createCountryNamer, flagEmoji } from "@/lib/country-names";
import { parseCompareParam } from "@/lib/map-filters";
import { formatKm } from "@/lib/format";
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

  const rows: Array<{
    label: string;
    color?: string;
    value: (c: RankedCountry) => React.ReactNode;
  }> = [
    ...ALL_CATEGORIES.map((category) => ({
      label: t(`category.${category}`),
      color: CATEGORY_COLORS[category],
      value: (c: RankedCountry) => (
        <>
          {formatKm(c.summary.byCategory[category].openedKm, locale)}
          {rankBadge(c.ranks.openedKm[category])}
        </>
      ),
    })),
    {
      label: t("country.totalOpened"),
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
      value: (c) => (
        <>
          {formatKm(c.summary.total.underConstructionKm, locale)}
          {rankBadge(c.ranks.underConstructionKm)}
        </>
      ),
    },
    {
      label: t("country.plannedTitle"),
      value: (c) => formatKm(c.summary.total.plannedKm, locale),
    },
    {
      label: t("country.perArea"),
      value: (c) =>
        c.kmPerArea === null ? (
          "—"
        ) : (
          <>
            {c.kmPerArea.toFixed(1)}
            {rankBadge(c.ranks.kmPerArea)}
          </>
        ),
    },
    {
      label: t("country.perCapita"),
      value: (c) =>
        c.kmPerCapita === null ? (
          "—"
        ) : (
          <>
            {c.kmPerCapita.toFixed(1)}
            {rankBadge(c.ranks.kmPerCapita)}
          </>
        ),
    },
    { label: t("country.projects"), value: (c) => c.summary.projects },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {countries.map(({ summary }) => {
          const code = summary.code;
          const on = selected.includes(code);
          const full = !on && selected.length >= MAX_COMPARED;
          return (
            <button
              key={code}
              onClick={() => toggle(code)}
              disabled={full}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                on
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : full
                    ? "border-neutral-200 text-neutral-300"
                    : "border-neutral-300 text-neutral-700 hover:border-neutral-900"
              }`}
            >
              <span aria-hidden className="mr-1.5">
                {flagEmoji(code)}
              </span>
              {nameOf(code)}
            </button>
          );
        })}
        {selected.length > 0 && (
          <button
            onClick={() => setSelected([])}
            className="rounded-full px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-900"
          >
            {t("country.clearCompare")}
          </button>
        )}
      </div>

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
                    <Link
                      href={`/countries/${c.summary.code}`}
                      className="hover:underline underline-offset-2"
                    >
                      <span aria-hidden className="mr-1.5">
                        {flagEmoji(c.summary.code)}
                      </span>
                      {nameOf(c.summary.code)}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((row) => (
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
                  {compared.map((c) => (
                    <td
                      key={c.summary.code}
                      className="py-2 pl-4 text-right tabular-nums"
                    >
                      {row.value(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
