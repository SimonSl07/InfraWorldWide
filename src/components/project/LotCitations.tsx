import { lotCitations } from "@/lib/lot-sources";
import type { Lot, Source } from "@/lib/schema";
import { ExternalLink } from "@/components/ui/ExternalLink";
import type { Translate } from "./MoneyLine";

/**
 * Which sources back one section: numbered references into the project's
 * list, links the lot carries alone, and any reference that resolves to
 * nothing.
 */
export function LotCitations({
  lot,
  lotName,
  sources,
  sourceNumbers,
  t,
}: {
  lot: Lot;
  /** Already localized, for the group's label. */
  lotName: string;
  sources: Source[];
  /** From `numberSources(sources)`, so the numbers match the list below. */
  sourceNumbers: Map<string, number>;
  t: Translate;
}) {
  const citations = lotCitations(lot, sources);
  if (
    citations.refs.length === 0 &&
    citations.own.length === 0 &&
    citations.unresolved.length === 0
  ) {
    return null;
  }
  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-1 text-xs font-normal"
      aria-label={t("project.lotSourcesLabel", { lot: lotName })}
      role="group"
    >
      {citations.refs.map((source) => {
        const number = sourceNumbers.get(source.url)!;
        return (
          <a
            key={source.url}
            href={`#source-${number}`}
            aria-label={t("project.citationLabel", {
              number,
              title: source.title,
            })}
            className="rounded bg-surface-raised px-1.5 py-0.5 tabular-nums text-ink-muted hover:text-ink"
          >
            {number}
          </a>
        );
      })}
      {citations.own.map((source) => (
        <ExternalLink
          key={source.url}
          href={source.url}
          className="rounded bg-surface-raised px-1.5 py-0.5 text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          {source.title}
        </ExternalLink>
      ))}
      {/* A reference resolving to nothing is a data fault, and saying so is
          better than rendering a section that looks uncited. */}
      {citations.unresolved.map((ref) => (
        <span
          key={ref}
          title={t("project.sourceMissing")}
          className="rounded bg-bad-soft px-1.5 py-0.5 text-bad"
        >
          {ref}
        </span>
      ))}
    </div>
  );
}
