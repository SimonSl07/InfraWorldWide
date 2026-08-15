import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * The landing place for the notFound() calls in projects/[id],
 * countries/[code] and cities/[slug]. It renders inside the locale layout,
 * so the header and footer stay put and there is a way back to the map.
 *
 * not-found.js takes no params, so the locale comes from the request
 * config rather than the route segment.
 */
export default async function LocaleNotFound() {
  const t = await getTranslations();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-semibold tracking-wide text-ink-faint uppercase">
        404
      </p>
      <h1 className="mt-2 text-2xl font-bold">{t("error.notFoundTitle")}</h1>
      <p className="mt-3 text-ink-soft">{t("error.notFoundBody")}</p>
      <Link
        href="/map"
        className="mt-8 rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-on-inverse hover:bg-inverse-soft"
      >
        {t("error.backHome")}
      </Link>
    </div>
  );
}
