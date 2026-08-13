/**
 * Text folding for search and slugs.
 *
 * Every name in this dataset is liable to carry diacritics, and nobody types
 * them: "Romania" has to find "România", "Bogl" has to find "Bögl". Folding
 * happens on both sides of a comparison so it does not matter which one is
 * accented.
 */

/** Letters that have no decomposed form, so NFD alone will not fold them. */
const LETTER_FOLDS: Record<string, string> = {
  ø: "o",
  Ø: "o",
  ł: "l",
  Ł: "l",
  đ: "d",
  Đ: "d",
  ß: "ss",
  æ: "ae",
  Æ: "ae",
  œ: "oe",
  Œ: "oe",
};

/** Lowercases and strips accents: "Bögl" → "bogl", "Râul" → "raul". */
export function foldText(value: string): string {
  return value
    .replace(/[øØłŁđĐßæÆœŒ]/g, (c) => LETTER_FOLDS[c] ?? c)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Whether `query` appears in `haystack`, ignoring case and accents. An
 * empty or whitespace-only query matches everything, so a cleared search box
 * restores the full list rather than emptying it.
 */
export function textMatches(haystack: string, query: string): boolean {
  const needle = foldText(query.trim());
  if (needle === "") return true;
  return foldText(haystack).includes(needle);
}
