import { describe, it, expect } from "vitest";
import {
  sharedTrackByCountry,
  summarizeSharedTrack,
} from "./shared-track";
import type { Project } from "./schema";

function project(
  id: string,
  country: string,
  lots: Array<{
    id: string;
    lengthKm: number;
    sharedWith?: string;
    status?: "opened" | "cancelled";
  }>,
): Project {
  return {
    id,
    country,
    category: "railway",
    name: { en: id },
    description: { en: "" },
    sources: [{ title: "s", url: "https://example.org" }],
    lots: lots.map((l) => ({
      id: l.id,
      name: { en: l.id },
      status: l.status ?? "opened",
      lengthKm: l.lengthKm,
      geometryRef: l.id,
      dates: { opened: "2020" },
      ...(l.sharedWith ? { sharedWith: l.sharedWith } : {}),
    })),
  };
}

const projects: Project[] = [
  project("ro-m1", "ro", [{ id: "a", lengthKm: 10 }]),
  project("ro-m3", "ro", [
    { id: "b", lengthKm: 5 },
    { id: "c", lengthKm: 8.67, sharedWith: "ro-m1" },
  ]),
  project("bg-m4", "bg", [
    { id: "d", lengthKm: 11.5, sharedWith: "bg-m1" },
    { id: "e", lengthKm: 4, sharedWith: "bg-m1", status: "cancelled" },
  ]),
];

describe("summarizeSharedTrack", () => {
  it("counts only lots whose track belongs to another project", () => {
    const total = summarizeSharedTrack(projects);
    expect(total.lots).toBe(2);
    expect(total.km).toBeCloseTo(20.17, 6);
  });

  it("returns zeroes when nothing is shared", () => {
    expect(summarizeSharedTrack([projects[0]])).toEqual({ lots: 0, km: 0 });
    expect(summarizeSharedTrack([])).toEqual({ lots: 0, km: 0 });
  });

  it("ignores cancelled track, as the network totals do", () => {
    // The 4 km cancelled section is not in any total, so explaining it away
    // in a footnote would describe a difference that isn't there.
    expect(summarizeSharedTrack([projects[2]])).toEqual({
      lots: 1,
      km: 11.5,
    });
  });
});

describe("sharedTrackByCountry", () => {
  it("groups by the country of the borrowing project", () => {
    expect(sharedTrackByCountry(projects)).toEqual({
      ro: { lots: 1, km: 8.67 },
      bg: { lots: 1, km: 11.5 },
    });
  });

  it("omits countries with no shared track", () => {
    expect(sharedTrackByCountry([projects[0]])).toEqual({});
  });
});
