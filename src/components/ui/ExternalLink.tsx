import type { ReactNode } from "react";

/**
 * A link that leaves the site: a new tab, and one `rel` for all of them. The
 * anchors this replaced disagreed about it, half `noreferrer` and half
 * `noopener noreferrer`.
 */
export function ExternalLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  );
}
