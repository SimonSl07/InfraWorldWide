import { describe, expect, it } from "vitest";
import {
  atLeastPriority,
  knownGapsSchema,
  matchesKnownGap,
  partitionKnown,
  summarise,
  toCsv,
  toJson,
  toTable,
} from "./gap-report";
import type { Gap } from "./gaps";

function gap(over: Partial<Gap> = {}): Gap {
  return {
    id: "ro/ro-a1/l1/no-cost",
    priority: "high",
    country: "ro",
    project: "ro-a1",
    lot: "l1",
    field: "cost",
    issue: "no cost at all",
    detail: "10 km, opened",
    whereToLook: "data/projects/ro/a1.json",
    ...over,
  };
}

describe("matchesKnownGap", () => {
  it("matches an exact id", () => {
    expect(matchesKnownGap("ro/ro-a1/l1/no-cost", "ro/ro-a1/l1/no-cost")).toBe(
      true,
    );
    expect(matchesKnownGap("ro/ro-a1/l2/no-cost", "ro/ro-a1/l1/no-cost")).toBe(
      false,
    );
  });

  it("matches a wildcard in any segment", () => {
    expect(
      matchesKnownGap(
        "rs/rs-a5/vrba/opened-no-actual",
        "rs/*/*/opened-no-actual",
      ),
    ).toBe(true);
    expect(
      matchesKnownGap(
        "ro/ro-a1/l1/opened-no-actual",
        "rs/*/*/opened-no-actual",
      ),
    ).toBe(false);
    expect(matchesKnownGap("rs/rs-a5/vrba/no-cost", "rs/rs-a5/*/*")).toBe(true);
  });

  it("does not let a wildcard span segments", () => {
    expect(matchesKnownGap("rs/rs-a5/vrba/no-cost", "rs/*/no-cost")).toBe(
      false,
    );
    expect(matchesKnownGap("rs/rs-a5/vrba/no-cost", "*")).toBe(false);
  });

  it("treats a pattern as literal text, not a regular expression", () => {
    expect(
      matchesKnownGap("rs/rs-a5/vrba/no-cost", "rs/rs.a5/vrba/no-cost"),
    ).toBe(false);
  });
});

describe("partitionKnown", () => {
  const known = [
    {
      id: "rs/*/*/project-no-actual",
      reason: "Serbian outturn costs are not published.",
      settledOn: "2026-08-12",
    },
  ];

  it("splits settled dead ends out of the open list", () => {
    const gaps = [
      gap({ id: "rs/rs-a5/-/project-no-actual", country: "rs" }),
      gap(),
    ];
    const { open, suppressed } = partitionKnown(gaps, known);
    expect(open.map((g) => g.id)).toEqual(["ro/ro-a1/l1/no-cost"]);
    expect(suppressed).toHaveLength(1);
    expect(suppressed[0].known.reason).toMatch(/not published/);
  });

  it("reports patterns that no longer match anything, so the list can be pruned", () => {
    const { stale } = partitionKnown([gap()], known);
    expect(stale).toEqual(["rs/*/*/project-no-actual"]);
  });
});

describe("atLeastPriority", () => {
  it("keeps everything at or above the given severity", () => {
    const gaps = [
      gap({ priority: "high" }),
      gap({ priority: "medium" }),
      gap({ priority: "low" }),
      gap({ priority: "info" }),
    ];
    expect(atLeastPriority(gaps, "medium").map((g) => g.priority)).toEqual([
      "high",
      "medium",
    ]);
    expect(atLeastPriority(gaps, undefined)).toHaveLength(4);
  });
});

describe("toCsv", () => {
  it("writes the original column order, with the id appended", () => {
    const csv = toCsv([gap()]);
    expect(csv.split("\n")[0]).toBe(
      "priority,country,project,lot,field,issue,detail,whereToLook,id",
    );
    expect(csv.split("\n")[1]).toBe(
      'high,ro,ro-a1,l1,cost,no cost at all,"10 km, opened",data/projects/ro/a1.json,ro/ro-a1/l1/no-cost',
    );
  });

  it("quotes fields containing a comma, a quote or a newline", () => {
    const csv = toCsv([gap({ detail: 'say "hi", then' })]);
    expect(csv).toContain('"say ""hi"", then"');
  });

  it("ends with a newline so the file concatenates cleanly", () => {
    expect(toCsv([gap()]).endsWith("\n")).toBe(true);
  });
});

describe("toJson", () => {
  it("carries the counts and the suppressed list alongside the gaps", () => {
    const parsed = JSON.parse(
      toJson({
        generatedAt: "2026-08-14",
        gaps: [
          gap(),
          gap({ priority: "low", id: "ro/ro-a1/l2/no-tender-award" }),
        ],
        suppressed: [
          {
            gap: gap({ id: "rs/rs-a5/-/project-no-actual" }),
            reason: "settled",
          },
        ],
      }),
    );
    expect(parsed.generatedAt).toBe("2026-08-14");
    expect(parsed.total).toBe(2);
    expect(parsed.byPriority).toEqual({ high: 1, low: 1 });
    expect(parsed.gaps).toHaveLength(2);
    expect(parsed.suppressed[0].reason).toBe("settled");
  });
});

describe("toTable", () => {
  it("groups by priority and pads the columns", () => {
    const table = toTable([gap(), gap({ priority: "low", field: "name.ro" })]);
    expect(table).toContain("HIGH (1)");
    expect(table).toContain("LOW (1)");
    expect(table).toContain("ro-a1");
  });

  it("says so when there is nothing to report", () => {
    expect(toTable([])).toBe("No gaps found.");
  });

  it("uses no em dash anywhere in its output", () => {
    expect(toTable([gap()])).not.toContain("—");
  });
});

describe("summarise", () => {
  it("counts rows per priority and issue, most common first", () => {
    const rows = summarise([
      gap(),
      gap({ id: "ro/ro-a1/l2/no-cost" }),
      gap({
        priority: "low",
        field: "name.ro",
        issue: "missing Romanian lot name",
      }),
    ]);
    expect(rows[0]).toEqual({
      priority: "high",
      field: "cost",
      issue: "no cost at all",
      count: 2,
    });
    expect(rows).toHaveLength(2);
  });
});

describe("knownGapsSchema", () => {
  it("accepts a seeded file", () => {
    const parsed = knownGapsSchema.safeParse({
      note: "why this file exists",
      entries: [
        {
          id: "rs/*/*/project-no-actual",
          reason: "Not published anywhere.",
          settledOn: "2026-08-12",
          source: "https://example.org/",
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an entry with no reason or a malformed date", () => {
    expect(
      knownGapsSchema.safeParse({
        note: "n",
        entries: [{ id: "a/b/c/d", settledOn: "2026-08-12" }],
      }).success,
    ).toBe(false);
    expect(
      knownGapsSchema.safeParse({
        note: "n",
        entries: [{ id: "a/b/c/d", reason: "r", settledOn: "August" }],
      }).success,
    ).toBe(false);
  });

  it("rejects an id that is not four segments", () => {
    expect(
      knownGapsSchema.safeParse({
        note: "n",
        entries: [{ id: "rs/*", reason: "r", settledOn: "2026-08-12" }],
      }).success,
    ).toBe(false);
  });
});
