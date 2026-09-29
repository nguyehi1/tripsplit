import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Separate config for `npm run perf:bench` (src/lib/perf/trips.bench.ts): the file doesn't match
// vitest.config.mts's default `*.test.ts`/`*.spec.ts` include pattern, so it needs its own include
// here rather than living in the default `npm test` run — see that file's comment for why.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/lib/perf/*.bench.ts"],
  },
});
