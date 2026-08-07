import { describe, it, expect } from "vitest";
import {
  projectSchema,
  lotSchema,
  dateYear,
  projectGeoPath,
} from "./schema";

const validProject = {
  id: "ro-a1",
  country: "ro",
  category: "highway",
  name: { en: "A1" },
  description: { en: "desc" },
  lots: [
    {
      id: "lot-1",
      name: { en: "Lot 1" },
      status: "opened",
      dates: { opened: "2012-07-19" },
      lengthKm: 62,
      geometryRef: "lot-1",
    },
  ],
  sources: [{ title: "Wikipedia", url: "https://en.wikipedia.org/wiki/A1" }],
};

describe("projectSchema", () => {
  it("accepts a valid project", () => {
    expect(projectSchema.safeParse(validProject).success).toBe(true);
  });

  it("rejects a project id that does not start with the country code shape", () => {
    const bad = { ...validProject, id: "A1" };
    expect(projectSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a project without sources", () => {
    const bad = { ...validProject, sources: [] };
    expect(projectSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a lot without geometryRef", () => {
    const bad = {
      ...validProject,
      lots: [{ ...validProject.lots[0], geometryRef: "" }],
    };
    expect(projectSchema.safeParse(bad).success).toBe(false);
  });
});

describe("lotSchema date rules", () => {
  it("requires dates.opened when status is opened", () => {
    const lot = {
      id: "x",
      name: { en: "X" },
      status: "opened",
      lengthKm: 10,
      geometryRef: "x",
    };
    expect(lotSchema.safeParse(lot).success).toBe(false);
  });

  it("allows missing dates for planned lots", () => {
    const lot = {
      id: "x",
      name: { en: "X" },
      status: "planned",
      lengthKm: 10,
      geometryRef: "x",
    };
    expect(lotSchema.safeParse(lot).success).toBe(true);
  });

  it("accepts year-only and year-month dates, rejects garbage", () => {
    const base = {
      id: "x",
      name: { en: "X" },
      status: "under_construction",
      lengthKm: 10,
      geometryRef: "x",
    };
    expect(
      lotSchema.safeParse({ ...base, dates: { constructionStart: "2022" } })
        .success,
    ).toBe(true);
    expect(
      lotSchema.safeParse({ ...base, dates: { constructionStart: "2022-03" } })
        .success,
    ).toBe(true);
    expect(
      lotSchema.safeParse({ ...base, dates: { constructionStart: "March 2022" } })
        .success,
    ).toBe(false);
  });
});

describe("helpers", () => {
  it("dateYear extracts the year from all supported formats", () => {
    expect(dateYear("2012")).toBe(2012);
    expect(dateYear("2012-06")).toBe(2012);
    expect(dateYear("2012-06-15")).toBe(2012);
  });

  it("projectGeoPath maps project id to its geojson path", () => {
    const p = projectSchema.parse(validProject);
    expect(projectGeoPath(p)).toBe("data/geo/ro/a1.geojson");
  });
});
