/**
 * Validates every project file in data/projects/** against the zod schema
 * and cross-checks that each lot's geometryRef exists in the project's
 * GeoJSON file. Also validates the two reference tables the rankings depend
 * on — data/deflators.json and data/contractors.json. Exits non-zero on any
 * error so builds fail loudly.
 */
import fs from "node:fs";
import path from "node:path";
import {
  cityTableSchema,
  contractorRegistrySchema,
  countryGeoPath,
  corridorTableSchema,
  countryTableSchema,
  deflatorTableSchema,
  operatorTableSchema,
  programmeTableSchema,
  fxTableSchema,
  projectSchema,
  projectGeoPath,
  statusFromEvents,
  type CityTable,
  type ContractorRegistry,
  type CorridorTable,
  type CountryTable,
  type OperatorTable,
  type ProgrammeTable,
  type DeflatorTable,
  type FxTable,
  type Money,
  type Project,
} from "../src/lib/schema";
import { contractorSlug, createContractorResolver } from "../src/lib/contractors";
import { lineLength } from "../src/lib/geo";

interface GeoFeature {
  /** `_source` records how the geometry was obtained, e.g. "OSM". */
  properties?: { geometryRef?: string; _source?: string } | null;
  geometry?: GeoJSON.Geometry | null;
}

/**
 * Drawn-vs-stated length band. Outside it the geometry and the recorded
 * lengthKm disagree enough that one of them is wrong, but which one is not
 * decidable here: a lot may legitimately draw short (geometry follows one
 * carriageway, or stops at the last mapped vertex) or long (lengthKm counts
 * a single carriageway while the drawn line follows the longer of the two).
 * So this is a WARNING tier, not an error: 83 of 212 committed lots are
 * currently outside it and turning that into a build failure would either
 * block every unrelated change or force a wave of guessed lengthKm edits.
 * The structural checks below (degenerate, out-of-range, duplicate, orphan
 * geometry) are unambiguous and stay errors.
 */
export const LENGTH_RATIO_MIN = 0.85;
export const LENGTH_RATIO_MAX = 1.2;

export interface GeometryReport {
  errors: string[];
  warnings: string[];
}

/** Positions of a line geometry, part by part. */
function lineParts(geometry: GeoJSON.Geometry): number[][][] | null {
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return null;
}

/**
 * Structural checks on one project's GeoJSON file. A feature that is not a
 * drawable line, or that carries a coordinate off the globe, renders nothing
 * on the map while still counting toward every length total, so each of these
 * is an error rather than something to notice later.
 */
export function checkProjectGeometry(
  project: Project,
  geo: { features?: GeoFeature[] },
  geoRel: string,
): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const byRef = new Map<string, GeoFeature>();
  for (const feature of geo.features ?? []) {
    const ref = feature.properties?.geometryRef;
    if (typeof ref !== "string" || ref.length === 0) {
      errors.push(`${geoRel}: feature without a geometryRef property`);
      continue;
    }
    if (byRef.has(ref)) {
      // Two features with one ref: the map draws both, the lot lookup takes
      // whichever the build happens to keep, and lengths double-count.
      errors.push(`${geoRel}: duplicate geometryRef "${ref}"`);
      continue;
    }
    byRef.set(ref, feature);
  }

  // Orphans: geometry nothing points at is invisible on the map but still
  // ships in public/data, and usually means a lot was renamed on one side.
  const lotRefs = new Set(project.lots.map((l) => l.geometryRef));
  for (const ref of byRef.keys()) {
    if (!lotRefs.has(ref)) {
      errors.push(
        `${geoRel}: feature "${ref}" matches no lot in ${project.id}`,
      );
    }
  }

  for (const lot of project.lots) {
    const feature = byRef.get(lot.geometryRef);
    if (!feature) {
      errors.push(
        `${project.id}: lot "${lot.id}" references geometryRef "${lot.geometryRef}" not found in ${geoRel}`,
      );
      continue;
    }
    const where = `${geoRel}: "${lot.geometryRef}"`;
    const geometry = feature.geometry;
    if (!geometry) {
      errors.push(`${where} has no geometry`);
      continue;
    }
    const parts = lineParts(geometry);
    if (!parts) {
      errors.push(
        `${where} is a ${geometry.type}, expected LineString or MultiLineString`,
      );
      continue;
    }

    const positions = parts.reduce((n, p) => n + p.length, 0);
    if (positions < 2 || parts.some((p) => p.length < 2)) {
      errors.push(
        `${where} has ${positions} position(s); a line needs at least 2 per part and draws nothing otherwise`,
      );
      continue;
    }

    let badCoord: string | null = null;
    for (const part of parts) {
      for (const [lng, lat] of part) {
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
          badCoord ??= `non-finite coordinate [${lng}, ${lat}]`;
        } else if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
          badCoord ??= `coordinate out of range [${lng}, ${lat}]`;
        }
      }
    }
    if (badCoord) {
      errors.push(`${where} has a ${badCoord}`);
      continue;
    }

    const drawn = lineLength(geometry);
    const ratio = drawn / lot.lengthKm;
    if (ratio < LENGTH_RATIO_MIN || ratio > LENGTH_RATIO_MAX) {
      warnings.push(
        `${where} draws ${drawn.toFixed(1)} km against lengthKm ${lot.lengthKm} (ratio ${ratio.toFixed(2)})`,
      );
    }
  }

  return { errors, warnings };
}

/** Parses and schema-checks a single reference file, collecting errors. */
function readReferenceFile<T>(
  root: string,
  rel: string,
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: { path: PropertyKey[]; message: string }[] } } },
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
    for (const issue of parsed.error!.issues) {
      errors.push(`${rel}: ${issue.path.join(".")}: ${issue.message}`);
    }
    return null;
  }
  return parsed.data!;
}

function checkDeflators(table: DeflatorTable, rel: string, errors: string[]) {
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
function checkContractors(
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
function checkCountries(
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
function checkCities(
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
function checkSharedTrack(projects: Project[], errors: string[]) {
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
 * Whether a partial ISO date has already passed, compared at the precision
 * it was written with. A year-only deadline of "2026" is not missed in
 * August 2026: the year still has months to run. Comparing "2026" against
 * "2026-08-14" as strings would report eight overdue lots that are not.
 */
export function hasElapsed(date: string, today: string): boolean {
  const n = Math.min(date.length, today.length);
  return today.slice(0, n) > date.slice(0, n);
}

/** Every money figure recorded anywhere on a project, with a label. */
function* moneyOf(
  project: Project,
): Generator<{ where: string; money: Money; lengthKm?: number }> {
  if (project.cost) {
    yield { where: `${project.id}: cost`, money: project.cost };
  }
  for (const lot of project.lots) {
    const at = `${project.id}: lot "${lot.id}"`;
    if (lot.cost?.estimated) {
      yield { where: `${at} cost.estimated`, money: lot.cost.estimated, lengthKm: lot.lengthKm };
    }
    if (lot.cost?.actual) {
      yield { where: `${at} cost.actual`, money: lot.cost.actual, lengthKm: lot.lengthKm };
    }
    if (lot.contract?.value) {
      yield { where: `${at} contract.value`, money: lot.contract.value };
    }
  }
}

/**
 * Status and dates have to describe the same world.
 *
 * Errors are reserved for statements that cannot both be true: a lot that is
 * only planned cannot also have opened, and nothing opens after today. A
 * missing start or award date is a gap in what was published, not a
 * contradiction, so it warns. An elapsed `expectedOpening` on a lot still
 * building is the one that has to start speaking the moment it slips, which
 * is why `today` is a parameter rather than a call to the clock.
 */
export function checkStatusDates(
  projects: Project[],
  today: string,
): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const project of projects) {
    for (const lot of project.lots) {
      const at = `${project.id}: lot "${lot.id}"`;
      const d = lot.dates;

      if (lot.status === "planned" && d?.opened) {
        errors.push(`${at} has status "planned" but has dates.opened (${d.opened})`);
      }
      if (d?.opened && hasElapsed(today, d.opened)) {
        errors.push(`${at} opened (${d.opened}) is in the future`);
      }
      if (lot.status === "under_construction" && !d?.constructionStart) {
        warnings.push(`${at} is under_construction with no dates.constructionStart`);
      }
      if (lot.status === "tendered" && !d?.tenderAwarded) {
        warnings.push(`${at} is tendered with no dates.tenderAwarded`);
      }
      if (
        (lot.status === "under_construction" || lot.status === "tendered") &&
        d?.expectedOpening &&
        hasElapsed(d.expectedOpening, today)
      ) {
        warnings.push(
          `${at} expectedOpening (${d.expectedOpening}) has elapsed and the lot is still ${lot.status}`,
        );
      }
    }
  }
  return { errors, warnings };
}

/**
 * A cost is only comparable if both reference tables reach its price year:
 * the deflator restates it within its currency, then FX converts it at that
 * year's rate. `checkFxCoverage` below tests only that the currency key
 * exists, so a 2026 figure in a series that stops at 2025 passed silently
 * and then dropped out of every ranking.
 *
 * Warning, not error: the figure is correctly recorded and correctly
 * sourced. What is missing is a row in a published series nobody has
 * extended yet, and failing the build for that would block unrelated work.
 */
export function checkPriceCoverage(
  deflators: DeflatorTable | null,
  fx: FxTable | null,
  projects: Project[],
): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!deflators || !fx) return { errors, warnings };

  for (const project of projects) {
    for (const { where, money } of moneyOf(project)) {
      // A programme figure is shown as recorded and never ranked, so it
      // needs no year and no conversion path.
      if (money.scope === "programme") continue;

      if (money.year === undefined) {
        warnings.push(
          `${where}: ${money.amount} ${money.currency} has no price year, so it is shown as recorded and never compared`,
        );
        continue;
      }
      const year = String(money.year);
      const missing: string[] = [];
      if (!deflators.series[money.currency]?.index[year]) missing.push("deflator");
      if (money.currency !== fx.base && !fx.rates[money.currency]?.perEur[year]) {
        missing.push("fx");
      }
      if (missing.length > 0) {
        warnings.push(
          `${where}: no ${missing.join(" or ")} entry for ${money.currency} ${year}, so the figure cannot be restated`,
        );
      }
    }
  }
  return { errors, warnings };
}

/**
 * A contractor name written on a lot should resolve to a registry entry.
 *
 * Unregistered spellings do not vanish (the resolver mints a synthetic
 * identity), but they do not merge either: "Strabag" and "Strabag (lot 1)"
 * rank as two firms. Warning rather than error, because registering a firm
 * is a sourcing job of its own and 82 names are currently unregistered.
 * One line per distinct name, so each line is one registry entry to add.
 */
export function checkLotContractors(
  registry: ContractorRegistry | null,
  projects: Project[],
): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!registry) return { errors, warnings };

  const known = new Set(registry.contractors.map((c) => c.id));
  const resolve = createContractorResolver(registry);
  const unresolved = new Map<string, number>();

  for (const project of projects) {
    for (const lot of project.lots) {
      for (const contractor of lot.contractors ?? []) {
        const misses = resolve(contractor.name).filter(
          (r) => r.kind === "firm" && !known.has(r.id),
        );
        if (misses.length > 0) {
          unresolved.set(contractor.name, (unresolved.get(contractor.name) ?? 0) + 1);
        }
      }
    }
  }
  for (const [name, count] of [...unresolved].sort()) {
    warnings.push(
      `data/contractors.json: "${name}" (${count} lot${count === 1 ? "" : "s"}) has no registry entry, so it cannot merge with other spellings`,
    );
  }
  return { errors, warnings };
}

/**
 * Order-of-magnitude sanity on cost per km.
 *
 * The bands are deliberately loose: a rehabilitated single-track line and a
 * bored metro tunnel are both "railway" and legitimately differ by fifty
 * times, so any band tight enough to judge a sourced figure would be wrong
 * more often than the data. What these catch is a units slip: an amount
 * typed in whole currency rather than millions, or a length in metres, both
 * of which land three orders of magnitude out. Figures with no price year,
 * or in a currency with no rate for that year, are skipped rather than
 * converted at some other year's rate.
 */
const COST_PER_KM_BANDS: Record<string, [number, number]> = {
  highway: [0.5, 100],
  railway: [0.5, 250],
  bridge: [5, 2000],
  tunnel: [5, 2000],
};

export function checkCostPerKm(
  fx: FxTable | null,
  projects: Project[],
): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const project of projects) {
    const band = COST_PER_KM_BANDS[project.category];
    if (!band) continue;
    for (const { where, money, lengthKm } of moneyOf(project)) {
      if (lengthKm === undefined || money.year === undefined) continue;
      if (money.scope === "programme") continue;
      let eur = money.amount;
      if (money.currency !== (fx?.base ?? "EUR")) {
        const rate = fx?.rates[money.currency]?.perEur[String(money.year)];
        if (!rate) continue;
        eur = money.amount / rate;
      }
      const perKm = eur / lengthKm;
      if (perKm < band[0] || perKm > band[1]) {
        warnings.push(
          `${where}: ${perKm.toFixed(1)}M EUR per km is outside the plausible ${band[0]}-${band[1]} band for a ${project.category}; check the units`,
        );
      }
    }
  }
  return { errors, warnings };
}

/** Reads a project's geometry file, or null when it cannot be read. */
export type GeoReader = (project: Project) => { features?: GeoFeature[] } | null;

/**
 * Source obligations.
 *
 * The OSM rule is a licence term, not a preference: geometry marked
 * `_source: "OSM"` is ODbL, and ODbL requires attribution. Nothing enforced
 * it, so it is an error. Everything else here is a quality signal and warns:
 * a project resting on one source is thin rather than wrong, and a source
 * with an id nothing points at is only clutter.
 */
export function checkSourceQuality(
  projects: Project[],
  readGeo: GeoReader,
): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const project of projects) {
    const ids = new Set<string>();
    for (const source of project.sources) {
      if (!source.id) continue;
      if (ids.has(source.id)) {
        errors.push(`${project.id}: duplicate source id "${source.id}"`);
      }
      ids.add(source.id);
    }

    const referenced = new Set<string>();
    for (const lot of project.lots) {
      for (const ref of lot.sourceRefs ?? []) {
        referenced.add(ref);
        if (!ids.has(ref)) {
          errors.push(
            `${project.id}: lot "${lot.id}" sourceRef "${ref}" matches no source id`,
          );
        }
      }
    }
    for (const id of ids) {
      if (!referenced.has(id)) {
        warnings.push(
          `${project.id}: source id "${id}" is referenced by no lot; drop the id or point a lot at it`,
        );
      }
    }

    if (project.sources.length < 2) {
      warnings.push(
        `${project.id}: rests on ${project.sources.length} source, so nothing corroborates it`,
      );
    }

    const geo = readGeo(project);
    const fromOsm = (geo?.features ?? []).some(
      (f) => f.properties?._source === "OSM",
    );
    if (fromOsm) {
      const cites = project.sources.some(
        (s) =>
          s.url.includes("openstreetmap.org") ||
          /openstreetmap|\bosm\b/i.test(s.title),
      );
      if (!cites) {
        errors.push(
          `${project.id}: geometry is OSM-derived (ODbL) but no source cites OpenStreetMap`,
        );
      }
    }
  }
  return { errors, warnings };
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
 * The event history, checked against the single word standing in for it.
 *
 * `status` stays authoritative for now: deriving it would change what
 * `map-filters.ts`, `country-stats.ts`, `build-data.ts` and `slip.ts` see,
 * and those are not this agent's to touch. So the disagreement is made
 * visible instead of resolved, which is what turns a silent contradiction
 * into something a person can act on.
 */
export function checkEvents(projects: Project[]): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const project of projects) {
    const ids = new Set(
      project.sources.map((s) => s.id).filter((id): id is string => Boolean(id)),
    );
    for (const lot of project.lots) {
      const events = lot.events ?? [];
      if (events.length === 0) continue;
      const at = `${project.id}: lot "${lot.id}"`;

      for (const event of events) {
        if (event.sourceRef && !ids.has(event.sourceRef)) {
          errors.push(
            `${at} event "${event.kind}" sourceRef "${event.sourceRef}" matches no source id`,
          );
        }
      }

      // A history that stops before the lot's own latest recorded date is
      // incomplete, not contradictory: events recording only a 2013
      // termination imply "tendered" purely because nothing after it was
      // written down. Saying so is a false positive, so the incompleteness
      // is what gets reported instead.
      const recordedDates = Object.values(lot.dates ?? {}).filter(
        (d): d is string => typeof d === "string",
      );
      const latestRecorded = recordedDates.sort().at(-1);
      const latestEvent = events.map((e) => e.date).sort().at(-1)!;

      if (latestRecorded !== undefined && latestEvent < latestRecorded) {
        warnings.push(
          `${at} event history stops at ${latestEvent} but dates record ${latestRecorded}, so the history is incomplete`,
        );
      } else {
        const implied = statusFromEvents(events);
        if (implied !== null && implied !== lot.status) {
          warnings.push(
            `${at} has status "${lot.status}" but its events imply "${implied}"`,
          );
        }
      }

      // Part of a lot in service while the lot is drawn as something else is
      // how 58 km of tendered road ended up covering open motorway. The lot
      // is the unit the map draws, so the fix is to split it.
      if (
        lot.status !== "opened" &&
        events.some((e) => e.kind === "partial_opening")
      ) {
        warnings.push(
          `${at} has a partial_opening event but status "${lot.status}", so the map draws the whole lot as ${lot.status}; split the open part into its own lot`,
        );
      }

      // An event and the dates block are two records of the same fact.
      for (const [kind, field] of [
        ["construction_start", "constructionStart"],
        ["opened", "opened"],
        ["awarded", "tenderAwarded"],
      ] as const) {
        const event = events.find((e) => e.kind === kind);
        const recorded = lot.dates?.[field];
        if (!event || !recorded) continue;
        const n = Math.min(event.date.length, recorded.length);
        if (event.date.slice(0, n) !== recorded.slice(0, n)) {
          warnings.push(
            `${at} event "${kind}" (${event.date}) disagrees with dates.${field} (${recorded})`,
          );
        }
      }
    }
  }
  return { errors, warnings };
}

/**
 * The revision chain has to agree with the flat fields it stands in for.
 * A `sourceRef` that resolves to nothing is an error for the same reason a
 * lot `sourceRef` is. A figure that contradicts the flat field warns rather
 * than fails: both may be sourced, and which one is right is a question for
 * a person, not the build.
 */
export function checkCostRevisions(projects: Project[]): GeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const project of projects) {
    const ids = new Set(
      project.sources.map((s) => s.id).filter((id): id is string => Boolean(id)),
    );
    for (const lot of project.lots) {
      const revisions = lot.cost?.revisions ?? [];
      for (const revision of revisions) {
        if (revision.sourceRef && !ids.has(revision.sourceRef)) {
          errors.push(
            `${project.id}: lot "${lot.id}" cost revision sourceRef "${revision.sourceRef}" matches no source id`,
          );
        }
      }
      for (const [field, kind] of [
        ["estimated", "estimate"],
        ["actual", "outturn"],
      ] as const) {
        const flat = lot.cost?.[field];
        const chain = revisions.filter((r) => r.kind === kind);
        if (!flat || chain.length === 0) continue;
        const newest = chain.reduce((a, b) => (b.date > a.date ? b : a)).money;
        if (newest.amount !== flat.amount || newest.currency !== flat.currency) {
          warnings.push(
            `${project.id}: lot "${lot.id}" cost.${field} (${flat.amount} ${flat.currency}) disagrees with the newest "${kind}" revision (${newest.amount} ${newest.currency})`,
          );
        }
      }
    }
  }
  return { errors, warnings };
}

/**
 * Locale keys must name a locale the site actually has.
 *
 * `localizedStringSchema` deliberately accepts any key so a third locale
 * needs no type change, which means a typo like "rp" is well-formed there.
 * This is the check that catches it: the vocabulary comes from messages/,
 * so adding a locale to the UI is what permits it in the data, and nothing
 * has to be edited twice.
 */
export function checkLocaleKeys(
  value: unknown,
  rel: string,
  locales: string[],
  path = "",
): string[] {
  const errors: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      errors.push(...checkLocaleKeys(item, rel, locales, `${path}[${i}]`));
    });
    return errors;
  }
  if (value === null || typeof value !== "object") return errors;

  const record = value as Record<string, unknown>;
  // Shape-detect a LocalizedString: nothing else in this schema carries an
  // "en" string property.
  if (typeof record.en === "string") {
    for (const key of Object.keys(record)) {
      if (!locales.includes(key)) {
        errors.push(
          `${rel}: ${path || "(root)"} has locale key "${key}", which has no messages/${key}.json`,
        );
      }
    }
    return errors;
  }
  for (const [key, child] of Object.entries(record)) {
    errors.push(
      ...checkLocaleKeys(child, rel, locales, path ? `${path}.${key}` : key),
    );
  }
  return errors;
}

/** Locales the site ships, taken from the messages directory. */
export function knownLocales(root: string): string[] {
  const dir = path.join(root, "messages");
  if (!fs.existsSync(dir)) return ["en"];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length));
}

/**
 * AGENTS.md bans the em dash in user-facing text and nothing enforced it.
 * An error, because the rule is unambiguous and the fix is mechanical. The
 * en dash (U+2013) is untouched: it is part of route names like
 * "Sebeș–Turda" and changing one corrupts the name.
 */
export function checkEmDashes(root: string, dirs: string[]): string[] {
  const errors: string[] = [];
  for (const dir of dirs) {
    for (const file of walk(path.join(root, dir))) {
      const text = fs.readFileSync(file, "utf8");
      const count = (text.match(/—/g) ?? []).length;
      if (count > 0) {
        errors.push(
          `${path.relative(root, file).replace(/\\/g, "/")}: ${count} em dash(es) (U+2014); AGENTS.md bans them, use a full stop, comma, colon or brackets`,
        );
      }
    }
  }
  return errors;
}

/** Every currency a cost is recorded in must be convertible, or the cost
 *  tables silently drop it. Warns via an error so new data cannot slip in
 *  a currency the FX table has never heard of. */
function checkFxCoverage(
  table: FxTable | null,
  projects: Project[],
  errors: string[],
) {
  if (!table) return;
  const missing = new Set<string>();
  for (const project of projects) {
    for (const lot of project.lots) {
      for (const money of [
        lot.cost?.estimated,
        lot.cost?.actual,
        lot.contract?.value,
      ]) {
        if (!money) continue;
        if (money.currency === table.base) continue;
        if (!table.rates[money.currency]) missing.add(money.currency);
      }
    }
  }
  for (const currency of [...missing].sort()) {
    errors.push(
      `data/fx.json: no rates for "${currency}", which costs are recorded in`,
    );
  }
}

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith(".json")) yield full;
  }
}

export interface ValidationResult {
  projects: Project[];
  deflators: DeflatorTable | null;
  contractors: ContractorRegistry | null;
  countries: CountryTable | null;
  fx: FxTable | null;
  cities: CityTable | null;
  corridors: CorridorTable | null;
  programmes: ProgrammeTable | null;
  operators: OperatorTable | null;
  errors: string[];
  /** Non-blocking findings: reported, but they do not fail the build. */
  warnings: string[];
}

export interface ValidationOptions {
  /**
   * The date "now" is taken to be, as YYYY-MM-DD. Injected so a rule about
   * elapsed deadlines is testable and does not change meaning overnight.
   */
  today?: string;
}

export function collectErrors(
  root: string,
  options: ValidationOptions = {},
): ValidationResult {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const projectsDir = path.join(root, "data/projects");
  const projects: Project[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();

  const deflators = readReferenceFile<DeflatorTable>(
    root,
    "data/deflators.json",
    deflatorTableSchema,
    errors,
  );
  if (deflators) checkDeflators(deflators, "data/deflators.json", errors);

  const contractors = readReferenceFile<ContractorRegistry>(
    root,
    "data/contractors.json",
    contractorRegistrySchema,
    errors,
  );
  if (contractors) {
    checkContractors(contractors, "data/contractors.json", errors);
  }

  const countries = readReferenceFile<CountryTable>(
    root,
    "data/countries.json",
    countryTableSchema,
    errors,
  );

  const fx = readReferenceFile<FxTable>(
    root,
    "data/fx.json",
    fxTableSchema,
    errors,
  );

  const cities = readReferenceFile<CityTable>(
    root,
    "data/cities.json",
    cityTableSchema,
    errors,
  );

  const corridors = readReferenceFile<CorridorTable>(
    root,
    "data/corridors.json",
    corridorTableSchema,
    errors,
  );

  const programmes = readReferenceFile<ProgrammeTable>(
    root,
    "data/programmes.json",
    programmeTableSchema,
    errors,
  );

  const operators = readReferenceFile<OperatorTable>(
    root,
    "data/operators.json",
    operatorTableSchema,
    errors,
  );

  for (const file of walk(projectsDir)) {
    const rel = path.relative(root, file);
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      errors.push(`${rel}: invalid JSON: ${(e as Error).message}`);
      continue;
    }

    const parsed = projectSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`${rel}: ${issue.path.join(".")}: ${issue.message}`);
      }
      continue;
    }
    const project = parsed.data;

    if (seenIds.has(project.id)) {
      errors.push(`${rel}: duplicate project id "${project.id}"`);
    }
    seenIds.add(project.id);

    if (!project.id.startsWith(`${project.country}-`)) {
      errors.push(
        `${rel}: project id "${project.id}" must start with country code "${project.country}-"`,
      );
    }

    const lotIds = new Set<string>();
    for (const lot of project.lots) {
      if (lotIds.has(lot.id)) {
        errors.push(`${rel}: duplicate lot id "${lot.id}"`);
      }
      lotIds.add(lot.id);

      // Dates must run in the order they happen. An audit of this dataset
      // found several lots whose recorded construction start predated their
      // own tender award — the tell-tale of two different procurements
      // merged into one record, which silently corrupts every slip figure
      // derived from them.
      const d = lot.dates;
      const order: Array<[string, string | undefined]> = [
        ["announced", d?.announced],
        ["tenderAwarded", d?.tenderAwarded],
        ["constructionStart", d?.constructionStart],
        ["opened", d?.opened],
      ];
      const present = order.filter((e): e is [string, string] => Boolean(e[1]));
      for (let i = 1; i < present.length; i++) {
        const [prevName, prev] = present[i - 1];
        const [name, cur] = present[i];
        // Compare on the shared precision so "2019" vs "2019-03" is not a
        // false positive — only a genuine ordering violation should fail.
        const n = Math.min(prev.length, cur.length);
        if (cur.slice(0, n) < prev.slice(0, n)) {
          errors.push(
            `${rel}: lot "${lot.id}" has ${name} (${cur}) before ${prevName} (${prev})`,
          );
        }
      }
    }

    // Cross-check geometry references, and the geometry behind them.
    const geoRel = projectGeoPath(project);
    const geoPath = path.join(root, geoRel);
    if (!fs.existsSync(geoPath)) {
      errors.push(`${rel}: missing geometry file ${geoRel}`);
    } else {
      let geo: { features?: GeoFeature[] };
      try {
        geo = JSON.parse(fs.readFileSync(geoPath, "utf8"));
      } catch (e) {
        errors.push(`${rel}: invalid GeoJSON: ${(e as Error).message}`);
        continue;
      }
      const report = checkProjectGeometry(project, geo, geoRel);
      errors.push(...report.errors);
      warnings.push(...report.warnings);
    }

    projects.push(project);
  }

  checkCountries(countries, projects, root, errors);
  checkCities(cities, projects, errors);
  checkSharedTrack(projects, errors);
  checkFxCoverage(fx, projects, errors);

  const readGeo: GeoReader = (project) => {
    const file = path.join(root, projectGeoPath(project));
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  };

  for (const report of [
    checkStatusDates(projects, today),
    checkPriceCoverage(deflators, fx, projects),
    checkLotContractors(contractors, projects),
    checkCostPerKm(fx, projects),
    checkSourceQuality(projects, readGeo),
    checkReferenceKeys(corridors, programmes, operators, projects),
    checkPartOf(projects),
    checkCostRevisions(projects),
    checkEvents(projects),
  ]) {
    errors.push(...report.errors);
    warnings.push(...report.warnings);
  }
  errors.push(...checkEmDashes(root, ["data", "messages"]));

  // Locale vocabulary, across every data file rather than projects only:
  // the reference tables carry localized labels too.
  const locales = knownLocales(root);
  for (const file of walk(path.join(root, "data"))) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    try {
      errors.push(
        ...checkLocaleKeys(JSON.parse(fs.readFileSync(file, "utf8")), rel, locales),
      );
    } catch {
      // A parse failure is already reported by whichever check owns the file.
    }
  }

  return {
    projects,
    deflators,
    contractors,
    countries,
    fx,
    cities,
    corridors,
    programmes,
    operators,
    errors,
    warnings,
  };
}

export interface ValidatedData {
  projects: Project[];
  deflators: DeflatorTable;
  contractors: ContractorRegistry;
  countries: CountryTable;
  fx: FxTable;
  cities: CityTable;
  corridors: CorridorTable;
  programmes: ProgrammeTable;
  operators: OperatorTable;
}

export function validateAll(root: string): ValidatedData {
  const {
    projects,
    deflators,
    contractors,
    countries,
    fx,
    cities,
    corridors,
    programmes,
    operators,
    errors,
    warnings,
  } = collectErrors(root);

  // Printed before the error block so a failing build still shows them, and
  // printed in full rather than counted so the gap stays visible in CI logs.
  if (warnings.length > 0) {
    console.warn(`${warnings.length} warning(s):`);
    for (const w of warnings) console.warn(`  ! ${w}`);
  }

  if (
    errors.length > 0 ||
    !deflators ||
    !contractors ||
    !countries ||
    !fx ||
    !cities ||
    !corridors ||
    !programmes ||
    !operators
  ) {
    console.error(`Data validation failed with ${errors.length} error(s):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  console.log(
    `✓ ${projects.length} project(s), ${Object.keys(deflators.series).length} deflator series, ${Object.keys(fx.rates).length} fx series, ${contractors.contractors.length} contractor entries, ${Object.keys(countries.countries).length} countries, ${Object.keys(cities.cities).length} cities validated`,
  );
  return {
    projects,
    deflators,
    contractors,
    countries,
    fx,
    cities,
    corridors,
    programmes,
    operators,
  };
}

if (process.argv[1] && process.argv[1].endsWith("validate-data.ts")) {
  validateAll(process.cwd());
}
