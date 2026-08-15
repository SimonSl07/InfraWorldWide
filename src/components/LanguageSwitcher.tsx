"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/** Human names for the locale codes, in their own language. */
const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  ro: "Română",
};

/**
 * Real links, not buttons.
 *
 * As buttons the alternate-language URL never appeared in the DOM, so a
 * crawler could not follow it, it could not be middle-clicked or opened in a
 * new tab, and its accessible name was the bare code "RO".
 */
export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 text-xs font-medium">
      {routing.locales.map((l) => (
        <Link
          key={l}
          href={pathname}
          locale={l}
          hrefLang={l}
          aria-current={l === locale ? "true" : undefined}
          aria-label={LOCALE_NAMES[l] ?? l}
          className={`px-2 py-1 rounded uppercase ${
            l === locale
              ? "bg-inverse text-on-inverse"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          {l}
        </Link>
      ))}
    </div>
  );
}
