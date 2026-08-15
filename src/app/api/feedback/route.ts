import { NextResponse } from "next/server";
import {
  HONEYPOT_FIELD,
  feedbackSchema,
  formatFeedbackMessage,
  validatePhoto,
} from "@/lib/feedback";
import { createRateLimiter } from "@/lib/rate-limit";
import { resolveClientKey } from "@/lib/client-key";

/**
 * Feedback intake.
 *
 * The client never talks to the delivery target directly — it posts here, and
 * this handler forwards to FEEDBACK_WEBHOOK_URL. Changing where feedback lands
 * (webhook today, a database or issue tracker later) is a change inside this
 * file; the dialog, its strings and its tests stay put.
 *
 * With no FEEDBACK_WEBHOOK_URL set the submission is logged and reported as
 * undelivered, so the form works end to end in local development. On a live
 * deployment that same state is a misconfiguration, not a mode: accepting a
 * report into a console log loses it, so production refuses instead.
 */

const WINDOW_MS = 10 * 60 * 1000;

/** Per-address allowance. */
const perClient = createRateLimiter({ limit: 5, windowMs: WINDOW_MS });

/**
 * Callers we cannot tell apart, because the host set no address header. They
 * share one allowance by necessity, so it is loose enough that a missing
 * header does not disable the form for everyone while still bounding a flood.
 */
const anonymous = createRateLimiter({ limit: 60, windowMs: WINDOW_MS });

/** How long to wait on the delivery target before giving up. */
const WEBHOOK_TIMEOUT_MS = 5000;

function withinRateLimit(request: Request, now: number): boolean {
  const { key, trusted } = resolveClientKey(request.headers);

  // An untrusted key comes from `x-forwarded-for`, which anything reaching
  // this handler unproxied can set per request. Giving each forged value its
  // own allowance is the same as having none, so untrusted callers share the
  // anonymous bucket: a rotating header then spends one budget rather than
  // minting a fresh one, while a genuine proxied caller behind a platform
  // header keeps its own.
  if (key === null || !trusted) return anonymous.check("anonymous", now);
  return perClient.check(key, now);
}

export async function POST(request: Request) {
  if (!withinRateLimit(request, Date.now())) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Answer a honeypot hit with success: telling a bot it was caught only
  // teaches whoever wrote it which field to leave alone next time.
  const honeypot = form.get(HONEYPOT_FIELD);
  if (typeof honeypot === "string" && honeypot !== "") {
    return NextResponse.json({ ok: true, delivered: false });
  }

  const parsed = feedbackSchema.safeParse({
    reason: form.get("reason"),
    email: form.get("email"),
    message: form.get("message"),
    pageUrl: form.get("pageUrl") || undefined,
    locale: form.get("locale") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  // An untouched file input still posts an entry — a zero-byte File means
  // "no photo", not "empty photo".
  const attachment = form.get("photo");
  const photo =
    attachment instanceof File && attachment.size > 0 ? attachment : null;
  if (photo) {
    const photoError = validatePhoto(photo);
    if (photoError) {
      return NextResponse.json(
        { error: `photo_${photoError}` },
        { status: 400 },
      );
    }
  }

  const content = formatFeedbackMessage(parsed.data, {
    photoName: photo?.name,
  });

  const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL;
  if (!webhookUrl) {
    if (process.env.NODE_ENV === "production") {
      console.error("[feedback] FEEDBACK_WEBHOOK_URL is not set; refusing the report");
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }
    console.info(`[feedback] no FEEDBACK_WEBHOOK_URL set, logging instead:\n${content}`);
    return NextResponse.json({ ok: true, delivered: false });
  }

  // `payload_json` + `files[n]` is the Discord webhook multipart convention,
  // which also lets the photo ride along in the same request. Targets that
  // expect plain JSON will need this body reshaped.
  const payload = new FormData();
  payload.set("payload_json", JSON.stringify({ content }));
  if (photo) payload.set("files[0]", photo, photo.name);

  try {
    // Without a deadline a hanging target pins the function until the platform
    // kills it, and the reporter watches a spinner for the whole time.
    const res = await fetch(webhookUrl, {
      method: "POST",
      body: payload,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(
        `[feedback] webhook responded ${res.status}: ${await res.text()}`,
      );
      return NextResponse.json({ error: "delivery_failed" }, { status: 502 });
    }
  } catch (err) {
    console.error("[feedback] webhook request failed", err);
    return NextResponse.json({ error: "delivery_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, delivered: true });
}
