import { describe, it, expect } from "vitest";
import { createLocalizer, localeChain, localized } from "./localized";

describe("localeChain", () => {
  it("puts the asked-for locale first and the fallback last", () => {
    expect(localeChain("ro")).toEqual(["ro", "en"]);
  });

  it("does not repeat the fallback when it is the locale", () => {
    expect(localeChain("en")).toEqual(["en"]);
  });

  it("tries the base language of a regional locale", () => {
    // A "pt-BR" reader should read the "pt" text before falling to English.
    expect(localeChain("pt-BR")).toEqual(["pt-BR", "pt", "en"]);
  });

  it("takes a fallback other than English", () => {
    expect(localeChain("de", "ro")).toEqual(["de", "ro"]);
  });
});

describe("localized", () => {
  const a1 = { en: "Bucharest ring road", ro: "Centura București" };

  it("returns the field for the reader's locale", () => {
    expect(localized(a1, "ro")).toBe("Centura București");
  });

  it("falls back to English when the translation is missing", () => {
    expect(localized({ en: "Danube bridge" }, "ro")).toBe("Danube bridge");
  });

  it("treats an empty translation as missing", () => {
    expect(localized({ en: "Danube bridge", ro: "" }, "ro")).toBe(
      "Danube bridge",
    );
  });

  it("falls back to English for a locale the data does not carry", () => {
    // This is the whole point of the ordered chain: a third locale added to
    // the routing is readable the moment the data has it, and harmless before.
    expect(localized(a1, "de")).toBe("Bucharest ring road");
  });

  it("reads a locale beyond the two shipped today", () => {
    expect(localized({ en: "A1 motorway", de: "Autobahn A1" }, "de")).toBe(
      "Autobahn A1",
    );
  });

  it("uses the base language of a regional locale", () => {
    expect(localized(a1, "ro-MD")).toBe("Centura București");
  });
});

describe("createLocalizer", () => {
  it("binds one locale for a page full of fields", () => {
    const name = createLocalizer("ro");
    expect(name({ en: "Sections", ro: "Secțiuni" })).toBe("Secțiuni");
    expect(name({ en: "Sources" })).toBe("Sources");
  });
});
