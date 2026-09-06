import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getCountries, getProjects } from "@/lib/data";
import { computeStats } from "@/lib/stats";
import { CATEGORY_COLORS } from "@/lib/map-style";
import { formatNumber } from "@/lib/format";

/**
 * Social preview. Shared links previewed as a bare URL before this existed.
 *
 * Drawn from the same figures the landing page shows, so the card cannot
 * drift from the dataset.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "InfraWorldWide";

export function generateStaticParams() {
  return routing.locales.map((lang) => ({ lang }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang });
  const stats = computeStats(getProjects(), new Date().getFullYear());

  const figures = [
    // Labels through the catalogue like every other string: the card is
    // rendered once per locale, and it used to read English on /ro.
    {
      value: formatNumber(Math.round(stats.openedKm), lang),
      label: t("og.km"),
    },
    { value: formatNumber(stats.projectCount, lang), label: t("og.projects") },
    {
      value: formatNumber(getCountries().length, lang),
      label: t("og.countries"),
    },
  ];

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#ffffff",
        padding: 72,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div
          style={{
            fontSize: 30,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#737373",
          }}
        >
          {t("site.name")}
        </div>
        <div
          style={{
            fontSize: 76,
            fontWeight: 700,
            color: "#171717",
            lineHeight: 1.1,
            maxWidth: 900,
          }}
        >
          {t("site.tagline")}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
        {/* The map's own category palette, as a route band. */}
        <div style={{ display: "flex", height: 12 }}>
          {Object.values(CATEGORY_COLORS).map((color) => (
            <div key={color} style={{ flex: 1, background: color }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 64 }}>
          {figures.map((figure) => (
            <div
              key={figure.label}
              style={{ display: "flex", flexDirection: "column" }}
            >
              <div style={{ fontSize: 60, fontWeight: 700, color: "#171717" }}>
                {figure.value}
              </div>
              <div style={{ fontSize: 26, color: "#737373" }}>
                {figure.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    size,
  );
}
