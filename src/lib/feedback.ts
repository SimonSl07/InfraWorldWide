import { z } from "zod";

/**
 * Feedback form model.
 *
 * The dialog posts multipart form data to /api/feedback, which re-validates
 * with these same schemas before forwarding to whatever FEEDBACK_WEBHOOK_URL
 * points at. Keeping the rules here is what stops the client and the route
 * handler from drifting apart — never validate in only one of the two.
 */

export const FEEDBACK_REASONS = [
  "map_addition",
  "map_error",
  "bug",
  "other",
] as const;

export const feedbackReasonSchema = z.enum(FEEDBACK_REASONS);
export type FeedbackReason = z.infer<typeof feedbackReasonSchema>;

/**
 * 4 MB. Sized to stay under the ~4.5 MB request body cap serverless hosts
 * impose, which binds tighter than any webhook target's own upload limit.
 */
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

export const ALLOWED_PHOTO_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export const MIN_MESSAGE_LENGTH = 10;
export const MAX_MESSAGE_LENGTH = 4000;

/** Field a real user never sees; a bot that fills it in is discarded. */
export const HONEYPOT_FIELD = "website";

export const feedbackSchema = z.object({
  reason: feedbackReasonSchema,
  email: z.email().max(200),
  message: z.string().trim().min(MIN_MESSAGE_LENGTH).max(MAX_MESSAGE_LENGTH),
  /** Page the report was filed from — set by the client, not typed by the user. */
  pageUrl: z.string().max(2000).optional(),
  locale: z.string().max(10).optional(),
});
export type Feedback = z.infer<typeof feedbackSchema>;

export type PhotoError = "type" | "size";

/**
 * Validate an attached photo. Returns null when acceptable, so callers can
 * write `const err = validatePhoto(f)`. Takes the structural shape rather than
 * `File` so it runs in Node tests without a DOM.
 */
export function validatePhoto(photo: {
  type: string;
  size: number;
}): PhotoError | null {
  if (!(ALLOWED_PHOTO_TYPES as readonly string[]).includes(photo.type)) {
    return "type";
  }
  if (photo.size > MAX_PHOTO_BYTES) return "size";
  return null;
}

/**
 * Discord caps webhook `content` at 2000 characters, well under our own
 * message limit, so the notification is truncated rather than rejected.
 */
export const WEBHOOK_CONTENT_LIMIT = 1900;

/**
 * Operator-facing labels. Deliberately not translated: these land in whatever
 * inbox/channel the maintainer watches, while the reporter sees the localised
 * strings from messages/*.json.
 */
const REASON_LABELS: Record<FeedbackReason, string> = {
  map_addition: "Map addition",
  map_error: "Error in map",
  bug: "Bug",
  other: "Other",
};

/** Render a submission as the notification body sent to the webhook. */
export function formatFeedbackMessage(
  feedback: Feedback,
  options: { photoName?: string; limit?: number } = {},
): string {
  const { photoName, limit = WEBHOOK_CONTENT_LIMIT } = options;

  const lines = [
    `**New feedback — ${REASON_LABELS[feedback.reason]}**`,
    `From: ${feedback.email}`,
  ];
  if (feedback.pageUrl) lines.push(`Page: ${feedback.pageUrl}`);
  if (feedback.locale) lines.push(`Locale: ${feedback.locale}`);
  if (photoName) lines.push(`Photo: ${photoName}`);
  lines.push("", feedback.message);

  const text = lines.join("\n");
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}
