import { formatDate } from "@/lib/format";
import type { Milestone } from "@/lib/lot-timeline";
import type { Translate } from "./MoneyLine";

function milestoneLabel(milestone: Milestone, locale: string): string {
  if (milestone.date !== null) return formatDate(milestone.date, locale);
  // Derived: a contract implies a month, not a day, and stating one would
  // claim a precision no source published.
  return `≈${Math.floor(milestone.month / 12)}`;
}

/**
 * A section's dates in order, past ones filled in and future ones outlined,
 * with a tag on any that comes from contract terms rather than a source.
 */
export function LotTimeline({
  milestones,
  t,
  locale,
}: {
  milestones: Milestone[];
  t: Translate;
  locale: string;
}) {
  if (milestones.length === 0) return <>{"–"}</>;
  return (
    <ol className="space-y-1">
      {milestones.map((milestone) => (
        <li
          key={`${milestone.kind}-${milestone.month}`}
          className="flex items-baseline gap-1.5 whitespace-nowrap"
        >
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${
              milestone.future ? "border border-line-strong" : "bg-ink-faint"
            }`}
          />
          <span className="tabular-nums">
            {milestoneLabel(milestone, locale)}
          </span>
          <span
            className={milestone.future ? "text-ink-faint" : "text-ink-soft"}
          >
            {t(`project.${milestone.kind}`)}
          </span>
          {milestone.derived && (
            <span
              className="rounded bg-surface-raised px-1 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted"
              title={t("project.expectedOpeningDerived")}
            >
              {t("project.expectedOpeningDerived")}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
