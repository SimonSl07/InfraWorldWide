"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  clampPage,
  nextSort,
  pageBounds,
  pageCount,
  pageSlice,
  sortRows,
  type SortState,
  type SortValue,
} from "@/lib/table";

export interface Column<T> {
  id: string;
  header: string;
  /** Omit to make the column unsortable (the header stops being a button). */
  sortValue?: (row: T) => SortValue;
  /** Right-aligns and tabular-numbers the column. */
  numeric?: boolean;
  /**
   * Renders this column's cells as `<th scope="row">`. Set it on the column
   * that names the row, so a screen reader announces "Sebeș–Turda, slip, +14
   * mo" instead of reading a bare number with no subject.
   */
  rowHeader?: boolean;
  cell: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  perPage?: number;
  emptyMessage: string;
  /** Shown under the table to explain what the default ordering means. */
  footnote?: string;
  /**
   * Accessible name for the table, rendered as a visually hidden `<caption>`.
   * Also names the scroll region, which is what makes the horizontal overflow
   * reachable by keyboard.
   */
  caption?: string;
}

function SortArrow({ direction }: { direction: "asc" | "desc" | null }) {
  if (direction === null) {
    return (
      <span aria-hidden className="text-ink-faint group-hover:text-ink-soft">
        ↕
      </span>
    );
  }
  return (
    <span aria-hidden className="text-ink">
      {direction === "desc" ? "↓" : "↑"}
    </span>
  );
}

/**
 * A sortable, paginated table.
 *
 * Sorting is tri-state (see `nextSort`): the third click drops back to the
 * order the page supplied, which is why `rows` arrives pre-sorted into
 * something meaningful rather than arbitrary.
 *
 * The page index is clamped at render rather than reset in an effect, so a
 * shrinking row set (a filter toggle, a narrower dataset) lands on the last
 * real page instead of a blank one.
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  perPage = 10,
  emptyMessage,
  footnote,
  caption,
}: DataTableProps<T>) {
  const t = useTranslations("table");
  const locale = useLocale();
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const byId = new Map(columns.map((c) => [c.id, c]));
    return sortRows(rows, sort, {
      locale,
      valueOf: (row, columnId) => byId.get(columnId)?.sortValue?.(row) ?? null,
    });
  }, [rows, sort, columns, locale]);

  const safePage = clampPage(page, sorted.length, perPage);
  const pages = pageCount(sorted.length, perPage);
  const bounds = pageBounds(safePage, sorted.length, perPage);
  const visible = pageSlice(sorted, safePage, perPage);

  const handleSort = (columnId: string) => {
    setSort((current) => nextSort(current, columnId));
    setPage(0);
  };

  if (rows.length === 0) {
    return (
      <p className="mt-2 max-w-3xl rounded-md bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="mt-2">
      {/* tabIndex makes the overflow scrollable without a mouse: the columns
          past the right edge were unreachable by keyboard. */}
      <div
        className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        tabIndex={0}
        role={caption ? "region" : undefined}
        aria-label={caption}
      >
        <table className="w-full min-w-max text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-muted">
              {columns.map((column) => {
                const active = sort?.columnId === column.id;
                const direction = active ? sort.direction : null;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={
                      active
                        ? direction === "desc"
                          ? "descending"
                          : "ascending"
                        : "none"
                    }
                    className={`py-2 pr-4 font-medium ${
                      column.numeric ? "text-right" : "text-left"
                    }`}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => handleSort(column.id)}
                        title={t("sortHint")}
                        // Spelled out rather than left to the button's text,
                        // which is just the bare column name and does not say
                        // what pressing it does.
                        aria-label={`${column.header}: ${t("sortHint")}`}
                        className={`group inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink ${
                          column.numeric ? "flex-row-reverse" : ""
                        } ${active ? "text-ink" : ""}`}
                      >
                        <SortArrow direction={direction} />
                        {column.header}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {visible.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => {
                  const className = `py-2 pr-4 ${
                    column.numeric ? "text-right tabular-nums" : ""
                  }`;
                  return column.rowHeader ? (
                    <th
                      key={column.id}
                      scope="row"
                      className={`${className} font-normal text-left`}
                    >
                      {column.cell(row)}
                    </th>
                  ) : (
                    <td key={column.id} className={className}>
                      {column.cell(row)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink-muted">
        <span className="tabular-nums">
          {t("showing", {
            from: bounds.from,
            to: bounds.to,
            total: sorted.length,
          })}
        </span>
        {pages > 1 && (
          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(safePage - 1)}
              disabled={safePage === 0}
              className="min-h-[24px] rounded-md border border-line-strong px-3 py-1 text-xs hover:border-inverse hover:text-ink disabled:border-line disabled:text-ink-faint"
            >
              {t("previous")}
            </button>
            <span className="tabular-nums">
              {t("page", { page: safePage + 1, pages })}
            </span>
            <button
              type="button"
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= pages - 1}
              className="min-h-[24px] rounded-md border border-line-strong px-3 py-1 text-xs hover:border-inverse hover:text-ink disabled:border-line disabled:text-ink-faint"
            >
              {t("next")}
            </button>
          </span>
        )}
      </div>

      {footnote && sort === null && (
        <p className="mt-2 max-w-3xl text-xs text-ink-muted">{footnote}</p>
      )}
    </div>
  );
}
