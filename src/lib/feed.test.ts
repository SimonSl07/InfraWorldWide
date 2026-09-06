import { describe, it, expect } from "vitest";
import { buildOpeningsFeed, escapeXml, rfc822 } from "./feed";
import type { Opening } from "./timeline";

const BASE = "https://infraworldwide.example";

const openings: Opening[] = [
  {
    projectId: "ro-a1",
    projectName: { en: "A1 motorway", ro: "Autostrada A1" },
    lotId: "sebes-turda",
    lotName: { en: "Sebeș–Turda", ro: "Sebeș–Turda" },
    category: "highway",
    country: "ro",
    lengthKm: 17.4,
    date: "2020-12-15",
  },
  {
    projectId: "bg-a3-struma",
    projectName: { en: "A3 Struma" },
    lotName: { en: "Blagoevgrad <> Krupnik" },
    lotId: "blagoevgrad-krupnik",
    category: "highway",
    country: "bg",
    lengthKm: 14.2,
    date: "2019",
  },
];

describe("escapeXml", () => {
  it("escapes everything that would break a document", () => {
    expect(escapeXml(`a & b < c > d "e" 'f'`)).toBe(
      "a &amp; b &lt; c &gt; d &quot;e&quot; &apos;f&apos;",
    );
  });

  it("leaves an en dash alone, because it is part of route names", () => {
    expect(escapeXml("Sebeș–Turda")).toBe("Sebeș–Turda");
  });
});

describe("rfc822", () => {
  it("expands a year-only date to its first day", () => {
    expect(rfc822("2019")).toContain("01 Jan 2019");
  });

  it("expands a year-month date", () => {
    expect(rfc822("2019-06")).toContain("01 Jun 2019");
  });

  it("keeps a full date", () => {
    expect(rfc822("2020-12-15")).toContain("15 Dec 2020");
  });
});

describe("buildOpeningsFeed", () => {
  const xml = buildOpeningsFeed({
    baseUrl: BASE,
    locale: "en",
    title: "Openings",
    description: "Sections opened",
    openings,
  });

  it("is a well-formed RSS channel", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0"');
    expect((xml.match(/<item>/g) ?? []).length).toBe(2);
  });

  it("links each item to its project page in the right locale", () => {
    expect(xml).toContain(`${BASE}/en/projects/ro-a1`);
  });

  it("gives each item a stable guid", () => {
    expect(xml).toContain('<guid isPermaLink="false">ro-a1/sebes-turda</guid>');
  });

  it("escapes text that would otherwise break the document", () => {
    // The Bulgarian lot name in the fixture contains angle brackets.
    expect(xml).toContain("Blagoevgrad &lt;&gt; Krupnik");
    expect(xml).not.toContain("Blagoevgrad <> Krupnik");
  });

  it("uses the requested locale's names when it has them", () => {
    const ro = buildOpeningsFeed({
      baseUrl: BASE,
      locale: "ro",
      title: "Deschideri",
      description: "Tronsoane deschise",
      openings,
    });
    expect(ro).toContain("Autostrada A1");
  });

  it("falls back to English when a translation is missing", () => {
    const ro = buildOpeningsFeed({
      baseUrl: BASE,
      locale: "ro",
      title: "Deschideri",
      description: "Tronsoane deschise",
      openings,
    });
    expect(ro).toContain("A3 Struma");
  });
});
