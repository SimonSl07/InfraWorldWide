import type { Money } from "./schema";

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: "€",
  USD: "$",
  RON: "lei ",
  GBP: "£",
};

/** Format a Money value (amount is in millions): "€500M", "€1.2B". */
export function formatMoney(m: Money): string {
  const symbol = CURRENCY_SYMBOLS[m.currency] ?? `${m.currency} `;
  const value =
    m.amount >= 1000
      ? `${(m.amount / 1000).toFixed(m.amount % 1000 === 0 ? 0 : 1)}B`
      : `${m.amount}M`;
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

/** Signed percentage with one decimal: "+38.3%", "−10.0%". */
export function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

/** Signed month count with a localized unit: "+46 mo", "−4 luni". */
export function formatMonths(value: number, unit = "mo"): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value)} ${unit}`;
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
