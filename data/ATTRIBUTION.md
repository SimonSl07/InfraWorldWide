# Sources and the credit each one asks for

Every figure in this dataset was transcribed from a public source, and every
file names its own in a `sources` block, down to the individual lot. This page
is the summary: who the sources are, what their terms are, and the notice each
one wants from anyone who reuses the data. `LICENSE` in this folder says which
licence covers which path.

| Source                              | Terms                                  | What it provides here                                                    |
| ----------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| OpenStreetMap, via Overpass         | ODbL 1.0                               | All route geometry under `geo/ro`, `geo/bg`, `geo/rs`, and opening dates cross-checked against OSM tags |
| Natural Earth 1:50m admin-0         | Public domain                          | The country outlines under `geo/countries`                                |
| CIA World Factbook, via factbook.json | Public domain                        | Country area in `countries.json`                                          |
| Eurostat                            | Reuse authorised with acknowledgement, Commission Decision 2011/833/EU | Population (`demo_gind`), regional GDP per inhabitant (`nama_10r_3gdp`), consumer prices (`prc_hicp_aind`), construction costs (`sts_copi_a`), dinar exchange rates (`ert_bil_eur_a`) |
| European Central Bank Data Portal   | Free reuse, ECB cited as the source    | Annual average euro reference rates (`EXR`) in `fx.json`                  |
| U.S. Bureau of Labor Statistics, via FRED | Public domain                    | The US consumer price series in `deflators.json`                          |
| National statistical offices        | Free reuse with acknowledgement        | City populations from the 2021 census round, Romania and Bulgaria         |
| Wikipedia, English, Romanian and Bulgarian | CC BY-SA 4.0                    | Facts only: dates, lengths, contractors, cost breakdowns                  |
| Road and rail operators, ministries, development banks | Their own site terms | Contract awards, openings, funding decisions, cited per project           |
| Press                               | Their own site terms                   | Award and opening reports, cited per project                              |
| OpenFreeMap and OpenMapTiles        | ODbL for the underlying OSM data       | The basemap the site renders. Not part of this dataset                    |

## The notices

Reusing the **route geometry** obliges you to two things, and they are not
optional: carry a visible credit, and keep any altered geometry under ODbL.

    © OpenStreetMap contributors, ODbL

Reusing the **curated records and tables** obliges you to credit the source and
say if you changed anything.

    Data from InfraWorldWide (https://infraworldwide.com), CC BY 4.0

**Eurostat** asks to be acknowledged as the source and for changes to be
indicated. Figures here are used as published, except that costs shown in real
terms are deflated by the app at render time, which is a change to the derived
figure and never to the published index.

**The European Central Bank** asks to be cited as the source. The reference
rates are used as published, at annual frequency, with no recalculation.

**Wikipedia** is CC BY-SA, which protects the wording and the arrangement of an
article, not the figures in it. Descriptions in this dataset are written from
the facts, never lifted or translated from an article, so nothing here is a
derivative of CC BY-SA text. `../CONTRIBUTING.md` holds contributors to the
same line.

## What none of this covers

A date, a length, a cost or a contractor name is a fact, and facts belong to
nobody. Anyone may restate them. What the licences in this folder cover is the
work of collecting, checking and arranging them, and the sentences written
around them.
