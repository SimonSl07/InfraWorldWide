import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { orderByMedianSlip } from "@/lib/performance";
import {
  MIN_RANKED_LOTS,
  unregisteredFirms,
  type ContractorProfile,
} from "@/lib/contractor-directory";
import { countryName, flagEmoji } from "@/lib/country-names";
import { formatKm, formatMonths, formatPercent } from "@/lib/format";
import { pageMetadata } from "@/lib/page-metadata";
import { loadContractorProfiles } from "./profiles";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const t = await getTranslations({ locale: lang });
  return pageMetadata({
    locale: lang,
    path: "/contractors",
    title: t("contractors.title"),
    description: t("contractors.metaDescription"),
    siteName: t("site.name"),
  });
}

export default async function ContractorsPage({
  params,
}: PageProps<"/[lang]/contractors">) {
  const { lang } = await params;
  setRequestLocale(lang);
  const t = await getTranslations();

  const profiles = loadContractorProfiles();
  const unregistered = unregisteredFirms(profiles);

  // Ordered exactly as the performance page orders its by-contractor table,
  // so the same firm cannot sit at a different place in the two leagues.
  const ranked = orderByMedianSlip(
    profiles.flatMap((p) => (p.ranking && p.ranked ? [p.ranking] : [])),
    MIN_RANKED_LOTS,
  ).flatMap((group) => {
    const profile = profiles.find((p) => p.id === group.key);
    return profile ? [{ profile, group }] : [];
  });

  const singleSection = profiles.filter(
    (p) => p.built.length > 0 && !p.ranked,
  ).length;

  const firmCell = (profile: ContractorProfile) => (
    <span className="flex items-baseline gap-2">
      <Link
        href={`/contractors/${profile.id}`}
        className="font-medium hover:underline underline-offset-2"
      >
        {profile.name}
      </Link>
      {!profile.registered && (
        <span
          title={t("contractors.registryGap", {
            unregistered: unregistered.length,
            total: profiles.length,
          })}
          className="shrink-0 rounded-full bg-warn-soft px-1.5 py-0.5 text-[10px] font-medium text-warn"
        >
          {t("contractors.unregisteredBadge")}
        </span>
      )}
    </span>
  );

  const countriesCell = (profile: ContractorProfile) => (
    <span className="text-ink-soft">
      {profile.countries.map((code) => (
        <span key={code} title={countryName(code, lang)} className="mr-1">
          <span aria-hidden>{flagEmoji(code)}</span>
          <span className="sr-only">{countryName(code, lang)}</span>
        </span>
      ))}
    </span>
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-bold">{t("contractors.title")}</h1>
      <p className="mt-2 max-w-3xl text-ink-soft">
        {t("contractors.intro")}
      </p>

      <div className="mt-4 max-w-3xl space-y-2 rounded-md border border-line bg-surface-sunken px-4 py-3 text-sm text-ink-soft">
        <p>{t("contractors.builderOnly")}</p>
        <p className="text-ink-muted">{t("contractors.jointVentureNote")}</p>
      </div>

      {unregistered.length > 0 && (
        <div className="mt-4 max-w-3xl rounded-md border border-warn bg-warn-soft px-4 py-3 text-sm text-warn">
          <p className="font-semibold">{t("contractors.registryGapTitle")}</p>
          <p className="mt-1">
            {t("contractors.registryGap", {
              unregistered: unregistered.length,
              total: profiles.length,
            })}
          </p>
        </div>
      )}

      {profiles.length === 0 ? (
        <p className="mt-8 text-ink-muted">{t("contractors.empty")}</p>
      ) : (
        <>
          <section className="mt-12">
            <h2 className="text-lg font-semibold">
              {t("contractors.leagueTitle")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              {t("contractors.leagueHelp", { min: MIN_RANKED_LOTS })}
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {t("contractors.thFirm")}
                    </th>
                    <th scope="col" className="py-2 pl-4 text-right font-medium">
                      {t("rankings.thLots")}
                    </th>
                    <th scope="col" className="py-2 pl-4 text-right font-medium">
                      {t("rankings.thKm")}
                    </th>
                    <th scope="col" className="py-2 pl-4 text-right font-medium">
                      {t("rankings.thMedianSlip")}
                    </th>
                    <th scope="col" className="py-2 pl-4 text-right font-medium">
                      {t("rankings.thOnTime")}
                    </th>
                    <th scope="col" className="py-2 pl-4 text-right font-medium">
                      {t("rankings.thMedianOverrun")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {ranked.map(({ profile, group }) => (
                    <tr key={profile.id}>
                      <td className="py-2 pr-4">{firmCell(profile)}</td>
                      <td className="py-2 pl-4 text-right tabular-nums">
                        {group.lots}
                      </td>
                      <td className="py-2 pl-4 text-right tabular-nums text-ink-soft">
                        {formatKm(group.km, lang)}
                      </td>
                      <td className="py-2 pl-4 text-right tabular-nums">
                        {group.slip.median === null ? (
                          "–"
                        ) : (
                          <span
                            className={`font-semibold ${group.slip.median > 0 ? "text-bad" : "text-good"}`}
                          >
                            {formatMonths(
                              group.slip.median,
                              t("rankings.unitMonths"),
                            )}
                          </span>
                        )}
                        <span className="ml-1 text-[10px] text-ink-faint">
                          n={group.slip.n}
                        </span>
                      </td>
                      <td className="py-2 pl-4 text-right tabular-nums text-ink-soft">
                        {group.onTimeShare === null
                          ? "–"
                          : `${Math.round(group.onTimeShare * 100)}%`}
                      </td>
                      <td className="py-2 pl-4 text-right tabular-nums text-ink-soft">
                        {group.overrun.estimate.median === null
                          ? "–"
                          : formatPercent(group.overrun.estimate.median)}
                        <span className="ml-1 text-[10px] text-ink-faint">
                          n={group.overrun.estimate.n}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {singleSection > 0 && (
              <p className="mt-3 max-w-3xl text-xs text-ink-muted">
                {t("contractors.unrankedNote", { count: singleSection })}
              </p>
            )}
          </section>

          <section className="mt-12">
            <h2 className="text-lg font-semibold">
              {t("contractors.directoryTitle")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">
              {t("contractors.directoryHelp", { count: profiles.length })}
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {t("contractors.thFirm")}
                    </th>
                    <th scope="col" className="py-2 pl-4 text-right font-medium">
                      {t("rankings.thLots")}
                    </th>
                    <th scope="col" className="py-2 pl-4 text-right font-medium">
                      {t("rankings.thKm")}
                    </th>
                    <th scope="col" className="py-2 pl-4 text-left font-medium">
                      {t("contractors.thCountries")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {profiles.map((profile) => (
                    <tr key={profile.id}>
                      <td className="py-2 pr-4">{firmCell(profile)}</td>
                      <td className="py-2 pl-4 text-right tabular-nums">
                        {profile.countedSections}
                      </td>
                      <td className="py-2 pl-4 text-right tabular-nums text-ink-soft">
                        {formatKm(profile.km, lang)}
                      </td>
                      <td className="py-2 pl-4">{countriesCell(profile)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
