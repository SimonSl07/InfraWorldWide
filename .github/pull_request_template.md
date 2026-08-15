## What this changes

<!-- One or two sentences. -->

## Checks

- [ ] `npm run data:validate` passes
- [ ] `npm test` passes
- [ ] `npm run lint` and `npm run typecheck` pass

## If this touches `data/`

- [ ] Every new figure has a source in the project's `sources`
- [ ] Costs are in **millions**, with the **price year** they were quoted in
- [ ] Geometry drawn length matches the recorded `lengthKm` (validation checks this)
- [ ] Geometry bootstrapped from Overpass carries its OpenStreetMap source entry (ODbL)
- [ ] Nothing was guessed to fill a required field. Unknown figures are omitted

## If this touches the UI

- [ ] New strings are in **both** `messages/en.json` and `messages/ro.json`
- [ ] No em dashes; en dashes in route names preserved
- [ ] New pure logic lives in `src/lib` with a test next to it
