import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import FeedbackDialog from "@/components/FeedbackDialog";
import { getCountries, getProjects } from "@/lib/data";

const LINKEDIN =
  "https://www.linkedin.com/in/simon-sl%C4%83nin%C4%83-528657333/";
const GITHUB = "https://github.com/SimonSl07";
const REPO = "https://github.com/SimonSl07/InfraWorldWide";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang, namespace: "about" });
  return { title: t("title"), description: t("lead") };
}

function External({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2 hover:text-neutral-900"
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
      <p className="mt-3 text-lg text-neutral-600">{t("lead")}</p>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("dataTitle")}</h2>
        <p className="mt-2 text-neutral-600">
          {t("dataBody", {
            projects: projects.length,
            lots,
            countries: getCountries().length,
          })}
        </p>
        <p className="mt-3 text-neutral-600">{t("dataSources")}</p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("helpTitle")}</h2>
        <p className="mt-2 text-neutral-600">{t("helpBody")}</p>
        <ul className="mt-4 space-y-3 text-neutral-600">
          <li className="flex gap-3">
            <span aria-hidden className="text-neutral-400">
              1.
            </span>
            {/* A div, not a span: FeedbackDialog renders a <dialog>, which is
                flow content and has no business inside phrasing content. */}
            <div>
              {t("helpReport")}{" "}
              <FeedbackDialog
                triggerClassName="font-medium text-neutral-900 underline underline-offset-2 hover:text-neutral-600"
                triggerLabel={t("helpReportCta")}
              />
            </div>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="text-neutral-400">
              2.
            </span>
            <span>
              {t("helpData")} <External href={REPO}>{t("helpRepoCta")}</External>
            </span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="text-neutral-400">
              3.
            </span>
            <span>{t("helpSpread")}</span>
          </li>
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("builderTitle")}</h2>
        <p className="mt-2 text-neutral-600">{t("builderBody")}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={LINKEDIN}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium transition-colors hover:border-neutral-900"
          >
            LinkedIn
          </a>
          <a
            href={GITHUB}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium transition-colors hover:border-neutral-900"
          >
            GitHub
          </a>
        </div>
      </section>

      <section className="mt-10 rounded-xl border border-neutral-200 bg-neutral-50 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          {t("startTitle")}
        </h2>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link
            href="/map"
            className="rounded-lg bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700"
          >
            {t("startMap")}
          </Link>
          <Link
            href="/rankings"
            className="rounded-lg border border-neutral-300 px-4 py-2 font-medium hover:border-neutral-900"
          >
            {t("startPerformance")}
          </Link>
        </div>
      </section>
    </div>
  );
}
