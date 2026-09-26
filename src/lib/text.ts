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

/**
 * Bulgarian Cyrillic to the romanisation the lot names already use
 * (Дупница = Dupnitsa). Streamlined BGN/PCGN, which is what Bulgarian road
 * signs and Wikipedia use, so it lands on the same spelling as the data.
 * Keys are lowercase: lowercase the text before looking letters up.
 */
export const BULGARIAN_CYRILLIC: Readonly<Record<string, string>> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sht",
  ъ: "a",
  ь: "y",
  ю: "yu",
  я: "ya",
};

/**
 * Letters only Serbian Cyrillic has, as Serbian Latin. They are emitted with
 * their diacritics so `foldText` treats them exactly like the Latin spelling:
 * "Ђорђевић" and "Đorđević" both fold to "dordevic".
 */
const SERBIAN_ONLY_CYRILLIC: Readonly<Record<string, string>> = {
  ђ: "đ",
  ј: "j",
  љ: "lj",
  њ: "nj",
  ћ: "ć",
  џ: "dž",
};

/**
 * Lowercase Latin for any Bulgarian or Serbian Cyrillic in `value`; Latin
 * text passes through unchanged.
 *
 * Where the two alphabets share a letter the Bulgarian romanisation wins
 * (`ц` is "ts", not "c"). That is deliberate for identities rather than
 * matching: every Cyrillic contractor name in the data is Bulgarian, and the
 * Serbian data is written in Latin, so a name only needs one stable spelling.
 * Text matched against Serbian place names should use `serbianLatin` in
 * ted-match.ts instead.
 */
export function romaniseCyrillic(value: string): string {
  let out = "";
  for (const ch of value.toLowerCase()) {
    out += BULGARIAN_CYRILLIC[ch] ?? SERBIAN_ONLY_CYRILLIC[ch] ?? ch;
  }
  return out;
}
