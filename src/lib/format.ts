import type { Money } from "./schema";

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "$",
  RON: "lei ",
  BGN: "лв",
  RSD: "дин.",
  GBP: "£",
};

/**
 * Magnitude words per locale. English writes "€1.8B" closed up; Romanian
 * abbreviates the word and spaces it, "€1,8 mld.".
 */
const MAGNITUDES: Record<string, { million: string; billion: string; space: boolean }> = {
  en: { million: "M", billion: "B", space: false },
  ro: { million: "mil.", billion: "mld.", space: true },
};

/** Group and round a number the way the reader's locale writes it. */
export function formatNumber(
  value: number,
  locale: string,
  fractionDigits = 0,
): string {
  return value.toLocaleString(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/**
 * Decimals a number is actually written with, up to `max`.
 *
 * A sourced figure is shown as recorded, so the precision comes from the
 * figure rather than from a constant: 133.97 is a contract value read off an
 * award notice, and printing it as 134.0 states a round number the source
 * never gave. Capped because a float that arrives as 1.7000000000000002 is
 * arithmetic noise, not precision.
 */
function decimalsOf(value: number, max: number): number {
  if (Number.isInteger(value)) return 0;
  for (let places = 1; places < max; places++) {
    const factor = 10 ** places;
    if (Math.abs(Math.round(value * factor) - value * factor) < 1e-9) {
      return places;
    }
  }
  return max;
}

/**
 * Most decimals printed for an amount written in millions. Three is what the
 * data carries: contract values are recorded to the thousand.
 */
const MILLION_DECIMALS = 3;

/**
 * Format a Money value (amount is in millions): "€500M", "€1.2B", "€1,8 mld.".
 *
 * The locale is optional so existing call sites keep working, but passing it
 * matters: `toFixed()` writes 1.8 where Romanian requires 1,8.
 *
 * Decimals follow the amount rather than a fixed width. Rounding everything
 * to one place turned 26 committed figures into numbers no source states,
 * `лв133.97M` reading as `лв134.0M`, which is precisely what this project
 * says not to do with a sourced figure.
 */
export function formatMoney(m: Money, locale = "en"): string {
  const symbol = CURRENCY_SYMBOLS[m.currency] ?? `${m.currency} `;
  const words = MAGNITUDES[locale] ?? MAGNITUDES.en;
  const gap = words.space ? " " : "";

  const value =
    m.amount >= 1000
      ? // Billions stay at one decimal. Writing an amount in units of a
        // thousand million is already a rounding, so there is no recorded
        // precision here to preserve.
        `${formatNumber(m.amount / 1000, locale, m.amount % 1000 === 0 ? 0 : 1)}${gap}${words.billion}`
      : `${formatNumber(m.amount, locale, decimalsOf(m.amount, MILLION_DECIMALS))}${gap}${words.million}`;

  return `${symbol}${value}`;
}

/** Absolute month index (see contract.monthIndex) → "Jan 2021". */
export function formatMonth(monthIdx: number, locale: string): string {
  const year = Math.floor(monthIdx / 12);
  const month = monthIdx - year * 12;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month, 1)));
}

/**
 * Network length as whole kilometres: "1,142 km". Fractions of a kilometre
 * are below the precision the source data supports, so they are not shown.
 *
 * The exception is a length under 1 km, which keeps one decimal. Urban
 * bridges and infill sections are genuinely a few hundred metres long, and
 * rounding those to "0 km" states something false about a row that is right
 * there on the page.
 */
export function formatKm(km: number, locale: string): string {
  if (km > 0 && km < 1) {
    return `${km.toLocaleString(locale, { maximumFractionDigits: 1 })} km`;
  }
  return `${Math.round(km).toLocaleString(locale)} km`;
}

/** Signed percentage with one decimal: "+38.3%", "−10.0%", "+38,3%". */
export function formatPercent(value: number, locale = "en"): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(value), locale, 1)}%`;
}

/** Signed month count with a localized unit: "+46 mo", "−4 luni". */
export function formatMonths(value: number, unit = "mo", locale = "en"): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(value), locale)} ${unit}`;
}

/** "2012-07-19" → "Jul 2012" style short date, year-only stays "2012". */
export function formatDate(date: string, locale: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!m) return String(y);
  const dt = new Date(Date.UTC(y, m - 1, d ?? 1));
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    ...(d ? { day: "numeric" } : {}),
    timeZone: "UTC",
  }).format(dt);
}
