/**
 * Localized country names and flags from an ISO 3166-1 alpha-2 code.
 *
 * Names come from the runtime's own CLDR data rather than the dataset, so
 * adding a locale to the app never means editing a data file — and a country
 * added to data/projects is immediately named in every locale.
 */

/**
 * A namer for one locale. Intl.DisplayNames is comparatively expensive to
 * construct, so components building many labels should make one of these
 * rather than calling `countryName` in a loop.
 */
export function createCountryNamer(locale: string): (code: string) => string {
  let display: Intl.DisplayNames | null = null;
  try {
    display = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    // An unsupported locale falls back to the code itself.
  }
  return (code: string) => {
    const upper = code.toUpperCase();
    if (!display) return upper;
    try {
      return display.of(upper) ?? upper;
    } catch {
      return upper;
    }
  };
}

/** One-off localized country name. */
export function countryName(code: string, locale: string): string {
  return createCountryNamer(locale)(code);
}

/**
 * Flag as regional-indicator symbols ("ro" → 🇷🇴). Returns an empty string
 * for anything that is not a two-letter code, so a malformed code degrades
 * to no flag rather than to mojibake.
 */
export function flagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return "";
  const base = 0x1f1e6; // REGIONAL INDICATOR SYMBOL LETTER A
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(base + c.charCodeAt(0) - 65))
    .join("");
}
