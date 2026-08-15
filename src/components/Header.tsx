import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import FeedbackDialog from "./FeedbackDialog";
import LanguageSwitcher from "./LanguageSwitcher";
import SiteNav, { type NavItem } from "./SiteNav";

export default async function Header() {
  const t = await getTranslations();

  const items: NavItem[] = [
    { href: "/map", label: t("nav.map") },
    { href: "/projects", label: t("nav.projects") },
    { href: "/countries", label: t("nav.countries") },
    { href: "/cities", label: t("nav.cities") },
    { href: "/rankings", label: t("nav.rankings") },
    { href: "/about", label: t("nav.about") },
  ];

  return (
    <header className="border-b border-line bg-surface/90 backdrop-blur sticky top-0 z-50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-inverse focus:px-3 focus:py-2 focus:text-sm focus:text-on-inverse"
      >
        {t("nav.skipToContent")}
      </a>
      <div className="relative mx-auto max-w-7xl px-4 h-14 flex items-center gap-6">
        <Link href="/" className="font-bold text-lg tracking-tight shrink-0">
          {t("site.name")}
        </Link>
        <SiteNav
          items={items}
          menuLabel={t("nav.menu")}
          closeMenuLabel={t("nav.closeMenu")}
        >
          <FeedbackDialog />
          <LanguageSwitcher />
        </SiteNav>
      </div>
    </header>
  );
}
