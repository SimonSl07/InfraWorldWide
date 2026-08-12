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

export const localizedStringSchema = z.object({
  en: z.string().min(1),
  ro: z.string().min(1).optional(),
});
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

export const moneySchema = z.object({
  /** Amount in MILLIONS of the currency unit (500 EUR = €500M). */
  amount: z.number().positive(),
  currency: z.string().length(3),
  /** Price year — costs from different years are not directly comparable. */
  year: z.number().int().min(1900).max(2100),
});
export type Money = z.infer<typeof moneySchema>;

export const fundingSchema = z.object({
  source: z.enum(["EU", "national_budget", "ppp", "loan", "other"]),
  detail: localizedStringSchema.optional(),
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
export const contractSchema = z.object({
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
});
export type Contract = z.infer<typeof contractSchema>;

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
    cost: z
      .object({
        estimated: moneySchema.optional(),
        actual: moneySchema.optional(),
      })
      .optional(),
    funding: z.array(fundingSchema).optional(),
    contractors: z.array(contractorSchema).optional(),
    contract: contractSchema.optional(),
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
  });
export type Lot = z.infer<typeof lotSchema>;

export const sourceSchema = z.object({
  title: z.string().min(1),
  url: z.url(),
});

export const projectSchema = z.object({
  /** "<country>-<slug>", e.g. "ro-a3". */
  id: z.string().regex(/^[a-z]{2}-[a-z0-9-]+$/),
  /** ISO 3166-1 alpha-2, lowercase. */
  country: z.string().length(2),
  category: categorySchema,
  name: localizedStringSchema,
  description: localizedStringSchema,
  lots: z.array(lotSchema).min(1),
  sources: z.array(sourceSchema).min(1),
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
