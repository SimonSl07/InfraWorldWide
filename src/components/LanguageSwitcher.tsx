"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function switchTo(l: string) {
    // Read the query string at click time instead of useSearchParams(),
    // so this component doesn't force a CSR bailout on every page.
    const qs = window.location.search;
    router.replace(`${pathname}${qs}`, { locale: l });
  }

  return (
    <div className="flex items-center gap-1 text-xs font-medium">
      {routing.locales.map((l) => (
        <button
          key={l}
          onClick={() => switchTo(l)}
          className={`px-2 py-1 rounded uppercase ${
            l === locale
              ? "bg-neutral-900 text-white"
              : "text-neutral-500 hover:text-neutral-900"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
