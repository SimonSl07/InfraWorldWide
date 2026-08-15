import { getTranslations } from "next-intl/server";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import "./globals.css";

/**
 * The fallback for URLs that never reach a locale, so it sits outside
 * [lang]/layout.tsx and has to supply its own document. Deliberately
 * minimal: no header, no footer, no fonts, one link back into the app in
 * the default locale.
 *
 * A locale-scoped 404 (a project id that does not exist, say) is handled
 * by [lang]/not-found.tsx instead, inside the full layout.
 */
export default async function RootNotFound() {
  const locale = routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "error" });
  // next-intl's <Link> reads the locale from a provider this page is
  // outside of, so the path is resolved here and handed to a plain anchor.
  const href = getPathname({ href: "/map", locale });

  return (
    <html lang={locale} className="h-full">
      <body className="flex min-h-full flex-col items-center justify-center bg-surface px-4 py-24 text-center text-ink antialiased">
        <p className="text-sm font-semibold tracking-wide text-ink-faint uppercase">
          404
        </p>
        <h1 className="mt-2 text-2xl font-bold">{t("notFoundTitle")}</h1>
        <p className="mt-3 text-ink-soft">{t("notFoundBody")}</p>
        <a
          href={href}
          className="mt-8 rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-on-inverse hover:bg-inverse-soft"
        >
          {t("backHome")}
        </a>
      </body>
    </html>
  );
}
