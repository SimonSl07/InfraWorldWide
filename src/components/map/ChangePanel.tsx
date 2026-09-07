"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { fromMonthIndex } from "@/lib/map-filters";
import { openedBetween, type DeltaWindow } from "@/lib/map-delta";
import type { LotEntry } from "@/lib/lot-list";
import { formatKm, formatMonth } from "@/lib/format";
import CategoryGlyph from "./CategoryGlyph";

/** Baselines offered, in years before the viewed month. */
export const BASELINE_YEARS = [1, 5, 10, 20] as const;

/**
 * What has been built between two months.
 *
 * The slider could show the network at any month but never the change
 * between two, which is the question it invites: not "what existed in 2020"
 * but "what has been built since". The baseline is a number of years back
 * from wherever the slider is, so scrubbing keeps the comparison meaningful
 * instead of pinning it to a date that drifts out of view.
 */
export default function ChangePanel({
  lots,
  month,
  nowMonth,
  baselineYears,
  onBaselineYearsChange,
  highlight,
  onHighlightChange,
  onSelect,
  locale,
}: {
  /** Every lot on the map, unfiltered by month. */
  lots: LotEntry[];
  month: number;
  nowMonth: number;
  baselineYears: number;
  onBaselineYearsChange: (years: number) => void;
  highlight: boolean;
  onHighlightChange: (on: boolean) => void;
  onSelect: (lot: LotEntry) => void;
  locale: string;
}) {
  const t = useTranslations();

  const window: DeltaWindow = useMemo(
    () => ({ from: month - baselineYears * 12, to: month, nowMonth }),
    [month, baselineYears, nowMonth],
  );
  const delta = useMemo(() => openedBetween(lots, window), [lots, window]);

  // The list is "what opened in the window", newest first, so scrubbing the
  // slider reads as a running commentary rather than a static table.
  const recent = useMemo(
    () =>
      [...delta.lots]
        .sort(
          (a, b) =>
            (b.openedMonth ?? b.expectedOpeningMonth ?? 0) -
            (a.openedMonth ?? a.expectedOpeningMonth ?? 0),
        )
        .slice(0, 8),
    [delta],
  );

  const baselineMonth = window.from;
  const { year: baselineYear } = fromMonthIndex(baselineMonth);
  const ahead = window.to > nowMonth;

  return (
    <div className="w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface/95 p-3 shadow backdrop-blur">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase text-ink-faint">
          {t("map.changeTitle")}
        </span>
        <div className="flex gap-1">
          {BASELINE_YEARS.map((years) => (
            <button
              key={years}
              type="button"
              onClick={() => onBaselineYearsChange(years)}
              aria-pressed={years === baselineYears}
              className={`cursor-pointer rounded px-1.5 py-0.5 text-[11px] tabular-nums ${
                years === baselineYears
                  ? "bg-inverse text-on-inverse"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {t("map.baselineYears", { years })}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-1 text-lg font-semibold text-ink tabular-nums">
        {delta.km > 0 ? "+" : ""}
        {formatKm(delta.km, locale)}
      </p>
      <p className="text-xs text-ink-muted">
        {t("map.changeSince", {
          count: delta.count,
          since: formatMonth(baselineMonth, locale),
        })}
      </p>

      {/* Both caveats are load-bearing: one is kilometres another project
          already counts, the other is a forecast rather than a record. */}
      {delta.alsoCountedKm > 0 && (
        <p className="mt-1 text-[11px] text-ink-faint">
          {t("map.changeAlsoCounted", {
            km: formatKm(delta.alsoCountedKm, locale),
          })}
        </p>
      )}
      {ahead && delta.projectedKm > 0 && (
        <p className="mt-1 text-[11px] text-warn">
          {t("map.changeProjected", {
            km: formatKm(delta.projectedKm, locale),
          })}
        </p>
      )}

      <label className="mt-2 flex cursor-pointer items-center gap-2 border-t border-line-soft pt-2 text-xs text-ink-soft">
        <input
          type="checkbox"
          checked={highlight}
          onChange={(e) => onHighlightChange(e.target.checked)}
          className="accent-inverse"
        />
        {t("map.highlightNew")}
      </label>

      {recent.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-y-auto border-t border-line-soft pt-1">
          {recent.map((lot) => {
            const at = lot.openedMonth ?? lot.expectedOpeningMonth;
            return (
              <li key={`${lot.projectId}.${lot.lotId}`}>
                <button
                  type="button"
                  onClick={() => onSelect(lot)}
                  className="flex w-full cursor-pointer items-start gap-2 rounded px-1 py-1 text-left text-xs hover:bg-surface-sunken focus:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
                >
                  <span className="mt-0.5">
                    <CategoryGlyph category={lot.category} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">
                      {lot.lotName}
                    </span>
                    <span className="block text-[11px] text-ink-faint tabular-nums">
                      {at === null || at === undefined
                        ? "–"
                        : fromMonthIndex(at).year}
                      {" · "}
                      {formatKm(lot.lengthKm, locale)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {delta.count === 0 && (
        <p className="mt-2 text-xs text-ink-faint">
          {t("map.changeNone", {
            since: String(baselineYear),
          })}
        </p>
      )}
    </div>
  );
}
