# Contributing

Everything on the map is a cited fact. That single rule decides most of what follows: if a figure has no public source, it does not go in, and the field is left out rather than filled with an estimate. A missing cost is a research task the gap report will keep reminding you about. A wrong cost is a number someone will quote.

## Before you start

```bash
npm install
npm run dev          # regenerates public/data, then serves on :3000
npm test             # unit tests + a re-validation of every committed file
npm run data:validate
```

Node 22 or newer. There is no database and no API key: the data is JSON in the repo.

## What to work on

`npm run data:gaps` prints the open research tasks, worst first, straight from the committed data.

```bash
npm run data:gaps -- --summary                  # counts per rule
npm run data:gaps -- --priority high            # the ones that block rankings
npm run data:gaps -- --format csv > gaps.csv
```

A `high` row is usually a missing cost or an opened lot with no construction start. A `low` row is usually a missing Romanian string, which needs no research at all and is a good first change.

Two things that are **not** open tasks:

- Anything in `data/known-gaps.json`. Those are researched dead ends, each with a reason and a date, and the report hides them. Serbian outturn costs are the standing example: they are not published anywhere, and the entry says why. If you find a source that proves an entry wrong, delete the entry in the same change.
- Anything under `## Serbia data gaps` or similar notes in the README about data that is deliberately absent.

## Adding or editing project data

1. **Find the sources first.** Romanian-language Wikipedia is consistently richer than English for per-lot contractors, contract months and award dates. Then national road authority reports, then trade press. Every project needs `sources`, and a project resting on one source is flagged.
2. **Write the file** at `data/projects/<cc>/<slug>.json`. Add a `$schema` key pointing at `schema/project.schema.json` and your editor will validate as you type.
3. **Geometry** comes from OpenStreetMap via `scripts/fetch-osm-geometry.ts` (see the README). It is ODbL, so the OSM attribution in the footer and an OSM entry in the project's `sources` are both mandatory.
4. **Validate**: `npm run data:validate && npm test`.

### Facts, and how to leave one out

- `cost.amount` is in **millions**. Getting this wrong by a factor of a million still validates, so check it twice against the source.
- A cost needs a **price year**. Without one it cannot be restated or converted, and it drops out of every ranking. Recording the figure with no year is allowed and honest; inventing the year is not.
- A figure that covers a whole programme rather than one lot carries `scope: "programme"`, and one covering only design or only land carries `design` or `land`. This is what keeps a 112 km design-build total from being ranked as the cost of a 9 km sector.
- **Never invent a deadline.** `dates.expectedOpening` is for a date a source states. Everything else is derived from the contract terms and labelled as derived.
- Dates run in the order they happen. A construction start before its own tender award fails validation, because it usually means two procurements were merged into one record.

## Adding a country

Read the "Adding a country" section of the README first: it lists the reference series each candidate country needs, checked against the live Eurostat and ECB endpoints, and it names the one country that is currently blocked (Bosnia and Herzegovina publishes no HICP series, so its costs could never be restated).

The short version: reference tables first (deflator, FX, country row, outline), projects second.

## Writing style

This applies to `messages/*.json`, page copy, and every `description` and `note` in `data/`.

- **No em dashes.** A full stop, a comma, a colon or brackets instead.
- **En dashes are correct in ranges and route names** and must be preserved: `Sebeș–Turda`, `Râul Doamnei – Eroilor`, `2013–2016`. The dash is part of the name; changing it corrupts it.
- Short and factual. Cut any sentence carrying no figure, date, name or caveat.
- Avoid the AI register: "serves as", "plays a crucial role", "boasts", "stands as a testament", triads of adjectives, sentences that restate their own first clause.
- Do not editorialise about whether a project is late or good value unless a recorded fact says so.
- Every UI string goes in **both** `messages/en.json` and `messages/ro.json`.

## Code

- **Pure logic in `src/lib`**, with a Vitest file beside it. React wires it up and holds no rules of its own. Tests first is the norm here, and it is why the gap rules and the TED matcher could be changed with confidence.
- **Schema changes** mean editing `src/lib/schema.ts`, running `npm run data:schema`, updating `scripts/build-data.ts` if the map needs the new field, and extending the tests. CI fails if the emitted schemas drift.
- **Navigation** uses `@/i18n/navigation`, never `next/link`, so the locale prefix survives.
- **Avoid `useSearchParams` outside a Suspense boundary.** It forces a client-side bailout and takes the whole page's static generation with it.
- **MapLibre paint expressions**: only one zoom-dependent `interpolate` per expression, and it must be outermost. Nesting one inside a `case` type-checks and then makes MapLibre drop the entire layer with no error. Build these in `src/lib/map-style.ts`, where `map-style.test.ts` validates them against the real style spec, which is the only thing that catches it.

## Aggregates

**Every total that spans projects must call `countsTowardNetwork(lot)`** from `src/lib/schema.ts`. Two different pointers mean a lot's kilometres are already counted somewhere else, and a new aggregate has to apply both:

- `sharedWith` is track another project owns. Sofia's four lines sum to 66.5 km against a 55.0 km system for exactly this reason.
- `partOf` is a structure sitting inside a section its parent already measures. `ro-tunnels` holds 11 structures on the A1, A3 and A8.

A lot's own project always counts it in full. This is only about sums that cross project boundaries.

Forgetting one is the most repeated bug in this codebase: the homepage overstated the network by 38.11 km, then by another 23.27 km when `partOf` arrived and nothing read it. `src/lib/network-totals.test.ts` states the rule once and every aggregate answers to it there. **Add a case to that file when you add an aggregate.**

One more that is easy to miss: a project with a `city` key is off the main map and on that city's page only.

## Scripts that touch the network

None of them run in `npm test`, and none write without being asked.

| Script                      | Writes?                                                              |
| --------------------------- | -------------------------------------------------------------------- |
| `report-gaps.ts`            | No. Exit code is always 0: a gap is a task, not a defect             |
| `check-links.ts`            | No                                                                   |
| `refresh-indices.ts`        | Only with `--write`, and it refuses to invent values                 |
| `fetch-osm-dates.ts`        | Only with `--write`, to a snapshot it never reads back into the site |
| `fetch-country-outlines.ts` | Yes, but `--diff` and `--check` compare instead                      |
| `fetch-ted-contracts.ts`    | Yes, to its `--out` file; `--diff` and `--check` compare instead     |
| `match-ted-lots.ts`         | No. It emits candidates for a person to accept                       |

`.github/workflows/scheduled-checks.yml` runs the gap report, the link check and the OSM date diff weekly, and keeps one issue up to date. It never fails a run.

## Pull requests

- One project, one country or one fix per pull request.
- Say where each new figure came from. A link in the PR body is enough; the citation itself belongs in the data file.
- `npm test`, `npm run lint` and `npx tsc --noEmit` all pass.
- If you changed anything under `src/lib`, `scripts` or `data`, run `npm test` again after rebasing: the data-integrity test (`src/lib/validation/data-integrity.test.ts`) re-validates every committed file and catches cross-file breakage that a unit test cannot.
