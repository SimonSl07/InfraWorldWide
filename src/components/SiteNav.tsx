"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";

export interface NavItem {
  href: string;
  label: string;
}

interface SiteNavProps {
  items: NavItem[];
  menuLabel: string;
  closeMenuLabel: string;
  /** Feedback dialog and language switcher, shown in both layouts. */
  children: ReactNode;
}

/**
 * Primary navigation, in two layouts.
 *
 * Above `md` the links sit inline. Below it they collapse behind a disclosure
 * button: seven items in one non-wrapping row measured 671px against a 375px
 * viewport, so every page scrolled sideways on a phone.
 */
export default function SiteNav({
  items,
  menuLabel,
  closeMenuLabel,
  children,
}: SiteNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  /** True for the item's own page and anything beneath it. */
  const isCurrent = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <nav
        aria-label={menuLabel}
        className="hidden md:flex items-center gap-4 text-sm text-ink-soft"
      >
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isCurrent(item.href) ? "page" : undefined}
            className="hover:text-ink aria-[current=page]:text-ink aria-[current=page]:font-semibold"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="ml-auto hidden md:flex items-center gap-4">{children}</div>

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="site-nav-panel"
        aria-label={open ? closeMenuLabel : menuLabel}
        className="ml-auto md:hidden inline-flex items-center justify-center w-11 h-11 -mr-2 rounded-lg text-ink-soft hover:bg-surface-raised"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {open ? (
            <>
              <path d="M5 5l10 10" />
              <path d="M15 5L5 15" />
            </>
          ) : (
            <>
              <path d="M3 6h14" />
              <path d="M3 10h14" />
              <path d="M3 14h14" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <div
          id="site-nav-panel"
          ref={panelRef}
          className="md:hidden absolute left-0 right-0 top-14 border-b border-line bg-surface shadow-lg"
        >
          <nav aria-label={menuLabel} className="flex flex-col p-2">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                // Closed here rather than in an effect on `pathname`: following
                // a link is the only way to leave, so the event is the signal.
                onClick={() => setOpen(false)}
                aria-current={isCurrent(item.href) ? "page" : undefined}
                className="px-3 py-3 rounded-lg text-ink-soft hover:bg-surface-raised aria-[current=page]:text-ink aria-[current=page]:font-semibold"
              >
                {item.label}
              </Link>
            ))}
            <div className="flex items-center gap-4 px-3 py-3 border-t border-line mt-1">
              {children}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
