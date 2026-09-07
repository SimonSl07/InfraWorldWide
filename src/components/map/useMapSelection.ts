"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import type { CityTable } from "@/lib/schema";
import {
  parseCityParam,
  parseCountryParam,
  parseLotRef,
  resolveLotRef,
  type LotRef,
} from "@/lib/map-filters";
import type { LotEntry } from "@/lib/lot-list";
import type { CityMarkerProperties } from "@/lib/map-features";
import { rankCountries, findCountry } from "@/lib/country-stats";
import { openedKmByDecade } from "@/lib/country-growth";
import type { MapArtifactsState } from "./useMapArtifacts";

/** The query parameters that name a selection, as the URL carries them. */
export interface SelectionParams {
  /** ?sel=, a lot reference: "project.lot", or a legacy bare lot id. */
  sel: string | null;
  /** ?city=, a city key. */
  city: string | null;
  /** ?c=, a country code. */
  c: string | null;
}

/**
 * What a shared link selects once the data it names has loaded: the lot in
 * ?sel=, else the city in ?city=. Decided as one because the panels share
 * a corner: a link carrying both must not open both, and the lot wins, as
 * it does in the URL.
 */
function restoredSelection(
  geojson: FeatureCollection,
  cityTable: CityTable | null,
  selRef: LotRef | null,
  cityParam: string | null,
): { lot: LotEntry | null; city: string | null } {
  const candidates = geojson.features
    .map((f) => f.properties as unknown as LotEntry | null)
    .filter((p): p is LotEntry => !!p?.lotId && p.marker !== true);
  // Lot ids repeat across projects: three Danube crossings each own a
  // lot called "main-bridge". An unqualified id that names more than
  // one of them selects none, rather than silently the first.
  const lot = resolveLotRef(candidates, selRef);
  if (lot) return { lot, city: null };
  return {
    lot: null,
    city: parseCityParam(cityParam, Object.keys(cityTable?.cities ?? {})),
  };
}

/**
 * The map's selection: one lot, one country or one city, never two at once,
 * because all three panels occupy the same corner. Each is returned together
 * with what its panel needs, resolved against the loaded data.
 *
 * Also owns the part of a shared link that cannot be read until the data is
 * here. The parameters are captured at mount: MapExplorer's URL-sync effect
 * rewrites the query string before the async load finishes, which would
 * otherwise drop them.
 */
export function useMapSelection(
  params: SelectionParams,
  artifacts: Pick<MapArtifactsState, "data" | "loaded">,
  /** The viewed month and the present, which the country figures follow. */
  { month, nowMonth }: { month: number; nowMonth: number },
) {
  const {
    geojson,
    countryOutlines,
    cityMarkers,
    projects,
    countryTable,
    cityTable,
  } = artifacts.data;

  const [selected, setSelected] = useState<LotEntry | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(() =>
    parseCountryParam(params.c),
  );
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [initialSelRef] = useState(() => parseLotRef(params.sel));
  const [initialCity] = useState(() => params.city);

  // Once, after the first successful load: the retry button only exists
  // while a load has failed, and re-running this on a later load would undo
  // whatever the reader had selected since. Nothing is clickable before the
  // data lands, so setting a null here is setting what is already there.
  const restored = useRef(false);
  useEffect(() => {
    if (!artifacts.loaded || restored.current) return;
    restored.current = true;
    const { lot, city } = restoredSelection(
      geojson,
      cityTable,
      initialSelRef,
      initialCity,
    );
    setSelected(lot);
    setSelectedCity(city);
    // A ?c= code that is not in the data has nothing to select: the panel
    // would never mount, so there would be no × to press, while every lot
    // on the map stayed dimmed against a country that isn't there. Drop it
    // now that we know which countries actually exist; the lot wins over a
    // known one, as above.
    setSelectedCountry((current) =>
      current &&
      !lot &&
      countryOutlines.features.some((f) => f.properties?.country === current)
        ? current
        : null,
    );
  }, [
    artifacts.loaded,
    geojson,
    countryOutlines,
    cityTable,
    initialSelRef,
    initialCity,
  ]);

  // One selection at a time — all three panels occupy the same corner.
  const handleSelectLot = useCallback((props: LotEntry | null) => {
    setSelected(props);
    if (props) {
      setSelectedCountry(null);
      setSelectedCity(null);
    }
  }, []);

  const handleSelectCountry = useCallback((code: string | null) => {
    setSelectedCountry(code);
    if (code) {
      setSelected(null);
      setSelectedCity(null);
    }
  }, []);

  const handleSelectCity = useCallback((key: string | null) => {
    setSelectedCity(key);
    if (key) {
      setSelected(null);
      setSelectedCountry(null);
    }
  }, []);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selected?.projectId),
    [projects, selected],
  );
  const selectedLot = useMemo(
    () => selectedProject?.lots.find((l) => l.id === selected?.lotId),
    [selectedProject, selected],
  );

  // Recomputed as the timeline moves: the panel reports the map's state in
  // the viewed month, ranks included.
  const ranked = useMemo(
    () =>
      countryTable
        ? rankCountries(projects, countryTable.countries, month, nowMonth)
        : [],
    [projects, countryTable, month, nowMonth],
  );
  const selectedCountryStats = useMemo(
    () => (selectedCountry ? findCountry(ranked, selectedCountry) : null),
    [ranked, selectedCountry],
  );
  // Growth is history, not a function of the viewed month, so it is keyed
  // only on the country.
  const selectedCountryGrowth = useMemo(
    () => (selectedCountry ? openedKmByDecade(projects, selectedCountry) : []),
    [projects, selectedCountry],
  );

  const selectedCityRef = useMemo(
    () => (selectedCity ? (cityTable?.cities[selectedCity] ?? null) : null),
    [cityTable, selectedCity],
  );
  const selectedCityMarker = useMemo(() => {
    const feature = cityMarkers.features.find(
      (f) => f.properties?.city === selectedCity,
    );
    return (feature?.properties as unknown as CityMarkerProperties) ?? null;
  }, [cityMarkers, selectedCity]);

  return {
    selected,
    selectedCountry,
    selectedCity,
    selectedProject,
    selectedLot,
    selectedCountryStats,
    selectedCountryGrowth,
    selectedCityRef,
    selectedCityMarker,
    handleSelectLot,
    handleSelectCountry,
    handleSelectCity,
    // Plain setters, for the panels' close buttons: clearing one selection
    // never has to touch the other two, which are already null.
    setSelected,
    setSelectedCountry,
    setSelectedCity,
  };
}
