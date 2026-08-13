<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# InfraWorldWide project rules

## What this is

InfraWorldWide — a static Next.js app mapping world infrastructure projects (highways, railways, bridges, tunnels) with time-travel. No backend: curated JSON data in the repo is validated and compiled to `public/data` at build time.

## Commands

- `npm run dev` / `npm run build` — both regenerate `public/data` first (pre hooks)
- `npm test` — Vitest; always run after changing `src/lib`, `scripts`, or `data/`
- `npm run data:validate` — fast schema + geometry cross-check of `data/projects/**`

## Conventions

- **Data-first**: facts (dates, costs, contractors) must come from cited public sources; every project has `sources`. Don't invent figures — omit optional fields instead. `cost.amount` is in MILLIONS.
- **Pure logic in `src/lib`**, React only wires it up — new logic gets a Vitest file next to it (TDD preferred).
- Schema changes: edit `src/lib/schema.ts`, update `scripts/build-data.ts` flattening if the map needs it, add/extend tests, extend seed data.
- i18n: every UI string goes in `messages/en.json` AND `messages/ro.json`; project data carries per-locale fields.
- Geometry is ODbL (OSM-derived) — attribution in footer + project sources is mandatory.
- Locale routes live under `src/app/[lang]`; navigation must use `@/i18n/navigation` (not next/link) so locale prefixes are kept.
- Avoid `useSearchParams` outside Suspense boundaries (it forces CSR bailout and breaks SSG of the whole page).
- A project with a `city` key is excluded from the main map and appears only on that city's page. City work is invisible at country zoom and buries the motorway network under it.
- A lot with `sharedWith` is track another project already owns (two metro lines through-running one tunnel). It counts toward its own line's length and is excluded from **every total that spans projects**. This is how operators report it: Sofia's four lines sum to 66.5 km against a 55.0 km system, and Bucharest breaks out M3's "8.67 km (M1 shared section)". Add the filter to any new aggregate.
- Costs are compared by deflating within the currency **first**, then converting to euro at that year's rate. Converting first mixes inflation and currency movement. Either step may refuse; a figure that cannot be restated is shown as recorded and dropped from rankings, never guessed.

## Writing style (user-facing text)

Applies to `messages/*.json`, page copy, and every `description` / `note` field in `data/`.

- **No em dashes (—, U+2014).** Use a full stop, comma, colon or brackets instead.
- **En dashes (–, U+2013) are correct and must be preserved** in ranges and route names: `Sebeș–Turda`, `Râul Doamnei – Eroilor`, `2013–2016`. They are part of the name; changing one corrupts it.
- Short and factual over long and padded. Cut any sentence carrying no figure, date, name or caveat.
- Avoid the AI register: "serves as", "plays a crucial role", "boasts", "stands as a testament", triads of adjectives, sentences restating their own first clause.
- Don't editorialise about whether a project is good or late unless a recorded fact says so.

## MapLibre paint expressions

Only **one** zoom-dependent `interpolate` per expression, and it must be **outermost**. Nesting one inside a `case` type-checks fine and makes MapLibre silently drop the entire layer, with no error. Build such expressions in `src/lib/map-style.ts` and validate them in `map-style.test.ts` against the real style spec (`createPropertyExpression`), which is the only thing that catches this.
