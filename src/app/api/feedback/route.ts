import { NextResponse } from "next/server";
import {
  HONEYPOT_FIELD,
  feedbackSchema,
  formatFeedbackMessage,
  validatePhoto,
} from "@/lib/feedback";
import { createRateLimiter } from "@/lib/rate-limit";

/**
 * Feedback intake.
 *
 * The client never talks to the delivery target directly — it posts here, and
 * this handler forwards to FEEDBACK_WEBHOOK_URL. Changing where feedback lands
 * (webhook today, a database or issue tracker later) is a change inside this
 * file; the dialog, its strings and its tests stay put.
 *
 * With no FEEDBACK_WEBHOOK_URL set the submission is logged and reported as
 * undelivered, so the form works end to end in local development.
 */

const limiter = createRateLimiter({ limit: 5, windowMs: 10 * 60 * 1000 });

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  if (!limiter.check(clientKey(request), Date.now())) {
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
    console.info(`[feedback] no FEEDBACK_WEBHOOK_URL set — logging instead:\n${content}`);
    return NextResponse.json({ ok: true, delivered: false });
  }

  // `payload_json` + `files[n]` is the Discord webhook multipart convention,
  // which also lets the photo ride along in the same request. Targets that
  // expect plain JSON will need this body reshaped.
  const payload = new FormData();
  payload.set("payload_json", JSON.stringify({ content }));
  if (photo) payload.set("files[0]", photo, photo.name);

  try {
    const res = await fetch(webhookUrl, { method: "POST", body: payload });
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
