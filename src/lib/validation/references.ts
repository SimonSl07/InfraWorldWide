/**
 * The reference tables (deflators, fx, contractors, countries, cities,
 * corridors, programmes, operators) and the pointers between projects, each
 * checked against the projects that use them so neither side drifts alone.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { contractorSlug } from "../contractors";
import {
  countryGeoPath,
  type CityTable,
  type ContractorRegistry,
  type CorridorTable,
  type CountryTable,
  type DeflatorTable,
  type FxTable,
  type OperatorTable,
  type ProgrammeTable,
  type Project,
} from "../schema";
import type { GeometryReport } from "./geometry";
import { moneyOf } from "./money";

/** Parses and schema-checks a single reference file, collecting errors. */
export function readReferenceFile<T>(
  root: string,
  rel: string,
  schema: z.ZodType<T>,
  errors: string[],
): T | null {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    errors.push(`${rel}: missing`);
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    errors.push(`${rel}: invalid JSON: ${(e as Error).message}`);
    return null;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${rel}: ${issue.path.join(".")}: ${issue.message}`);
    }
    return null;
  }
  return parsed.data;
}

export function checkDeflators(table: DeflatorTable, rel: string, errors: string[]) {
  for (const [currency, series] of Object.entries(table.series)) {
    if (Object.keys(series.index).length === 0) {
      errors.push(`${rel}: series "${currency}" has no index values`);
    }
  }
}

/**
 * A name or alias may only ever point at one firm — otherwise resolution
 * depends on registry order and rankings silently merge unrelated companies.
 */
export function checkContractors(
  registry: ContractorRegistry,
  rel: string,
  errors: string[],
) {
  const ids = new Set<string>();
  const claimed = new Map<string, string>();

  for (const entry of registry.contractors) {
    if (ids.has(entry.id)) {
      errors.push(`${rel}: duplicate contractor id "${entry.id}"`);
    }
    ids.add(entry.id);

    if (entry.members?.includes(entry.id)) {
      errors.push(`${rel}: joint venture "${entry.id}" lists itself as a member`);
    }

    for (const key of [entry.name, ...(entry.aliases ?? [])]) {
      const slug = contractorSlug(key);
      const owner = claimed.get(slug);
      if (owner !== undefined && owner !== entry.id) {
        errors.push(
          `${rel}: "${key}" is claimed by both "${owner}" and "${entry.id}"`,
        );
      }
      claimed.set(slug, entry.id);
    }
  }
}

/**
 * Countries must line up in three places: the projects, the reference table
 * and the outline polygons. A country with projects but no outline is
 * unclickable on the map; one with an outline but no reference row renders a
 * panel with blank densities. Both directions are checked so neither can
 * drift silently when a country is added.
 */
export function checkCountries(
  table: CountryTable | null,
  projects: Project[],
  root: string,
  errors: string[],
) {
  const used = [...new Set(projects.map((p) => p.country))].sort();

  for (const country of used) {
    if (table && !table.countries[country]) {
      errors.push(
        `data/countries.json: no entry for "${country}", which has projects`,
      );
    }
    const rel = countryGeoPath(country);
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) {
      errors.push(
        `${rel}: missing outline for "${country}"; run scripts/fetch-country-outlines.ts`,
      );
      continue;
    }
    let geo: { features?: Array<{ geometry?: { type?: string } | null }> };
    try {
      geo = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      errors.push(`${rel}: invalid GeoJSON: ${(e as Error).message}`);
      continue;
    }
    const polygons = (geo.features ?? []).filter(
      (f) =>
        f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon",
    );
    if (polygons.length === 0) {
      errors.push(`${rel}: no Polygon/MultiPolygon feature`);
    }
  }

  for (const country of Object.keys(table?.countries ?? {})) {
    if (!used.includes(country)) {
      errors.push(
        `data/countries.json: entry "${country}" has no projects; remove it or add its projects`,
      );
    }
  }
}

/**
 * Cities must line up with the projects placed in them, in both directions.
 * A project pointing at a city that does not exist would vanish from the
 * main map without appearing anywhere else; a city with no projects renders
 * an empty page. Both are silent failures, so both are errors here.
 */
export function checkCities(
  table: CityTable | null,
  projects: Project[],
  errors: string[],
) {
  const used = [
    ...new Set(
      projects.map((p) => p.city).filter((c): c is string => c !== undefined),
    ),
  ].sort();

  for (const key of used) {
    const city = table?.cities[key];
    if (table && !city) {
      errors.push(
        `data/cities.json: no entry for "${key}", which has projects`,
      );
      continue;
    }
    // The city's country has to agree with the projects placed in it, or
    // the city page would list roads from somewhere else.
    for (const project of projects.filter((p) => p.city === key)) {
      if (city && project.country !== city.country) {
        errors.push(
          `${project.id}: city "${key}" is in "${city.country}" but the project is in "${project.country}"`,
        );
      }
    }
  }

  for (const key of Object.keys(table?.cities ?? {})) {
    if (!used.includes(key)) {
      errors.push(
        `data/cities.json: entry "${key}" has no projects; remove it or add its projects`,
      );
    }
  }
}

/**
 * A lot's `sharedWith` must name a real project that could actually own the
 * track. A dangling or self-referential pointer would silently subtract the
 * lot from every network total while nothing else counted it, which reads as
 * a shorter network rather than as an error.
 */
export function checkSharedTrack(projects: Project[], errors: string[]) {
  const byId = new Map(projects.map((p) => [p.id, p]));

  for (const project of projects) {
    for (const lot of project.lots) {
      const target = lot.sharedWith;
      if (target === undefined) continue;

      if (target === project.id) {
        errors.push(
          `${project.id}: lot "${lot.id}" is sharedWith its own project`,
        );
        continue;
      }
      const owner = byId.get(target);
      if (!owner) {
        errors.push(
          `${project.id}: lot "${lot.id}" is sharedWith "${target}", which does not exist`,
        );
        continue;
      }
      // Track cannot be shared across a border, and a shared city lot whose
      // owner sits on the main map would vanish from both views.
      if (owner.country !== project.country) {
        errors.push(
          `${project.id}: lot "${lot.id}" is sharedWith "${target}" in a different country`,
        );
      }
      if (owner.city !== project.city) {
        errors.push(
          `${project.id}: lot "${lot.id}" is sharedWith "${target}", which is in a different city`,
        );
      }
    }
  }
}

/**
 * The three key-based reference tables, checked in both directions exactly
 * as cities are. A key that resolves to nothing means a project silently
 * drops out of the corridor or programme view it was meant to appear in; a
 * table entry nothing uses is a claim the data does not back. Both are
 * silent failures, so both are errors.
 */
export function checkReferenceKeys(
  corridors: CorridorTable | null,
  programmes: ProgrammeTable | null,
  operators: OperatorTable | null,
  projects: Project[],
): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const usedCorridors = new Set<string>();
  const usedProgrammes = new Set<string>();
  const usedOperators = new Set<string>();

  for (const project of projects) {
    for (const key of project.corridors ?? []) {
      usedCorridors.add(key);
      if (corridors && !corridors.corridors[key]) {
        errors.push(
          `${project.id}: corridor "${key}" is not in data/corridors.json`,
        );
      }
    }
    if (project.operator) {
      usedOperators.add(project.operator);
      if (operators && !operators.operators[project.operator]) {
        errors.push(
          `${project.id}: operator "${project.operator}" is not in data/operators.json`,
        );
      }
    }
    for (const lot of project.lots) {
      for (const funding of lot.funding ?? []) {
        if (!funding.programme) continue;
        usedProgrammes.add(funding.programme);
        if (programmes && !programmes.programmes[funding.programme]) {
          errors.push(
            `${project.id}: lot "${lot.id}" funding programme "${funding.programme}" is not in data/programmes.json`,
          );
        }
      }
    }
  }

  for (const [table, entries, used] of [
    ["data/corridors.json", Object.keys(corridors?.corridors ?? {}), usedCorridors],
    ["data/programmes.json", Object.keys(programmes?.programmes ?? {}), usedProgrammes],
    ["data/operators.json", Object.keys(operators?.operators ?? {}), usedOperators],
  ] as const) {
    for (const key of entries) {
      if (!used.has(key)) {
        errors.push(`${table}: entry "${key}" is used by no project; remove it or assign it`);
      }
    }
  }
  return { errors, warnings };
}

/**
 * `partOf` is an exclusion marker, like `sharedWith`. A dangling, circular
 * or chained pointer would silently subtract a project from the national
 * totals while nothing else counted it, which reads as a shorter network
 * rather than as an error. Chains are rejected outright: with A part of B
 * part of C, "exclude anything with a parent" and "exclude anything whose
 * root is elsewhere" stop agreeing, and every aggregate would have to pick.
 */
export function checkPartOf(projects: Project[]): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const byId = new Map(projects.map((p) => [p.id, p]));

  for (const project of projects) {
    for (const lot of project.lots) {
      const target = lot.partOf;
      if (target === undefined) continue;

      if (target === project.id) {
        errors.push(`${project.id}: lot "${lot.id}" is partOf its own project`);
        continue;
      }
      const parent = byId.get(target);
      if (!parent) {
        errors.push(
          `${project.id}: lot "${lot.id}" is partOf "${target}", which does not exist`,
        );
        continue;
      }
      // A structure cannot sit inside a road in another country, and a
      // parent that is itself a container would make the exclusion rule
      // ambiguous: "drop anything with a parent" and "drop anything whose
      // root is elsewhere" stop agreeing, and every aggregate would pick.
      if (parent.country !== project.country) {
        errors.push(
          `${project.id}: lot "${lot.id}" is partOf "${target}" in a different country`,
        );
      }
      if (parent.lots.some((l) => l.partOf !== undefined)) {
        errors.push(
          `${project.id}: lot "${lot.id}" is partOf "${target}", which is itself part of another project; chains are not supported`,
        );
      }
    }
  }
  return { errors, warnings };
}

/**
 * Every currency a figure is recorded in must be convertible, or the cost
 * tables silently drop it. Warns via an error so new data cannot slip in a
 * currency the FX table has never heard of. Walks `moneyOf`, so a project
 * cost, a revision or a funding share is held to it the same as a lot cost:
 * the old hand-written loop over three lot fields let those three through.
 */
export function checkFxCoverage(
  table: FxTable | null,
  projects: Project[],
  errors: string[],
) {
  if (!table) return;
  const missing = new Set<string>();
  for (const project of projects) {
    for (const { money } of moneyOf(project)) {
      if (money.currency === table.base) continue;
      if (!table.rates[money.currency]) missing.add(money.currency);
    }
  }
  for (const currency of [...missing].sort()) {
    errors.push(
      `data/fx.json: no rates for "${currency}", which costs are recorded in`,
    );
  }
}
