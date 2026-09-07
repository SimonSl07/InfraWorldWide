import { commonLatestYear, createDeflator, type Deflator } from "./deflator";
import { createConverter, type Converter } from "./fx";
import {
  createContractorResolver,
  type ContractorResolver,
} from "./contractors";
import type { CostOptions } from "./performance";
import type { MetricsOptions } from "./rankings";
import type { ContractorRegistry, DeflatorTable, FxTable } from "./schema";

/**
 * The one price basis every comparison on the site is made on.
 *
 * Six call sites used to wire this up by hand, and they drifted: two left
 * out `convert`, so an overrun whose estimate and outturn were recorded in
 * different currencies was measured on /rankings and refused on /countries,
 * under a comment saying the two could not disagree. The price year is the
 * same hazard in another shape: a lot restated into 2022 prices on one page
 * and 2023 on another is one lot with two figures. Built here once, the
 * pages cannot differ.
 *
 * Pure: it takes the tables rather than reading them, so tests hand it
 * fixtures and data.ts memoizes the wiring to the committed artifacts.
 */
export interface AnalysisContext {
  deflate: Deflator;
  convert: Converter;
  resolve: ContractorResolver;
  /** Newest price year every currency covers, so figures compare across countries. */
  priceYear: number;
  /** "Now" as an absolute month index, for in-progress slip. */
  nowMonth: number;
  /** What the cost tables take: the same function references, not copies. */
  costOptions: CostOptions;
  /** What `collectLotMetrics` and the contractor directory take. */
  metricsOptions: MetricsOptions;
}

export interface AnalysisInput {
  deflators: DeflatorTable;
  fx: FxTable;
  contractors: ContractorRegistry;
  nowMonth: number;
}

export function createAnalysisContext({
  deflators,
  fx,
  contractors,
  nowMonth,
}: AnalysisInput): AnalysisContext {
  const deflate = createDeflator(deflators);
  const convert = createConverter(fx);
  const resolve = createContractorResolver(contractors);
  // Only a table with no series has no common year; the base year is then a
  // stand-in, and every deflation will refuse anyway.
  const priceYear = commonLatestYear(deflators) ?? deflators.baseYear;

  return {
    deflate,
    convert,
    resolve,
    priceYear,
    nowMonth,
    costOptions: { deflate, convert, priceYear },
    metricsOptions: { deflate, convert, priceYear, resolve, nowMonth },
  };
}
