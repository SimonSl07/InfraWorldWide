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
