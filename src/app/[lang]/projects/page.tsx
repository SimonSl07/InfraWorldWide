import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getProjects } from "@/lib/data";
import { getOpenings, type Opening } from "@/lib/timeline";
import { formatDate, formatKm } from "@/lib/format";
import { categoryVar } from "@/lib/map-theme";
import { createLocalizer } from "@/lib/localized";
import { pageMetadata } from "@/lib/page-metadata";
import ProjectsBrowser from "@/components/ProjectsBrowser";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang });
  return pageMetadata({
    locale: lang,
    path: "/projects",
    title: t("projects.title"),
    description: t("home.subtitle"),
    siteName: t("site.name"),
  });
}

function OpeningList({
  title,
  openings,
  locale,
}: {
  title: string;
  openings: Opening[];
  locale: string;
}) {
  const name = createLocalizer(locale);
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </h3>
      {openings.length === 0 ? (
        <p className="mt-2 text-sm text-ink-faint">–</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {openings.slice(0, 10).map((o) => (
            <li key={`${o.projectId}/${o.lotId}`} className="text-sm">
              <Link
                href={`/projects/${o.projectId}`}
                className="flex items-baseline gap-2 hover:underline underline-offset-2"
              >
                <span className="tabular-nums text-ink-muted shrink-0 w-20">
                  {formatDate(o.date, locale)}
                </span>
                <span
                  className="inline-block w-3 h-1 rounded-full shrink-0 translate-y-[-2px]"
                  style={{ backgroundColor: categoryVar(o.category) }}
                />
                <span className="min-w-0 truncate">
                  {name(o.projectName)} / {name(o.lotName)}
                </span>
                <span className="text-ink-faint shrink-0">
                  {formatKm(o.lengthKm, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function ProjectsPage({
  params,
}: PageProps<"/[lang]/projects">) {
  const { lang } = await params;
  setRequestLocale(lang);
  const t = await getTranslations("projects");

  const projects = getProjects();
  const { past, scheduled } = getOpenings(projects);

  return (
    <div className="mx-auto max-w-7xl w-full px-4 py-8">
      <h1 className="text-3xl font-bold">{t("title")}</h1>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t("openings")}</h2>
        <div className="mt-4 grid gap-8 sm:grid-cols-2">
          <OpeningList title={t("pastOpenings")} openings={past} locale={lang} />
          <OpeningList
            title={t("scheduledOpenings")}
            openings={scheduled}
            locale={lang}
          />
        </div>
      </section>

      <section className="mt-12">
        <ProjectsBrowser projects={projects} />
      </section>
    </div>
  );
}
