import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "./LanguageSwitcher";

export default async function Header() {
  const t = await getTranslations();

  return (
    <header className="border-b border-neutral-200 bg-white/90 backdrop-blur sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-6">
        <Link href="/" className="font-bold text-lg tracking-tight">
          {t("site.name")}
        </Link>
        <nav className="flex items-center gap-4 text-sm text-neutral-600">
          <Link href="/map" className="hover:text-neutral-900">
            {t("nav.map")}
          </Link>
          <Link href="/projects" className="hover:text-neutral-900">
            {t("nav.projects")}
          </Link>
        </nav>
        <div className="ml-auto">
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
