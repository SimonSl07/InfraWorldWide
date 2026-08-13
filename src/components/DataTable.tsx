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
}

function SortArrow({ direction }: { direction: "asc" | "desc" | null }) {
  if (direction === null) {
    return (
      <span aria-hidden className="text-neutral-300 group-hover:text-neutral-400">
        ↕
      </span>
    );
  }
  return (
    <span aria-hidden className="text-neutral-900">
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
      <p className="mt-2 max-w-3xl rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="mt-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
              {columns.map((column) => {
                const active = sort?.columnId === column.id;
                const direction = active ? sort.direction : null;
                return (
                  <th
                    key={column.id}
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
                        className={`group inline-flex items-center gap-1 uppercase tracking-wide hover:text-neutral-900 ${
                          column.numeric ? "flex-row-reverse" : ""
                        } ${active ? "text-neutral-900" : ""}`}
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
          <tbody className="divide-y divide-neutral-100">
            {visible.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={`py-2 pr-4 ${
                      column.numeric ? "text-right tabular-nums" : ""
                    }`}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-neutral-500">
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
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:border-neutral-900 hover:text-neutral-900 disabled:border-neutral-200 disabled:text-neutral-300"
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
              className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:border-neutral-900 hover:text-neutral-900 disabled:border-neutral-200 disabled:text-neutral-300"
            >
              {t("next")}
            </button>
          </span>
        )}
      </div>

      {footnote && sort === null && (
        <p className="mt-2 max-w-3xl text-xs text-neutral-400">{footnote}</p>
      )}
    </div>
  );
}
