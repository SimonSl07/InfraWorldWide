import type { Category } from "@/lib/schema";
import { categoryVar } from "@/lib/map-theme";

/**
 * A legend sample that survives being printed in greyscale.
 *
 * Category is otherwise hue alone, and the palette puts railway green next
 * to bridge amber: the deuteranopia confusion pair. Each glyph therefore
 * carries a shape as well as a colour, borrowing the conventional
 * cartographic signatures (cross ties for rail, piers for a bridge, portal
 * walls for a tunnel).
 */
export default function CategoryGlyph({
  category,
  color,
}: {
  category: Category;
  color?: string;
}) {
  const stroke = color ?? categoryVar(category);
  return (
    <svg
      width="30"
      height="12"
      viewBox="0 0 30 12"
      aria-hidden="true"
      className="shrink-0"
    >
      {category === "highway" && (
        <>
          <line x1="1" y1="6" x2="29" y2="6" stroke={stroke} strokeWidth="5" />
          {/* centre line, the road's own signature */}
          <line
            x1="1"
            y1="6"
            x2="29"
            y2="6"
            stroke="var(--surface)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        </>
      )}
      {category === "railway" && (
        <>
          <line x1="1" y1="6" x2="29" y2="6" stroke={stroke} strokeWidth="3" />
          {[4, 10, 16, 22, 28].map((x) => (
            <line
              key={x}
              x1={x}
              y1="2"
              x2={x}
              y2="10"
              stroke={stroke}
              strokeWidth="1.5"
            />
          ))}
        </>
      )}
      {category === "bridge" && (
        <>
          <line x1="1" y1="5" x2="29" y2="5" stroke={stroke} strokeWidth="3.5" />
          {[9, 21].map((x) => (
            <line
              key={x}
              x1={x}
              y1="5"
              x2={x}
              y2="11"
              stroke={stroke}
              strokeWidth="1.5"
            />
          ))}
        </>
      )}
      {category === "tunnel" && (
        <>
          <line
            x1="1"
            y1="6"
            x2="29"
            y2="6"
            stroke={stroke}
            strokeWidth="3.5"
            strokeDasharray="4 2.5"
          />
          {/* portal walls at both ends */}
          {[2, 28].map((x) => (
            <line
              key={x}
              x1={x}
              y1="1.5"
              x2={x}
              y2="10.5"
              stroke={stroke}
              strokeWidth="2"
            />
          ))}
        </>
      )}
    </svg>
  );
}
