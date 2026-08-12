# InfraWorldWide

An interactive world map of infrastructure projects — highways, railways, bridges and tunnels — showing when they were built, by whom, at what cost, and how they were funded. Inspired by [130km.ro](https://130km.ro) and [proinfrastructura.ro](https://proinfrastructura.ro), but worldwide and time-aware.

**Features**

- Interactive map (MapLibre GL + OpenFreeMap basemap) with category colors and status line styles (opened / under construction / tendered / planned)
- **Time travel**: a year slider replays how the network grew, from the 1970s to scheduled future openings
- Click any segment for dates, length, estimated vs actual cost, funding sources and contractors
- Project list with search/filters and a 130km.ro-style openings timeline (past + scheduled)
- Per-project detail pages with a lots table and cited sources
- English and Romanian UI
- All data is curated, version-controlled JSON — no backend

## Tech stack

Next.js (App Router, SSG) · TypeScript · MapLibre GL JS (react-map-gl) · OpenFreeMap tiles · next-intl · Tailwind CSS · zod · Vitest

## Getting started

```bash
npm install
npm run dev        # builds data artifacts (predev) and starts Next.js
```

Open http://localhost:3000 (redirects to /en).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | data build + dev server |
| `npm run build` | data build + production build |
| `npm test` | Vitest unit + data-integrity tests |
| `npm run data:validate` | validate `data/projects/**` against the zod schema + geometry cross-checks |
| `npm run data:build` | validate, then emit `public/data/*.json` (gitignored build artifacts) |
| `npx tsx scripts/fetch-osm-geometry.ts …` | bootstrap route geometry from OpenStreetMap (see below) |

## Data model

Data lives in the repo, curated by hand (facts from cited public sources):

```
data/projects/<country>/<project>.json   # metadata: lots, dates, costs, funding, contractors, sources
data/geo/<country>/<project>.geojson     # geometry: one feature per lot, properties.geometryRef
```

A **Project** (e.g. "A1 motorway") has **Lots** — sections with their own status, dates, cost, contractors. A lot's `geometryRef` joins it to a GeoJSON feature. `npm run data:validate` enforces the schema (zod), requires `dates.opened` for opened lots, sources for every project, and a matching geometry feature for every lot. The same checks run in `npm test` (`scripts/data-integrity.test.ts`).

Amounts in `cost` are in **millions** of the currency unit (`{"amount": 500, "currency": "EUR"}` = €500M).

### Contract terms and expected openings

A lot may carry a `contract` block recording the public award: `designMonths`, `executionMonths`, `totalMonths`, `guaranteeMonths`, `value`, plus `noticeReference` and `noticeUrl` linking the award notice or the report documenting it.

Expected completion resolves in this order (`src/lib/contract.ts`):

1. `dates.expectedOpening` — a date a source states outright (always wins)
2. otherwise **derived** from `constructionStart` (or `tenderAwarded`) + the contracted months, shown in the UI as "Projected from contract ≈YYYY"
3. null for lots already `opened` or `cancelled`

The build flattens the result to `expectedOpening` on each map feature plus an `expectedOpeningDerived` flag, and the time slider treats a lot as in service once the viewed year passes that date. **Never invent a deadline** — omit the field when no source gives one.

Note on sourcing: TED (`api.ted.europa.eu`) only exposes contract-duration fields for eForms-era notices (≈2024+), so most Romanian motorway awards from 2018–2023 are not machine-readable there; those terms come from the cited press/CNAIR reports instead. Romania's national portal (`e-licitatie.ro`) has no open API, opentender.eu blocks automated requests, and data.gov.ro carries no CNAIR procurement dataset. **Romanian-language Wikipedia articles are consistently richer than the English ones** for per-lot contractors, contract months and award dates — search those first (`ro.wikipedia.org/w/api.php?action=parse&page=Autostrada_A7_(România)&prop=wikitext`).

A working TED query for post-2024 notices:

```bash
curl -s -X POST https://api.ted.europa.eu/v3/notices/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"place-of-performance=ROU AND classification-cpv=45233110 AND publication-date>=20240101",
       "limit":50,
       "fields":["publication-number","notice-title","publication-date",
                 "duration-period-value-lot","duration-period-unit-lot",
                 "contract-duration-end-date-lot"]}'
```

Full notice XML (with `VAL_ESTIMATED_TOTAL`) is at `https://ted.europa.eu/en/notice/<publication-number>/xml`.

### Data sources worth reusing (and their licences)

| Source | Licence | What it's good for | Verdict |
| --- | --- | --- | --- |
| **OpenStreetMap** (Overpass) | ODbL — attribution + share-alike | Geometry, and date tags `start_date` / `opening_date` / **`construction:opening_date`**, often per named lot ("A0 Nord Lot 1 → 2026") | **Best all-round source.** Already attributed here; harvest with `scripts/fetch-osm-dates.ts` |
| **Romanian Wikipedia** | CC BY-SA | Per-lot contractors, contract months, award dates, cost breakdowns — consistently richer than English | **Primary for facts** (cite the article) |
| **Wikidata** (SPARQL) | **CC0 — no restrictions** | Route-level length, inception year | Reusable but very sparse: no costs, no per-lot data |
| **Natural Earth** 1:50m admin-0 | **Public domain — no attribution required** | Country outlines: the map's click targets and dimming mask | In use via `scripts/fetch-country-outlines.ts`. Borders are generalised, so they drift from the OSM basemap above ~z8 — the rendered outline fades out before that shows |
| **CIA World Factbook** (via [factbook.json](https://github.com/factbook/factbook.json)) | Public domain | Country area, on one methodology worldwide | In use for `data/countries.json`. **Retired February 2026** — cia.gov no longer serves country pages, and Wayback captured only the page shell, so cite the factbook.json conversion of the final 2025 edition |
| **Eurostat** (`demo_gind`) | Free reuse (2011/833/EU) | Population on 1 January, incl. enlargement countries like Serbia | In use for `data/countries.json`. Publishes **no area figure for Serbia**, which is why area comes from the Factbook throughout |
| **TED** (`api.ted.europa.eu`) | Free reuse (EU Commission decision 2011/833/EU) | Contract durations/values — **eForms notices only (≈2024+)** | Useful for future awards, near-useless for 2018–23 Romanian motorways |
| `e-licitatie.ro` | — | National procurement | No open API (404) |
| `opentender.eu` | — | Procurement analytics | Blocks automated requests (403) |
| `data.gov.ro` | Open | Romanian government data | No CNAIR procurement dataset |

```bash
npx tsx scripts/fetch-osm-dates.ts --country ro            # all numbered routes
npx tsx scripts/fetch-osm-dates.ts --country ro --ref A7   # one route
```

The script prints a report rather than writing data — dates get reviewed against a second source before landing in `data/projects`.

### Bootstrapping geometry from OpenStreetMap

```bash
npx tsx scripts/fetch-osm-geometry.ts \
  --country ro --ref A2 --out data/geo/ro/a2.geojson \
  --section bucharest-fetesti:26.10,44.43:27.36,44.38 \
  --section fetesti-cernavoda:27.36,44.38:27.99,44.34
```

Fetches ways for the route from Overpass (with mirror failover/retries), then slices one feature per `--section` (`ref:fromLng,fromLat:toLng,toLat`) via **chainage projection** (`scripts/route-projection.ts`): vertices are projected onto a reference polyline built from the section endpoints, binned by distance along the route, and averaged — this collapses dual carriageways into a clean forward-only centerline and avoids zigzag slicing bugs. Give sections in route order; add `--via lng,lat` for big bends between section endpoints and `--max-lateral` (default 0.5°) to exclude strays. `--also-construction` includes `highway=construction` ways; `--dry-run` inspects without writing; `--highway trunk` works for non-motorway routes; `--cache file` / `--from-cache file` saves raw ways so you can iterate on waypoints offline (Overpass is often busy).

OSM-derived geometry is **ODbL-licensed**: keep "© OpenStreetMap contributors" attribution (see the site footer) and add the OSM source entry to the project's `sources`.

### Adding a new project

1. Gather facts (dates, lengths, costs, contractors, funding) from public sources.
2. Bootstrap geometry with the script above (or hand-draw in [geojson.io](https://geojson.io)).
3. Write `data/projects/<cc>/<slug>.json` with `en` (and ideally `ro`) strings and `sources`.
4. `npm run data:validate && npm test`.

## Testing

Vitest covers the pure logic (`src/lib/*.test.ts`: schema rules, map filters, URL params, formatting, stats, timeline, filtering, geo helpers), the geo algorithms (`scripts/fetch-osm-geometry.test.ts`), and a data-integrity test that re-validates all committed seed data. CI should run `npm test && npm run build`.

## Deployment

Static-friendly Next.js build; deploy to Vercel with no configuration (`prebuild` regenerates `public/data`). Map tiles come from OpenFreeMap (free, no API key) — swap `OPENFREEMAP_STYLE` in `src/lib/map-style.ts` to change basemaps.
