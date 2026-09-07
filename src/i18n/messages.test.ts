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

  it("covers every key the performance page needs", () => {
    // Guards the page: these are read through t() at render time, so a typo
    // only surfaces in the browser otherwise.
    const required = [
      ...[
        "title",
        "intro",
        "asOf",
        "priceYear",
        "coverage",
        "coverageGap",
        "byContractorTitle",
        "byCountryTitle",
        "thSection",
        "thCountry",
        "thKm",
        "thOpened",
        "thSlip",
        "thFirm",
        "thLots",
        "thMedianSlip",
        "thMedianOverrun",
        "thOnTime",
        "unitMonths",
        "emptySlip",
        "emptyGroup",
        "methodologyTitle",
        "methodologyCosts",
        "methodologySchedule",
        "methodologySource",
      ].map((k) => `rankings.${k}`),
      ...["sortHint", "showing", "previous", "next", "page"].map(
        (k) => `table.${k}`,
      ),
      ...[
        "thCategory",
        "thRecorded",
        "thComparable",
        "thPerKm",
        "thProject",
        "thCovered",
        "covered",
        "basis.actual",
        "basis.award",
        "basis.estimate",
        "scope.section",
        "scope.project",
        "openedTitle",
        "openedHelp",
        "costTitle",
        "costHelp",
        "contractorHelp",
        "countryHelp",
        "emptyCost",
        "orderOpened",
        "orderCost",
        "orderGroup",
      ].map((k) => `performance.${k}`),
    ];

    const missing = required.filter((k) => !enFlat.has(k) || !roFlat.has(k));
    expect(missing).toEqual([]);
  });

  it("covers every key the city panel and pages need", () => {
    const required = [
      "panelKicker",
      "population",
      "gdpPerCapita",
      "networkSummary",
      "notOnMainMap",
      "seeMore",
      "officialSite",
      "backToMap",
      "metaDescription",
      "intro",
      "openedKm",
      "acrossProjects",
      "lotsCount",
      "mapTitle",
      "mapIntro",
      "projectsTitle",
      "openedOfTotal",
      "sourcesTitle",
      "selected",
      "clearSelection",
      "selectHint",
    ].map((k) => `city.${k}`);

    const missing = required.filter((k) => !enFlat.has(k) || !roFlat.has(k));
    expect(missing).toEqual([]);
  });

  it("covers every key the about page needs", () => {
    const required = [
      "title",
      "lead",
      "dataTitle",
      "dataBody",
      "figuresProjects",
      "figuresSections",
      "figuresCountries",
      "figuresCities",
      "figuresOpenedKm",
      "figuresUnderConstructionKm",
      "figuresSources",
      "figuresYears",
      "byType",
      "countriesTitle",
      "dataSources",
      "builtNote",
      "helpTitle",
      "helpBody",
      "helpReport",
      "helpReportCta",
      "helpData",
      "helpRepoCta",
      "helpSpread",
      "builderTitle",
      "startTitle",
      "startMap",
      "startPerformance",
    ]
      .map((k) => `about.${k}`)
      .concat("nav.about");

    const missing = required.filter((k) => !enFlat.has(k) || !roFlat.has(k));
    expect(missing).toEqual([]);
  });

  it("covers every key the country panel and pages need", () => {
    const required = [
      "panelKicker",
      "asOf",
      "close",
      "emptyMonth",
      "building",
      "planned",
      "plannedTitle",
      "totalOpened",
      "underConstruction",
      "projects",
      "decade",
      "lots",
      "perArea",
      "perCapita",
      "rankHelp",
      "densityBasis",
      "growthSparkline",
      "seeMore",
      "metric",
      "indexTitle",
      "indexIntro",
      "compareTitle",
      "compareIntro",
      "compareHint",
      "clearCompare",
      "searchLabel",
      "searchPlaceholder",
      "searchEmpty",
      "pickOnMap",
      "removeFromCompare",
      "leads",
      "leadNote",
      "backToCountries",
      "metaDescription",
      "byCategory",
      "growthTitle",
      "growthPeak",
      "growthEmpty",
      "mapTitle",
      "deliveryTitle",
      "deliveryIntro",
      "deliveryEmpty",
      "worstSlips",
      "worstOverruns",
      "noOverrunData",
      "projectsTitle",
      "projectSourcesNote",
      "viewOnMap",
    ]
      .map((k) => `country.${k}`)
      .concat("nav.countries");

    const missing = required.filter((k) => !enFlat.has(k) || !roFlat.has(k));
    expect(missing).toEqual([]);
  });
});
