import { describe, it, expect } from "vitest";
import { foldText, textMatches } from "./text";

describe("foldText", () => {
  it("lowercases", () => {
    expect(foldText("Bucharest")).toBe("bucharest");
  });

  it("strips accents that decompose", () => {
    expect(foldText("România")).toBe("romania");
    expect(foldText("Bögl")).toBe("bogl");
    expect(foldText("Râul Doamnei")).toBe("raul doamnei");
  });

  it("folds letters NFD leaves alone", () => {
    expect(foldText("Łódź")).toBe("lodz");
    expect(foldText("Đorđe")).toBe("dorde");
    expect(foldText("Straße")).toBe("strasse");
  });

  it("leaves plain text untouched", () => {
    expect(foldText("sofia")).toBe("sofia");
  });
});

describe("textMatches", () => {
  it("matches ignoring case", () => {
    expect(textMatches("Bulgaria", "bulg")).toBe(true);
  });

  it("matches an unaccented query against accented text", () => {
    expect(textMatches("România", "romania")).toBe(true);
  });

  it("matches an accented query against unaccented text", () => {
    expect(textMatches("Romania", "românia")).toBe(true);
  });

  it("matches anywhere in the string, not just the start", () => {
    expect(textMatches("Republic of Serbia", "serbia")).toBe(true);
  });

  it("returns false when absent", () => {
    expect(textMatches("Bulgaria", "poland")).toBe(false);
  });

  it("treats an empty or blank query as matching everything", () => {
    expect(textMatches("Bulgaria", "")).toBe(true);
    expect(textMatches("Bulgaria", "   ")).toBe(true);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(textMatches("Bulgaria", "  bulg  ")).toBe(true);
  });
});
