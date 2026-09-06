import { formatMoney } from "@/lib/format";
import type { Money } from "@/lib/schema";

/**
 * The part of next-intl's translator these components use. Kept this loose so
 * a server page can hand down its `getTranslations()` result and a client
 * panel its `useTranslations()` one: none of the components calls a hook.
 */
export type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

function MoneyTag({ children }: { children: string }) {
  return (
    <span className="ml-1.5 rounded bg-surface-raised px-1 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
      {children}
    </span>
  );
}

/**
 * One recorded cost figure, with everything the source qualified it with.
 *
 * The price year is optional, so it is only printed when there is one: a
 * blank pair of brackets, or worse a year that is not the source's, would
 * change what the figure claims. Scope and confidence are shown when they
 * are not the plain case, because a whole-programme total sitting in a
 * per-section column is exactly the figure that gets misread.
 *
 * This is the one place a Money is printed with its qualifiers. The map panel
 * used to do it by hand and showed "(undefined)" for a year-less figure.
 */
export function MoneyLine({
  money,
  locale,
  t,
}: {
  money: Money;
  locale: string;
  t: Translate;
}) {
  return (
    <>
      {formatMoney(money, locale)}
      {money.year !== undefined && (
        <span className="ml-1 text-xs text-ink-faint">({money.year})</span>
      )}
      {money.scope && money.scope !== "total" && (
        <MoneyTag>{t(`project.moneyScope.${money.scope}`)}</MoneyTag>
      )}
      {money.confidence && money.confidence !== "reported" && (
        <MoneyTag>{t(`project.moneyConfidence.${money.confidence}`)}</MoneyTag>
      )}
      {money.note && (
        <span className="block max-w-xs text-xs leading-snug text-ink-muted">
          {money.note}
        </span>
      )}
    </>
  );
}
