"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Category } from "@/lib/schema";
import { ALL_CATEGORIES, MAP_STATUSES } from "@/lib/map-style";
import CategoryGlyph from "./CategoryGlyph";
import LegendLine from "./LegendLine";

/**
 * What the lines mean: category and status, in one panel.
 *
 * The legend used to list statuses only and was `hidden sm:block`, so on a
 * phone the map had no key at all and category was hue with nothing to read
 * it against. Here the panel is a disclosure below the `sm` breakpoint and
 * always open above it, which needs no viewport measurement and so cannot
 * mismatch on hydration.
 */
export default function MapLegend({
  categories = ALL_CATEGORIES,
  showStatuses = true,
  showDerivedNote = false,
}: {
  categories?: readonly Category[];
  /** Off for a map that draws a single status vocabulary. */
  showStatuses?: boolean;
  /**
   * Only the main map hatches sections that are open on a projected date,
   * so only the main map should explain the hatching.
   */
  showDerivedNote?: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <div className="w-max">
      {/* Only below sm: above it the panel is permanently open. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="map-legend-panel"
        className="cursor-pointer rounded-full border border-line bg-surface/95 px-3 py-1.5 text-xs font-medium text-ink-soft shadow backdrop-blur sm:hidden"
      >
        {open ? t("map.hideLegend") : t("map.showLegend")}
      </button>

      <div
        id="map-legend-panel"
        className={`${
          open ? "block" : "hidden"
        } mt-1 rounded-xl border border-line bg-surface/95 px-3 py-2 shadow backdrop-blur sm:mt-0 sm:block`}
      >
        <div className="text-[10px] font-semibold uppercase text-ink-faint">
          {t("map.legendCategory")}
        </div>
        {categories.map((category) => (
          <div
            key={category}
            className="flex items-center gap-2 text-xs text-ink-soft"
          >
            <CategoryGlyph category={category} />
            {t(`category.${category}`)}
          </div>
        ))}

        {showStatuses && (
          <>
            <div className="mt-2 text-[10px] font-semibold uppercase text-ink-faint">
              {t("map.legend")}
            </div>
            {MAP_STATUSES.map((status) => (
              <div
                key={status}
                className="flex items-center gap-2 text-xs text-ink-soft"
              >
                <LegendLine status={status} />
                {t(`status.${status}`)}
              </div>
            ))}
          </>
        )}

        {/* The one styling rule that is not otherwise discoverable. */}
        {showDerivedNote && (
          <div className="mt-1.5 flex items-center gap-2 border-t border-line-soft pt-1.5 text-[11px] text-ink-muted">
            <LegendLine status="derived" />
            {t("project.expectedOpeningDerived")}
          </div>
        )}
      </div>
    </div>
  );
}
