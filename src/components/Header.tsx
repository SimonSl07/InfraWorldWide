import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import FeedbackDialog from "./FeedbackDialog";
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
          <Link href="/countries" className="hover:text-neutral-900">
            {t("nav.countries")}
          </Link>
          <Link href="/rankings" className="hover:text-neutral-900">
            {t("nav.rankings")}
          </Link>
          <Link href="/about" className="hover:text-neutral-900">
            {t("nav.about")}
          </Link>
          <FeedbackDialog />
        </nav>
        <div className="ml-auto">
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
