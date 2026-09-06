"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Category } from "@/lib/schema";
import { ALL_CATEGORIES, MAP_STATUSES } from "@/lib/map-style";
import { categoryVar } from "@/lib/map-theme";
import {
  isCategoryActive,
  isStatusActive,
  setCategoryStatuses,
  toggleCategory,
  toggleStatus,
  type CategoryStatusSelection,
} from "@/lib/map-filters";
import LegendLine from "./LegendLine";

/**
 * Resting the pointer on a pill this long opens its status menu. Clicking
 * the pill keeps its original meaning — show/hide the whole category — so
 * the menu has to arrive on dwell rather than on click.
 */
const HOVER_OPEN_DELAY_MS = 2000;

/**
 * Grace period before a dwell-opened menu closes, so clipping a corner on
 * the way to a checkbox doesn't dismiss it.
 */
const HOVER_CLOSE_DELAY_MS = 300;

interface CategoryToggleProps {
  selection: CategoryStatusSelection;
  onChange: (next: CategoryStatusSelection) => void;
}

export default function CategoryToggle({
  selection,
  onChange,
}: CategoryToggleProps) {
  const t = useTranslations();
  const [openCat, setOpenCat] = useState<Category | null>(null);
  // A menu opened deliberately by clicking the caret stays until dismissed;
  // only one that appeared on its own from dwelling follows the pointer out.
  const [pinned, setPinned] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const cancelTimers = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    cancelTimers();
    setOpenCat(null);
    setPinned(false);
  }, [cancelTimers]);

  useEffect(() => cancelTimers, [cancelTimers]);

  // Dismiss like any other menu: Escape, or a press outside the row.
  useEffect(() => {
    if (!openCat) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openCat, close]);

  return (
    <div ref={rootRef} className="flex flex-wrap gap-2">
      {ALL_CATEGORIES.map((cat) => {
        const active = isCategoryActive(selection, cat);
        const shown = selection.get(cat)?.size ?? 0;
        const partial = active && shown < MAP_STATUSES.length;
        const open = openCat === cat;

        return (
          <div
            key={cat}
            className="relative"
            onPointerEnter={(e) => {
              cancelTimers(); // also cancels a pending close on re-entry
              if (e.pointerType === "touch" || openCat === cat) return;
              openTimer.current = setTimeout(() => {
                setOpenCat(cat);
                setPinned(false);
              }, HOVER_OPEN_DELAY_MS);
            }}
            onPointerLeave={() => {
              cancelTimers();
              if (openCat !== cat || pinned) return;
              closeTimer.current = setTimeout(close, HOVER_CLOSE_DELAY_MS);
            }}
          >
            <div
              className={`flex items-center rounded-full border text-xs font-medium transition-colors ${
                active
                  ? "border-inverse bg-surface text-ink"
                  : "border-line bg-surface/70 text-ink-faint"
              }`}
            >
              <button
                type="button"
                onClick={() => onChange(toggleCategory(selection, cat))}
                aria-pressed={active}
                className="flex items-center gap-1.5 py-1.5 pl-3 pr-2"
              >
                <span
                  className="inline-block w-4 h-1 rounded-full"
                  style={{
                    backgroundColor: active
                      ? categoryVar(cat)
                      : "var(--line-strong)",
                  }}
                />
                {t(`category.${cat}`)}
                {partial && (
                  <span className="text-[10px] font-normal text-ink-muted tabular-nums">
                    {shown}/{MAP_STATUSES.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  cancelTimers();
                  if (open) close();
                  else {
                    setOpenCat(cat);
                    setPinned(true);
                  }
                }}
                aria-haspopup="true"
                aria-expanded={open}
                aria-label={t("map.statusMenu", {
                  category: t(`category.${cat}`),
                })}
                className="border-l border-line/80 px-1.5 py-1.5 text-ink-faint hover:text-ink"
              >
                <svg width="9" height="6" viewBox="0 0 9 6" aria-hidden="true">
                  <path
                    d="M1 1.5 4.5 5 8 1.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            {open && (
              /* pt-1 rather than mt-1: the 4px offset is padding inside the
                 hoverable box, so crossing it never leaves the wrapper */
              <div
                role="group"
                aria-label={t("map.statusMenu", {
                  category: t(`category.${cat}`),
                })}
                className="absolute left-0 top-full z-20 w-56 pt-1"
              >
                <div className="rounded-xl border border-line bg-surface p-2 shadow-lg">
                  <div className="px-1 pb-1 text-[10px] font-semibold uppercase text-ink-faint">
                    {t("map.filterByStatus")}
                  </div>
                  {MAP_STATUSES.map((status) => (
                    <label
                      key={status}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-xs text-ink-soft hover:bg-surface-sunken"
                    >
                      <input
                        type="checkbox"
                        checked={isStatusActive(selection, cat, status)}
                        onChange={() =>
                          onChange(toggleStatus(selection, cat, status))
                        }
                        className="accent-inverse"
                      />
                      <LegendLine status={status} color={categoryVar(cat)} />
                      {t(`status.${status}`)}
                    </label>
                  ))}
                  <div className="mt-1 flex gap-3 border-t border-line-soft px-1 pt-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        onChange(
                          setCategoryStatuses(selection, cat, MAP_STATUSES),
                        )
                      }
                      className="text-[11px] text-ink-muted hover:text-ink"
                    >
                      {t("map.showAll")}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onChange(setCategoryStatuses(selection, cat, []))
                      }
                      className="text-[11px] text-ink-muted hover:text-ink"
                    >
                      {t("map.showNone")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
