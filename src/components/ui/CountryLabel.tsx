import { flagEmoji } from "@/lib/country-names";

/**
 * A flag with the country's name. The flag is decoration and hidden from
 * assistive tech; the name is what gets read, either visibly or, in a row of
 * flags where names would not fit, as screen-reader-only text with the same
 * name as a tooltip for everyone else.
 */
export function CountryLabel({
  code,
  name,
  srOnlyName = false,
  className,
  flagClassName = "mr-1",
}: {
  code: string;
  /** Already localized. */
  name: string;
  srOnlyName?: boolean;
  className?: string;
  /** Gap after the flag while the name is visible. */
  flagClassName?: string;
}) {
  return (
    <span title={srOnlyName ? name : undefined} className={className}>
      {/* No gap when the name is invisible: there is nothing to separate. */}
      <span aria-hidden className={srOnlyName ? undefined : flagClassName}>
        {flagEmoji(code)}
      </span>
      {srOnlyName ? <span className="sr-only">{name}</span> : name}
    </span>
  );
}
