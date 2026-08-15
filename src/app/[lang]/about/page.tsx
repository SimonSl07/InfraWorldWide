import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import FeedbackDialog from "@/components/FeedbackDialog";
import { getCountries, getProjects } from "@/lib/data";
import { EXTERNAL_LINKS } from "@/lib/links";
import { pageMetadata } from "@/lib/page-metadata";

const LINKEDIN =
  "https://www.linkedin.com/in/simon-sl%C4%83nin%C4%83-528657333/";
const GITHUB = EXTERNAL_LINKS.github;
const REPO = EXTERNAL_LINKS.repo;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang });
  return pageMetadata({
    locale: lang,
    path: "/about",
    title: t("about.title"),
    description: t("about.lead"),
    siteName: t("site.name"),
  });
}

function External({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2 hover:text-ink"
    >
      {children}
    </a>
  );
}

export default async function AboutPage({
  params,
}: PageProps<"/[lang]/about">) {
  const { lang } = await params;
  setRequestLocale(lang);
  const t = await getTranslations("about");

  const projects = getProjects();
  const lots = projects.reduce((sum, p) => sum + p.lots.length, 0);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
      <p className="mt-3 text-lg text-ink-soft">{t("lead")}</p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("dataTitle")}</h2>
        <p className="mt-2 text-ink-soft">
          {t("dataBody", {
            projects: projects.length,
            lots,
            countries: getCountries().length,
          })}
        </p>
        <p className="mt-3 text-ink-soft">{t("dataSources")}</p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("helpTitle")}</h2>
        <p className="mt-2 text-ink-soft">{t("helpBody")}</p>
        <ul className="mt-4 space-y-3 text-ink-soft">
          <li className="flex gap-3">
            <span aria-hidden className="text-ink-faint">
              1.
            </span>
            {/* A div, not a span: FeedbackDialog renders a <dialog>, which is
                flow content and has no business inside phrasing content. */}
            <div>
              {t("helpReport")}{" "}
              <FeedbackDialog
                triggerClassName="font-medium text-ink underline underline-offset-2 hover:text-ink-soft"
                triggerLabel={t("helpReportCta")}
              />
            </div>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="text-ink-faint">
              2.
            </span>
            <span>
              {t("helpData")} <External href={REPO}>{t("helpRepoCta")}</External>
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="text-ink-faint">
              3.
            </span>
            <span>{t("helpSpread")}</span>
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("builderTitle")}</h2>
        <p className="mt-2 text-ink-soft">{t("builderBody")}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={LINKEDIN}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium transition-colors hover:border-inverse"
          >
            LinkedIn
          </a>
          <a
            href={GITHUB}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium transition-colors hover:border-inverse"
          >
            GitHub
          </a>
        </div>
      </section>

      <section className="mt-10 rounded-xl border border-line bg-surface-sunken p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {t("startTitle")}
        </h2>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link
            href="/map"
            className="rounded-lg bg-inverse px-4 py-2 font-medium text-on-inverse hover:bg-inverse-soft"
          >
            {t("startMap")}
          </Link>
          <Link
            href="/rankings"
            className="rounded-lg border border-line-strong px-4 py-2 font-medium hover:border-inverse"
          >
            {t("startPerformance")}
          </Link>
        </div>
      </section>
    </div>
  );
}
