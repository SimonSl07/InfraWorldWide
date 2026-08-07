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
