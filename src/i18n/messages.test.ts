import { describe, it, expect } from "vitest";
import en from "../../messages/en.json";
import ro from "../../messages/ro.json";

/**
 * Locale parity: every UI string must exist in both locales, with the same
 * ICU placeholders. A key present in one file and not the other renders as
 * its own dotted path in the app ("rankings.unitMonths"), which is easy to
 * miss in a locale you don't read — so it fails the build instead.
 */

type Messages = { [key: string]: string | Messages };

function flatten(obj: Messages, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

/** ICU argument names in a message: "{months} mo" → ["months"]. */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]).sort();
}

const enFlat = flatten(en as Messages);
const roFlat = flatten(ro as Messages);

describe("message catalogues", () => {
  it("has no keys missing from ro", () => {
    const missing = [...enFlat.keys()].filter((k) => !roFlat.has(k));
    expect(missing).toEqual([]);
  });

  it("has no keys missing from en", () => {
    const missing = [...roFlat.keys()].filter((k) => !enFlat.has(k));
    expect(missing).toEqual([]);
  });

  it("has no empty strings", () => {
    const empty = [...enFlat, ...roFlat]
      .filter(([, v]) => v.trim().length === 0)
      .map(([k]) => k);
    expect(empty).toEqual([]);
  });

  it("uses the same ICU placeholders in both locales", () => {
    const mismatched = [...enFlat]
      .filter(([key, value]) => {
        const other = roFlat.get(key);
        return (
          other !== undefined &&
          placeholders(value).join(",") !== placeholders(other).join(",")
        );
      })
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it("covers every key the rankings page needs", () => {
    // Guards the page built in this feature: these are read through t() at
    // render time, so a typo only surfaces in the browser otherwise.
    const required = [
      "title",
      "intro",
      "asOf",
      "priceYear",
      "coverage",
      "coverageGap",
      "overrunTitle",
      "basisEstimate",
      "basisEstimateHelp",
      "basisAward",
      "basisAwardHelp",
      "slipTitle",
      "slipIntro",
      "slipDelivered",
      "slipInProgress",
      "slipInProgressHelp",
      "bestTitle",
      "bestIntro",
      "bestSlipTitle",
      "bestOverrunTitle",
      "byContractorTitle",
      "byContractorIntro",
      "byCountryTitle",
      "leagueNote",
      "unitMonths",
      "contractMonths",
      "refOpened",
      "refExpectedOpening",
      "refNow",
      "emptyOverrunEstimate",
      "emptyOverrunAward",
      "emptySlip",
      "emptyGroup",
      "emptyOnTime",
      "emptyUnderBudget",
      "methodologyTitle",
      "methodologyCosts",
      "methodologySchedule",
      "methodologySource",
    ].map((k) => `rankings.${k}`);

    const missing = required.filter((k) => !enFlat.has(k) || !roFlat.has(k));
    expect(missing).toEqual([]);
  });
});
