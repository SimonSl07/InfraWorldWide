import { describe, expect, it } from "vitest";
import {
  classifyLink,
  collectSourceUrls,
  formatLinkReport,
  type LinkResult,
} from "./link-check";
import type { Project } from "./schema";

function project(over: Partial<Project> = {}): Project {
  return {
    id: "ro-a1",
    country: "ro",
    category: "highway",
    name: { en: "A1" },
    description: { en: "d" },
    lots: [
      {
        id: "l1",
        name: { en: "l1" },
        status: "opened",
        lengthKm: 1,
        geometryRef: "l1",
      },
    ],
    sources: [{ title: "one", url: "https://example.org/1" }],
    ...over,
  };
}

describe("collectSourceUrls", () => {
  it("collects project sources and contract notice links", () => {
    const p = project({
      lots: [
        {
          id: "l1",
          name: { en: "l1" },
          status: "opened",
          lengthKm: 1,
          geometryRef: "l1",
          contract: { noticeUrl: "https://ted.example/notice" },
        },
      ],
    });
    expect(collectSourceUrls([p]).map((l) => l.url)).toEqual([
      "https://example.org/1",
      "https://ted.example/notice",
    ]);
  });

  it("lists one row per url, naming everything that cites it", () => {
    const a = project();
    const b = project({ id: "ro-a2" });
    const [link] = collectSourceUrls([b, a]);
    expect(link.url).toBe("https://example.org/1");
    expect(link.usedBy).toEqual(["ro-a1", "ro-a2"]);
  });

  it("sorts by url so two runs produce the same list", () => {
    const p = project({
      sources: [
        { title: "z", url: "https://example.org/z" },
        { title: "a", url: "https://example.org/a" },
      ],
    });
    expect(collectSourceUrls([p]).map((l) => l.url)).toEqual([
      "https://example.org/a",
      "https://example.org/z",
    ]);
  });
});

describe("classifyLink", () => {
  it("passes 2xx", () => {
    expect(classifyLink({ status: 200 })).toBe("ok");
    expect(classifyLink({ status: 204 })).toBe("ok");
  });

  it("calls 404 and 410 dead, which is the case worth a pull request", () => {
    expect(classifyLink({ status: 404 })).toBe("dead");
    expect(classifyLink({ status: 410 })).toBe("dead");
  });

  it("separates a blocked crawler from a broken link", () => {
    // opentender.eu answers 403 to any automated request and is not dead.
    expect(classifyLink({ status: 403 })).toBe("blocked");
    expect(classifyLink({ status: 429 })).toBe("blocked");
  });

  it("treats other failures as unknown rather than as a dead source", () => {
    expect(classifyLink({ status: 500 })).toBe("unknown");
    expect(classifyLink({ status: null, error: "timeout" })).toBe("unknown");
  });

  it("counts a redirect as ok, since fetch follows it", () => {
    expect(classifyLink({ status: 301 })).toBe("ok");
  });
});

describe("formatLinkReport", () => {
  const results: LinkResult[] = [
    {
      url: "https://ok.example/",
      usedBy: ["ro-a1"],
      status: 200,
      verdict: "ok",
    },
    {
      url: "https://gone.example/",
      usedBy: ["ro-a2", "ro-a3"],
      status: 404,
      verdict: "dead",
    },
    {
      url: "https://blocked.example/",
      usedBy: ["ro-a4"],
      status: 403,
      verdict: "blocked",
    },
  ];

  it("leads with the dead links and names what cites them", () => {
    const text = formatLinkReport(results);
    expect(text.indexOf("gone.example")).toBeLessThan(
      text.indexOf("blocked.example"),
    );
    expect(text).toContain("ro-a2, ro-a3");
    expect(text).toContain("404");
  });

  it("counts each verdict", () => {
    expect(formatLinkReport(results)).toContain(
      "1 dead, 1 blocked, 0 unknown, 1 ok, 3 checked",
    );
  });

  it("does not list the links that answered", () => {
    expect(formatLinkReport(results)).not.toContain("ok.example");
  });

  it("uses no em dash", () => {
    expect(formatLinkReport(results)).not.toContain("—");
  });
});
