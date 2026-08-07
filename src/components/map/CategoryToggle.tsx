"use client";

import { useTranslations } from "next-intl";
import type { Category } from "@/lib/schema";
import { ALL_CATEGORIES, CATEGORY_COLORS } from "@/lib/map-style";

interface CategoryToggleProps {
  active: Set<Category>;
  onChange: (next: Set<Category>) => void;
}

export default function CategoryToggle({ active, onChange }: CategoryToggleProps) {
  const t = useTranslations("category");

  function toggle(cat: Category) {
    const next = new Set(active);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    onChange(next);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ALL_CATEGORIES.map((cat) => {
        const isActive = active.has(cat);
        return (
          <button
            key={cat}
            onClick={() => toggle(cat)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? "border-neutral-900 bg-white text-neutral-900"
                : "border-neutral-200 bg-white/70 text-neutral-400"
            }`}
          >
            <span
              className="inline-block w-4 h-1 rounded-full"
              style={{
                backgroundColor: isActive ? CATEGORY_COLORS[cat] : "#d4d4d4",
              }}
            />
            {t(cat)}
          </button>
        );
      })}
    </div>
  );
}
