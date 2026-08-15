import { contractBaseline, monthIndex } from "./contract";
import type { Lot } from "./schema";

/**
 * A lot's dates as a timeline rather than a sentence.
 *
 * The project page joined four dates with " · " into one cell, which reads
 * as a list of unrelated facts: nothing said which had happened, which was
 * still ahead, or which was a contract-derived estimate rather than a date
 * anyone published. All three distinctions are in the data already.
 */

export type MilestoneKind =
  | "announced"
  | "tenderAwarded"
  | "constructionStart"
  | "opened"
  | "expectedOpening";

export interface Milestone {
  kind: MilestoneKind;
  /** The date as recorded. Null when the month was derived from a contract. */
  date: string | null;
  /** Absolute month index, for ordering and for the past/ahead test. */
  month: number;
  /** Derived from contract terms rather than stated by a source. */
  derived: boolean;
  /** Still ahead of the month being viewed. */
  future: boolean;
}

const RECORDED: MilestoneKind[] = [
  "announced",
  "tenderAwarded",
  "constructionStart",
  "opened",
];

/**
 * Every milestone a lot has, in the order they happened.
 *
 * An expected opening is appended only while one is still meaningful: for an
 * opened or cancelled lot the recorded fact is the end of the story, and a
 * contract estimate beside it would be noise. A derived deadline that has
 * already passed stays in the list and is marked as past, because on a late
 * section that is the most informative row there is.
 */
export function lotMilestones(lot: Lot, nowMonth: number): Milestone[] {
  const milestones: Milestone[] = [];

  for (const kind of RECORDED) {
    const date = lot.dates?.[kind];
    const month = monthIndex(date);
    if (date === undefined || month === null) continue;
    milestones.push({
      kind,
      date,
      month,
      derived: false,
      future: month > nowMonth,
    });
  }

  if (lot.status !== "opened" && lot.status !== "cancelled") {
    const stated = lot.dates?.expectedOpening;
    const statedMonth = monthIndex(stated);
    const derived = contractBaseline(lot);
    if (stated !== undefined && statedMonth !== null) {
      milestones.push({
        kind: "expectedOpening",
        date: stated,
        month: statedMonth,
        derived: false,
        future: statedMonth > nowMonth,
      });
    } else if (derived) {
      milestones.push({
        kind: "expectedOpening",
        date: null,
        month: derived.month,
        derived: true,
        future: derived.month > nowMonth,
      });
    }
  }

  // Chronological, not field order: sources do record a section announced
  // after the corridor it belongs to was tendered.
  return milestones.sort((a, b) => a.month - b.month);
}

export interface ConstructionProgress {
  /** Months since work started. */
  elapsedMonths: number;
  /** Months the contract allowed for the same stretch. */
  contractedMonths: number;
  /**
   * Elapsed over contracted. Deliberately unclamped: a bar that stops at
   * 100% hides exactly the sections worth looking at.
   */
  ratio: number;
  /** Months past the contracted finish, zero while still inside it. */
  overdueMonths: number;
}

/**
 * How far into its contracted time a section under construction is.
 *
 * Only for lots actually building: for anything else the question is either
 * answered (it opened) or not yet asked (it has not started). The contracted
 * duration comes from `contractBaseline`, so the months counted are the ones
 * that match the anchor date, never design time added to a physical start.
 */
export function constructionProgress(
  lot: Lot,
  nowMonth: number,
): ConstructionProgress | null {
  if (lot.status !== "under_construction") return null;

  const baseline = contractBaseline(lot);
  if (!baseline) return null;

  const startMonth = baseline.month - baseline.months;
  const elapsedMonths = nowMonth - startMonth;
  if (elapsedMonths < 0) return null;

  return {
    elapsedMonths,
    contractedMonths: baseline.months,
    ratio: elapsedMonths / baseline.months,
    overdueMonths: Math.max(0, nowMonth - baseline.month),
  };
}
