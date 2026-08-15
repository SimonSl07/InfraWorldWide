import { describe, expect, it } from "vitest";
import {
  contractedMonths,
  matchNotices,
  noticeCategory,
  normaliseText,
  placeTokens,
  routeRefs,
  scoreNotice,
  tokenWeights,
  wouldAdd,
  type TedNotice,
} from "./ted-match";
import type { Lot, Project } from "./schema";

function notice(over: Partial<TedNotice> = {}): TedNotice {
  return {
    publicationNumber: "8275-2024",
    publicationDate: "2024-01-15",
    noticeType: "can-standard",
    title:
      "Romania – Construction work for highways, roads – EXECUȚIE LUCRĂRI AUTOSTRADA PLOIESTI-BUZAU LOT 1 Dumbrava-Mizil km 0+000 – km 21+000",
    value: 4437278369.63,
    currency: "RON",
    durationValue: 80,
    durationUnit: "MONTH",
    conclusionDate: "2023-12-01",
    winners: "Spedition UMB",
    url: "https://ted.europa.eu/en/notice/-/detail/8275-2024",
    ...over,
  };
}

function lot(id: string, over: Partial<Lot> = {}): Lot {
  return {
    id,
    name: { en: id },
    status: "under_construction",
    lengthKm: 21,
    geometryRef: id,
    ...over,
  };
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: "ro-a7",
    country: "ro",
    category: "highway",
    name: { en: "A7 Motorway (Moldavia Motorway)" },
    description: { en: "d" },
    lots: [lot("dumbrava-mizil", { name: { en: "Dumbrava (A3) – Mizil (Ploiești–Buzău lot 1)" } })],
    sources: [{ title: "s", url: "https://example.org/" }],
    ...over,
  };
}

describe("normaliseText", () => {
  it("folds Romanian diacritics onto their base letters", () => {
    expect(normaliseText("Sebeș–Turda, Făgăraș, Moțca, Târgu Mureș")).toBe(
      "sebes turda fagaras motca targu mures",
    );
  });

  it("transliterates Bulgarian Cyrillic the way the data romanises it", () => {
    // TED titles for Bulgaria are Cyrillic; every lot name here is Latin.
    expect(normaliseText("Дупница")).toBe("dupnitsa");
    expect(normaliseText("Благоевград")).toBe("blagoevgrad");
    expect(normaliseText("Кресна – Сандански")).toBe("kresna sandanski");
    expect(normaliseText("Щипка")).toBe("shtipka");
  });

  it("drops punctuation, chainage and case", () => {
    expect(normaliseText("LOT 1 Dumbrava-Mizil km 0+000 – km 21+000")).toBe(
      "lot 1 dumbrava mizil km 0 000 km 21 000",
    );
  });
});

describe("placeTokens", () => {
  it("keeps toponyms and drops procurement and geography filler", () => {
    expect(placeTokens("Lot 3: Arpașu de Jos – Sâmbăta de Sus")).toEqual([
      "arpasu",
      "sambata",
    ]);
  });

  it("drops chainage, bare numbers and units", () => {
    expect(placeTokens("Dumbrava-Mizil km 0+000 – km 21+000")).toEqual([
      "dumbrava",
      "mizil",
    ]);
  });

  it("keeps a single-word lot name", () => {
    expect(placeTokens("Buzău bypass")).toEqual(["buzau"]);
  });

  it("deduplicates", () => {
    expect(placeTokens("Buzău – Buzău")).toEqual(["buzau"]);
  });
});

describe("routeRefs", () => {
  it("finds motorway, express and national road references", () => {
    expect(routeRefs("Autostrada A7 si DEx12 catre DN 2")).toEqual(["a7", "dex12", "dn2"]);
  });

  it("reads a Bulgarian ref written with a space", () => {
    // OSM and Bulgarian sources write "A 3"; the same road is "A3" here.
    expect(routeRefs("Автомагистрала A 3 Струма")).toEqual(["a3"]);
  });

  it("does not invent a ref from a bare number", () => {
    expect(routeRefs("Lot 1 km 21+000")).toEqual([]);
  });
});

describe("scoreNotice", () => {
  const p = project();

  it("scores a notice naming both endpoints of the lot as high", () => {
    const result = scoreNotice(notice(), p.lots[0], p);
    expect(result.confidence).toBe("high");
    // The corridor name the lot carries in brackets, "(Ploiești–Buzău lot 1)",
    // is in the notice title too, so all four names line up.
    expect(result.matched).toEqual(["dumbrava", "mizil", "ploiesti", "buzau"]);
  });

  it("refuses a single weak token with no route reference", () => {
    const result = scoreNotice(
      notice({ title: "Reparatii curente pod pe DN 11 la Dumbrava" }),
      p.lots[0],
      p,
    );
    expect(result.confidence).toBe("none");
  });

  it("demotes a maintenance framework that happens to name the road", () => {
    const maintenance = notice({
      title:
        "Romania – Highway maintenance work – Acord cadru lucrari de intretinere curenta Dumbrava Mizil",
    });
    const result = scoreNotice(maintenance, p.lots[0], p);
    expect(result.reasons).toContain("maintenance or framework notice");
    expect(result.score).toBeLessThan(scoreNotice(notice(), p.lots[0], p).score);
  });

  it("rewards a route reference the title shares with the project", () => {
    const withRef = scoreNotice(
      notice({ title: "Autostrada A7 Dumbrava Mizil" }),
      p.lots[0],
      p,
    );
    const withoutRef = scoreNotice(notice({ title: "Dumbrava Mizil" }), p.lots[0], p);
    expect(withRef.score).toBeGreaterThan(withoutRef.score);
    expect(withRef.reasons).toContain("route ref a7");
  });

  it("rewards a notice published near the recorded award date", () => {
    const dated = lot("dumbrava-mizil", {
      name: { en: "Dumbrava – Mizil" },
      dates: { tenderAwarded: "2023-12" },
    });
    const near = scoreNotice(notice({ publicationDate: "2024-01-15" }), dated, p);
    const far = scoreNotice(notice({ publicationDate: "2015-01-15" }), dated, p);
    expect(near.score).toBeGreaterThan(far.score);
    expect(near.reasons).toContain("published near the recorded award");
  });

  it("scores an unrelated notice at nothing", () => {
    const result = scoreNotice(
      notice({ title: "Bulgaria – Road construction – Kresna Sandanski" }),
      p.lots[0],
      p,
    );
    expect(result.confidence).toBe("none");
    expect(result.score).toBe(0);
  });
});

describe("noticeCategory", () => {
  // Every TED title is "<country> – <CPV label> – <national title>", and the
  // CPV label is the only part written in English on every notice.
  it("reads the CPV label out of the title", () => {
    expect(noticeCategory("Romania – Construction work for highways, roads – X")).toBe("road");
    expect(noticeCategory("Romania – Railway construction works – X")).toBe("rail");
    expect(noticeCategory("Romania – Underground railway works – X")).toBe("rail");
    expect(noticeCategory("Romania – Road bridge construction work – X")).toBe("structure");
    expect(noticeCategory("Romania – Ring road construction work – X")).toBe("road");
  });

  it("separates upkeep from construction", () => {
    expect(noticeCategory("Romania – Highway maintenance work – X")).toBe("maintenance");
    expect(noticeCategory("Romania – Road-repair works – X")).toBe("maintenance");
    expect(noticeCategory("Romania – Bridge renewal construction work – X")).toBe("maintenance");
  });

  it("gives up rather than guessing", () => {
    expect(noticeCategory("Romania – Building construction work – X")).toBe("other");
    expect(noticeCategory("no dashes at all")).toBe("other");
  });
});

describe("scoreNotice category gate", () => {
  const highway = project();
  const railway = project({
    id: "ro-rail-x",
    category: "railway",
    name: { en: "Line 300" },
    lots: [lot("dumbrava-mizil", { name: { en: "Dumbrava – Mizil" } })],
  });

  it("rejects a railway notice offered to a motorway lot", () => {
    const result = scoreNotice(
      notice({ title: "Romania – Railway construction works – Dumbrava Mizil" }),
      highway.lots[0],
      highway,
    );
    expect(result.confidence).toBe("none");
    expect(result.reasons).toContain("railway notice against a highway project");
  });

  it("rejects a road notice offered to a railway lot", () => {
    const result = scoreNotice(
      notice({ title: "Romania – Construction work for highways, roads – Dumbrava Mizil" }),
      railway.lots[0],
      railway,
    );
    expect(result.confidence).toBe("none");
  });

  it("lets a bridge or tunnel notice stand against either", () => {
    const title = "Romania – Road bridge construction work – Dumbrava Mizil";
    expect(scoreNotice(notice({ title }), highway.lots[0], highway).confidence).not.toBe("none");
    expect(scoreNotice(notice({ title }), railway.lots[0], railway).confidence).not.toBe("none");
  });

  it("demotes an upkeep notice from its CPV label alone", () => {
    const result = scoreNotice(
      notice({ title: "Romania – Road-repair works – Dumbrava Mizil Ploiesti Buzau" }),
      highway.lots[0],
      highway,
    );
    expect(result.reasons).toContain("maintenance or framework notice");
  });
});

describe("token weighting", () => {
  // "Poiana tunnel (A1 Pitești–Sibiu lot 3)" carries its corridor in brackets.
  // Unweighted, any notice naming that corridor matches two of its three
  // names and outranks the lot the notice is actually about.
  const tunnel = project({
    id: "ro-tunnels",
    category: "tunnel",
    name: { en: "Romanian road tunnels" },
    lots: [
      lot("poiana", { name: { en: "Poiana tunnel (A1 Pitești–Sibiu lot 3)" } }),
      lot("caineni", { name: { en: "Câineni tunnel (A1 Pitești–Sibiu lot 2)" } }),
      lot("balota", { name: { en: "Balota tunnel (A1 Pitești–Sibiu lot 2)" } }),
    ],
  });
  const corridor = notice({
    title:
      "Romania – Construction work for highways, roads – Autostrada Pitesti - Sibiu lot 4",
  });

  it("demotes names shared by many lots and keeps the distinctive one", () => {
    const rows = matchNotices([corridor], [tunnel]);
    // Every lot shares "pitesti" and "sibiu" and nothing else matches, so
    // none of them should be offered.
    expect(rows).toEqual([]);
  });

  it("still matches when the distinctive name appears", () => {
    const named = notice({
      title:
        "Romania – Construction work for highways, roads – Tunel Poiana, Autostrada Pitesti - Sibiu",
    });
    const rows = matchNotices([named], [tunnel]);
    expect(rows[0].lot).toBe("poiana");
  });

  it("weighs a name by how many lots use it", () => {
    expect(tokenWeights([tunnel]).get("poiana")).toBe(1);
    expect(tokenWeights([tunnel]).get("pitesti")).toBeCloseTo(1 / 3, 5);
  });

  it("will not call a match high when no name belongs to the lot alone", () => {
    // The A8 lot "Targu Mures - Ditrau" shares both leading names with the A3
    // corridor "Brasov - Targu Mures - Cluj - Oradea". Without Ditrau in the
    // title, this is a guess, and the report must not present it as settled.
    const a8 = project({
      id: "ro-a8",
      name: { en: "A8 Motorway" },
      lots: [lot("targu-mures-ditrau", { name: { en: "Târgu Mureș – Ditrău" } })],
    });
    const a3 = project({
      id: "ro-a3-transylvania",
      name: { en: "A3 Transylvania Motorway" },
      lots: [lot("campia-turzii-targu-mures", { name: { en: "Câmpia Turzii – Târgu Mureș" } })],
    });
    const corridorAward = notice({
      title:
        "Romania – Construction work for highways, roads – Autostrazii Brasov - Targu Mures - Cluj - Oradea",
    });
    const weights = tokenWeights([a8, a3]);
    const result = scoreNotice(corridorAward, a8.lots[0], a8, weights);
    expect(result.confidence).not.toBe("high");
    expect(result.reasons).toContain("no name unique to this lot");

    // With the lot's own name present it can be high again.
    const named = notice({
      title: "Romania – Construction work for highways, roads – Targu Mures - Ditrau sectiunea 1",
    });
    expect(scoreNotice(named, a8.lots[0], a8, weights).confidence).toBe("high");
  });
});

describe("contractedMonths", () => {
  it("accepts a duration TED states in months", () => {
    expect(contractedMonths({ durationValue: 48, durationUnit: "MONTH" })).toEqual({
      months: 48,
      certain: true,
    });
  });

  it("refuses to guess when the unit is missing", () => {
    // 425 of 900 harvested notices state a number and no unit.
    expect(contractedMonths({ durationValue: 80, durationUnit: "" })).toEqual({
      months: 80,
      certain: false,
    });
  });

  it("refuses a duration in days rather than converting it", () => {
    expect(contractedMonths({ durationValue: 1840, durationUnit: "DAY" })).toBeNull();
  });

  it("refuses a notice whose lots carry different units", () => {
    expect(
      contractedMonths({ durationValue: 24, durationUnit: "MONTH | DAY | MONTH" }),
    ).toBeNull();
  });

  it("treats repeated identical units as one unit", () => {
    expect(
      contractedMonths({ durationValue: 24, durationUnit: "MONTH | MONTH | MONTH" }),
    ).toEqual({ months: 24, certain: true });
  });

  it("is null when there is no duration at all", () => {
    expect(contractedMonths({ durationValue: null, durationUnit: "" })).toBeNull();
  });
});

describe("wouldAdd", () => {
  it("lists only the fields the lot does not already have", () => {
    const bare = lot("dumbrava-mizil");
    expect(wouldAdd(notice(), bare)).toEqual([
      "contract.value",
      "contract.executionMonths",
      "dates.tenderAwarded",
      "contractors",
    ]);
  });

  it("offers nothing when the lot is already complete", () => {
    const full = lot("dumbrava-mizil", {
      dates: { tenderAwarded: "2023-12" },
      contract: { value: { amount: 1468, currency: "RON", year: 2022 }, executionMonths: 20 },
      contractors: [{ name: "Spedition UMB" }],
    });
    expect(wouldAdd(notice(), full)).toEqual([]);
  });

  it("does not offer a duration it cannot express in months", () => {
    const bare = lot("dumbrava-mizil");
    expect(wouldAdd(notice({ durationValue: 900, durationUnit: "DAY" }), bare)).not.toContain(
      "contract.executionMonths",
    );
  });
});

describe("matchNotices", () => {
  const p = project({
    lots: [
      lot("dumbrava-mizil", { name: { en: "Dumbrava (A3) – Mizil" } }),
      lot("kresna-sandanski", { name: { en: "Kresna – Sandanski" } }),
    ],
  });

  it("returns the best candidates per notice, strongest first", () => {
    const rows = matchNotices([notice()], [p]);
    expect(rows).toHaveLength(1);
    expect(rows[0].lot).toBe("dumbrava-mizil");
    expect(rows[0].project).toBe("ro-a7");
    expect(rows[0].confidence).toBe("high");
  });

  it("leaves out notices that match nothing", () => {
    expect(matchNotices([notice({ title: "Snow clearing in Cluj county" })], [p])).toEqual([]);
  });

  it("caps the candidates offered per notice", () => {
    const many = matchNotices([notice()], [p], { maxPerNotice: 1 });
    expect(many).toHaveLength(1);
  });

  it("carries what the notice would add through to the row", () => {
    const rows = matchNotices([notice()], [p]);
    expect(rows[0].wouldAdd).toContain("contract.value");
    expect(rows[0].publicationNumber).toBe("8275-2024");
  });

  it("keeps one row per lot when a notice covers several", () => {
    const multi = notice({
      title:
        "AUTOSTRADA PLOIESTI-BUZAU LOT 1 Dumbrava-Mizil LOT 2 Mizil-Pietroasele LOT 3 Pietroasele-Buzau",
    });
    const three = project({
      lots: [
        lot("dumbrava-mizil", { name: { en: "Dumbrava – Mizil" } }),
        lot("mizil-pietroasele", { name: { en: "Mizil – Pietroasele" } }),
        lot("pietroasele-buzau", { name: { en: "Pietroasele – Buzău" } }),
      ],
    });
    const rows = matchNotices([multi], [three]);
    expect(rows.map((r) => r.lot).sort()).toEqual([
      "dumbrava-mizil",
      "mizil-pietroasele",
      "pietroasele-buzau",
    ]);
  });
});
