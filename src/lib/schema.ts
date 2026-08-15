import { z } from "zod";

/**
 * Core data model for InfraWorldWide.
 *
 * A Project is a logical infrastructure endeavour (e.g. "A3 motorway").
 * It is built/opened in Lots — sections with their own status, dates,
 * costs, contractors and geometry. Geometry lives in separate GeoJSON
 * files (data/geo/<country>/<project>.geojson) and is joined at build
 * time via Lot.geometryRef.
 */

/**
 * Prose in one or more locales. English is required and is the last resort
 * of every fallback chain; any other locale key is accepted.
 *
 * The keys are open rather than an explicit list because the runtime
 * resolver (`localized()`) already walks an ordered chain such as
 * `ro-MD -> ro -> en`, and an explicit list would make the *type* the thing
 * that blocks a third locale. The cost is that a typo like `rp` is a
 * well-formed key here; `catchall` at least means it must still hold a
 * non-empty string, and data:validate rejects any locale key that has no
 * matching file in messages/, which is the check that actually catches the
 * typo. Shape is a schema question, vocabulary is a data question.
 */
export const localizedStringSchema = z
  .object({ en: z.string().min(1) })
  .catchall(z.string().min(1));
export type LocalizedString = z.infer<typeof localizedStringSchema>;

export const categorySchema = z.enum(["highway", "railway", "bridge", "tunnel"]);
export type Category = z.infer<typeof categorySchema>;

export const statusSchema = z.enum([
  "planned",
  "tendered",
  "under_construction",
  "opened",
  "cancelled",
]);
export type Status = z.infer<typeof statusSchema>;

/** ISO date, allowing year-only ("2012") and year-month ("2012-06"). */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}(-\d{2})?(-\d{2})?$/, "expected YYYY, YYYY-MM or YYYY-MM-DD");

/**
 * What a figure covers. Absent means the whole of whatever it is attached to
 * (a lot's cost is that lot's cost). Naming the scope keeps a works-only or
 * whole-programme figure out of comparisons that assume a total, which is
 * how a partial outturn ends up ranked as an implausibly cheap section.
 */
export const moneyScopeSchema = z.enum([
  "works",
  "design",
  "land",
  "total",
  "programme",
]);
export type MoneyScope = z.infer<typeof moneyScopeSchema>;

/** How firm the figure is. Absent means an ordinary sourced figure. */
export const moneyConfidenceSchema = z.enum([
  "reported",
  "estimated",
  "disputed",
]);
export type MoneyConfidence = z.infer<typeof moneyConfidenceSchema>;

export const moneySchema = z.object({
  /** Amount in MILLIONS of the currency unit (500 EUR = €500M). */
  amount: z.number().positive(),
  currency: z.string().length(3),
  /**
   * Price year. Optional, because a sourced figure whose price year the
   * source never states is still a fact worth recording, and requiring the
   * field only meant such figures were dropped on the floor. A figure
   * without a year is shown as recorded and never deflated, converted or
   * ranked — see `isComparableMoney`.
   */
  year: z.number().int().min(1900).max(2100).optional(),
  scope: moneyScopeSchema.optional(),
  confidence: moneyConfidenceSchema.optional(),
  /** What the figure does and does not include, in the source's terms. */
  note: z.string().min(1).optional(),
});
export type Money = z.infer<typeof moneySchema>;

/**
 * Whether a figure may enter a comparison.
 *
 * Restating a cost needs a price year (deflate within the currency, then
 * convert at that year's rate). A figure without one cannot be put on the
 * common axis, and a programme figure is not the cost of any one lot, so
 * neither belongs in a ranking. Both are still shown as recorded.
 */
export function isComparableMoney(money: Money): boolean {
  return money.year !== undefined && money.scope !== "programme";
}

export const fundingSchema = z.object({
  source: z.enum(["EU", "national_budget", "ppp", "loan", "other"]),
  detail: localizedStringSchema.optional(),
  /**
   * Key into data/programmes.json. The five `source` buckets say where the
   * money came from in the broadest sense; the instrument that actually
   * carries conditions and deadlines (PNRR, ISPA, a MIGA guarantee) was
   * only ever named in `detail` prose, where nothing could aggregate it.
   */
  programme: z.string().regex(/^[a-z0-9-]+$/).optional(),
  /** Share of the cost this source carries, as a fraction: 0.85 = 85%. */
  coFinancingRate: z.number().min(0).max(1).optional(),
  /** The amount this source contributes, when a figure is published. */
  amount: moneySchema.optional(),
  /**
   * Date the money has to be absorbed by. PNRR's is the reason the time
   * slider can answer "how much of this opens before the deadline".
   */
  deadline: dateStringSchema.optional(),
});
export type Funding = z.infer<typeof fundingSchema>;

export const contractorSchema = z.object({
  name: z.string().min(1),
  role: z.enum(["builder", "designer", "concessionaire"]).optional(),
});
export type Contractor = z.infer<typeof contractorSchema>;

/**
 * Public-contract terms as published in the award (design/execution months,
 * contract value, reference to the notice). Used to explain where an
 * `expectedOpening` estimate comes from.
 */
export const contractSchema = z
  .object({
    /** Contracted design (proiectare) duration in months. */
    designMonths: z.number().int().positive().optional(),
    /** Contracted execution (execuție) duration in months. */
    executionMonths: z.number().int().positive().optional(),
    /** Total contract duration in months, when stated as a single figure. */
    totalMonths: z.number().int().positive().optional(),
    /** Guarantee/warranty period in months. */
    guaranteeMonths: z.number().int().positive().optional(),
    /** Awarded contract value (amount in MILLIONS, as elsewhere). */
    value: moneySchema.optional(),
    /** Procurement notice reference, e.g. a TED publication number. */
    noticeReference: z.string().min(1).optional(),
    /** Link to the contract award notice or the report documenting it. */
    noticeUrl: z.url().optional(),
  })
  .superRefine((contract, ctx) => {
    // A contract block is load-bearing: contractBaseline, computeSlip and
    // the time slider's derived expectedOpening all key off it, and every
    // "N lots have contract terms" figure counts it. A block holding only a
    // notice reference proves no term at all, so prose goes to lot.note and
    // the link goes to lot.sources instead.
    if (!hasContractTerms(contract)) {
      ctx.addIssue({
        code: "custom",
        message:
          "contract needs at least one term (designMonths, executionMonths, totalMonths, guaranteeMonths or value); put prose in lot.note and links in lot.sources",
      });
    }
  });
export type Contract = z.infer<typeof contractSchema>;

/** Whether a contract block states any term a baseline can be built from. */
export function hasContractTerms(contract: {
  designMonths?: number;
  executionMonths?: number;
  totalMonths?: number;
  guaranteeMonths?: number;
  value?: unknown;
}): boolean {
  return (
    contract.designMonths !== undefined ||
    contract.executionMonths !== undefined ||
    contract.totalMonths !== undefined ||
    contract.guaranteeMonths !== undefined ||
    contract.value !== undefined
  );
}

export const sourceSchema = z.object({
  /**
   * Stable key a lot can point at with `sourceRefs`. Optional: a source that
   * backs the project as a whole needs no key. Set one instead of encoding
   * the relation into the title, which is what "hotnews.ro: bacau-bypass
   * (contract.totalMonths)" was doing.
   */
  id: z.string().regex(/^[a-z0-9-]+$/).optional(),
  title: z.string().min(1),
  url: z.url(),
  /**
   * Date the URL was last read. A cited page is a claim about what was
   * published at a moment, and this dataset already outlived one source that
   * went offline in February 2026. Optional, because a retrieval date cannot
   * be reconstructed for an entry someone else added.
   */
  retrievedOn: dateStringSchema.optional(),
  /** Archived copy, for when the original stops resolving. */
  archiveUrl: z.url().optional(),
});
export type Source = z.infer<typeof sourceSchema>;

/**
 * A dated point in a lot's cost record.
 *
 * A real cost is a chain, not a pair: the tender estimate, the awarded sum,
 * each addendum, the revised budget, the settlement. Collapsing it to
 * `estimated` and `actual` lost the dates, and only 3 of 212 lots ever
 * carried both, so the overrun rankings ran on three rows. A revision is
 * only worth recording when a source gives the figure *and* when it was
 * struck, which is why `date` is required here and optional nowhere.
 */
export const costRevisionSchema = z.object({
  kind: z.enum(["estimate", "award", "addendum", "revised_budget", "outturn"]),
  money: moneySchema,
  date: dateStringSchema,
  note: z.string().min(1).optional(),
  /** Id of a project source that states this figure. */
  sourceRef: z.string().min(1).optional(),
});
export type CostRevision = z.infer<typeof costRevisionSchema>;

export const lotCostSchema = z.object({
  estimated: moneySchema.optional(),
  actual: moneySchema.optional(),
  revisions: z.array(costRevisionSchema).optional(),
});
export type LotCost = z.infer<typeof lotCostSchema>;

/**
 * Physical character of a section, and how much of it was actually built.
 *
 * Nominal cost per km spans 24x inside `highway` alone, from 1.8M EUR/km
 * across the Bărăgan plain to 44.1M across the Carpathians, and nothing in
 * the data distinguished the two. `works` matters separately: three rail
 * modernisations are otherwise ranked per km against greenfield motorway.
 * Every field is optional and must come from a cited statement, because a
 * guessed terrain class is worse than an absent one.
 */
export const lotProfileSchema = z.object({
  terrain: z.enum(["plain", "hilly", "mountain"]).optional(),
  works: z
    .enum(["greenfield", "upgrade", "rehabilitation", "reconstruction"])
    .optional(),
  viaductKm: z.number().nonnegative().optional(),
  tunnelKm: z.number().nonnegative().optional(),
  bridgeCount: z.number().int().nonnegative().optional(),
  /** Highway: total lanes across both carriageways. */
  lanes: z.number().int().positive().optional(),
  designSpeedKmh: z.number().int().positive().optional(),
  tolled: z.boolean().optional(),
  /** Rail: line speed the upgrade is built for. */
  maxSpeedKmh: z.number().int().positive().optional(),
  electrified: z.boolean().optional(),
  tracks: z.number().int().positive().optional(),
  /** Stations or metro stops on the section, for cost per station. */
  stationCount: z.number().int().nonnegative().optional(),
});
export type LotProfile = z.infer<typeof lotProfileSchema>;

/**
 * One dated thing that happened to a lot.
 *
 * `status` is a single word standing in for a history, and the history is
 * what the sources actually record. Comarnic–Brașov was `tendered` with a
 * construction start date while 6.3 km of it had been open since December
 * 2020, and two cancelled procurements lived only in prose, which is why no
 * lot in 212 was ever `cancelled` and the UI's cancelled badge was
 * unreachable. Events are additive: `status` stays authoritative and the
 * validator warns when the two disagree.
 */
export const lotEventSchema = z.object({
  kind: z.enum([
    "announced",
    "tender_launched",
    "tender_cancelled",
    "awarded",
    "contract_terminated",
    "construction_start",
    "suspended",
    "resumed",
    "partial_opening",
    "opened",
    "litigation",
  ]),
  date: dateStringSchema,
  /** What happened, in the source's terms. Prose, so localized. */
  note: localizedStringSchema.optional(),
  /** Id of a project source that states this event. */
  sourceRef: z.string().min(1).optional(),
});
export type LotEvent = z.infer<typeof lotEventSchema>;

/** Status each event kind implies, or null when it says nothing about status. */
const EVENT_STATUS: Partial<Record<LotEvent["kind"], Status>> = {
  announced: "planned",
  tender_launched: "tendered",
  tender_cancelled: "cancelled",
  awarded: "tendered",
  contract_terminated: "cancelled",
  construction_start: "under_construction",
  suspended: "under_construction",
  resumed: "under_construction",
  opened: "opened",
};

/**
 * The status a history implies: the last event that carries status meaning.
 *
 * `partial_opening` deliberately says nothing. A lot with part of it in
 * service is still being built, and treating it as opened is exactly the
 * error that drew 58 km of open motorway over a tendered road. A lot whose
 * opening is genuinely partial should be split instead.
 */
export function statusFromEvents(
  events: Array<{ kind: LotEvent["kind"]; date: string }>,
): Status | null {
  let status: Status | null = null;
  for (const event of events) {
    status = EVENT_STATUS[event.kind] ?? status;
  }
  return status;
}

export const lotSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: localizedStringSchema,
    status: statusSchema,
    dates: z
      .object({
        announced: dateStringSchema.optional(),
        tenderAwarded: dateStringSchema.optional(),
        constructionStart: dateStringSchema.optional(),
        opened: dateStringSchema.optional(),
        /** Announced/expected opening for lots not yet opened. */
        expectedOpening: dateStringSchema.optional(),
      })
      .optional(),
    lengthKm: z.number().positive(),
    cost: lotCostSchema.optional(),
    profile: lotProfileSchema.optional(),
    /** Dated history, oldest first. See lotEventSchema. */
    events: z.array(lotEventSchema).optional(),
    funding: z.array(fundingSchema).optional(),
    contractors: z.array(contractorSchema).optional(),
    contract: contractSchema.optional(),
    /**
     * Set when this lot's physical track is already a lot of another
     * project, naming the project that owns it.
     *
     * Two metro lines that through-run the same tunnel each list it, because
     * each line really is that long. A network total must still count the
     * track once, which is how the operators report it: Sofia's four lines
     * sum to 66.5 km against a 55.0 km system, and Bucharest breaks out
     * M3's "8.67 km (M1 shared section)" for exactly this reason. So a
     * shared lot counts toward its own project's length and is excluded from
     * every total that spans projects.
     */
    sharedWith: z.string().regex(/^[a-z]{2}-[a-z0-9-]+$/).optional(),
    /**
     * The project whose section physically contains this lot's works.
     *
     * `ro-tunnels` is a container of 11 structures that sit inside A1, A3
     * and A8 sections; without a link, the A1's cost per km excludes the
     * tunnels that are the reason its mountain crossing is expensive. It is
     * deliberately on the lot rather than the project, because the parent
     * differs lot by lot: six of those tunnels are on the A1, two on the
     * A8, one on the A3, and two are on national roads this dataset does
     * not cover at all, so a single project-level parent would be false for
     * most of them.
     *
     * Like `sharedWith`, this is an exclusion marker: the lot counts toward
     * its own project and must be dropped from every total that spans
     * projects, or its length and cost are counted twice.
     */
    partOf: z.string().regex(/^[a-z]{2}-[a-z0-9-]+$/).optional(),
    /**
     * Prose about this lot: what the section is, how its boundaries were
     * drawn, history a date field cannot hold. Localized, because it is
     * rendered to the reader. This is where 127 lots' worth of free text
     * lived before, inside `contract.noticeReference`, which the schema
     * documents as a TED publication number.
     */
    note: localizedStringSchema.optional(),
    /** Sources that back this lot specifically, beyond the project's own. */
    sources: z.array(sourceSchema).optional(),
    /**
     * Ids of project-level sources that back this lot. The machine-readable
     * form of what "hotnews.ro: bacau-bypass (contract.totalMonths)" was
     * saying in prose.
     */
    sourceRefs: z.array(z.string().min(1)).optional(),
    /** Key of a feature's properties.geometryRef in the project's GeoJSON file. */
    geometryRef: z.string().min(1),
  })
  .superRefine((lot, ctx) => {
    if (lot.status === "opened" && !lot.dates?.opened) {
      ctx.addIssue({
        code: "custom",
        message: `lot "${lot.id}": status "opened" requires dates.opened`,
      });
    }
    // A history that is not in order does not read as one, and "the last
    // event that carries status meaning" would depend on file order.
    const events = lot.events ?? [];
    for (let i = 1; i < events.length; i++) {
      if (events[i].date < events[i - 1].date) {
        ctx.addIssue({
          code: "custom",
          message: `lot "${lot.id}": events must be in date order, but ${events[i].kind} (${events[i].date}) follows ${events[i - 1].kind} (${events[i - 1].date})`,
        });
      }
    }

    // A structure cannot be longer than the thing it is part of. Catches a
    // metres-for-kilometres slip, which otherwise reads as a plausible number.
    for (const field of ["viaductKm", "tunnelKm"] as const) {
      const value = lot.profile?.[field];
      if (value !== undefined && value > lot.lengthKm) {
        ctx.addIssue({
          code: "custom",
          message: `lot "${lot.id}": profile.${field} (${value}) exceeds lengthKm (${lot.lengthKm})`,
        });
      }
    }
  });
export type Lot = z.infer<typeof lotSchema>;

/** Newest revision of one kind, by date. */
function newestRevision(
  cost: LotCost | undefined,
  kind: CostRevision["kind"],
): Money | null {
  const matching = (cost?.revisions ?? []).filter((r) => r.kind === kind);
  if (matching.length === 0) return null;
  return matching.reduce((a, b) => (b.date > a.date ? b : a)).money;
}

/**
 * The tender estimate, as a derived view over the revision chain.
 *
 * An explicit `cost.estimated` still wins: it is what the existing data
 * carries, and back-compat is the whole reason both forms exist.
 */
export function lotEstimatedCost(lot: {
  cost?: LotCost;
}): Money | null {
  return lot.cost?.estimated ?? newestRevision(lot.cost, "estimate");
}

/**
 * The outturn, as a derived view. A revised budget is not an outturn: it is
 * what the job was expected to cost after a re-plan, so it never stands in
 * for money actually spent.
 */
export function lotActualCost(lot: { cost?: LotCost }): Money | null {
  return lot.cost?.actual ?? newestRevision(lot.cost, "outturn");
}


export const projectSchema = z.object({
  /** "<country>-<slug>", e.g. "ro-a3". */
  id: z.string().regex(/^[a-z]{2}-[a-z0-9-]+$/),
  /** ISO 3166-1 alpha-2, lowercase. */
  country: z.string().length(2),
  /**
   * City this project belongs to, keyed into data/cities.json. Setting it
   * moves the project off the main map entirely and onto that city's own
   * view: a metro line drawn at country zoom is a smudge that buries the
   * motorway network under it.
   */
  city: z.string().regex(/^[a-z]{2}-[a-z0-9-]+$/).optional(),
  category: categorySchema,
  name: localizedStringSchema,
  description: localizedStringSchema,
  lots: z.array(lotSchema).min(1),
  /**
   * Transport corridors this project is part of, keyed into
   * data/corridors.json. Membership is only ever recorded where the
   * project's own cited text states it: a corridor is a designation, not a
   * geographic fact, and inferring it from a map would invent policy.
   */
  corridors: z.array(z.string().regex(/^[a-z0-9-]+$/)).optional(),
  /** Procuring authority, keyed into data/operators.json. */
  operator: z.string().regex(/^[a-z0-9-]+$/).optional(),
  /**
   * Stations on the line as a whole, which is the figure the sources give.
   * Deliberately not on the lot: every metro description publishes a line
   * total ("23.0 km with 20 stations") and splitting it across lots would
   * be arithmetic no source supports. Enough for cost per station at
   * project level, which is the standard metro benchmark.
   */
  stationCount: z.number().int().nonnegative().optional(),
  /**
   * A figure for the endeavour as a whole, where the source gives one and
   * does not break it out per lot. The A5 Morava Corridor's EUR 745M
   * design-build contract is one number for 112 km, and before this field
   * existed the only honest place for it was a sentence in `description`.
   * Use `scope: "programme"` so it is never ranked against a lot cost.
   */
  cost: moneySchema.optional(),
  sources: z.array(sourceSchema).min(1),
  /**
   * When the project's figures were last checked against their sources.
   * Nothing else in the data records staleness, and one committed URL is
   * already dead.
   */
  lastVerified: dateStringSchema.optional(),
});
export type Project = z.infer<typeof projectSchema>;

/**
 * Price-index series used to express costs from different price years in
 * comparable real terms, keyed by ISO currency code. `index` maps a year to
 * the index level for that currency's reference area; the series only needs
 * to be internally consistent, so any index (HICP, a construction cost
 * index) can be substituted as long as the shape holds.
 */
export const deflatorSeriesSchema = z.object({
  /** Reference area the series is measured for, e.g. "EA", "RO". */
  geo: z.string().min(1),
  label: localizedStringSchema,
  /** Year → index level. Years outside the series are not deflatable. */
  index: z.record(z.string().regex(/^\d{4}$/), z.number().positive()),
});
export type DeflatorSeries = z.infer<typeof deflatorSeriesSchema>;

export const deflatorTableSchema = z.object({
  /** Year the index is normalised to (documentation only — ratios are used). */
  baseYear: z.number().int().min(1900).max(2100),
  note: z.string().min(1),
  sources: z.array(sourceSchema).min(1),
  series: z.record(z.string().length(3), deflatorSeriesSchema),
});
export type DeflatorTable = z.infer<typeof deflatorTableSchema>;

/**
 * Per-country reference figures, used only to normalise infrastructure
 * length into densities. Country *names* are deliberately absent: they come
 * from Intl.DisplayNames, so adding a locale never means editing this file.
 */
export const countryRefSchema = z.object({
  /** Total territory area in km². */
  areaKm2: z.number().positive(),
  population: z.number().int().positive(),
  /** Date the population figure refers to, e.g. "2026-01". */
  populationDate: dateStringSchema,
  /**
   * Caveat shown next to the country's density figures. Localized, because
   * it is prose rendered to the reader — unlike a source title, which is the
   * published name of a document and is not translated.
   */
  note: localizedStringSchema.optional(),
  sources: z.array(sourceSchema).min(1),
});
export type CountryRef = z.infer<typeof countryRefSchema>;

export const countryTableSchema = z.object({
  note: z.string().min(1),
  /** Keyed by ISO 3166-1 alpha-2, lowercase — as on Project.country. */
  countries: z.record(z.string().length(2), countryRefSchema),
});
export type CountryTable = z.infer<typeof countryTableSchema>;

/**
 * Annual average exchange rates, used to put costs recorded in different
 * currencies on one axis. Separate from the deflator table because they
 * answer different questions: the deflator moves money through time within
 * a currency, this moves it across currencies within a year.
 */
export const fxSeriesSchema = z.object({
  label: localizedStringSchema,
  /** Year → units of this currency per 1 EUR. */
  perEur: z.record(z.string().regex(/^\d{4}$/), z.number().positive()),
});
export type FxSeries = z.infer<typeof fxSeriesSchema>;

export const fxTableSchema = z
  .object({
    /** Currency every rate is quoted against. */
    base: z.string().length(3),
    note: z.string().min(1),
    sources: z.array(sourceSchema).min(1),
    rates: z.record(z.string().length(3), fxSeriesSchema),
  })
  .superRefine((table, ctx) => {
    // The rate field is literally named perEur, so a non-euro base would be
    // a silent lie about what the numbers mean.
    if (table.base !== "EUR") {
      ctx.addIssue({ code: "custom", message: 'fx base must be "EUR"' });
    }
    if (table.rates[table.base]) {
      ctx.addIssue({
        code: "custom",
        message: `fx rates must not contain the base currency "${table.base}"`,
      });
    }
  });
export type FxTable = z.infer<typeof fxTableSchema>;

/**
 * Per-person money. Deliberately not `moneySchema`, whose amount is in
 * MILLIONS — GDP per capita is in whole units and mixing the two would be a
 * six-order-of-magnitude error that still validates.
 */
export const perCapitaMoneySchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  year: z.number().int().min(1900).max(2100),
});

/**
 * A city with its own view: metro lines, urban bridges and the like, which
 * are invisible at country zoom and would otherwise clutter the main map.
 */
export const citySchema = z.object({
  /** ISO 3166-1 alpha-2, lowercase — must match the projects placed here. */
  country: z.string().length(2),
  name: localizedStringSchema,
  population: z.number().int().positive(),
  /** When the population figure was measured, e.g. "2021-12". */
  populationDate: dateStringSchema,
  gdpPerCapita: perCapitaMoneySchema.optional(),
  /** [longitude, latitude] of the city centre, for the map camera. */
  center: z.tuple([
    z.number().min(-180).max(180),
    z.number().min(-90).max(90),
  ]),
  /** Best public page about the city. */
  link: z.url().optional(),
  /** Caveat shown with the figures. Localized: it is prose for the reader. */
  note: localizedStringSchema.optional(),
  sources: z.array(sourceSchema).min(1),
});
export type City = z.infer<typeof citySchema>;

export const cityTableSchema = z.object({
  note: z.string().min(1),
  /** Keyed by "<country>-<slug>", as referenced by Project.city. */
  cities: z.record(z.string().regex(/^[a-z]{2}-[a-z0-9-]+$/), citySchema),
});
export type CityTable = z.infer<typeof cityTableSchema>;

/**
 * A canonical contractor. `members` marks the entry as a joint venture whose
 * work is credited both to the JV and to each member firm.
 */
export const contractorEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)).optional(),
  members: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(2).optional(),
  note: z.string().min(1).optional(),
});
export type ContractorEntry = z.infer<typeof contractorEntrySchema>;

export const contractorRegistrySchema = z.object({
  note: z.string().min(1),
  contractors: z.array(contractorEntrySchema),
});
export type ContractorRegistry = z.infer<typeof contractorRegistrySchema>;

/**
 * A transport corridor: a designation projects are assigned to by policy,
 * not by geography. Two schemes appear in the sources and both are kept
 * rather than mapped onto one, because they are different instruments: the
 * Pan-European (Helsinki) corridors are how these projects were described
 * when they were planned, and the TEN-T core network corridors are what EU
 * money is allocated on today. Recording only the modern one would rewrite
 * what the cited sources actually say.
 */
export const corridorSchema = z.object({
  scheme: z.enum(["pan-european", "ten-t"]),
  name: localizedStringSchema,
  /** Route as the designation describes it, e.g. "Dresden – Constanța". */
  route: z.string().min(1).optional(),
  note: localizedStringSchema.optional(),
  sources: z.array(sourceSchema).min(1),
});
export type Corridor = z.infer<typeof corridorSchema>;

export const corridorTableSchema = z.object({
  note: z.string().min(1),
  /** Keyed by slug, as referenced by Project.corridors. */
  corridors: z.record(z.string().regex(/^[a-z0-9-]+$/), corridorSchema),
});
export type CorridorTable = z.infer<typeof corridorTableSchema>;

/**
 * A funding programme: the instrument that actually carries the money's
 * conditions. `funding[].source` sorts 275 entries into five buckets, which
 * cannot distinguish a PNRR grant with a 2026 absorption deadline from a
 * JICA loan repaid over thirty years.
 */
export const programmeSchema = z.object({
  name: localizedStringSchema,
  instrument: z.enum(["grant", "loan", "guarantee", "blended"]),
  /** Programming period, e.g. "2021-2026". */
  period: z.string().min(1).optional(),
  /** Body that provides or administers the money. */
  authority: z.string().min(1),
  /** Date the money must be absorbed by, where the programme sets one. */
  deadline: dateStringSchema.optional(),
  note: localizedStringSchema.optional(),
  sources: z.array(sourceSchema).min(1),
});
export type Programme = z.infer<typeof programmeSchema>;

export const programmeTableSchema = z.object({
  note: z.string().min(1),
  programmes: z.record(z.string().regex(/^[a-z0-9-]+$/), programmeSchema),
});
export type ProgrammeTable = z.infer<typeof programmeTableSchema>;

/**
 * A procuring authority. Delivery performance by authority is arguably
 * fairer than by contractor, since the authority wrote the contract terms
 * the contractor was held to. Names are not localized: they are the legal
 * names of bodies, like source titles.
 */
export const operatorSchema = z.object({
  name: z.string().min(1),
  /** Name in the country's own language, where it differs. */
  localName: z.string().min(1).optional(),
  country: z.string().length(2),
  role: z.enum([
    "road_authority",
    "rail_authority",
    "metro_operator",
    "project_company",
    "municipality",
  ]),
  aliases: z.array(z.string().min(1)).optional(),
  note: localizedStringSchema.optional(),
  sources: z.array(sourceSchema).min(1),
});
export type Operator = z.infer<typeof operatorSchema>;

export const operatorTableSchema = z.object({
  note: z.string().min(1),
  operators: z.record(z.string().regex(/^[a-z0-9-]+$/), operatorSchema),
});
export type OperatorTable = z.infer<typeof operatorTableSchema>;

/**
 * Whether a lot's works are already counted inside another project's section.
 *
 * The structural twin of `isSharedTrack`. Every total that spans projects
 * has to apply both, or `ro-tunnels` adds its 11 structures to the national
 * length on top of the A1, A3 and A8 sections that already contain them.
 */
export function isPartOfAnother(lot: { partOf?: string }): boolean {
  return lot.partOf !== undefined;
}

/**
 * The single predicate every total that spans projects must apply.
 *
 * There are now two independent ways a lot's kilometres are already counted
 * elsewhere, and there will probably be a third. Asking this question once,
 * by name, is what stops the next aggregate from remembering one rule and
 * forgetting the other, which is exactly how the homepage came to overstate
 * the network by 38 km.
 *
 * A lot's own project always counts it in full. This is only about sums that
 * cross project boundaries.
 */
export function countsTowardNetwork(lot: {
  sharedWith?: string;
  partOf?: string;
}): boolean {
  return !isSharedTrack(lot) && !isPartOfAnother(lot);
}

/**
 * Whether a lot's track is already counted under another project.
 *
 * The one predicate every cross-project total has to apply. Counting a
 * through-run tunnel once per line inflates a city's network by the length
 * of the shared section.
 */
export function isSharedTrack(lot: { sharedWith?: string }): boolean {
  return lot.sharedWith !== undefined;
}

/** Extract the year from a date string ("2012", "2012-06", "2012-06-15" → 2012). */
export function dateYear(date: string): number {
  return parseInt(date.slice(0, 4), 10);
}

/** Path of a project's GeoJSON file relative to the repo root. */
export function projectGeoPath(project: Project): string {
  return `data/geo/${project.country}/${project.id.slice(3)}.geojson`;
}

/** Path of a country's outline polygon relative to the repo root. */
export function countryGeoPath(country: string): string {
  return `data/geo/countries/${country}.geojson`;
}
