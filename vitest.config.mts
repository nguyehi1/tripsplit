import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Bench files (src/lib/perf/*.bench.ts) don't match this include pattern (no .test./.spec.
    // in the name), so they're already excluded from the default `npm test` run — they're run
    // separately via `npm run perf:bench` (see vitest.bench.config.mts), since their noisier,
    // slower timing-based checks don't belong in the default suite.
  },
});
