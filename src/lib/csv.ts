/**
 * CSV serialization for the downloadable ranking tables.
 *
 * Separate from the gap report's own writer, which serializes one fixed
 * record shape. This one takes columns and rows, because the tables it has
 * to emit do not share a shape with each other either.
 *
 * An unmeasured value is written as an empty cell rather than a zero. Every
 * figure in these tables is derived, and a firm with no measured slip has no
 * figure at all; writing 0 would make it read as delivered on time in
 * whatever opens the file next.
 */

export type CsvValue = string | number | boolean | null | undefined;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  columns: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<CsvValue>>,
): string {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return `${lines.join("\n")}\n`;
}
