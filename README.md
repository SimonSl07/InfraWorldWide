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

| Command                                   | Purpose                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`                             | data build + dev server                                                              |
| `npm run build`                           | data build + production build                                                        |
| `npm test`                                | Vitest unit + data-integrity tests                                                   |
| `npm run data:validate`                   | validate `data/projects/**` against the zod schema + geometry cross-checks           |
| `npm run data:build`                      | validate, then emit `public/data/*.json` (gitignored build artifacts)                |
| `npm run data:schema`                     | regenerate `schema/*.schema.json` from `src/lib/schema.ts` (CI fails if these drift) |
| `npm run data:gaps`                       | what the data is still missing, as a table, CSV or JSON                              |
| `npm run data:links`                      | check every cited URL still resolves                                                 |
| `npm run data:indices`                    | refetch the price indices and exchange rates, and diff them                          |
| `npm run data:news`                       | fetch the news feeds and the cited Wikipedia histories, and write the digest         |
| `npx tsx scripts/fetch-osm-geometry.ts …` | bootstrap route geometry from OpenStreetMap (see below)                              |

Contributing a project or a country: **[CONTRIBUTING.md](CONTRIBUTING.md)**.

### Editor validation

`npm run data:schema` writes JSON Schemas to `schema/`. Point a data file at one with a `$schema` key and an editor with JSON language support validates it as you type, including the enums:

```json
{
  "$schema": "../../../schema/project.schema.json",
  "id": "ro-a7",
  "country": "ro"
}
```

CI regenerates the schemas and fails on a diff, so a change to `src/lib/schema.ts` that skips this step is caught rather than leaving editors checking contributions against a stale shape.

## Data model

Data lives in the repo, curated by hand (facts from cited public sources):

```
data/projects/<country>/<project>.json   # metadata: lots, dates, costs, funding, contractors, sources
data/geo/<country>/<project>.geojson     # geometry: one feature per lot, properties.geometryRef
data/geo/countries/<cc>.geojson          # country outline, the map's click target
data/countries.json                      # area + population, for the density figures
data/cities.json                         # cities that get their own view
data/deflators.json                      # price indices, to compare costs across years
data/fx.json                             # annual average exchange rates, to compare across currencies
data/contractors.json                    # canonical contractor identities and aliases
```

A **Project** (e.g. "A1 motorway") has **Lots** — sections with their own status, dates, cost, contractors. A lot's `geometryRef` joins it to a GeoJSON feature. `npm run data:validate` enforces the schema (zod), requires `dates.opened` for opened lots, sources for every project, and a matching geometry feature for every lot. The same checks run in `npm test` (`src/lib/validation/data-integrity.test.ts`).

Amounts in `cost` are in **millions** of the currency unit (`{"amount": 500, "currency": "EUR"}` = €500M). The one exception is `gdpPerCapita` in `data/cities.json`, which is a per-person figure in **whole** units.

### Cities

A project may carry a `city` key (`"city": "ro-bucharest"`) pointing into `data/cities.json`. Setting it **moves the project off the main map entirely** and onto that city's own page at `/[lang]/cities/<key>`: a metro line drawn at country zoom is a few pixels of noise sitting on top of the motorway network. The build writes those projects to `public/data/geo/cities/<key>.geojson` instead of the country file, plus a `cities.geojson` of one point per city that the map renders as a clickable marker. Validation checks both directions, so a project cannot point at a city that does not exist and a city cannot sit there with no projects.

### Shared track

Two metro lines that through-run the same tunnel each list it, because each line really is that long. The lot on the borrowing line carries `"sharedWith": "<owning project id>"`, which keeps it in that line's own length and drops it from every total spanning projects: city and country network km, the growth chart, the by-country league, and the opened-sections table.

That is how operators publish it. Sofia's four lines sum to 66.5 km against a 55.0 km system; Bucharest's infobox breaks out M3's "8.67 km (M1 shared section)" so the 80.1 km network total stays right. Validation checks the pointer resolves to a real project in the same country and city.

### Comparing costs

Two reference tables put costs on one axis, and the order they are applied matters:

1. `data/deflators.json` restates a figure into a common **price year**, within its own currency.
2. `data/fx.json` then converts it to euro at **that year's** annual average rate.

Converting first would apply a rate from one year to prices from another, mixing inflation and currency movement into one unattributable number. Either step may refuse (a currency with no published rates, a price year outside the series); the cost then shows as recorded but drops out of any ranking rather than being sorted against figures that mean something different. `src/lib/performance.test.ts` pins the ordering.

`data/deflators-construction.json` is a second, alternative price basis: Eurostat's construction cost index rather than consumer prices. It is the closer fit for civil works and the difference is not academic. 1000 RON of 2013 restated into 2022 prices is 1303 on HICP and **1779** on the construction basis, because construction input costs ran far ahead of consumer prices in 2021-23, so a real-terms overrun spanning that window is understated by the consumer-price table. It buys that at the price of coverage: **BGN, EUR and RON only** (Eurostat returns zeroes for Serbia and publishes no US series), it stops at 2022/2023 where HICP reaches 2025, and the published series is residential building work because no civil-engineering index exists for these countries. Both tables have the same shape, so `src/lib/deflator.ts` consumes either.

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

| Source                                                                                  | Licence                                         | What it's good for                                                                                                                    | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenStreetMap** (Overpass)                                                            | ODbL — attribution + share-alike                | Geometry, and date tags `start_date` / `opening_date` / **`construction:opening_date`**, often per named lot ("A0 Nord Lot 1 → 2026") | **Best all-round source.** Already attributed here; harvest with `scripts/fetch-osm-dates.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Romanian Wikipedia**                                                                  | CC BY-SA                                        | Per-lot contractors, contract months, award dates, cost breakdowns — consistently richer than English                                 | **Primary for facts** (cite the article)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Wikidata** (SPARQL)                                                                   | **CC0 — no restrictions**                       | Route-level length, inception year                                                                                                    | Reusable but very sparse: no costs, no per-lot data                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Natural Earth** 1:50m admin-0                                                         | **Public domain — no attribution required**     | Country outlines: the map's click targets and dimming mask                                                                            | In use via `scripts/fetch-country-outlines.ts`. Borders are generalised, so they drift from the OSM basemap above ~z8 — the rendered outline fades out before that shows                                                                                                                                                                                                                                                                                                                                                                                       |
| **CIA World Factbook** (via [factbook.json](https://github.com/factbook/factbook.json)) | Public domain                                   | Country area, on one methodology worldwide                                                                                            | In use for `data/countries.json`. **Retired February 2026**, so country area now has **no live source**: cia.gov no longer serves country pages and Wayback captured only the page shell. `factbook.json` still carries the final 2025 edition and is what to cite. A new country's area comes from there or from its own statistics office, and the two are not on one methodology                                                                                                                                                                            |
| **Eurostat** (`demo_gind`)                                                              | Free reuse (2011/833/EU)                        | Population on 1 January, incl. enlargement countries like Serbia                                                                      | In use for `data/countries.json`. Publishes **no area figure for Serbia**, which is why area comes from the Factbook throughout                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Eurostat** (`nama_10r_3gdp`)                                                          | Free reuse (2011/833/EU)                        | GDP per inhabitant by NUTS 3 region                                                                                                   | In use for `data/cities.json`. A NUTS 3 region is not always the city: `RO321` is exactly the Bucharest municipality, but `BG411` is Stolichna municipality, ~8% more people than Sofia town. Watch out for `BG412`, which is the rural Sofia _Province_, not the city                                                                                                                                                                                                                                                                                         |
| **Eurostat** (`prc_hicp_aind`, `INX_A_AVG`)                                             | Free reuse (2011/833/EU)                        | HICP annual average index, 2015 = 100                                                                                                 | In use for `data/deflators.json`, all five series. Eurostat marks this dataset **discontinued in favour of `prc_hicp_ainr`**; it still updates, but that is where `scripts/refresh-indices.ts` will have to point. Also carries a **US** series, which is _not_ the one in use: it is an HICP and the committed USD series is the BLS CPI-U, 106.80 against 109.2 for 2020, so the two must never be spliced                                                                                                                                                   |
| **Eurostat** (`sts_copi_a`, `COST`, `I15`)                                              | Free reuse (2011/833/EU)                        | Construction cost index, 2015 = 100: a second price basis for civil works                                                             | In use for `data/deflators-construction.json`. It matters: 1000 RON of 2013 restated into 2022 prices is 1303 on HICP and **1779** on this basis, because construction input costs ran far ahead of consumer prices in 2021-23. Two deliberate limits. The published series is **residential building work (CPA F41001)**, since Eurostat publishes no civil-engineering cost index for these countries. It covers **BGN, EUR and RON only**: Eurostat returns zeroes for Serbia and there is no US series. It also stops at 2022/2023 where HICP reaches 2025 |
| **ECB** euro reference rates (`EXR/A.<CUR>.EUR.SP00.A`)                                 | Free reuse with attribution                     | Annual average exchange rates against the euro                                                                                        | In use for `data/fx.json`. Publishes **no RSD series** (404), so the dinar comes from Eurostat `ert_bil_eur_a` instead; the two agree to 4 dp on every year for RON and USD, which is how that substitution was checked. RON is published already redenominated, so pre-2005 years need **no** ROL conversion                                                                                                                                                                                                                                                  |
| **TED** (`api.ted.europa.eu`)                                                           | Free reuse (EU Commission decision 2011/833/EU) | Contract durations, values and winners — **eForms notices only (2024+)**                                                              | Harvest with `scripts/fetch-ted-contracts.ts`, match with `scripts/match-ted-lots.ts`. The eForms cutover is a cliff, not a slope: of 900 Romanian notices from 2024 on, **893 carry a duration and 835 a winner**, while all 1200 from 2018-2022 carry neither and are titled only `Romania-Iași: Bridge renewal construction work`, with no project name to match on. Bulgaria's whole 2018-2022 harvest is the same, so it matches nothing at all                                                                                                           |
| `e-licitatie.ro`                                                                        | —                                               | National procurement                                                                                                                  | No open API (404)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `opentender.eu`                                                                         | —                                               | Procurement analytics                                                                                                                 | Blocks automated requests (403)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `data.gov.ro`                                                                           | Open                                            | Romanian government data                                                                                                              | No CNAIR procurement dataset                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

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

Fetches ways for the route from Overpass (with mirror failover/retries), then slices one feature per `--section` (`ref:fromLng,fromLat:toLng,toLat`) via **chainage projection** (`scripts/route-projection.ts`): vertices are projected onto a reference polyline built from the section endpoints, binned by distance along the route, and averaged — this collapses dual carriageways into a clean forward-only centerline and avoids zigzag slicing bugs. Give sections in route order; add `--via lng,lat` for big bends between section endpoints and `--max-lateral` (default 0.5°) to exclude strays. **Bulgarian motorways are tagged `ref="A 3"` with a space**, so `--ref A3` returns zero ways there and `--ref "A 3"` is what works; Romanian refs have no space. A run that fetches nothing is almost always this rather than a bad bounding box. `--also-construction` includes `highway=construction` ways; `--dry-run` inspects without writing; `--highway trunk` works for non-motorway routes; `--cache file` / `--from-cache file` saves raw ways so you can iterate on waypoints offline (Overpass is often busy).

OSM-derived geometry is **ODbL-licensed**: keep "© OpenStreetMap contributors" attribution (see the site footer) and add the OSM source entry to the project's `sources`.

### Adding a new project

1. Gather facts (dates, lengths, costs, contractors, funding) from public sources.
2. Bootstrap geometry with the script above (or hand-draw in [geojson.io](https://geojson.io)).
3. Write `data/projects/<cc>/<slug>.json` with `en` (and ideally `ro`) strings and `sources`.
4. `npm run data:validate && npm test`.

### Adding a country

The research is the work. A country is dozens of projects, each needing dates, lengths, costs and contractors from cited sources, and none of that can be generated. What _can_ be stated in advance is the fixed cost of entry: which reference series have to exist before a single cost in that country can be compared with the rest.

**Order of operations.** Reference tables first, because a project whose costs cannot be restated is half a project:

1. **Deflator series** in `data/deflators.json`, keyed by currency, from Eurostat `prc_hicp_aind`. Skip for a euro country, which already has one.
2. **FX series** in `data/fx.json`, from the ECB where it publishes the currency, otherwise Eurostat `ert_bil_eur_a`. Skip for a euro country.
3. **Country row** in `data/countries.json`: population from Eurostat `demo_gind`, area from `factbook.json` (see the source table: the Factbook is retired, so area has no live source).
4. **Outline**: `npx tsx scripts/fetch-country-outlines.ts <cc>`.
5. Then the projects, and `npm run data:validate` will tell you what is missing.

**Cost of entry, checked against the live endpoints on 2026-08-14** rather than assumed:

| Country                    | Deflator                | FX                              | Cost of entry                                                                                                                                                                                                                                                         |
| -------------------------- | ----------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Greece, Slovenia, Slovakia | euro                    | euro                            | **None.** HICP runs 1996-2025 for each. Greece looks the strongest first move: dense Wikipedia coverage, and `GRC` is already in the ISO3 map in `fetch-ted-contracts.ts`                                                                                             |
| Croatia                    | euro, but see below     | ECB `HRK` 2000-2022             | **One FX series.** Croatia joined the euro in 2023, so a cost from before that is in kuna and needs the HRK rate; the ECB publishes it for exactly 2000-2022                                                                                                          |
| Montenegro                 | HICP **2015-2025 only** | euro                            | **None**, but nothing before 2015 can be restated. Montenegro uses the euro without being in the euro area                                                                                                                                                            |
| Hungary, Poland, Czechia   | HICP 1996-2025          | ECB `HUF`/`PLN`/`CZK` 1999-2025 | **One deflator + one FX series each.** Both published, both complete                                                                                                                                                                                                  |
| North Macedonia            | HICP **2005-2025**      | Eurostat `MKD` 1999-2025        | One of each. The ECB publishes no denar rate, so FX comes from `ert_bil_eur_a`, the same substitution already documented for the dinar                                                                                                                                |
| Albania                    | HICP **2016-2025 only** | Eurostat `ALL` 1999-2025        | One of each, but a ten-year index is a real limit: most of Albania's motorway building predates it                                                                                                                                                                    |
| **Bosnia and Herzegovina** | **none published**      | Eurostat `BAM` 1999-2025        | **Blocked.** `prc_hicp_aind` returns an empty dataset for `geo=BA`, so a Bosnian cost could be converted to euro but never restated into another year's prices. It would show as recorded and drop out of every ranking, exactly like Serbia's outturn costs do today |

Two caveats that apply to the euro countries above and are not visible from the table:

- **The deflator table is keyed by currency, not by country**, so every euro cost is restated on the euro-area index. Greece is where that stops being a rounding error: Greek prices _fell_ 2.5% from 2013 to 2016 while euro-area prices rose 0.9%, and over 2010-2025 the two indices diverge by 11.8% (Greece ×1.2365, euro area ×1.3823). A Greek 2010 cost restated to 2025 on the euro-area index is overstated by that much. Adding Greece properly means either accepting the error and saying so, or keying the series by country as well as currency, which is a schema change.
- **Croatia needs an HRK deflator too**, not just the FX series: a 2013 kuna cost has to be restated within kuna before it is converted. Croatia's HICP (`geo=HR`, 1998-2025) is one series covering both currency eras, so it is one fetch, filed under `HRK`.

Everything in that table came from two requests, and both are worth repeating before committing to a country, since coverage changes:

```bash
curl -s "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_aind?format=JSON&unit=INX_A_AVG&coicop=CP00&sinceTimePeriod=1996&geo=MK&geo=AL&geo=BA"
curl -s "https://data-api.ecb.europa.eu/service/data/EXR/A.HRK+HUF+PLN.EUR.SP00.A?format=csvdata&startPeriod=1999&endPeriod=2026"
```

## Keeping the data honest

Five scripts that report rather than gate. None of them runs in `npm test` (they all touch the network, except the gap report), and none of them writes without being asked.

| Command                                                       | What it does                                                                                                                                                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsx scripts/report-gaps.ts`                              | Lists what the data is missing: costs, dates, contractors, funding, Romanian strings, price years outside the reference tables, implausible cost-per-km figures, expected openings that have passed |
| `npx tsx scripts/check-links.ts`                              | Requests every URL cited in `data/projects/**` and reports the dead ones                                                                                                                            |
| `npx tsx scripts/refresh-indices.ts`                          | Refetches `data/deflators.json` and `data/fx.json` from Eurostat and the ECB, and diffs them against what is committed                                                                              |
| `npx tsx scripts/fetch-osm-dates.ts --country ro --diff`      | Compares OSM date tags against the last snapshot taken                                                                                                                                              |
| `npx tsx scripts/match-ted-lots.ts --awards data/ted/ro.json` | Matches a TED harvest to lots and emits a review CSV                                                                                                                                                |

`.github/workflows/scheduled-checks.yml` runs the first, second and fourth weekly and keeps a single issue up to date. It never fails a run: it opens or edits one issue, and skips even that when the report is identical to last week's.

### News digest

`npm run data:news` reads the feeds in `data/news-sources.json` and the edit history of every Wikipedia article a project cites, matches each item to a section by the place names it shares (the TED matcher's weighting, through `src/lib/news.ts`), notes the event kind the wording suggests, and writes a Markdown digest of the last 14 days. `.github/workflows/news-digest.yml` runs it daily and keeps one issue (label `news-digest`) current, editing it only when the digest changed. The seen-state that makes "since the last run" possible lives in the Actions cache, or locally in the gitignored `data/news/`.

It is a report, like every harvester here. A match is a guess from shared toponyms and a suggested kind is a phrase match; nothing is written to `data/`. Read the article, then record the fact with the URL and the date you read it. Only feeds are read: a site without RSS or Atom is not scraped, which is why Bulgaria and Serbia are covered through Wikipedia histories alone for now (see the note in `data/news-sources.json` for what was tried).

### Gap report

```bash
npx tsx scripts/report-gaps.ts                          # table, worst first
npx tsx scripts/report-gaps.ts --summary                # counts per rule
npx tsx scripts/report-gaps.ts --format csv > gaps.csv  # the old data-gaps.csv columns, plus an id
npx tsx scripts/report-gaps.ts --format json --priority high
npx tsx scripts/report-gaps.ts --include-known          # settled dead ends too
```

`--priority` is a floor: `--priority medium` reports medium and high. The exit code is 0 whatever it finds, since every row is a research task and not a defect; only a malformed command line exits 2. The rules are pure functions in `src/lib/gaps.ts`, unit-tested there, and the script is a thin CLI over them.

Cost-per-km sanity bands are per category, in millions of euro per km of the cost's own price year. A railway project with a `city` key is banded as a metro: tunnelled urban metro runs 20 to 250 M EUR/km where a mainline rehabilitation runs 2 to 10, and one band for both would flag every mainline section.

**`data/known-gaps.json`** holds gaps researched to a dead end, each with an id, a reason and the date it was settled. The report hides them and prints a count; `--include-known` shows them. An id is `<country>/<project>/<lot>/<code>`, where a whole segment may be `*`, so `rs/*/*/opened-no-actual` covers every Serbian lot at once. That entry exists because Serbian outturn costs are genuinely unobtainable: `PayedAmount` is null on every public row of the procurement portal, and motorway and rail contracts run under intergovernmental agreements exempt from the Public Procurement Act, so they never enter it. Patterns that stop matching anything are reported, so a stale entry cannot sit there suppressing a gap that has since reappeared.

### Diffing a fetch against what is committed

`fetch-country-outlines.ts`, `fetch-ted-contracts.ts` and `fetch-osm-dates.ts` each take `--diff` (print added, removed and changed records, write nothing) and `--check` (the same, exiting 1 on any difference). A scheduled job can then raise a pull request instead of overwriting reviewed data.

```bash
npx tsx scripts/fetch-country-outlines.ts --check          # has Natural Earth moved a border?
npx tsx scripts/fetch-ted-contracts.ts --country BG --out data/ted/bg.json --diff
npx tsx scripts/fetch-osm-dates.ts --country ro --write    # snapshot the current tags
npx tsx scripts/fetch-osm-dates.ts --country ro --check    # has a mapper changed one since?
```

Country outlines are compared by shape summary and a geometry digest, not coordinate by coordinate. TED awards are keyed on the publication number. OSM dates are keyed on route, tag and value, and need a snapshot in `data/osm-dates/<cc>.json` first; that snapshot is a record of what OSM said, not data the site reads, and dates still get reviewed against a second source before they land in `data/projects`.

### Matching TED notices to lots

```bash
npx tsx scripts/fetch-ted-contracts.ts --country RO --out data/ted/ro.json --from 2024
npx tsx scripts/match-ted-lots.ts --awards data/ted/ro.json --format table --min high
npx tsx scripts/match-ted-lots.ts --awards data/ted/ro.json > ted-review.csv
```

The harvester's header has always called matching "a separate, reviewable step"; this is it. It emits candidates with a confidence, the place names behind the match and the fields the notice would fill in, and **writes nothing to `data/projects`**. A wrong match puts a cited figure on the wrong road, and nothing downstream would catch it.

Matching works on place names, because a notice title carries the same toponyms as a lot name: "AUTOSTRADA PLOIESTI-BUZAU LOT 1 Dumbrava-Mizil" against a lot called "Dumbrava (A3) – Mizil". Three things keep that honest:

- **Names are weighted by how many lots use them.** Lot names carry their corridor in brackets ("Poiana tunnel (A1 Pitești–Sibiu lot 3)"), so unweighted, every notice about the corridor outranks the one about the lot.
- **`high` requires a name no other lot uses.** Otherwise an A3 award reading "Autostrăzii Brașov – Târgu Mureș – Cluj – Oradea" comes back as a confident match for the A8 lot "Târgu Mureș – Ditrău", a different motorway.
- **The CPV label in the title gates the category.** Every TED title is `<country> – <CPV label> – <national title>`, and that label is the one part in English on every notice. It is what separates "Construction work for highways, roads" from "Road-repair works" on a corridor where both name the same towns, and it rejects a railway notice offered to a motorway lot.

**Expect little, and only from 2024 on.** The eForms cutover is a cliff, not a slope. Of 900 Romanian notices published from 2024, 893 carry a contract duration and 835 a winner. All 1200 harvested from 2018-2022 carry neither, and are titled only `Romania-Iași: Bridge renewal construction work`. The project is not named anywhere in the notice, so there is nothing to match on and no matcher can fix it. Bulgaria's entire 2018-2022 harvest is the same shape and matches nothing at all. This is why the contract terms in `data/projects` come from press and CNAIR reports.

Durations need the same care. Nearly half the notices state a number with no unit and a few state days, so `contractedMonths` passes an unstated unit through flagged uncertain and **refuses days outright** rather than dividing by thirty: a duration is the input to every slip figure.

### Refreshing the price indices and exchange rates

```bash
npx tsx scripts/refresh-indices.ts            # dry run: prints the diff
npx tsx scripts/refresh-indices.ts --write    # applies it, then run npm run data:validate
npx tsx scripts/refresh-indices.ts --only fx
```

Both files carry their query URLs in their own `sources` blocks, and this script issues exactly those: Eurostat `prc_hicp_aind` (`INX_A_AVG`, `CP00`) per reference area for the deflators, ECB `EXR/A.<CUR>.EUR.SP00.A` for the rates, and Eurostat `ert_bil_eur_a` for RSD, which the ECB does not publish. Values are rounded to the precision each table is kept at (2 decimals for the indices, 4 for the rates) before comparison, so a refetch does not churn the files.

Two things it refuses to do, both of which a naive refetch would get wrong:

- **The USD deflator is not refetched.** The committed series is the US CPI-U from BLS rebased to 2015 = 100. Eurostat does publish a US HICP, but it is a different index (106.80 against 109.2 for 2020), and splicing one onto the other would corrupt every dollar comparison.
- **Deliberately absent years stay absent.** The dinar's 1999 and 2000 rates are a frozen administered 11.735 RSD/EUR, not a rate anything could be converted at, and were excluded on purpose; the script drops them again and says so.

An annual average only exists once the year is over, so nothing can produce a 2026 figure during 2026. The costs priced in 2026 stay unrestatable until early 2027 whatever this script does, which is what the gap report's `no-deflator` and `no-fx` rows are recording. Note also that Eurostat marks `prc_hicp_aind` discontinued in favour of `prc_hicp_ainr`; the series still updates, but that replacement is where this will have to point eventually.

## Testing

Vitest covers the pure logic (`src/lib/*.test.ts`: schema rules, map filters, URL params, formatting, stats, timeline, filtering, geo helpers), the validators (`src/lib/validation/*.ts`), the geo algorithms (`scripts/fetch-osm-geometry.test.ts`), and a data-integrity test (`src/lib/validation/data-integrity.test.ts`) that re-validates all committed seed data. CI should run `npm test && npm run build`.

## Deployment

**This needs a server runtime.** It is not a static export: `src/proxy.ts` rewrites locale-prefixed routes and `src/app/api/feedback/route.ts` is a request handler, so `output: "export"` fails the build. Pages are still statically generated (SSG) and the data is baked in at build time; what cannot be dropped is the Node runtime in front of them.

The production site runs on Vercel (Hobby). Any host that runs the Next.js Node server works the same way; nothing at runtime depends on Vercel. Map tiles come from OpenFreeMap (free, no API key): swap `OPENFREEMAP_STYLE` in `src/lib/map-style.ts` to change basemaps.

### Vercel

Import the GitHub repository at [vercel.com/new](https://vercel.com/new); the framework is detected and `npm run build` runs `prebuild`, which regenerates `public/data`. The repository carries the settings that matter:

- `vercel.json` pins the install command to `npm ci` (the lockfile is exact, see `CONTRIBUTING.md`) and the function region to `fra1` (Frankfurt). `src/proxy.ts` runs on every HTML request, so the region decides the round trip for readers in Romania, Bulgaria and Serbia; the default is in the US.
- `package.json` `engines.node` selects Node 22, the version CI builds with. Node 24 ships npm 11, which writes the lockfile in a form npm 10 rejects (see `CONTRIBUTING.md`); one npm on every machine that touches it avoids that.
- Every dynamic segment sets `dynamicParams = false`: an unknown project, country, city or contractor id is a 404 from the static set, never an on-demand render.

Environment variables, set in the project's settings for Production (and Preview if you want previews to match):

| Variable               | Purpose                                                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL` | Canonical origin, e.g. `https://example.org`, no trailing slash. Read at build time by `src/lib/seo.ts` for canonicals, hreflang, the sitemap and robots. Without it Vercel's production URL is used, which is fine until a custom domain exists. |
| `FEEDBACK_WEBHOOK_URL` | Where `/api/feedback` forwards submissions. Production answers 503 without it.                                                                                                                                                                    |

Custom domain: add it under Domains in the project settings and point DNS at Vercel (A record for the apex, CNAME for `www`), then set `NEXT_PUBLIC_SITE_URL` to it and redeploy so the baked-in URLs change. Register the domain with a registrar independent of the host; DNS is the only part of a move that is not a redeploy.

Moving elsewhere: `next start` is the reference runtime, so a container needs only `output: "standalone"` in `next.config.ts` and a Dockerfile, plus the two variables above. `NEXT_PUBLIC_SITE_URL` is inlined at build, so it must be a build argument, not a runtime setting.
