// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import type { Feature, FeatureCollection } from "geojson";
import {
  createPropertyExpression,
  latest,
} from "@maplibre/maplibre-gl-style-spec";
import {
  buildMonthFilters,
  fullSelection,
  toMonthIndex,
} from "@/lib/map-filters";

/**
 * What is worth pinning here is the wiring, not MapLibre: the slider bounds
 * come from the fetched artifact rather than a hardcoded decade, the map
 * opens at the present month, and every layer gets the filters for whatever
 * month the slider is on. jsdom has no WebGL, so the frame and the map
 * primitives are stand-ins that record what they were handed.
 */

const scene = vi.hoisted(() => ({
  /** What the mocked frame hands to the render prop. */
  data: null as unknown,
  /** The props the frame was mounted with. */
  props: {} as Record<string, unknown>,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock("./StaticGeoMap", () => ({
  default: (props: Record<string, unknown>) => {
    scene.props = props;
    const children = props.children as (data: unknown) => ReactNode;
    return <div data-testid="frame">{children(scene.data)}</div>;
  },
}));

vi.mock("react-map-gl/maplibre", () => ({
  Source: ({ children }: { children?: ReactNode }) => (
    <div data-testid="source">{children}</div>
  ),
  Layer: (props: {
    id: string;
    type: string;
    filter?: unknown;
    paint?: unknown;
  }) => (
    <div
      data-testid="layer"
      data-layer-id={props.id}
      data-layer-type={props.type}
      data-filter={JSON.stringify(props.filter ?? null)}
      data-paint={JSON.stringify(props.paint ?? null)}
    />
  ),
}));

const { default: TimeTravelMap } = await import("./TimeTravelMap");

/* ── Fixture ──────────────────────────────────────────────────────────── */

const NOW = toMonthIndex(2026, 8);

function lot(props: Record<string, unknown>): Feature {
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [
        [23.3, 42.7],
        [23.4, 42.7],
      ],
    },
    properties: {
      lotId: "lot",
      projectId: "bg-sofia-metro-m1",
      category: "railway",
      status: "opened",
      openedMonth: null,
      constructionStartMonth: null,
      expectedOpeningMonth: null,
      ...props,
    },
  };
}

/** Earliest date is January 1960; latest projection is December 2031. */
const FEATURES = [
  lot({ lotId: "old", openedMonth: toMonthIndex(1960, 1) }),
  lot({ lotId: "recent", openedMonth: toMonthIndex(2009, 5) }),
  lot({
    lotId: "building",
    status: "under_construction",
    constructionStartMonth: toMonthIndex(2024, 1),
    expectedOpeningMonth: toMonthIndex(2031, 12),
  }),
  lot({ lotId: "planned", status: "planned" }),
  lot({
    lotId: "bridge",
    category: "bridge",
    marker: true,
    openedMonth: toMonthIndex(2000, 1),
  }),
];

function collection(features: Feature[] = FEATURES): FeatureCollection {
  return { type: "FeatureCollection", features };
}

function mount(overrides: Record<string, unknown> = {}) {
  return render(
    <TimeTravelMap
      url="/data/geo/cities/bg-sofia.geojson"
      locale="en"
      fallback={{ longitude: 23.32, latitude: 42.7, zoom: 11 }}
      {...overrides}
    />,
  );
}

/* ── Readers ──────────────────────────────────────────────────────────── */

const layers = () => screen.queryAllByTestId("layer");

function layer(id: string): HTMLElement | undefined {
  return layers().find((l) => l.getAttribute("data-layer-id") === id);
}

function filterOf(id: string): unknown {
  return JSON.parse(layer(id)?.getAttribute("data-filter") ?? "null");
}

const monthInput = () => screen.getByLabelText("month") as HTMLInputElement;

/** The filters the component should be handing out for a given month. */
const expected = (month: number) =>
  buildMonthFilters(month, fullSelection(), NOW);

beforeEach(() => {
  scene.data = collection();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 14));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TimeTravelMap", () => {
  it("opens at the present month", () => {
    mount();
    expect(monthInput().value).toBe(String(NOW));
  });

  it("takes the slider bounds from the data, not from fixed years", () => {
    mount();
    const input = monthInput();
    // Earliest date is 1960-01, so the slider starts five years before it.
    expect(input.min).toBe(String(toMonthIndex(1955, 1)));
    // The 2031-12 projection is further out than the five-year default.
    expect(input.max).toBe(String(toMonthIndex(2031, 12)));
  });

  it("moves the bounds with the artifact it is given", () => {
    // A city whose whole network is recent must not open on a 1955 slider.
    scene.data = collection([lot({ openedMonth: toMonthIndex(2015, 6) })]);
    mount();
    expect(monthInput().min).toBe(String(toMonthIndex(1970, 1)));
    expect(monthInput().max).toBe(String(NOW + 5 * 12));
  });

  it("draws the casing, the opened lines and the building ones", () => {
    mount();
    expect(filterOf("timetravel-casing")).toEqual(expected(NOW).opened);
    expect(filterOf("timetravel-opened")).toEqual(expected(NOW).opened);
    expect(filterOf("timetravel-under-construction")).toEqual(
      expected(NOW).underConstruction,
    );
  });

  it("hands the layers the filters for whatever month the slider is on", () => {
    mount();
    const past = toMonthIndex(1999, 3);
    fireEvent.change(monthInput(), { target: { value: String(past) } });

    expect(monthInput().value).toBe(String(past));
    expect(filterOf("timetravel-opened")).toEqual(expected(past).opened);
    expect(filterOf("timetravel-under-construction")).toEqual(
      expected(past).underConstruction,
    );
  });

  it("keeps the not-yet-started lines out of the past", () => {
    mount();
    expect(layer("timetravel-future")).toBeDefined();

    fireEvent.change(monthInput(), {
      target: { value: String(toMonthIndex(1999, 3)) },
    });
    expect(layer("timetravel-future")).toBeUndefined();
    expect(layer("timetravel-points-future")).toBeUndefined();
  });

  it("restricts the circle layers to the midpoint markers", () => {
    mount();
    expect(filterOf("timetravel-points-opened")).toEqual([
      "all",
      expected(NOW).opened,
      ["==", ["get", "marker"], true],
    ]);
    expect(filterOf("timetravel-points-under-construction")).toEqual([
      "all",
      expected(NOW).underConstruction,
      ["==", ["get", "marker"], true],
    ]);
  });

  it("owns the playback state the slider only reports", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mount();
    await user.click(screen.getByRole("button", { name: "play" }));
    expect(screen.getByRole("button", { name: "pause" })).toBeInTheDocument();
  });

  it("passes the frame the url and the documented defaults", () => {
    mount();
    expect(scene.props.url).toBe("/data/geo/cities/bg-sofia.geojson");
    expect(scene.props.heightClass).toBe("h-96");
    expect(scene.props.padding).toBe(40);
    expect(scene.props.scrollZoom).toBe(false);
    expect(scene.props.fallback).toEqual({
      longitude: 23.32,
      latitude: 42.7,
      zoom: 11,
    });
  });

  it("lets the caller override the frame", () => {
    mount({ heightClass: "h-[32rem]", padding: 24, scrollZoom: true });
    expect(scene.props.heightClass).toBe("h-[32rem]");
    expect(scene.props.padding).toBe(24);
    expect(scene.props.scrollZoom).toBe(true);
  });

  it("keeps the legend out unless it is asked for", () => {
    mount();
    expect(screen.queryByText("map.legendCategory")).toBeNull();
    mount({ showLegend: true });
    expect(screen.getAllByText("map.legendCategory").length).toBe(1);
  });

  it("lists only the categories the artifact actually contains", () => {
    mount({ showLegend: true });
    expect(screen.getByText("category.railway")).toBeInTheDocument();
    expect(screen.getByText("category.bridge")).toBeInTheDocument();
    expect(screen.queryByText("category.tunnel")).toBeNull();
  });
});

/* ── Paint expressions ────────────────────────────────────────────────── */

type PropertySpec = Parameters<typeof createPropertyExpression>[1];

/**
 * MapLibre drops a layer whose paint is malformed without an error, and the
 * rule it enforces silently is that a zoom "interpolate" must be outermost
 * and appear once. These expressions are built in this component rather than
 * in map-style.ts, so this is the only place that check can happen.
 */
function validate(expression: unknown, property: string, layer: string) {
  const spec = (
    latest as unknown as Record<string, Record<string, PropertySpec>>
  )[layer][property];
  if (!spec) return `no spec for ${layer}.${property}`;
  const result = createPropertyExpression(expression as never, spec);
  return result.result === "success"
    ? null
    : result.value.map((e) => e.message).join("; ");
}

describe("TimeTravelMap paint", () => {
  it("validates every paint property against the style spec", () => {
    mount();
    const problems: string[] = [];
    for (const element of layers()) {
      const id = element.getAttribute("data-layer-id");
      const type = element.getAttribute("data-layer-type");
      const paint = JSON.parse(element.getAttribute("data-paint") ?? "null") as
        | Record<string, unknown>
        | null;
      if (!paint) continue;
      for (const [property, value] of Object.entries(paint)) {
        const message = validate(value, property, `paint_${type}`);
        if (message) problems.push(`${id}.${property}: ${message}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("keeps the zoom interpolation outermost in every width ramp", () => {
    mount();
    for (const element of layers()) {
      const paint = JSON.parse(element.getAttribute("data-paint") ?? "null") as
        | Record<string, unknown>
        | null;
      for (const value of Object.values(paint ?? {})) {
        const encoded = JSON.stringify(value);
        if (!encoded.includes('"interpolate"')) continue;
        // Exactly one, and it opens the expression.
        expect(encoded.split('"interpolate"').length - 1).toBe(1);
        expect(encoded.startsWith('["interpolate"')).toBe(true);
      }
    }
  });
});
