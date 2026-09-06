import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  MIN_RANKED_LOTS,
  findContractorProfile,
} from "@/lib/contractor-directory";
import type { LotMetric } from "@/lib/rankings";
import { countryName } from "@/lib/country-names";
import {
  formatKm,
  formatMonth,
  formatMonths,
  formatPercent,
} from "@/lib/format";
import { createLocalizer } from "@/lib/localized";
import { pageMetadata } from "@/lib/page-metadata";
import { CountryLabel } from "@/components/ui/CountryLabel";
import { SectionLink } from "@/components/ui/SectionLink";
import { loadContractorProfiles } from "../profiles";

export function generateStaticParams() {
  // Locales are enumerated by the parent [lang] layout.
  return loadContractorProfiles().map((p) => ({ id: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const profile = findContractorProfile(loadContractorProfiles(), id);
  if (!profile) return {};
  const t = await getTranslations({ locale: lang });
  return pageMetadata({
    locale: lang,
    path: `/contractors/${id}`,
    title: profile.name,
    description: t("contractors.metaDescription"),
    siteName: t("site.name"),
  });
}

export default async function ContractorPage({
  params,
}: PageProps<"/[lang]/contractors/[id]">) {
  const { lang, id } = await params;
  setRequestLocale(lang);
  const t = await getTranslations();

  const profile = findContractorProfile(loadContractorProfiles(), id);
  if (!profile) notFound();

  const name = createLocalizer(lang);
  const ranking = profile.ranking;

  const sectionLink = (metric: LotMetric) => (
    <SectionLink
      projectId={metric.projectId}
      projectName={name(metric.projectName)}
      lotName={name(metric.lotName)}
      category={metric.category}
    />
  );

  const countryCell = (code: string) => (
    <CountryLabel
      code={code}
      name={countryName(code, lang)}
      className="whitespace-nowrap text-ink-soft"
    />
  );

  const headline = [
    {
      label: t("rankings.thLots"),
      value: String(profile.countedSections),
    },
    {
      label: t("rankings.thKm"),
      value: formatKm(profile.km, lang),
    },
    {
      label: t("rankings.thMedianSlip"),
      value:
        ranking?.slip.median === undefined || ranking?.slip.median === null
          ? "–"
          : formatMonths(ranking.slip.median, t("rankings.unitMonths"), lang),
      tone:
        ranking?.slip.median != null
          ? ranking.slip.median > 0
            ? "text-bad"
            : "text-good"
          : undefined,
    },
    {
      label: t("rankings.thMedianOverrun"),
      value:
        ranking?.overrun.estimate.median === undefined ||
        ranking?.overrun.estimate.median === null
          ? "–"
          : formatPercent(ranking.overrun.estimate.median, lang),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <Link
        href="/contractors"
        className="text-sm text-ink-muted hover:text-ink"
      >
        ← {t("contractors.backToContractors")}
      </Link>

      <h1 className="mt-4 text-3xl font-bold">{profile.name}</h1>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
        {profile.countries.map((code) => (
          <span key={code}>{countryCell(code)}</span>
        ))}
      </div>

      {!profile.registered && (
        <div className="mt-4 max-w-3xl rounded-md border border-warn bg-warn-soft px-4 py-3 text-sm text-warn">
          <p className="font-semibold">{t("contractors.registryGapTitle")}</p>
          <p className="mt-1">{t("contractors.unregisteredBadge")}</p>
        </div>
      )}

      <dl className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {headline.map((item) => (
          <div key={item.label}>
            <dt className="text-sm text-ink-muted">{item.label}</dt>
            <dd
              className={`mt-1 text-2xl font-bold tabular-nums ${item.tone ?? ""}`}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 max-w-3xl space-y-1 text-xs text-ink-muted">
        {ranking && ranking.slip.n > 0 ? (
          <p>
            {t("contractors.measuredOn", {
              measured: ranking.slip.n,
              total: profile.countedSections,
            })}
          </p>
        ) : (
          <p>{t("contractors.noDeliveryData")}</p>
        )}
        {ranking?.overrun.estimate.n === 0 && (
          <p>{t("contractors.noOverrunData")}</p>
        )}
        {!profile.ranked && profile.built.length > 0 && (
          <p>{t("contractors.notRankedHere")}</p>
        )}
        <p>{t("contractors.builderOnly")}</p>
      </div>

      {profile.jointVentures.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">
            {t("contractors.jointVenturesTitle")}
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {profile.jointVentures.map((venture) => (
              <li
                key={venture}
                className="rounded-full bg-surface-raised px-3 py-1 text-sm text-ink-soft"
              >
                {venture}
              </li>
            ))}
          </ul>
          <p className="mt-2 max-w-3xl text-xs text-ink-muted">
            {t("contractors.jointVentureNote")}
          </p>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-semibold">{t("contractors.builtTitle")}</h2>
        {profile.built.length === 0 ? (
          <p className="mt-2 text-sm text-ink-faint">–</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-max text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t("rankings.thSection")}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t("rankings.thCountry")}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    {t("project.status")}
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right font-medium">
                    {t("rankings.thKm")}
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right font-medium">
                    {t("rankings.thOpened")}
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right font-medium">
                    {t("rankings.thSlip")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {profile.built.map((metric) => (
                  <tr key={`${metric.projectId}/${metric.lotId}`}>
                    <td className="py-2 pr-4">{sectionLink(metric)}</td>
                    <td className="py-2 pr-4">{countryCell(metric.country)}</td>
                    <td className="py-2 pr-4 text-ink-soft">
                      {t(`status.${metric.status}`)}
                    </td>
                    <td className="py-2 pl-4 text-right tabular-nums text-ink-soft">
                      {formatKm(metric.lengthKm, lang)}
                    </td>
                    <td className="py-2 pl-4 text-right tabular-nums text-ink-soft">
                      {metric.openedMonth === null
                        ? "–"
                        : formatMonth(metric.openedMonth, lang)}
                    </td>
                    <td className="py-2 pl-4 text-right tabular-nums">
                      {metric.slip === null ? (
                        <span className="text-ink-faint">–</span>
                      ) : (
                        <span
                          className={`font-semibold ${metric.slip.slipMonths > 0 ? "text-bad" : "text-good"}`}
                        >
                          {formatMonths(
                            metric.slip.slipMonths,
                            t("rankings.unitMonths"),
                            lang,
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {profile.otherRoles.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">
            {t("contractors.otherRolesTitle")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-muted">
            {t("contractors.otherRolesHelp")}
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {profile.otherRoles.map(({ metric, role }) => (
              <li
                key={`${metric.projectId}/${metric.lotId}/${role}`}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="min-w-0">{sectionLink(metric)}</span>
                <span className="shrink-0 rounded-full bg-surface-raised px-2 py-0.5 text-[11px] text-ink-soft">
                  {t(`contractorRole.${role}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 text-xs text-ink-faint">
        {t("contractors.leagueHelp", { min: MIN_RANKED_LOTS })}
      </p>
    </div>
  );
}
