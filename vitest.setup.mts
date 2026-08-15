// Registers the jest-dom matchers and their type augmentation for vitest's
// `expect`. Safe to import under the node environment: the matchers only
// touch the DOM when a test actually calls one.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

/**
 * Most of the suite runs on node and has no `document`, so the React cleanup
 * is loaded only where there is a DOM to clean.
 */
if (typeof document !== "undefined") {
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());
}
