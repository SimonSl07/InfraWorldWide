"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ALL_CATEGORIES,
} from "@/lib/map-style";
import { categoryVar } from "@/lib/map-theme";
import MapPanel from "./MapPanel";
import { countryName, flagEmoji } from "@/lib/country-names";
import { formatKm, formatMonth } from "@/lib/format";
import { localized } from "@/lib/localized";
import type { Rank, RankedCountry } from "@/lib/country-stats";
import type { DecadeBucket } from "@/lib/country-growth";
import Sparkline from "./Sparkline";
import { RankBadge } from "@/components/ui/RankBadge";

interface CountryPanelProps {
  country: RankedCountry;
  growth: DecadeBucket[];
  /** Month being viewed, so the figures can say what they are "as of". */
  month: number;
  onClose: () => void;
}

export default function CountryPanel({
  country,
  growth,
  month,
  onClose,
}: CountryPanelProps) {
  const t = useTranslations();
  const locale = useLocale();
  const { summary, ranks, ref } = country;
  const code = summary.code;

  // The panel's figures are set small, so the chips beside them are too.
  const rankChip = (rank: Rank | null) => (
    <RankBadge
      rank={rank}
      title={t("country.rankHelp")}
      className="shrink-0 px-1.5 py-0.5 text-[10px] text-ink-soft"
    />
  );

  // Categories the country actually has something in, longest first — a row
  // of zeroes says nothing and pushes the useful rows off the panel.
  const categories = ALL_CATEGORIES.map((category) => ({
    category,
    totals: summary.byCategory[category],
  }))
    .filter((c) => c.totals.lots > 0)
    .sort((a, b) => b.totals.openedKm - a.totals.openedKm);

  return (
    <MapPanel onClose={onClose} labelledBy="map-panel-country-heading">
      <div className="pr-8">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          {t("country.panelKicker")}
        </div>
        <h3
          id="map-panel-country-heading"
          className="flex items-center gap-2 text-lg font-bold leading-tight"
        >
          <span aria-hidden>{flagEmoji(code)}</span>
          {countryName(code, locale)}
        </h3>
        <div className="text-xs text-ink-muted">
          {t("country.asOf", { month: formatMonth(month, locale) })}
        </div>
      </div>

      {categories.length === 0 ? (
        <p className="mt-4 rounded-md bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
          {t("country.emptyMonth")}
        </p>
      ) : (
        <dl className="mt-4 space-y-2">
          {categories.map(({ category, totals }) => (
            <div key={category}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <dt className="flex min-w-0 items-baseline gap-2">
                  <span
                    className="inline-block h-1 w-3 shrink-0 translate-y-[-2px] rounded-full"
                    style={{ backgroundColor: categoryVar(category) }}
                  />
                  <span className="truncate">{t(`category.${category}`)}</span>
                </dt>
                <dd className="flex shrink-0 items-baseline">
                  <span className="font-semibold tabular-nums">
                    {formatKm(totals.openedKm, locale)}
                  </span>
                  {rankChip(ranks.openedKm[category])}
                </dd>
              </div>
              {/* summarizeCountries already zeroes planned km when viewing
                  the past, matching the map — no extra guard needed here. */}
              {(totals.underConstructionKm > 0 || totals.plannedKm > 0) && (
                <div className="mt-0.5 flex justify-end gap-3 pr-1 text-[11px] text-ink-muted">
                  {totals.underConstructionKm > 0 && (
                    <span>
                      {t("country.building")}{" "}
                      <span className="tabular-nums">
                        {formatKm(totals.underConstructionKm, locale)}
                      </span>
                    </span>
                  )}
                  {totals.plannedKm > 0 && (
                    <span>
                      {t("country.planned")}{" "}
                      <span className="tabular-nums">
                        {formatKm(totals.plannedKm, locale)}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </dl>
      )}

      <div className="mt-4 border-t border-line-soft pt-3 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-ink-muted">{t("country.totalOpened")}</span>
          <span className="flex items-baseline">
            <span className="font-semibold tabular-nums">
              {formatKm(summary.total.openedKm, locale)}
            </span>
            {rankChip(ranks.openedKm.all)}
          </span>
        </div>

        {country.kmPerArea !== null && (
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-ink-muted">{t("country.perArea")}</span>
            <span className="flex items-baseline">
              <span className="tabular-nums">
                {country.kmPerArea.toFixed(1)}
              </span>
              {rankChip(ranks.kmPerArea)}
            </span>
          </div>
        )}
        {country.kmPerCapita !== null && (
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-ink-muted">{t("country.perCapita")}</span>
            <span className="flex items-baseline">
              <span className="tabular-nums">
                {country.kmPerCapita.toFixed(1)}
              </span>
              {rankChip(ranks.kmPerCapita)}
            </span>
          </div>
        )}

        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-ink-muted">{t("country.projects")}</span>
          <span className="tabular-nums">{summary.projects}</span>
        </div>
      </div>

      {growth.length > 1 && (
        <div className="mt-4 border-t border-line-soft pt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
            {t("country.growthSparkline")}
          </div>
          <Sparkline buckets={growth} className="mt-1.5" />
          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-ink-faint">
            {/* Romanian says "anii 1990", not "1990s" — the suffix is a
                translated string, not something to concatenate here. */}
            <span>
              {t("country.decade", { decade: String(growth[0].decade) })}
            </span>
            <span>
              {t("country.decade", {
                decade: String(growth[growth.length - 1].decade),
              })}
            </span>
          </div>
        </div>
      )}

      {ref?.note && (
        <p className="mt-3 text-[11px] leading-snug text-ink-faint">
          {localized(ref.note, locale)}
        </p>
      )}

      <Link
        href={`/countries/${code}`}
        className="mt-4 inline-block text-sm font-medium text-ink underline underline-offset-2 hover:text-ink-soft"
      >
        {t("country.seeMore")} →
      </Link>
    </MapPanel>
  );
}
