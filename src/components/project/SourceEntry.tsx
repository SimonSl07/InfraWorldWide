import { formatDate } from "@/lib/format";
import type { Source } from "@/lib/schema";
import { ExternalLink } from "@/components/ui/ExternalLink";
import type { Translate } from "./MoneyLine";

/** One numbered entry in a project's source list, the target of a citation. */
export function SourceEntry({
  source,
  number,
  t,
  locale,
}: {
  source: Source;
  number: number;
  t: Translate;
  locale: string;
}) {
  return (
    <li id={`source-${number}`} className="scroll-mt-24">
      <ExternalLink
        href={source.url}
        className="underline underline-offset-2 hover:text-ink"
      >
        {source.title}
      </ExternalLink>
      {(source.retrievedOn || source.archiveUrl) && (
        <span className="ml-2 text-xs text-ink-faint">
          {source.retrievedOn &&
            t("project.sourceRetrieved", {
              date: formatDate(source.retrievedOn, locale),
            })}
          {source.retrievedOn && source.archiveUrl && " · "}
          {source.archiveUrl && (
            <ExternalLink
              href={source.archiveUrl}
              className="underline underline-offset-2 hover:text-ink"
            >
              {t("project.sourceArchive")}
            </ExternalLink>
          )}
        </span>
      )}
    </li>
  );
}
