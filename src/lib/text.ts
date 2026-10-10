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
  // Turkish dotless i: "Özaltın" must fold to "ozaltin", not "ozaltn".
  ı: "i",
};

/** Lowercases and strips accents: "Bögl" → "bogl", "Râul" → "raul". */
export function foldText(value: string): string {
  return value
    .replace(/[øØłŁđĐßæÆœŒı]/g, (c) => LETTER_FOLDS[c] ?? c)
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

/**
 * Single Greek letters in the ELOT 743 romanisation that Greek road signs,
 * operators and Wikipedia use (Θεσσαλονίκη = Thessaloniki, Πύργος = Pyrgos),
 * so a Greek headline lands on the same spelling as the lot names. Accented
 * forms are listed too, so tonos and diaeresis need no separate pass.
 */
const GREEK_LETTERS: Readonly<Record<string, string>> = {
  α: "a",
  ά: "a",
  β: "v",
  γ: "g",
  δ: "d",
  ε: "e",
  έ: "e",
  ζ: "z",
  η: "i",
  ή: "i",
  θ: "th",
  ι: "i",
  ί: "i",
  ϊ: "i",
  ΐ: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x",
  ο: "o",
  ό: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  υ: "y",
  ύ: "y",
  ϋ: "y",
  ΰ: "y",
  φ: "f",
  χ: "ch",
  ψ: "ps",
  ω: "o",
  ώ: "o",
};

/** αυ, ευ and ηυ are af/ef/if before these, and at the end of a word. */
const GREEK_VOICELESS = new Set([
  "θ",
  "κ",
  "ξ",
  "π",
  "σ",
  "ς",
  "τ",
  "φ",
  "χ",
  "ψ",
]);

const GREEK_LETTER = /[Ͱ-Ͽ]/;

/**
 * Lowercase Latin for any Greek in `value`, by ELOT 743; text with no Greek
 * letter comes back unchanged. The digraphs are what a letter table cannot
 * do: ου is one vowel (Μουδανιά = Moudania), αυ/ευ turn voiceless before
 * θ κ ξ π σ τ φ χ ψ (Ελευσίνα = Elefsina), and μπ/ντ are b/d only at the
 * start of a word (Μπράλος = Bralos, Κέντρο = Kentro).
 */
export function romaniseGreek(value: string): string {
  if (!GREEK_LETTER.test(value)) return value;
  const text = value.toLowerCase();
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1] ?? "";
    const wordStart = i === 0 || !GREEK_LETTER.test(text[i - 1]);
    if (ch === "ο" && (next === "υ" || next === "ύ")) {
      out += "ou";
      i++;
    } else if ("αάεέηή".includes(ch) && (next === "υ" || next === "ύ")) {
      const after = text[i + 2] ?? "";
      const voiceless = GREEK_VOICELESS.has(after) || !GREEK_LETTER.test(after);
      out += GREEK_LETTERS[ch] + (voiceless ? "f" : "v");
      i++;
    } else if (ch === "μ" && next === "π") {
      out += wordStart ? "b" : "mp";
      i++;
    } else if (ch === "ν" && next === "τ") {
      out += wordStart ? "d" : "nt";
      i++;
    } else if (ch === "γ" && next !== "" && "γξχ".includes(next)) {
      // γγ = ng, γξ = nx, γχ = nch; γκ stays gk, as ELOT writes it.
      out += "n";
    } else {
      out += GREEK_LETTERS[ch] ?? ch;
    }
  }
  return out;
}
