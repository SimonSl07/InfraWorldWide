import { describe, it, expect } from "vitest";
import {
  feedbackSchema,
  formatFeedbackMessage,
  validatePhoto,
  MAX_PHOTO_BYTES,
  MAX_MESSAGE_LENGTH,
  type Feedback,
} from "./feedback";

const valid = {
  reason: "map_error",
  email: "reporter@example.com",
  message:
    "The A7 Buzău lot is shown as opened but it is still under construction.",
};

describe("feedbackSchema", () => {
  it("accepts a minimal valid submission", () => {
    const parsed = feedbackSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("accepts the client-supplied page context", () => {
    const parsed = feedbackSchema.safeParse({
      ...valid,
      pageUrl: "https://example.com/en/map?year=2020",
      locale: "ro",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.locale).toBe("ro");
  });

  it.each(["map_addition", "map_error", "bug", "other"])(
    "accepts reason %s",
    (reason) => {
      expect(feedbackSchema.safeParse({ ...valid, reason }).success).toBe(true);
    },
  );

  it("rejects an unknown reason", () => {
    expect(feedbackSchema.safeParse({ ...valid, reason: "spam" }).success).toBe(
      false,
    );
  });

  it("rejects a malformed email", () => {
    expect(
      feedbackSchema.safeParse({ ...valid, email: "not-an-email" }).success,
    ).toBe(false);
  });

  it("rejects a message that is too short or too long", () => {
    expect(
      feedbackSchema.safeParse({ ...valid, message: "typo" }).success,
    ).toBe(false);
    expect(
      feedbackSchema.safeParse({
        ...valid,
        message: "x".repeat(MAX_MESSAGE_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("trims the message before length checks", () => {
    const parsed = feedbackSchema.safeParse({
      ...valid,
      message: `   ${valid.message}   `,
    });
    expect(parsed.data?.message).toBe(valid.message);
    // Whitespace alone must not pass the minimum.
    expect(
      feedbackSchema.safeParse({ ...valid, message: " ".repeat(50) }).success,
    ).toBe(false);
  });
});

describe("validatePhoto", () => {
  it("accepts a normal image", () => {
    expect(validatePhoto({ type: "image/jpeg", size: 1024 })).toBeNull();
  });

  it("rejects a non-image type", () => {
    expect(validatePhoto({ type: "application/pdf", size: 1024 })).toBe("type");
    expect(validatePhoto({ type: "image/svg+xml", size: 1024 })).toBe("type");
  });

  it("rejects an oversized image", () => {
    expect(
      validatePhoto({ type: "image/png", size: MAX_PHOTO_BYTES + 1 }),
    ).toBe("size");
    expect(
      validatePhoto({ type: "image/png", size: MAX_PHOTO_BYTES }),
    ).toBeNull();
  });

  it("checks type before size", () => {
    expect(
      validatePhoto({ type: "application/zip", size: MAX_PHOTO_BYTES + 1 }),
    ).toBe("type");
  });
});

describe("formatFeedbackMessage", () => {
  const feedback = feedbackSchema.parse(valid) satisfies Feedback;

  it("includes the reason, sender and message", () => {
    const text = formatFeedbackMessage(feedback);
    expect(text).toContain("Error in map");
    expect(text).toContain("reporter@example.com");
    expect(text).toContain(valid.message);
  });

  it("omits optional context that was not supplied", () => {
    const text = formatFeedbackMessage(feedback);
    expect(text).not.toContain("Page:");
    expect(text).not.toContain("Locale:");
    expect(text).not.toContain("Photo:");
  });

  it("includes page context and photo name when present", () => {
    const text = formatFeedbackMessage(
      { ...feedback, pageUrl: "https://example.com/ro/map", locale: "ro" },
      { photoName: "sign.jpg" },
    );
    expect(text).toContain("Page: https://example.com/ro/map");
    expect(text).toContain("Locale: ro");
    expect(text).toContain("Photo: sign.jpg");
  });

  it("truncates past the webhook content limit", () => {
    const long = formatFeedbackMessage(
      { ...feedback, message: "x".repeat(MAX_MESSAGE_LENGTH) },
      { limit: 200 },
    );
    expect(long).toHaveLength(200);
    expect(long.endsWith("…")).toBe(true);
  });

  it("leaves a message at exactly the limit untouched", () => {
    const text = formatFeedbackMessage(feedback);
    expect(formatFeedbackMessage(feedback, { limit: text.length })).toBe(text);
  });
});
