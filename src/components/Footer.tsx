import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EXTERNAL_LINKS } from "@/lib/links";
import { ExternalLink } from "@/components/ui/ExternalLink";

/**
 * Attribution, and the links it needs to be worth anything.
 *
 * The three sentences were plain text, so the ODbL attribution AGENTS.md
 * calls mandatory pointed nowhere. The data page sits in the same row,
 * because that is where a reader who has just read a licence obligation goes
 * looking for what it applies to.
 *
 * The names in the external row are proper nouns and stay the same in every
 * locale, which is why they carry no message key.
 */
export default async function Footer() {
  const t = await getTranslations();

  const internal = [
    { href: "/data", label: t("dataPage.title") },
    { href: "/contractors", label: t("contractors.title") },
    { href: "/about", label: t("nav.about") },
  ];

  const external = [
    { href: EXTERNAL_LINKS.openStreetMap, label: "OpenStreetMap" },
    { href: EXTERNAL_LINKS.odbl, label: "ODbL" },
    { href: EXTERNAL_LINKS.openFreeMap, label: "OpenFreeMap" },
    { href: EXTERNAL_LINKS.repo, label: "GitHub" },
  ];

  return (
    <footer className="border-t border-line bg-surface-sunken">
      <div className="mx-auto max-w-7xl px-4 py-6 text-xs text-ink-soft space-y-1">
        <p>{t("footer.mapData")}</p>
        <p>{t("footer.infraData")}</p>
        <p>{t("footer.disclaimer")}</p>
        <nav
          aria-label={t("footer.linksLabel")}
          className="flex flex-wrap gap-x-4 gap-y-1 pt-2"
        >
          {internal.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="font-medium underline underline-offset-2 hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
          {external.map((link) => (
            <ExternalLink
              key={link.href}
              href={link.href}
              className="underline underline-offset-2 hover:text-ink"
            >
              {link.label}
            </ExternalLink>
          ))}
        </nav>
      </div>
    </footer>
  );
}
