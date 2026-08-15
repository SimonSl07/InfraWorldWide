import { describe, it, expect } from "vitest";
import {
  dataEndpoints,
  odblEndpoints,
  parseBuildStamp,
} from "./data-endpoints";

const samples = { country: "ro", city: "ro-bucharest", project: "ro-a1" };

describe("dataEndpoints", () => {
  it("describes every artifact the build publishes", () => {
    expect(dataEndpoints(samples).map((e) => e.path)).toEqual([
      "/data/projects.json",
      "/data/countries.json",
      "/data/cities.json",
      "/data/contractors.json",
      "/data/deflators.json",
      "/data/deflators-construction.json",
      "/data/fx.json",
      "/data/geo/manifest.json",
      "/data/geo/countries.geojson",
      "/data/geo/cities.geojson",
      "/data/geo/{country}.geojson",
      "/data/geo/cities/{city}.geojson",
      "/data/geo/projects/{project}.geojson",
    ]);
  });

  it("fills a templated path from a real id, so the link resolves", () => {
    const byPath = new Map(dataEndpoints(samples).map((e) => [e.path, e]));
    expect(byPath.get("/data/geo/{country}.geojson")!.example).toBe(
      "/data/geo/ro.geojson",
    );
    expect(byPath.get("/data/geo/projects/{project}.geojson")!.example).toBe(
      "/data/geo/projects/ro-a1.geojson",
    );
  });

  it("leaves a fixed path as its own example", () => {
    const projects = dataEndpoints(samples)[0];
    expect(projects.example).toBe("/data/projects.json");
  });

  it("offers no example when the dataset has nothing to point at", () => {
    // An empty dataset must not produce a link to "/data/geo/{country}.geojson".
    const byPath = new Map(dataEndpoints({}).map((e) => [e.path, e]));
    expect(byPath.get("/data/geo/{country}.geojson")!.example).toBeNull();
    expect(byPath.get("/data/projects.json")!.example).toBe(
      "/data/projects.json",
    );
  });

  it("names the published schema only where one exists", () => {
    const byPath = new Map(dataEndpoints(samples).map((e) => [e.path, e]));
    expect(byPath.get("/data/projects.json")!.schema).toBe(
      "project.schema.json",
    );
    // No schema is emitted for the contractor registry yet.
    expect(byPath.get("/data/contractors.json")!.schema).toBeUndefined();
  });
});

describe("odblEndpoints", () => {
  it("marks the OpenStreetMap-derived geometry and nothing else", () => {
    // The licence obligation rides on the route geometry. Country outlines
    // are Natural Earth (public domain) and the tables are compiled figures.
    expect(odblEndpoints(dataEndpoints(samples)).map((e) => e.path)).toEqual([
      "/data/geo/{country}.geojson",
      "/data/geo/cities/{city}.geojson",
      "/data/geo/projects/{project}.geojson",
    ]);
  });
});

describe("parseBuildStamp", () => {
  it("reads the generated timestamp and the commit", () => {
    expect(
      parseBuildStamp({ generated: "2026-08-13T23:40:19.603Z", commit: "a6965a6" }),
    ).toEqual({ generated: "2026-08-13T23:40:19.603Z", commit: "a6965a6" });
  });

  it("refuses anything that is not a stamped artifact", () => {
    // A page that printed "undefined" as the build date would be worse than
    // one that omits the line.
    expect(parseBuildStamp(null)).toBeNull();
    expect(parseBuildStamp({})).toBeNull();
    expect(parseBuildStamp({ generated: "2026-08-13T23:40:19.603Z" })).toBeNull();
    expect(parseBuildStamp({ generated: 1, commit: "a" })).toBeNull();
  });
});
