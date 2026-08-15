"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Contract } from "@/lib/schema";
import { contractSummaryParts } from "@/lib/contract";

/**
 * Public-contract terms (design/execution months, value): the provenance
 * behind a projected opening date.
 *
 * The notice reference and its URL are gone from the data. All 160 references
 * were prose rather than notice numbers and all 190 URLs pointed at press or
 * Wikipedia rather than an award notice, so both were migrated out: the prose
 * to `lot.note`, which `note` renders here, and the links to `lot.sources`.
 */
export default function ContractTerms({
  contract,
  note,
}: {
  contract: Contract;
  /** `lot.note`, already localized by the caller. */
  note?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const parts = contractSummaryParts(contract, t, locale);
  if (parts.length === 0 && !note) return null;

  return (
    <div className="mt-3 text-sm">
      <div className="text-ink-muted">{t("project.contract")}</div>
      {parts.length > 0 && <div className="mt-0.5">{parts.join(" · ")}</div>}
      {note && <p className="mt-1 text-xs leading-snug text-ink-muted">{note}</p>}
    </div>
  );
}
