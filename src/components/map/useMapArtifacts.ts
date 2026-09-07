"use client";

import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";
import type { CityTable, CountryTable, Project } from "@/lib/schema";
import { fetchJson } from "@/lib/fetch-json";

/** Everything the main map fetches from public/data, as one bundle. */
export interface MapArtifacts {
  /** Every country's lot features, merged into one collection. */
  geojson: FeatureCollection;
  /** Country outlines used as click targets. */
  countryOutlines: FeatureCollection;
  cityMarkers: FeatureCollection;
  projects: Project[];
  countryTable: CountryTable | null;
  cityTable: CityTable | null;
}

export interface MapArtifactsState {
  /** The empty collections until the load lands, then everything at once. */
  data: MapArtifacts;
  /** True once a load has succeeded; what the URL restoration waits for. */
  loaded: boolean;
  loading: boolean;
  /** The message of the failure, or null. */
  error: string | null;
  /** Re-runs the whole load. */
  retry: () => void;
}

const EMPTY_COLLECTION: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const EMPTY: MapArtifacts = {
  geojson: EMPTY_COLLECTION,
  countryOutlines: EMPTY_COLLECTION,
  cityMarkers: EMPTY_COLLECTION,
  projects: [],
  countryTable: null,
  cityTable: null,
};

async function loadArtifacts(): Promise<MapArtifacts> {
  // The manifest names the country files, so it has to land first.
  const manifest = await fetchJson<{ countries: string[] }>(
    "/data/geo/manifest.json",
  );
  // Everything below is independent of everything else: awaiting them
  // in turn cost one round trip each for no reason.
  const [collections, idx, outlines, table, cityPoints, cityRefs] =
    await Promise.all([
      Promise.all(
        manifest.countries.map((c) =>
          fetchJson<FeatureCollection>(`/data/geo/${c}.geojson`),
        ),
      ),
      fetchJson<{ projects: Project[] }>("/data/projects.json"),
      fetchJson<FeatureCollection>("/data/geo/countries.geojson"),
      fetchJson<CountryTable>("/data/countries.json"),
      fetchJson<FeatureCollection>("/data/geo/cities.geojson"),
      fetchJson<CityTable>("/data/cities.json"),
    ]);
  return {
    geojson: {
      type: "FeatureCollection",
      features: collections.flatMap((c) => c.features),
    },
    projects: idx.projects,
    countryOutlines: outlines,
    countryTable: table,
    cityMarkers: cityPoints,
    cityTable: cityRefs,
  };
}

/**
 * Loads everything the main map draws, with a real loading and error state.
 *
 * The bundle is one object set in one call, so a consumer never sees this
 * load's projects beside the last load's geometry. The outcome is tagged
 * with the attempt it belongs to, as in useMapData: pressing retry makes
 * the previous outcome stale by construction, so nothing has to reset
 * state during render.
 */
export function useMapArtifacts(): MapArtifactsState {
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<MapArtifacts>(EMPTY);
  const [outcome, setOutcome] = useState<{
    key: number;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadArtifacts()
      .then((bundle) => {
        if (cancelled) return;
        setData(bundle);
        setOutcome({ key: attempt, error: null });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        // Without this the map used to sit on an empty basemap forever:
        // the only trace of a missing artifact was a console line.
        console.error(cause);
        setOutcome({
          key: attempt,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const settled = outcome && outcome.key === attempt ? outcome : null;

  return {
    data,
    loaded: settled !== null && settled.error === null,
    loading: settled === null,
    error: settled?.error ?? null,
    retry: () => setAttempt((n) => n + 1),
  };
}
