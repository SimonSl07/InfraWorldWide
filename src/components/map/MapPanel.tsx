"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * The shell shared by the project, country and city panels.
 *
 * All three used to mount as a bare `<aside>`: no role, no focus move, no
 * focus return and no Escape handler, so opening one from the keyboard left
 * focus behind on the map and there was no way to dismiss it without a
 * mouse. `CategoryToggle` already had the right dismiss pattern; this is the
 * same thing, plus focus management.
 *
 * Deliberately not a modal. The map stays usable behind it, so focus is
 * moved but not trapped, and dismissing does not require an overlay.
 */
export default function MapPanel({
  onClose,
  labelledBy,
  children,
}: {
  onClose: () => void;
  /** Id of the heading that names the panel. */
  labelledBy: string;
  children: ReactNode;
}) {
  const t = useTranslations();
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Whatever had focus when the panel opened gets it back on close, so a
    // keyboard user is returned to the map rather than to the top of the page.
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Let a menu inside the panel close itself first.
      if (event.defaultPrevented) return;
      onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <aside
      ref={panelRef}
      // A named region, so a screen reader can jump to it and announce what
      // it is rather than reading an unlabelled container.
      role="region"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      className="absolute top-4 right-4 z-10 flex max-h-[calc(100%-2rem)] w-80 max-w-[calc(100%-2rem)] flex-col overflow-y-auto rounded-xl border border-line bg-surface/95 p-4 shadow-lg backdrop-blur"
    >
      {children}
      <button
        type="button"
        onClick={onClose}
        aria-label={t("country.close")}
        // Bottom of the DOM order but pinned visually top right: a keyboard
        // user reaches the content first, which is what they came for.
        className="absolute top-2 right-2 flex h-9 w-9 items-center justify-center rounded-lg text-xl leading-none text-ink-muted hover:bg-surface-raised hover:text-ink"
      >
        ×
      </button>
    </aside>
  );
}
