"use client";

import { useTranslations } from "next-intl";
import type { Contract } from "@/lib/schema";
import { contractSummaryParts } from "@/lib/contract";

/**
 * Public-contract terms (design/execution months, value, notice reference) —
 * the provenance behind a projected opening date.
 */
export default function ContractTerms({ contract }: { contract: Contract }) {
  const t = useTranslations();
  const parts = contractSummaryParts(contract, t);
  if (parts.length === 0 && !contract.noticeReference) return null;

  return (
    <div className="mt-3 text-sm">
      <div className="text-neutral-500">{t("project.contract")}</div>
      {parts.length > 0 && <div className="mt-0.5">{parts.join(" · ")}</div>}
      {contract.noticeReference && (
        <div className="mt-0.5 text-xs text-neutral-500">
          {contract.noticeUrl ? (
            <a
              href={contract.noticeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-neutral-900"
            >
              {contract.noticeReference}
            </a>
          ) : (
            contract.noticeReference
          )}
        </div>
      )}
    </div>
  );
}
