import type { Status } from "@/lib/schema";

/**
 * One colour per status, so the pill on the map panel, in the project grid
 * and in the lots table cannot drift apart. Each of those had its own copy of
 * this table.
 */
const STATUS_BADGE: Record<Status, string> = {
  opened: "bg-good-soft text-good",
  under_construction: "bg-warn-soft text-warn",
  tendered: "bg-info-soft text-info",
  planned: "bg-surface-raised text-ink-soft",
  cancelled: "bg-bad-soft text-bad",
};

export function statusBadgeClass(status: Status): string {
  return STATUS_BADGE[status];
}

export function StatusBadge({
  status,
  label,
  className = "text-xs",
}: {
  status: Status;
  /** Already translated, so this renders on the server and the client alike. */
  label: string;
  /**
   * Type size and anything else the call site needs. It replaces the default
   * `text-xs` rather than adding to it: two font sizes on one element would
   * leave Tailwind's stylesheet order to pick the winner.
   */
  className?: string;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-medium ${className} ${STATUS_BADGE[status]}`}
    >
      {label}
    </span>
  );
}
