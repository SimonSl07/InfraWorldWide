import type { Category, Status } from "./schema";

export const CATEGORY_COLORS: Record<Category, string> = {
  highway: "#2563eb", // blue-600
  railway: "#16a34a", // green-600
  bridge: "#d97706", // amber-600
  tunnel: "#7c3aed", // violet-600
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_COLORS) as Category[];

/** Statuses rendered on the map (cancelled lots are hidden). */
export const MAP_STATUSES: Status[] = [
  "opened",
  "under_construction",
  "tendered",
  "planned",
];

export const OPENFREEMAP_STYLE =
  "https://tiles.openfreemap.org/styles/positron";
