/**
 * Text-level checks that apply to every JSON file under data/ and messages/:
 * the locale vocabulary and the house style's one hard typographic rule.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Locale keys must name a locale the site actually has.
 *
 * `localizedStringSchema` deliberately accepts any key so a third locale
 * needs no type change, which means a typo like "rp" is well-formed there.
 * This is the check that catches it: the vocabulary comes from messages/,
 * so adding a locale to the UI is what permits it in the data, and nothing
 * has to be edited twice.
 */
export function checkLocaleKeys(
  value: unknown,
  rel: string,
  locales: string[],
  path = "",
): string[] {
  const errors: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      errors.push(...checkLocaleKeys(item, rel, locales, `${path}[${i}]`));
    });
    return errors;
  }
  if (value === null || typeof value !== "object") return errors;

  const record = value as Record<string, unknown>;
  // Shape-detect a LocalizedString: nothing else in this schema carries an
  // "en" string property.
  if (typeof record.en === "string") {
    for (const key of Object.keys(record)) {
      if (!locales.includes(key)) {
        errors.push(
          `${rel}: ${path || "(root)"} has locale key "${key}", which has no messages/${key}.json`,
        );
      }
    }
    return errors;
  }
  for (const [key, child] of Object.entries(record)) {
    errors.push(
      ...checkLocaleKeys(child, rel, locales, path ? `${path}.${key}` : key),
    );
  }
  return errors;
}

/** Locales the site ships, taken from the messages directory. */
export function knownLocales(root: string): string[] {
  const dir = path.join(root, "messages");
  if (!fs.existsSync(dir)) return ["en"];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length));
}

/**
 * AGENTS.md bans the em dash in user-facing text and nothing enforced it.
 * An error, because the rule is unambiguous and the fix is mechanical. The
 * en dash (U+2013) is untouched: it is part of route names like
 * "Sebeș–Turda" and changing one corrupts the name.
 */
export function checkEmDashes(root: string, dirs: string[]): string[] {
  const errors: string[] = [];
  for (const dir of dirs) {
    for (const file of walk(path.join(root, dir))) {
      const text = fs.readFileSync(file, "utf8");
      const count = (text.match(/—/g) ?? []).length;
      if (count > 0) {
        errors.push(
          `${path.relative(root, file).replace(/\\/g, "/")}: ${count} em dash(es) (U+2014); AGENTS.md bans them, use a full stop, comma, colon or brackets`,
        );
      }
    }
  }
  return errors;
}

/** Every .json file under a directory, recursively. */
export function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".json")) yield full;
  }
}
