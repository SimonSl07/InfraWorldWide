"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { searchLots, type LotEntry } from "@/lib/lot-list";
import { formatKm } from "@/lib/format";
import CategoryGlyph from "./CategoryGlyph";

/**
 * The map's contents as a searchable, focusable list.
 *
 * Two audit findings meet here. Selection ran exclusively through canvas
 * clicks, so no road on the map was reachable by keyboard and none had a
 * non-visual description; and /map, the landing surface, was the only main
 * view with no search while /projects and /countries both had one.
 *
 * A blank query lists whatever the map is currently drawing, which is why
 * one component answers both: the search results and the plain list are the
 * same list.
 */
export default function LotSearchPanel({
  lots,
  selectedLotId,
  onSelect,
  locale,
}: {
  /** The lots the map is drawing right now, already filtered. */
  lots: LotEntry[];
  selectedLotId: string | null;
  onSelect: (lot: LotEntry) => void;
  locale: string;
}) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => searchLots(lots, query), [lots, query]);
  // Typing opens the list without a second gesture; it stays open after.
  const listOpen = open || query.trim().length > 0;

  /** The focusable rows, read at event time (never during render). */
  const items = useCallback(
    () =>
      Array.from(
        listRef.current?.querySelectorAll<HTMLButtonElement>(
          "button[data-lot-row]",
        ) ?? [],
      ),
    [],
  );

  /**
   * ArrowDown from a closed list has nothing to focus yet: the rows only
   * exist after the render that opens it. The flag defers the focus to
   * that render, so one key press both opens the list and enters it.
   */
  const wantsFirstRow = useRef(false);
  useEffect(() => {
    if (!wantsFirstRow.current) return;
    wantsFirstRow.current = false;
    items()[0]?.focus();
  });

  const moveFocus = useCallback(
    (e: React.KeyboardEvent, from: number) => {
      const rows = items();
      if (rows.length === 0) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          rows[Math.min(from + 1, rows.length - 1)]?.focus();
          return;
        case "ArrowUp":
          e.preventDefault();
          // Off the top of the list is back into the search box, which is
          // where a keyboard user came from.
          if (from <= 0) inputRef.current?.focus();
          else rows[from - 1]?.focus();
          return;
        case "Home":
          e.preventDefault();
          rows[0]?.focus();
          return;
        case "End":
          e.preventDefault();
          rows[rows.length - 1]?.focus();
          return;
        case "Escape":
          e.preventDefault();
          inputRef.current?.focus();
          return;
      }
    },
    [items],
  );

  return (
    <div className="w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface/95 shadow backdrop-blur">
      <div className="p-2">
        <label htmlFor={`${listId}-input`} className="sr-only">
          {t("map.searchLabel")}
        </label>
        <input
          id={`${listId}-input`}
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown") return;
            e.preventDefault();
            if (listOpen) items()[0]?.focus();
            else {
              wantsFirstRow.current = true;
              setOpen(true);
            }
          }}
          placeholder={t("map.searchPlaceholder")}
          // aria-controls only: aria-expanded belongs to the toggle below,
          // and a plain textbox may not carry it without combobox semantics.
          aria-controls={listId}
          className="w-full rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-faint focus:border-inverse focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        />

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={listOpen}
          aria-controls={listId}
          className="mt-1.5 w-full cursor-pointer text-left text-[11px] text-ink-muted hover:text-ink"
        >
          {t("country.lots", { count: lots.length })}
        </button>
      </div>

      {listOpen && (
        <div className="border-t border-line-soft">
          {/* Announced on its own so a screen reader hears the count change
              as the query narrows, without the list being read out again. */}
          <p aria-live="polite" className="px-3 py-1 text-[11px] text-ink-muted">
            {results.length === 0
              ? t("map.searchEmpty")
              : t("map.searchShowing", {
                  shown: results.length,
                  total: lots.length,
                })}
          </p>
          <ul
            id={listId}
            ref={listRef}
            className="max-h-[45vh] overflow-y-auto pb-1"
          >
            {results.map((lot) => {
              const active = lot.lotId === selectedLotId;
              return (
                <li key={`${lot.projectId}.${lot.lotId}`}>
                  <button
                    type="button"
                    data-lot-row
                    aria-current={active ? "true" : undefined}
                    onClick={() => onSelect(lot)}
                    onKeyDown={(e) => moveFocus(e, items().indexOf(e.currentTarget))}
                    className={`flex w-full cursor-pointer items-start gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-sunken focus:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus ${
                      active ? "bg-surface-raised" : ""
                    }`}
                  >
                    <span className="mt-0.5">
                      <CategoryGlyph category={lot.category} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">
                        {lot.lotName}
                      </span>
                      <span className="block truncate text-ink-muted">
                        {lot.projectName}
                      </span>
                      <span className="block text-[11px] text-ink-faint">
                        {t(`status.${lot.status}`)}
                        {" · "}
                        {formatKm(lot.lengthKm, locale)}
                        {lot.expectedOpeningDerived && (
                          <>
                            {" · "}
                            {t("project.expectedOpeningDerived")}
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
