import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { absoluteUrl, buildAlternates, localePath, siteUrl } from "@/lib/seo";
import {
  datasetJsonLd,
  jsonLdScript,
  websiteJsonLd,
} from "@/lib/structured-data";
import { getCountries, getProjects } from "@/lib/data";
import { dataYearRange } from "@/lib/stats";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return routing.locales.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: "site" });
  const baseUrl = siteUrl(process.env);
  const alternates = buildAlternates({
    baseUrl,
    path: "/",
    locale: lang,
    locales: routing.locales,
    defaultLocale: routing.defaultLocale,
  });

  return {
    // Absolute origin for canonical, alternate and og:image URLs. Without it
    // every one of them resolves relative and breaks once shared.
    metadataBase: new URL(baseUrl),
    // A plain string here would be replaced outright by every child page, so
    // the A1 page's title was just "A1 motorway" with no site name at all.
    title: { default: t("name"), template: `%s · ${t("name")}` },
    description: t("tagline"),
    alternates: {
      ...alternates,
      types: {
        "application/rss+xml": [
          {
            url: absoluteUrl(baseUrl, localePath(lang, "/openings.xml")),
            title: t("name"),
          },
        ],
      },
    },
    openGraph: {
      type: "website",
      siteName: t("name"),
      title: t("name"),
      description: t("tagline"),
      locale: lang,
      url: alternates.canonical,
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function LangLayout({
  children,
  params,
}: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(routing.locales, lang)) {
    notFound();
  }
  setRequestLocale(lang);

  const t = await getTranslations({ locale: lang, namespace: "site" });
  const baseUrl = siteUrl(process.env);
  const years = dataYearRange(getProjects());
  const structuredData = [
    datasetJsonLd({
      baseUrl,
      locale: lang,
      name: t("name"),
      description: t("tagline"),
      countries: getCountries(),
      firstYear: years.first,
      lastYear: years.last,
    }),
    websiteJsonLd({ baseUrl, locale: lang, name: t("name") }),
  ];

  return (
    <html
      lang={lang}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-surface text-ink">
        <script
          type="application/ld+json"
          // Declares the site as a Dataset with its licence, temporal range
          // and machine-readable distributions, so it is discoverable as data.
          dangerouslySetInnerHTML={{ __html: jsonLdScript(structuredData) }}
        />
        <NextIntlClientProvider>
          <Header />
          <main id="main" className="flex-1 flex flex-col">
            {children}
          </main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
