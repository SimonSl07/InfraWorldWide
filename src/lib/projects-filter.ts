import type { Category, Project, Status } from "./schema";

export interface ProjectFilters {
  query: string;
  country: string | null;
  category: Category | null;
  /** Matches a project if ANY of its lots has this status. */
  status: Status | null;
}

/** Pure project filtering for the projects browser — unit-tested. */
export function filterProjects(
  projects: Project[],
  filters: ProjectFilters,
): Project[] {
  const q = filters.query.trim().toLowerCase();
  return projects.filter((p) => {
    if (filters.country && p.country !== filters.country) return false;
    if (filters.category && p.category !== filters.category) return false;
    if (filters.status && !p.lots.some((l) => l.status === filters.status)) {
      return false;
    }
    if (q) {
      const haystack = [
        p.name.en,
        p.name.ro ?? "",
        ...p.lots.flatMap((l) => [l.name.en, l.name.ro ?? ""]),
      ]
        .join("\n")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
