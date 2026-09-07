// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Feature } from "geojson";
import { cityMarkerProperties, lotFeatureProperties } from "@/lib/map-features";
import type { City, Lot, Project } from "@/lib/schema";
import type { MapArtifacts } from "./useMapArtifacts";
import { useMapSelection, type SelectionParams } from "./useMapSelection";

/**
 * The part of a shared link that cannot be read until the data is here.
 *
 * What is worth pinning is the set of rules, not React: a lot reference
 * resolves only when it names one lot, a city or country that is not in the
 * data is dropped rather than left dimming the map with no panel to close,
 * the lot wins when a link carries more than one, and the restoration runs
 * once, so a later load never undoes what the reader clicked since.
 */

function lot(id: string): Lot {
  return {
    id,
    name: { en: id },
    status: "opened",
    dates: { opened: "2020" },
    lengthKm: 10,
    geometryRef: id,
  };
}

function project(id: string, country: string, lots: Lot[]): Project {
  return {
    id,
    country,
    category: "bridge",
    name: { en: id },
    description: { en: "" },
    lots,
    sources: [{ title: "S", url: "https://example.org" }],
  };
}

// Two Danube crossings each own a lot called "main-bridge", so the bare id
// names both of them; only the qualified "ro-a1.sebes-turda" form is unique.
const a1 = project("ro-a1", "ro", [lot("sebes-turda"), lot("main-bridge")]);
const danube = project("bg-danube", "bg", [lot("main-bridge")]);
const PROJECTS = [a1, danube];

const bucharest: City = {
  country: "ro",
  name: { en: "Bucharest" },
  population: 1716961,
  populationDate: "2021-12",
  center: [26.1, 44.43],
  sources: [{ title: "S", url: "https://example.org" }],
};

function feature(p: Project, l: Lot): Feature {
  return {
    type: "Feature",
    properties: lotFeatureProperties(p, l),
    geometry: {
      type: "LineString",
      coordinates: [
        [25, 45],
        [26, 46],
      ],
    },
  };
}

/** A fresh bundle each call, as a retry produces: no identity is shared. */
function artifacts(loaded = true): { data: MapArtifacts; loaded: boolean } {
  return {
    loaded,
    data: {
      geojson: {
        type: "FeatureCollection",
        features: PROJECTS.flatMap((p) => p.lots.map((l) => feature(p, l))),
      },
      // Only Romania has an outline, so ?c=bg names a country the map
      // cannot show.
      countryOutlines: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { country: "ro", bbox: [20, 43, 30, 48] },
            geometry: { type: "Point", coordinates: [25, 45.5] },
          },
        ],
      },
      cityMarkers: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: cityMarkerProperties(
              "ro-bucharest",
              bucharest,
              [],
              null,
            ),
            geometry: { type: "Point", coordinates: bucharest.center },
          },
        ],
      },
      projects: PROJECTS,
      countryTable: null,
      cityTable: { note: "test", cities: { "ro-bucharest": bucharest } },
    },
  };
}

const MONTHS = { month: 2026 * 12, nowMonth: 2026 * 12 };

function props(params: Partial<SelectionParams>, state = artifacts()) {
  return {
    params: { sel: null, city: null, c: null, ...params },
    artifacts: state,
  };
}

function renderSelection(
  params: Partial<SelectionParams>,
  state = artifacts(),
) {
  return renderHook(
    (p: ReturnType<typeof props>) =>
      useMapSelection(p.params, p.artifacts, MONTHS),
    { initialProps: props(params, state) },
  );
}

describe("useMapSelection", () => {
  it("restores a qualified ?sel= once the data is here", () => {
    const { result } = renderSelection({ sel: "ro-a1.sebes-turda" });
    expect(result.current.selected?.lotId).toBe("sebes-turda");
    expect(result.current.selectedProject?.id).toBe("ro-a1");
    expect(result.current.selectedLot?.id).toBe("sebes-turda");
  });

  it("waits for the load, then reads the link", () => {
    const { result, rerender } = renderSelection(
      { sel: "ro-a1.sebes-turda" },
      artifacts(false),
    );
    expect(result.current.selected).toBeNull();
    rerender(props({ sel: "ro-a1.sebes-turda" }));
    expect(result.current.selected?.lotId).toBe("sebes-turda");
  });

  it("selects nothing for a bare id that two projects share", () => {
    // Silently taking the first would open the wrong bridge's panel.
    const { result } = renderSelection({ sel: "main-bridge" });
    expect(result.current.selected).toBeNull();
    expect(result.current.selectedProject).toBeUndefined();
  });

  it("restores a known ?city= and drops an unknown one", () => {
    const known = renderSelection({ city: "ro-bucharest" });
    expect(known.result.current.selectedCity).toBe("ro-bucharest");
    expect(known.result.current.selectedCityRef?.name.en).toBe("Bucharest");
    expect(known.result.current.selectedCityMarker?.name).toBe("Bucharest");

    const unknown = renderSelection({ city: "ro-cluj" });
    expect(unknown.result.current.selectedCity).toBeNull();
    expect(unknown.result.current.selectedCityRef).toBeNull();
  });

  it("keeps a ?c= country that has an outline and drops one that does not", () => {
    expect(renderSelection({ c: "ro" }).result.current.selectedCountry).toBe(
      "ro",
    );
    // With no outline there is no panel, so there would be no × to press
    // while every lot stayed dimmed against a country that isn't there.
    expect(
      renderSelection({ c: "bg" }).result.current.selectedCountry,
    ).toBeNull();
  });

  it("dims the ?c= country from the first frame, then checks it against the data", () => {
    const { result, rerender } = renderSelection({ c: "bg" }, artifacts(false));
    expect(result.current.selectedCountry).toBe("bg");
    rerender(props({ c: "bg" }));
    expect(result.current.selectedCountry).toBeNull();
  });

  it("lets the lot win when a link carries ?sel= beside ?c= or ?city=", () => {
    // The panels share a corner, so the link must not open two of them.
    const { result } = renderSelection({
      sel: "ro-a1.sebes-turda",
      c: "ro",
      city: "ro-bucharest",
    });
    expect(result.current.selected?.lotId).toBe("sebes-turda");
    expect(result.current.selectedCountry).toBeNull();
    expect(result.current.selectedCity).toBeNull();
  });

  it("restores once, so a reload of the data never undoes a later click", () => {
    const { result, rerender } = renderSelection({ sel: "ro-a1.sebes-turda" });
    const bridge = lotFeatureProperties(danube, danube.lots[0]);
    act(() => result.current.handleSelectLot(bridge));
    expect(result.current.selected?.projectId).toBe("bg-danube");

    // A fresh bundle with loaded still true, as pressing retry produces.
    rerender(props({ sel: "ro-a1.sebes-turda" }));
    expect(result.current.selected?.projectId).toBe("bg-danube");
    expect(result.current.selectedProject?.id).toBe("bg-danube");
  });

  it("holds one selection at a time", () => {
    const { result } = renderSelection({});
    act(() =>
      result.current.handleSelectLot(lotFeatureProperties(a1, a1.lots[0])),
    );
    act(() => result.current.handleSelectCountry("ro"));
    expect(result.current.selected).toBeNull();
    expect(result.current.selectedCountry).toBe("ro");

    act(() => result.current.handleSelectCity("ro-bucharest"));
    expect(result.current.selectedCountry).toBeNull();
    expect(result.current.selectedCity).toBe("ro-bucharest");

    // Closing a panel clears only its own selection.
    act(() => result.current.setSelectedCity(null));
    expect(result.current.selectedCity).toBeNull();
    expect(result.current.selectedCityRef).toBeNull();
  });
});
