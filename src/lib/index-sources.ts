/**
 * Reading the two published sources behind data/deflators.json and
 * data/fx.json.
 *
 * Both tables were assembled by hand, which is why neither reaches 2026 and
 * three committed costs cannot be restated. Refetching them is only safe if
 * the parsers are exact, so the wire formats are handled here as pure
 * functions with tests over captured responses, and scripts/refresh-indices.ts
 * does nothing but fetch, call these, and print a diff.
 *
 * Formats:
 *   Eurostat  JSON-stat 2.0. Dimensions are listed in `id` with their lengths
 *             in `size`; `value` is an object keyed by the flattened index,
 *             and cells with no observation are absent rather than null.
 *   ECB       SDMX csvdata. One row per observation, thirty-two columns, and
 *             TITLE_COMPL contains commas inside quotes.
 */

/** Year (as a four-digit string) to observed value. */
export type YearValues = Record<string, number>;

interface JsonStatDimension {
  category?: { index?: Record<string, number> };
}

interface JsonStat {
  id?: string[];
  size?: number[];
  value?: Record<string, number> | number[];
  dimension?: Record<string, JsonStatDimension>;
}

/**
 * Splits a JSON-stat cube into one year series per category of `dimension`
 * (geo for the HICP query, currency for the exchange-rate one). Every other
 * dimension in these queries is pinned to a single value by the query itself,
 * so nothing has to be summed or chosen.
 */
export function parseJsonStat(
  json: unknown,
  dimension: string,
): Record<string, YearValues> {
  const cube = json as JsonStat;
  const id = cube.id;
  const size = cube.size;
  if (
    !Array.isArray(id) ||
    !Array.isArray(size) ||
    !cube.dimension ||
    !cube.value
  ) {
    throw new Error(
      "not a JSON-stat 2.0 response (no id, size, dimension or value)",
    );
  }

  const targetAxis = id.indexOf(dimension);
  const timeAxis = id.indexOf("time");
  if (targetAxis < 0) {
    throw new Error(
      `response has no "${dimension}" dimension (has ${id.join(", ")})`,
    );
  }
  if (timeAxis < 0) throw new Error('response has no "time" dimension');

  const categories = (axis: number): string[] => {
    const index = cube.dimension![id[axis]]?.category?.index ?? {};
    const names: string[] = [];
    for (const [name, position] of Object.entries(index))
      names[position] = name;
    return names;
  };
  const targets = categories(targetAxis);
  const years = categories(timeAxis);

  // Row-major strides: the last dimension varies fastest.
  const strides = size.map((_, axis) =>
    size.slice(axis + 1).reduce((product, n) => product * n, 1),
  );

  const values = cube.value;
  const at = (flat: number): number | undefined =>
    Array.isArray(values) ? values[flat] : values[String(flat)];

  const out: Record<string, YearValues> = {};
  for (let t = 0; t < targets.length; t++) {
    const series: YearValues = {};
    for (let y = 0; y < years.length; y++) {
      const flat = t * strides[targetAxis] + y * strides[timeAxis];
      const value = at(flat);
      // Absent means "not published", which is not the same as zero.
      if (typeof value === "number") series[years[y]] = value;
    }
    out[targets[t]] = series;
  }
  return out;
}

/** One CSV line into fields, honouring double quotes and doubled quotes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  out.push(cell);
  return out;
}

/**
 * ECB SDMX csvdata into one series per currency. Only annual observations are
 * kept: asking for frequency A already excludes the rest, but a stray monthly
 * row would otherwise land under a year-shaped key.
 */
export function parseEcbCsv(text: string): Record<string, YearValues> {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return {};

  const header = splitCsvLine(lines[0]);
  const currencyAt = header.indexOf("CURRENCY");
  const periodAt = header.indexOf("TIME_PERIOD");
  const valueAt = header.indexOf("OBS_VALUE");
  if (currencyAt < 0 || periodAt < 0 || valueAt < 0) {
    throw new Error(
      "ECB response has no CURRENCY, TIME_PERIOD and OBS_VALUE columns",
    );
  }

  const out: Record<string, YearValues> = {};
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const period = cells[periodAt];
    if (!/^\d{4}$/.test(period ?? "")) continue;
    const value = Number(cells[valueAt]);
    if (!Number.isFinite(value)) continue;
    const currency = cells[currencyAt];
    (out[currency] ??= {})[period] = value;
  }
  return out;
}

/** Rounds every value to `decimals`, the precision the tables are kept at. */
export function roundSeries(series: YearValues, decimals: number): YearValues {
  const factor = 10 ** decimals;
  const out: YearValues = {};
  for (const [year, value] of Object.entries(series)) {
    out[year] = Math.round(value * factor) / factor;
  }
  return out;
}

export interface SeriesChange {
  year: string;
  before: number | null;
  after: number | null;
  kind: "added" | "removed" | "changed";
}

/**
 * What a refetch would do to a committed series. `tolerance` absorbs the last
 * binary digit of a float so a value that round-trips through JSON unchanged
 * is not reported as a revision.
 */
export function diffSeries(
  committed: YearValues,
  fetched: YearValues,
  tolerance = 1e-9,
): SeriesChange[] {
  const years = [
    ...new Set([...Object.keys(committed), ...Object.keys(fetched)]),
  ].sort();
  const changes: SeriesChange[] = [];
  for (const year of years) {
    const before = committed[year];
    const after = fetched[year];
    if (before === undefined && after !== undefined) {
      changes.push({ year, before: null, after, kind: "added" });
    } else if (before !== undefined && after === undefined) {
      changes.push({ year, before, after: null, kind: "removed" });
    } else if (
      before !== undefined &&
      after !== undefined &&
      Math.abs(before - after) > tolerance
    ) {
      changes.push({ year, before, after, kind: "changed" });
    }
  }
  return changes;
}

/** The changes to one series, or an empty string when there are none. */
export function formatSeriesDiff(
  name: string,
  changes: SeriesChange[],
): string {
  if (changes.length === 0) return "";
  const lines = [`${name}: ${changes.length} change(s)`];
  for (const change of changes) {
    if (change.kind === "added")
      lines.push(`  + ${change.year}: ${change.after}`);
    else if (change.kind === "removed")
      lines.push(`  - ${change.year}: ${change.before}`);
    else lines.push(`  ~ ${change.year}: ${change.before} -> ${change.after}`);
  }
  return lines.join("\n");
}
