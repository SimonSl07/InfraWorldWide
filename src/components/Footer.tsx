import { getTranslations } from "next-intl/server";

export default async function Footer() {
  const t = await getTranslations("footer");

  return (
    <footer className="border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto max-w-7xl px-4 py-6 text-xs text-neutral-500 space-y-1">
        <p>{t("mapData")}</p>
        <p>{t("infraData")}</p>
        <p>{t("disclaimer")}</p>
      </div>
    </footer>
  );
}
