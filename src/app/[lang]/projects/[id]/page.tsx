import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getProject, getProjects } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/format";
import { CATEGORY_COLORS } from "@/lib/map-style";
import { Link } from "@/i18n/navigation";
import ProjectMiniMap from "@/components/map/ProjectMiniMap";
import { contractSummaryParts, expectedOpeningYear } from "@/lib/contract";
import type { Status } from "@/lib/schema";

const STATUS_BADGE: Record<Status, string> = {
  opened: "bg-green-100 text-green-800",
  under_construction: "bg-amber-100 text-amber-800",
  tendered: "bg-blue-100 text-blue-800",
  planned: "bg-neutral-100 text-neutral-600",
  cancelled: "bg-red-100 text-red-700",
};

export function generateStaticParams() {
  // Locales are enumerated by the parent [lang] layout.
  return getProjects().map((p) => ({ id: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const project = getProject(id);
  if (!project) return {};
  return { title: lang === "ro" && project.name.ro ? project.name.ro : project.name.en };
}

export default async function ProjectPage({
  params,
}: PageProps<"/[lang]/projects/[id]">) {
  const { lang, id } = await params;
  setRequestLocale(lang);
  const t = await getTranslations();

  const project = getProject(id);
  if (!project) notFound();

  const name = (s: { en: string; ro?: string }) =>
    lang === "ro" && s.ro ? s.ro : s.en;

  return (
    <div className="mx-auto max-w-5xl w-full px-4 py-8">
      <Link
        href="/projects"
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        ← {t("project.backToProjects")}
      </Link>

      <div className="mt-4 flex items-center gap-3">
        <span
          className="inline-block w-6 h-1.5 rounded-full"
          style={{ backgroundColor: CATEGORY_COLORS[project.category] }}
        />
        <span className="text-sm text-neutral-500 uppercase">
          {t(`category.${project.category}`)}
        </span>
      </div>
      <h1 className="mt-1 text-3xl font-bold">{name(project.name)}</h1>
      <p className="mt-3 text-neutral-600 max-w-3xl">
        {name(project.description)}
      </p>

      <div className="mt-6">
        <ProjectMiniMap
          country={project.country}
          projectId={project.id}
          category={project.category}
        />
      </div>

      <h2 className="mt-10 text-xl font-semibold">{t("project.lots")}</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-neutral-500 border-b border-neutral-200">
              <th className="py-2 pr-4 font-medium">{t("project.lots")}</th>
              <th className="py-2 pr-4 font-medium">{t("project.status")}</th>
              <th className="py-2 pr-4 font-medium">{t("project.length")}</th>
              <th className="py-2 pr-4 font-medium">{t("project.dates")}</th>
              <th className="py-2 pr-4 font-medium">{t("project.cost")}</th>
              <th className="py-2 pr-4 font-medium">{t("project.funding")}</th>
              <th className="py-2 pr-4 font-medium">{t("project.contractors")}</th>
              <th className="py-2 font-medium">{t("project.contract")}</th>
            </tr>
          </thead>
          <tbody>
            {project.lots.map((lot) => {
              const dateParts: string[] = [];
              if (lot.dates?.constructionStart)
                dateParts.push(
                  `${t("project.constructionStart")}: ${formatDate(lot.dates.constructionStart, lang)}`,
                );
              if (lot.dates?.opened)
                dateParts.push(
                  `${t("project.opened")}: ${formatDate(lot.dates.opened, lang)}`,
                );
              if (lot.dates?.expectedOpening && !lot.dates?.opened)
                dateParts.push(
                  `${t("project.expectedOpening")}: ${formatDate(lot.dates.expectedOpening, lang)}`,
                );
              // Contract-derived estimate when no date is directly sourced.
              if (!lot.dates?.opened && !lot.dates?.expectedOpening) {
                const derived = expectedOpeningYear(lot);
                if (derived !== null) {
                  dateParts.push(
                    `${t("project.expectedOpeningDerived")}: ≈${derived}`,
                  );
                }
              }
              const costParts: string[] = [];
              if (lot.cost?.estimated)
                costParts.push(
                  `${t("project.estimated")} ${formatMoney(lot.cost.estimated)} (${lot.cost.estimated.year})`,
                );
              if (lot.cost?.actual)
                costParts.push(
                  `${t("project.actual")} ${formatMoney(lot.cost.actual)} (${lot.cost.actual.year})`,
                );
              return (
                <tr
                  key={lot.id}
                  className="border-b border-neutral-100 align-top"
                >
                  <td className="py-3 pr-4 font-medium">{name(lot.name)}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_BADGE[lot.status]}`}
                    >
                      {t(`status.${lot.status}`)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap">
                    {lot.lengthKm} km
                  </td>
                  <td className="py-3 pr-4 text-neutral-600">
                    {dateParts.length > 0 ? dateParts.join(" · ") : "–"}
                  </td>
                  <td className="py-3 pr-4 text-neutral-600">
                    {costParts.length > 0 ? costParts.join(" · ") : "–"}
                  </td>
                  <td className="py-3 pr-4 text-neutral-600">
                    {lot.funding && lot.funding.length > 0
                      ? lot.funding
                          .map((f) => t(`funding.${f.source}`))
                          .join(", ")
                      : "–"}
                  </td>
                  <td className="py-3 pr-4 text-neutral-600">
                    {lot.contractors && lot.contractors.length > 0
                      ? lot.contractors.map((c) => c.name).join(", ")
                      : "–"}
                  </td>
                  <td className="py-3 text-neutral-600">
                    {lot.contract ? (
                      <>
                        {contractSummaryParts(lot.contract, t).join(" · ") || "–"}
                        {lot.contract.noticeReference && (
                          <div className="mt-1 text-xs text-neutral-500">
                            {lot.contract.noticeUrl ? (
                              <a
                                href={lot.contract.noticeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline underline-offset-2 hover:text-neutral-900"
                              >
                                {lot.contract.noticeReference}
                              </a>
                            ) : (
                              lot.contract.noticeReference
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      "–"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-semibold">{t("project.sources")}</h2>
      <ul className="mt-3 list-disc pl-5 text-sm text-neutral-600 space-y-1">
        {project.sources.map((s) => (
          <li key={s.url}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-neutral-900"
            >
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
