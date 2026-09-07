/**
 * A labelled figure with an optional qualifier: a population and the date it
 * was counted, a length and how many projects it spans.
 *
 * `card` is the city page's bordered tile with the note on its own line.
 * `compact` is the map panel's, where the note sits inline after the value
 * because the panel has no room for a third line.
 */
export function Figure({
  label,
  value,
  note,
  variant = "card",
}: {
  label: string;
  value: string;
  note?: string;
  variant?: "card" | "compact";
}) {
  if (variant === "compact") {
    return (
      <div>
        <div className="text-xs text-ink-muted">{label}</div>
        <div className="text-lg font-bold tabular-nums">
          {value}
          {note && (
            <span className="ml-1.5 text-xs font-normal text-ink-faint">
              {note}
            </span>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {note && <div className="mt-0.5 text-xs text-ink-faint">{note}</div>}
    </div>
  );
}
