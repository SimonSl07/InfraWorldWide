"use client";

import { useTranslations } from "next-intl";

/**
 * The loading pill and the failure card shared by every mini-map.
 *
 * Without it a failed data load or a tile-provider outage is a grey box
 * with no explanation and no way to retry, which is indistinguishable from
 * a project that simply has no geometry.
 */
export default function MapStatus({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations();
  if (!loading && !error) return null;

  if (error) {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/80 p-4 backdrop-blur-xs">
        <div
          role="alert"
          className="max-w-xs rounded-xl border border-line bg-surface px-4 py-3 text-center shadow-lg"
        >
          <p className="text-sm text-ink-soft">{t("map.loadError")}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 cursor-pointer rounded-lg bg-inverse px-3 py-1.5 text-sm font-medium text-on-inverse hover:bg-inverse-soft"
          >
            {t("map.loadRetry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
      <div className="rounded-full border border-line bg-surface/95 px-3 py-1 text-xs text-ink-soft shadow backdrop-blur">
        {t("map.loading")}
      </div>
    </div>
  );
}
