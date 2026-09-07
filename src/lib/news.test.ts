import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LocalizedString, Project } from "./schema";
import { normaliseText, serbianLatin, tokenWeights } from "./ted-match";
import {
  daysBefore,
  decodeEntities,
  editSummary,
  EMPTY_STATE,
  feedText,
  formatDigest,
  hasInfrastructureKeyword,
  isRelevant,
  matchItem,
  mergeState,
  newsSourcesSchema,
  parseFeed,
  suggestEventKind,
  wikipediaWatches,
  windowItems,
  type DigestEntry,
  type StoredItem,
} from "./news";

/**
 * Shapes captured 2026-09-07 from hotnews.ro/rss (WordPress RSS 2.0 with
 * CDATA and numeric entities) and a ro.wikipedia.org history feed (Atom with
 * an escaped HTML summary and two links per entry), trimmed to the fields the
 * parser reads.
 */
const RSS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>HotNews</title>
  <item>
    <title>A7: s-a deschis circulația pe lotul Adjud &#8211; Bacău, cu &#8222;o lună mai devreme&#8221;</title>
    <link>https://hotnews.ro/a7-adjud-bacau-2342954</link>
    <dc:creator><![CDATA[Redacția]]></dc:creator>
    <pubDate>Mon, 07 Sep 2026 09:04:31 +0000</pubDate>
    <category><![CDATA[Economie]]></category>
    <guid isPermaLink="false">https://hotnews.ro/?p=2342954</guid>
    <description><![CDATA[CNAIR a anunțat că <b>autostrada</b> A7 este deschisă traficului între Adjud și Bacău &#8230; ]]></description>
  </item>
  <item>
    <title><![CDATA[Interviu: controalele ANAF]]></title>
    <link>https://hotnews.ro/anaf-2342955</link>
    <pubDate>not a date</pubDate>
    <content:encoded><![CDATA[<p>Text despre <em>impozite</em>.</p>]]></content:encoded>
  </item>
  <item>
    <title>No link, dropped</title>
  </item>
</channel>
</rss>`;

const ATOM_SAMPLE = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ro">
  <id>https://ro.wikipedia.org/w/index.php?action=history&amp;feed=atom&amp;title=Autostrada_A7</id>
  <title>Autostrada A7 (România) - Istoricul modificărilor</title>
  <link rel="self" type="application/atom+xml" href="https://ro.wikipedia.org/w/index.php?action=history&amp;feed=atom&amp;title=Autostrada_A7"/>
  <entry>
    <id>https://ro.wikipedia.org/w/index.php?title=Autostrada_A7&amp;diff=17976237&amp;oldid=prev</id>
    <title>~2026-48233-24: /* Listă ieșiri */</title>
    <link rel="alternate" type="text/html" href="https://ro.wikipedia.org/w/index.php?title=Autostrada_A7&amp;diff=17976237&amp;oldid=prev"/>
    <updated>2026-09-05T17:49:32Z</updated>
    <summary type="html">&lt;p&gt;&lt;span class=&quot;autocomment&quot;&gt;Listă ieșiri&lt;/span&gt;&lt;/p&gt; &lt;table&gt;&lt;tr&gt;&lt;td&gt;Linia 208:&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</summary>
    <author><name>Editor</name></author>
  </entry>
</feed>`;

function project(
  id: string,
  lots: Array<{ id: string; en: string; ro?: string }>,
  sources: string[],
): Project {
  return {
    id,
    country: id.slice(0, 2),
    category: "highway",
    name: { en: id.slice(3).toUpperCase() },
    description: { en: "" },
    lots: lots.map((lot) => ({
      id: lot.id,
      name: (lot.ro
        ? { en: lot.en, ro: lot.ro }
        : { en: lot.en }) as LocalizedString,
      status: "under_construction" as const,
      lengthKm: 10,
      geometryRef: lot.id,
    })),
    sources: sources.map((url) => ({ title: url, url })),
  };
}

const PROJECTS: Project[] = [
  project(
    "ro-a7",
    [
      {
        id: "bacau-bypass",
        en: "Bacău bypass",
        ro: "Varianta de ocolire Bacău",
      },
      { id: "adjud-bacau", en: "Adjud – Bacău" },
    ],
    [
      "https://ro.wikipedia.org/wiki/Autostrada_A7_(Rom%C3%A2nia)",
      "https://en.wikipedia.org/wiki/A7_motorway_(Romania)#History",
      "https://ro.wikipedia.org/wiki/Autostrada_A7_(Rom%C3%A2nia)?oldid=1",
      "https://hotnews.ro/some-article",
    ],
  ),
  project(
    "bg-a1-trakia",
    [{ id: "sofia-plovdiv", en: "Sofia – Plovdiv" }],
    ["https://bg.wikipedia.org/wiki/Автомагистрала_Тракия"],
  ),
  project("ro-a1", [{ id: "sibiu-pitesti", en: "Sibiu – Pitești" }], []),
];

const WEIGHTS = tokenWeights(PROJECTS);

const item = (title: string, summary = "", url = "https://x.test/a") => ({
  url,
  title,
  published: "2026-09-07",
  summary,
});

describe("parseFeed", () => {
  it("reads RSS items, decoding CDATA and entities and dropping tags", () => {
    const items = parseFeed(RSS_SAMPLE);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      url: "https://hotnews.ro/a7-adjud-bacau-2342954",
      title:
        "A7: s-a deschis circulația pe lotul Adjud – Bacău, cu „o lună mai devreme”",
      published: "2026-09-07",
      summary:
        "CNAIR a anunțat că autostrada A7 este deschisă traficului între Adjud și Bacău …",
    });
    // content:encoded wins over a missing description; an unparseable date
    // is null rather than "Invalid Date".
    expect(items[1]).toEqual({
      url: "https://hotnews.ro/anaf-2342955",
      title: "Interviu: controalele ANAF",
      published: null,
      summary: "Text despre impozite .",
    });
  });

  it("reads Atom entries, taking the alternate link and the updated date", () => {
    const items = parseFeed(ATOM_SAMPLE);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe(
      "https://ro.wikipedia.org/w/index.php?title=Autostrada_A7&diff=17976237&oldid=prev",
    );
    expect(items[0].title).toBe("~2026-48233-24: /* Listă ieșiri */");
    expect(items[0].published).toBe("2026-09-05");
    expect(items[0].summary).toBe("Listă ieșiri Linia 208:");
  });

  it("returns nothing for a document with no entries", () => {
    expect(parseFeed("<html><body>Not a feed</body></html>")).toEqual([]);
  });
});

describe("feedText and decodeEntities", () => {
  it("decodes numeric and named entities once each side of the tag strip", () => {
    expect(decodeEntities("&amp;#8230; &#8230; &lt;b&gt;")).toBe(
      "&#8230; … <b>",
    );
    expect(feedText("<![CDATA[<p>a &amp;amp; b&nbsp;c</p>]]>")).toBe("a & b c");
    expect(feedText(null)).toBe("");
  });
});

describe("wikipediaWatches", () => {
  it("watches each cited article once, per edition, without anchors or queries", () => {
    const watches = wikipediaWatches(PROJECTS);
    expect(
      watches.map((w) => `${w.projectId}:${w.edition}:${w.title}`),
    ).toEqual([
      "ro-a7:ro:Autostrada_A7_(Rom%C3%A2nia)",
      "ro-a7:en:A7_motorway_(Romania)",
      "bg-a1-trakia:bg:Автомагистрала_Тракия",
    ]);
    expect(watches[0].feedUrl).toBe(
      "https://ro.wikipedia.org/w/index.php?title=Autostrada_A7_(Rom%C3%A2nia)&action=history&feed=atom",
    );
  });
});

describe("editSummary", () => {
  it("drops the editor and unwraps the section marker", () => {
    expect(editSummary("~2026-48233-24: /* Listă ieșiri */")).toBe(
      "Listă ieșiri",
    );
    expect(editSummary("Someone: /* Istoric */ actualizare date")).toBe(
      "Istoric actualizare date",
    );
    expect(editSummary("Fixed a typo")).toBe("Fixed a typo");
  });
});

describe("hasInfrastructureKeyword", () => {
  it("recognises the vocabulary in the three languages, after folding", () => {
    expect(
      hasInfrastructureKeyword("Autostrada A7: lotul 2 a fost inaugurat"),
    ).toBe(true);
    expect(hasInfrastructureKeyword("Автомагистрала Хемус: нов участък")).toBe(
      true,
    );
    expect(hasInfrastructureKeyword("Otvoren autoput Miloš Veliki")).toBe(true);
    expect(hasInfrastructureKeyword("Controalele ANAF se înmulțesc")).toBe(
      false,
    );
  });
});

describe("matchItem", () => {
  it("names the section whose place names the item repeats", () => {
    const candidates = matchItem(
      item(
        "A7: s-a deschis circulația pe lotul Adjud – Bacău",
        "CNAIR anunță deschiderea între Adjud și Bacău",
      ),
      PROJECTS,
      WEIGHTS,
    );
    expect(candidates[0]).toMatchObject({
      projectId: "ro-a7",
      lotId: "adjud-bacau",
      confidence: "high",
    });
    // Bacău alone also names the bypass, but with a name two lots share it
    // cannot be more than a medium guess, and it ranks second.
    expect(candidates[1]).toMatchObject({
      projectId: "ro-a7",
      lotId: "bacau-bypass",
      confidence: "medium",
    });
  });

  it("files an item that names only the route under the project", () => {
    const candidates = matchItem(
      item("Autostrada A7 primește finanțare europeană"),
      PROJECTS,
      WEIGHTS,
    );
    expect(candidates).toEqual([
      {
        projectId: "ro-a7",
        lotId: null,
        confidence: "low",
        score: 0.25,
        matched: ["a7"],
      },
    ]);
  });

  it("keeps a route-only match inside the source's country when told it", () => {
    const restrictions = item(
      "Restricții pe autostrada A1 între Margina și Traian Vuia",
    );
    expect(
      matchItem(restrictions, PROJECTS, WEIGHTS).map((c) => c.projectId),
    ).toEqual(["bg-a1-trakia", "ro-a1"]);
    expect(
      matchItem(restrictions, PROJECTS, WEIGHTS, { country: "ro" }).map(
        (c) => c.projectId,
      ),
    ).toEqual(["ro-a1"]);
  });

  it("matches nothing for news about something else", () => {
    expect(
      matchItem(item("Controalele ANAF se înmulțesc"), PROJECTS, WEIGHTS),
    ).toEqual([]);
  });
});

describe("isRelevant", () => {
  const none = item("Vremea de mâine");
  it("keeps every item of a trade feed", () => {
    expect(isRelevant(none, "infrastructure")).toBe(true);
  });
  it("keeps a general-news item only when it uses the vocabulary", () => {
    expect(isRelevant(none, "general")).toBe(false);
    // Place names alone do not qualify: a store opening in Brăila shares its
    // toponyms with the A7 and is not news about the A7.
    expect(
      isRelevant(
        item("Leroy Merlin deschide primul magazin din Brăila"),
        "general",
      ),
    ).toBe(false);
    expect(isRelevant(item("Un nou pod peste Dunăre"), "general")).toBe(true);
  });
});

describe("suggestEventKind", () => {
  it("reads the decisive phrases in Romanian, English and Serbian", () => {
    expect(suggestEventKind("Lotul 2 a fost inaugurat astăzi")).toBe("opened");
    expect(suggestEventKind("CNAIR a semnat contractul pentru lotul 3")).toBe(
      "awarded",
    );
    expect(suggestEventKind("Contractul a fost reziliat de CNAIR")).toBe(
      "contract_terminated",
    );
    expect(suggestEventKind("Ordinul de începere a fost emis")).toBe(
      "construction_start",
    );
    expect(suggestEventKind("Potpisan ugovor za autoput")).toBe("awarded");
    expect(suggestEventKind("Vremea de mâine")).toBeNull();
  });
});

describe("state", () => {
  it("counts days back across a month boundary", () => {
    expect(daysBefore("2026-09-07", 14)).toBe("2026-08-24");
    expect(daysBefore("2026-01-01", 1)).toBe("2025-12-31");
  });

  it("stamps new URLs with today, keeps first sightings, prunes the old", () => {
    const seen = mergeState(
      {
        version: 1,
        items: {
          "https://x.test/old": {
            ...item("Old", "", "https://x.test/old"),
            sourceId: "s",
            firstSeen: "2026-05-01",
          },
          "https://x.test/known": {
            ...item("Known", "", "https://x.test/known"),
            sourceId: "s",
            firstSeen: "2026-09-01",
          },
        },
      },
      [
        {
          sourceId: "s",
          item: item("Known again", "", "https://x.test/known"),
        },
        {
          sourceId: "s",
          item: item("New", "x".repeat(700), "https://x.test/new"),
        },
      ],
      "2026-09-07",
      90,
    );
    expect(Object.keys(seen.items).sort()).toEqual([
      "https://x.test/known",
      "https://x.test/new",
    ]);
    expect(seen.items["https://x.test/known"].firstSeen).toBe("2026-09-01");
    expect(seen.items["https://x.test/new"].firstSeen).toBe("2026-09-07");
    expect(seen.items["https://x.test/new"].summary).toHaveLength(600);
  });

  it("windows on the published date, falling back to the first sighting", () => {
    const stored = (url: string, published: string | null, firstSeen: string) =>
      ({
        ...item("t", "", url),
        published,
        sourceId: "s",
        firstSeen,
      }) as StoredItem;
    const state = {
      version: 1 as const,
      items: {
        a: stored("a", "2026-09-06", "2026-09-07"),
        b: stored("b", "2026-08-01", "2026-09-07"),
        c: stored("c", null, "2026-09-05"),
        d: stored("d", null, "2026-08-01"),
      },
    };
    expect(windowItems(state, "2026-09-07", 14).map((i) => i.url)).toEqual([
      "a",
      "c",
    ]);
    expect(windowItems(EMPTY_STATE, "2026-09-07", 14)).toEqual([]);
  });
});

describe("formatDigest", () => {
  const entry = (
    title: string,
    candidates: DigestEntry["candidates"],
    extra: Partial<DigestEntry> = {},
  ): DigestEntry => ({
    item: {
      ...item(title, "", `https://x.test/${title.replace(/\W+/g, "-")}`),
      sourceId: "hotnews",
      firstSeen: "2026-09-07",
    },
    sourceName: "HotNews",
    candidates,
    suggested: null,
    ...extra,
  });

  it("headlines a section only when the match is medium or better", () => {
    // A live run put an explosion in Augsburg under the Sofia metro and a
    // locomotive fire under a Danube bridge, both on one shared place name.
    // Low belongs in the fold with the rest of the day's reading.
    const cand = (confidence: "high" | "medium" | "low") => [
      {
        projectId: "ro-a7",
        lotId: "adjud-bacau",
        confidence,
        score: 1,
        matched: ["adjud"],
      },
    ];
    const digest = formatDigest({
      entries: [
        entry("Opened Adjud", cand("high")),
        entry("Awarded Adjud", cand("medium")),
        entry("Explosion in Augsburg", cand("low")),
      ],
      failures: [],
      sources: 9,
      windowDays: 14,
    });
    const headline = digest.slice(
      digest.indexOf("## Matched to a section"),
      digest.indexOf("<details>"),
    );
    expect(headline).toContain("Opened Adjud");
    expect(headline).toContain("Awarded Adjud");
    expect(headline).not.toContain("Augsburg");
    expect(digest).toContain("Other infrastructure news");
    expect(digest.slice(digest.indexOf("<details>"))).toContain("Augsburg");
  });

  it("says so when the window is empty, in bytes that do not change by day", () => {
    const input = { entries: [], failures: [], sources: 9, windowDays: 14 };
    const digest = formatDigest(input);
    expect(digest).toContain("Nothing new in the window.");
    expect(digest).toBe(formatDigest(input));
  });

  it("groups matches by project and lists the rest by kind", () => {
    const digest = formatDigest({
      entries: [
        entry(
          "Lot Adjud Bacău deschis",
          [
            {
              projectId: "ro-a7",
              lotId: "adjud-bacau",
              confidence: "high",
              score: 1.25,
              matched: [],
            },
            {
              projectId: "ro-a7",
              lotId: "bacau-bypass",
              confidence: "medium",
              score: 0.6,
              matched: [],
            },
          ],
          { suggested: "opened" },
        ),
        entry("A7 finanțare", [
          {
            projectId: "ro-a7",
            lotId: null,
            confidence: "low",
            score: 0.25,
            matched: ["a7"],
          },
        ]),
        entry("Un pod nou", []),
        entry("~Editor: /* Istoric */", [], { wikipediaProject: "ro-a7" }),
      ],
      failures: [{ source: "cnadnr.ro", error: "HTTP 503" }],
      sources: 9,
      windowDays: 14,
    });
    expect(digest).toContain("## Matched to a section");
    expect(digest).toContain("### ro-a7");
    expect(digest).toContain(
      "→ ro-a7 / adjud-bacau (high) or ro-a7 / bacau-bypass",
    );
    expect(digest).toContain("suggests `opened`");
    expect(digest).toContain("## Route named, no section matched");
    expect(digest).toContain("## Cited Wikipedia articles edited");
    expect(digest).toContain("- 2026-09-07 · [Istoric](");
    expect(digest).toContain(
      "Other infrastructure news, no section matched (1)",
    );
    expect(digest).toContain("- cnadnr.ro: HTTP 503");
    // The writing rule holds for generated prose too.
    expect(digest).not.toContain("—");
  });

  it("caps the list and says how much it left out", () => {
    const entries = Array.from({ length: 5 }, (_, i) => entry(`n${i}`, []));
    const digest = formatDigest({
      entries,
      failures: [],
      sources: 1,
      windowDays: 14,
      maxEntries: 3,
    });
    expect(digest).toContain("2 more entries not listed.");
  });
});

describe("serbianLatin", () => {
  // The Bulgarian map in ted-match gives "po ate" for Појате and
  // "krushevats" for Крушевац, so the four Serbian official feeds could
  // never reach a lot recorded as "Kruševac East".
  it("gives the Latin the Serbian data is written in", () => {
    const pairs: Array<[string, string]> = [
      ["Појате", "Pojate"],
      ["Крушевац", "Kruševac"],
      ["Обреновац", "Obrenovac"],
      ["Сурчин", "Surčin"],
      ["Ниш", "Niš"],
      ["Ђердап", "Đerdap"],
      ["Љубовија", "Ljubovija"],
    ];
    for (const [cyrillic, latin] of pairs) {
      expect(normaliseText(serbianLatin(cyrillic))).toBe(normaliseText(latin));
    }
  });

  it("returns nothing for text that holds no Cyrillic", () => {
    // The caller appends the result, so "" is what leaves every Romanian and
    // English item scoring exactly as it did before.
    expect(serbianLatin("Autostrada A7 Adjud - Bacau")).toBe("");
  });
});

describe("data/news-sources.json", () => {
  it("validates against the schema and names only feeds", () => {
    const file = path.join(process.cwd(), "data/news-sources.json");
    const parsed = newsSourcesSchema.parse(
      JSON.parse(fs.readFileSync(file, "utf8")),
    );
    const ids = parsed.sources.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const source of parsed.sources) {
      expect(source.url).toMatch(/^https:\/\//);
    }
  });
});
