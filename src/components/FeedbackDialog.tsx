"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ALLOWED_PHOTO_TYPES,
  FEEDBACK_REASONS,
  HONEYPOT_FIELD,
  MAX_MESSAGE_LENGTH,
  MAX_PHOTO_BYTES,
  MIN_MESSAGE_LENGTH,
  validatePhoto,
  type PhotoError,
} from "@/lib/feedback";

type Status = "idle" | "sending" | "sent" | "error";

const PHOTO_MB = MAX_PHOTO_BYTES / (1024 * 1024);

/**
 * `triggerClassName` lets the About page open the same dialog from a proper
 * button rather than a nav link. The default is the header's styling, so
 * existing callers need no change.
 */
export default function FeedbackDialog({
  triggerClassName = "hover:text-ink",
  triggerLabel,
}: {
  triggerClassName?: string;
  triggerLabel?: string;
} = {}) {
  const t = useTranslations("feedback");
  const locale = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [photoError, setPhotoError] = useState<PhotoError | null>(null);
  const photoUrlRef = useRef<string | null>(null);

  // Drive the native dialog from state so Esc, the backdrop and the close
  // button all funnel through one place. showModal() also gives us the focus
  // trap and inert background for free.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Only a cleanup: release whatever preview URL is outstanding if the header
  // is ever torn down. Selection itself is handled in the change handler.
  useEffect(
    () => () => {
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    },
    [],
  );

  /** Swap the previewed photo, revoking the URL the old one was holding. */
  function selectPhoto(file: File | null) {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    const url = file ? URL.createObjectURL(file) : null;
    photoUrlRef.current = url;
    setPhoto(file && url ? { file, url } : null);
  }

  function close() {
    setOpen(false);
    // Reset only once the dialog is shut, so the form doesn't visibly clear
    // itself during the closing frame.
    setStatus("idle");
    selectPhoto(null);
    setPhotoError(null);
    formRef.current?.reset();
  }

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      selectPhoto(null);
      setPhotoError(null);
      return;
    }
    const error = validatePhoto(file);
    setPhotoError(error);
    selectPhoto(error ? null : file);
    // Clear the input too, so a rejected file is never posted with the form.
    if (error) event.target.value = "";
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (photoError) return;

    const body = new FormData(event.currentTarget);
    // Read the URL at submit time rather than via useSearchParams(), which
    // would force a CSR bailout on every page that renders the header.
    body.set("pageUrl", window.location.href);
    body.set("locale", locale);

    setStatus("sending");
    try {
      const res = await fetch("/api/feedback", { method: "POST", body });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  // A border colour change is not a focus indicator. The ring comes from the
  // :focus-visible rule in globals.css, so nothing suppresses it here.
  const fieldClass =
    "w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm focus:border-inverse";
  const labelClass = "block text-sm font-medium text-ink";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName}
      >
        {triggerLabel ?? t("nav")}
      </button>

      <dialog
        ref={dialogRef}
        onClose={close}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        aria-labelledby="feedback-title"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl p-0 text-ink backdrop:bg-black/50 backdrop:backdrop-blur-sm"
      >
        {/* Wrapper keeps padding off the dialog itself, so the backdrop click
            test above only ever matches the true backdrop. */}
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="feedback-title" className="text-lg font-semibold">
                {t("title")}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">{t("description")}</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={t("close")}
              className="-mr-2 -mt-1 rounded-lg px-2 py-1 text-xl leading-none text-ink-faint hover:bg-surface-raised hover:text-ink"
            >
              ×
            </button>
          </div>

          {status === "sent" ? (
            <div className="mt-6">
              <p className="font-medium">{t("successTitle")}</p>
              <p className="mt-1 text-sm text-ink-soft">{t("successBody")}</p>
              <button
                type="button"
                onClick={close}
                className="mt-6 w-full rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-on-inverse hover:bg-inverse-soft"
              >
                {t("close")}
              </button>
            </div>
          ) : (
            <form
              ref={formRef}
              onSubmit={handleSubmit}
              className="mt-5 flex flex-col gap-4"
            >
              <div>
                <label htmlFor="feedback-reason" className={labelClass}>
                  {t("reasonLabel")}
                </label>
                <select
                  id="feedback-reason"
                  name="reason"
                  defaultValue={FEEDBACK_REASONS[0]}
                  required
                  className={`${fieldClass} mt-1.5`}
                >
                  {FEEDBACK_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {t(`reason.${r}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="feedback-email" className={labelClass}>
                  {t("emailLabel")}
                </label>
                <input
                  id="feedback-email"
                  name="email"
                  type="email"
                  required
                  maxLength={200}
                  autoComplete="email"
                  placeholder={t("emailPlaceholder")}
                  className={`${fieldClass} mt-1.5`}
                />
                <p className="mt-1 text-xs text-ink-muted">{t("emailHint")}</p>
              </div>

              <div>
                <label htmlFor="feedback-message" className={labelClass}>
                  {t("messageLabel")}
                </label>
                <textarea
                  id="feedback-message"
                  name="message"
                  required
                  rows={5}
                  minLength={MIN_MESSAGE_LENGTH}
                  maxLength={MAX_MESSAGE_LENGTH}
                  placeholder={t("messagePlaceholder")}
                  className={`${fieldClass} mt-1.5 resize-y`}
                />
              </div>

              <div>
                <label htmlFor="feedback-photo" className={labelClass}>
                  {t("photoLabel")}{" "}
                  <span className="font-normal text-ink-muted">
                    ({t("optional")})
                  </span>
                </label>
                <input
                  id="feedback-photo"
                  name="photo"
                  type="file"
                  accept={ALLOWED_PHOTO_TYPES.join(",")}
                  onChange={handlePhotoChange}
                  className="mt-1.5 block w-full text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-surface-raised file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-line"
                />
                {photoError ? (
                  // Announced, not just coloured: the rejection happens after
                  // the file dialog closes, so nothing else tells a screen
                  // reader the attachment was dropped.
                  <p role="alert" className="mt-1.5 text-xs text-bad">
                    {photoError === "size"
                      ? t("errorPhotoSize", { size: PHOTO_MB })
                      : t("errorPhotoType")}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-ink-muted">
                    {t("photoHint", { size: PHOTO_MB })}
                  </p>
                )}
                {photo && (
                  <div className="mt-2 flex items-center gap-3">
                    {/* Local object URL, never a remote asset — next/image would
                        add nothing but a configured-domains problem. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.file.name}
                      className="h-16 w-16 rounded-lg border border-line object-cover"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
                      {photo.file.name}
                    </span>
                  </div>
                )}
              </div>

              {/* Honeypot: off-screen and out of the tab order, so only a bot
                  filling every input will trip it. */}
              <input
                type="text"
                name={HONEYPOT_FIELD}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="absolute left-[-9999px] h-0 w-0 opacity-0"
              />

              {status === "error" && (
                <p role="alert" className="text-sm text-bad">
                  {t("errorGeneric")}
                </p>
              )}

              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-ink-soft hover:bg-surface-raised"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="rounded-lg bg-inverse px-4 py-2 text-sm font-medium text-on-inverse hover:bg-inverse-soft disabled:opacity-50"
                >
                  {status === "sending" ? t("sending") : t("submit")}
                </button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
