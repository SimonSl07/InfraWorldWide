import { describe, it, expect } from "vitest";
import { foldText, textMatches } from "./text";

describe("foldText", () => {
  it("folds the Turkish dotless i", () => {
    expect(foldText("Özaltın İnşaat")).toBe("ozaltin insaat");
  });

  it("lowercases", () => {
    expect(foldText("Bucharest")).toBe("bucharest");
  });

  it("strips accents that decompose", () => {
    expect(foldText("România")).toBe("romania");
    expect(foldText("Bögl")).toBe("bogl");
    expect(foldText("Râul Doamnei")).toBe("raul doamnei");
  });

  it("folds Slovak diacritics through NFD alone", () => {
    expect(foldText("Diaľnica Žilina–Košice")).toBe("dialnica zilina–kosice");
    expect(foldText("Ľubochňa, Čebrať, Štrba, Ružomberok, Trenčín")).toBe(
      "lubochna, cebrat, strba, ruzomberok, trencin",
    );
    expect(foldText("Svrčinovec, Poľana, Hôrky, Ďurďošík, Kráľová")).toBe(
      "svrcinovec, polana, horky, durdosik, kralova",
    );
  });

  it("folds Polish letters, including ł that NFD leaves alone", () => {
    expect(foldText("Droga ekspresowa S7, węzeł Kiełpin")).toBe(
      "droga ekspresowa s7, wezel kielpin",
    );
    expect(foldText("Łódź, Gdańsk, Świnoujście, Żywiec, Kraków")).toBe(
      "lodz, gdansk, swinoujscie, zywiec, krakow",
    );
    expect(foldText("Ząbki, Mińsk Mazowiecki, Chełm, Sośnica, Ćmielów")).toBe(
      "zabki, minsk mazowiecki, chelm, sosnica, cmielow",
    );
  });

  it("folds Hungarian letters, including double-acute ő and ű", () => {
    expect(foldText("Autópálya, autóút, alagút, híd, csomópont")).toBe(
      "autopalya, autout, alagut, hid, csomopont",
    );
    expect(foldText("Győr, Szőny, Tűzoltó utca, Gödöllő, Nyíregyháza")).toBe(
      "gyor, szony, tuzolto utca, godollo, nyiregyhaza",
    );
    expect(foldText("Kőröshegy, Ürömi, Ferihegyi Ikarus, Szűcs")).toBe(
      "koroshegy, uromi, ferihegyi ikarus, szucs",
    );
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
