import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

/**
 * Vitest ran on bare defaults until now, which meant no "@/" resolution (the
 * reason every test used relative imports, and why nothing under src/app could
 * be tested at all) and no DOM, so the component layer had no tests of any
 * kind.
 *
 * Pure logic and scripts stay on the node environment, which is faster and
 * keeps the existing suite honest about not needing a DOM. Components opt in
 * with a `// @vitest-environment jsdom` docblock at the top of the file.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.mts"],
  },
});
