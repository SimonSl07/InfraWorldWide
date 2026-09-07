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
 *
 * A card at the top right on a wide screen, a sheet across the bottom below
 * `sm`. At 320px wide and full height the card left a phone no map at all,
 * and the reader could not see the section they had just tapped. The sheet
 * stops short of the bottom so the basemap attribution stays visible, which
 * is an obligation and not a nicety.
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
  const panelRef = useRef<HTMLDivElement>(null);

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
    <aside className="absolute right-2 bottom-10 left-2 z-20 flex max-h-[60%] flex-col overflow-hidden rounded-2xl border border-line bg-surface/95 shadow-lg backdrop-blur sm:top-4 sm:right-4 sm:bottom-auto sm:left-auto sm:z-10 sm:max-h-[calc(100%-2rem)] sm:w-80 sm:max-w-[calc(100%-2rem)] sm:rounded-xl">
      <div
        ref={panelRef}
        // A named region, so a screen reader can jump to it and announce what
        // it is rather than reading an unlabelled container. It is also the
        // scroller, so arrow keys move the content the moment it opens.
        role="region"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto p-4"
      >
        {children}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("country.close")}
          // Bottom of the DOM order but pinned visually top right: a keyboard
          // user reaches the content first, which is what they came for. It
          // is positioned against the frame rather than the scroller, so a
          // long panel cannot scroll its own dismiss button out of reach.
          className="absolute top-2 right-2 flex h-11 w-11 items-center justify-center rounded-lg text-xl leading-none text-ink-muted hover:bg-surface-raised hover:text-ink sm:h-9 sm:w-9"
        >
          ×
        </button>
      </div>
    </aside>
  );
}
