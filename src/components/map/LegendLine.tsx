/** Line samples matching the map's per-status line styles. */
const LEGEND_SVG: Record<string, { dash?: string; opacity?: number }> = {
  opened: {},
  under_construction: { dash: "8 6" },
  tendered: { dash: "2 5", opacity: 0.7 },
  planned: { dash: "2 5", opacity: 0.7 },
};

export default function LegendLine({
  status,
  color = "#262626",
}: {
  status: string;
  color?: string;
}) {
  const s = LEGEND_SVG[status] ?? {};
  return (
    <svg width="30" height="6" aria-hidden="true" className="shrink-0">
      <line
        x1="1"
        y1="3"
        x2="29"
        y2="3"
        stroke={color}
        strokeWidth="3.5"
        strokeLinecap="butt"
        strokeDasharray={s.dash}
        opacity={s.opacity ?? 1}
      />
    </svg>
  );
}
