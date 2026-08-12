import { describe, it, expect } from "vitest";
import { countryName, createCountryNamer, flagEmoji } from "./country-names";

describe("countryName", () => {
  it("localizes the ISO code", () => {
    expect(countryName("ro", "en")).toBe("Romania");
    expect(countryName("ro", "ro")).toBe("România");
    expect(countryName("rs", "en")).toBe("Serbia");
  });

  it("accepts either case", () => {
    expect(countryName("BG", "en")).toBe(countryName("bg", "en"));
  });

  it("falls back to the uppercase code for an unassigned region", () => {
    expect(countryName("qq", "en")).toBe("QQ");
  });

  // Intl.DisplayNames throws a RangeError on a malformed code rather than
  // returning anything — a country page for a typo'd code must still render.
  it("survives a malformed code", () => {
    expect(countryName("r", "en")).toBe("R");
    expect(countryName("r1", "en")).toBe("R1");
  });
});

describe("createCountryNamer", () => {
  it("reuses one formatter across calls", () => {
    const name = createCountryNamer("en");
    expect([name("ro"), name("bg")]).toEqual(["Romania", "Bulgaria"]);
  });
});

describe("flagEmoji", () => {
  it("builds the flag from regional indicators", () => {
    expect(flagEmoji("ro")).toBe("🇷🇴");
    expect(flagEmoji("BG")).toBe("🇧🇬");
  });

  it("is empty for anything that is not a two-letter code", () => {
    expect(flagEmoji("rou")).toBe("");
    expect(flagEmoji("")).toBe("");
    expect(flagEmoji("r1")).toBe("");
  });
});
