/**
 * Canonical and alternate URLs.
 *
 * The site serves two complete locale trees under `localePrefix: "always"`,
 * so /en/projects/ro-a1 and /ro/projects/ro-a1 hold the same facts in two
 * languages. Without hreflang alternates a search engine treats them as
 * duplicates competing with each other, and picks one at random for a reader
 * whose language matches neither.
 *
 * Everything here is pure and takes its inputs explicitly, so it can be tested
 * without a request or a build environment.
 */

/** Path with its locale prefix: ("ro", "/projects") becomes "/ro/projects". */
export function localePath(locale: string, path: string): string {
  const trimmed = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed ? `/${locale}/${trimmed}` : `/${locale}`;
}

export function absoluteUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

export interface Alternates {
  canonical: string;
  languages: Record<string, string>;
}

export function buildAlternates(options: {
  baseUrl: string;
  /** Locale-independent path, e.g. "/projects/ro-a1". */
  path: string;
  locale: string;
  locales: readonly string[];
  defaultLocale: string;
}): Alternates {
  const { baseUrl, path, locale, locales, defaultLocale } = options;
  const url = (l: string) => absoluteUrl(baseUrl, localePath(l, path));

  const languages: Record<string, string> = {};
  for (const l of locales) languages[l] = url(l);
  languages["x-default"] = url(defaultLocale);

  return { canonical: url(locale), languages };
}

/**
 * Where this deployment lives. Metadata needs an absolute origin, and a
 * relative one silently produces broken canonical and og:image URLs.
 */
export function siteUrl(env: Record<string, string | undefined>): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel =
    env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}
