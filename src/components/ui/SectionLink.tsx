import { Link } from "@/i18n/navigation";
import { categoryVar } from "@/lib/map-theme";
import type { Category } from "@/lib/schema";

/**
 * "Project / section" as a link to the project page, with the category's
 * colour as a dot in front. Names arrive already localized, so this renders
 * on the server (country and contractor pages) and in the client tables
 * alike.
 *
 * `lotName` is left out on rows that stand for a whole project, such as the
 * per-project cost table.
 */
export function SectionLink({
  projectId,
  projectName,
  lotName,
  category,
}: {
  projectId: string;
  projectName: string;
  lotName?: string;
  category: Category;
}) {
  return (
    <Link
      href={`/projects/${projectId}`}
      className="flex items-baseline gap-2 hover:underline underline-offset-2"
    >
      <span
        aria-hidden
        className="inline-block h-1 w-3 shrink-0 translate-y-[-2px] rounded-full"
        style={{ backgroundColor: categoryVar(category) }}
      />
      <span>
        <span className="text-ink-muted">{projectName}</span>
        {lotName && (
          <>
            <span className="text-ink-faint"> / </span>
            <span className="font-medium">{lotName}</span>
          </>
        )}
      </span>
    </Link>
  );
}
