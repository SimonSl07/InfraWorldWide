/**
 * Picking the reader's language out of a localized field.
 *
 * Every page open-coded `locale === "ro" && s.ro ? s.ro : s.en`, which names
 * both locales in every one of some thirty call sites: a third locale meant
 * editing all of them. Here the locale is data, so adding one is a new entry
 * in `routing.locales` and a new field in the JSON, and nothing else.
 */

/**
 * Locales to try, most specific first: "ro-MD" reads Moldovan text if the
 * data has it, plain Romanian if not, and English last.
 */
export function localeChain(locale: string, fallbackLocale = "en"): string[] {
  const base = locale.split("-")[0];
  const chain = [locale, base, fallbackLocale];
  return [...new Set(chain.filter((l) => l.length > 0))];
}

/**
 * The first non-empty translation along the chain, and English if none of
 * them is there. `en` is required by the schema, so this always returns text.
 */
export function localized<T extends { en: string }>(
  value: T,
  locale: string,
  fallbackLocale = "en",
): string {
  const record = value as Record<string, unknown>;
  for (const key of localeChain(locale, fallbackLocale)) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return value.en;
}

/** `localized` with the locale already bound, for a page that reads many. */
export function createLocalizer(locale: string, fallbackLocale = "en") {
  return <T extends { en: string }>(value: T): string =>
    localized(value, locale, fallbackLocale);
}
