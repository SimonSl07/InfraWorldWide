import { describe, expect, it } from "vitest";
import { diffRecords, formatDiff, hasChanges } from "./record-diff";

const a = { id: "a", value: 1, note: "first" };
const b = { id: "b", value: 2, note: "second" };

describe("diffRecords", () => {
  it("finds nothing between identical sets", () => {
    const diff = diffRecords({ a, b }, { a, b });
    expect(hasChanges(diff)).toBe(false);
    expect(diff.unchanged).toBe(2);
  });

  it("reports added and removed keys", () => {
    const diff = diffRecords({ a }, { b });
    expect(diff.added.map((e) => e.key)).toEqual(["b"]);
    expect(diff.removed.map((e) => e.key)).toEqual(["a"]);
    expect(hasChanges(diff)).toBe(true);
  });

  it("names the fields that changed, and only those", () => {
    const diff = diffRecords({ a }, { a: { ...a, value: 9 } });
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].fields).toEqual(["value"]);
    expect(diff.changed[0].prev.value).toBe(1);
    expect(diff.changed[0].next.value).toBe(9);
  });

  it("counts a field appearing or disappearing as a change", () => {
    const diff = diffRecords(
      { a: { id: "a" } as Record<string, unknown> },
      { a: { id: "a", extra: true } },
    );
    expect(diff.changed[0].fields).toEqual(["extra"]);
  });

  it("compares nested values structurally, not by reference", () => {
    const withArray = { id: "a", parts: [1, 2, 3] };
    expect(
      hasChanges(
        diffRecords({ a: withArray }, { a: { id: "a", parts: [1, 2, 3] } }),
      ),
    ).toBe(false);
    expect(
      hasChanges(
        diffRecords({ a: withArray }, { a: { id: "a", parts: [1, 2] } }),
      ),
    ).toBe(true);
  });

  it("ignores fields the caller says are noise", () => {
    const diff = diffRecords(
      { a: { id: "a", fetchedAt: "monday" } },
      { a: { id: "a", fetchedAt: "tuesday" } },
      { ignore: ["fetchedAt"] },
    );
    expect(hasChanges(diff)).toBe(false);
  });

  it("keeps keys in sorted order so two runs print the same diff", () => {
    const diff = diffRecords({}, { z: { id: "z" }, a: { id: "a" } });
    expect(diff.added.map((e) => e.key)).toEqual(["a", "z"]);
  });
});

describe("formatDiff", () => {
  it("prints one line per change with a leading sign", () => {
    const text = formatDiff(diffRecords({ a }, { b }), { label: "records" });
    expect(text).toContain("+ b");
    expect(text).toContain("- a");
    expect(text).toContain("1 added, 1 removed, 0 changed");
  });

  it("shows the old and new value of every changed field", () => {
    const text = formatDiff(diffRecords({ a }, { a: { ...a, value: 9 } }), {
      label: "records",
    });
    expect(text).toContain("~ a");
    expect(text).toContain("value: 1 -> 9");
  });

  it("says so when nothing differs", () => {
    expect(formatDiff(diffRecords({ a }, { a }), { label: "record" })).toBe(
      "No change: 1 record(s) identical to what is committed.",
    );
  });

  it("truncates a long value rather than dumping a whole geometry", () => {
    const long = { id: "a", blob: "x".repeat(500) };
    const text = formatDiff(
      diffRecords({ a: { id: "a", blob: "y" } }, { a: long }),
      {
        label: "records",
        maxValueChars: 20,
      },
    );
    expect(text).toMatch(/x{20}\.\.\./);
    expect(text).not.toMatch(/x{40}/);
  });

  it("uses no em dash", () => {
    expect(
      formatDiff(diffRecords({ a }, { b }), { label: "records" }),
    ).not.toContain("—");
  });
});

describe("formatDiff baseline", () => {
  it("names a different baseline when the comparison is not against the repo", () => {
    const diff = diffRecords({ a: { v: 1 } }, { a: { v: 1 } });

    expect(
      formatDiff(diff, { label: "gap", baseline: "the run of 2026-09" }),
    ).toBe("No change: 1 gap(s) identical to the run of 2026-09.");
  });
});
