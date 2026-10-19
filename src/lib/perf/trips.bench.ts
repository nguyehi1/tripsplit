import { describe, expect, it } from "vitest";
import { getMyTrips, getTripSummary, getTripView } from "@/lib/data/trips";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { runBench, printBenchTable, checkRegressions, type Baseline } from "./bench";
import baseline from "./local-baseline.json";

/**
 * Local synthetic performance-regression check for the three core surfaces named in
 * docs/features/performance-scaling/requirements.md (trip list, trip detail, invite/summary
 * view) — see bench.ts's header for what this can and can't catch. Not matched by `npm test`'s
 * default include pattern (see vitest.config.mts) since bench timings are noisier and slower than
 * the rest of the suite; run explicitly via `npm run perf:bench` during QA (see .claude/agents/qa.md).
 *
 * To regenerate the baseline after a deliberate, reviewed performance change: run
 * `PERF_BENCH_UPDATE_BASELINE=1 npm run perf:bench` and commit the resulting local-baseline.json
 * diff. (An env var, not a CLI flag, since vitest's own CLI parser rejects unknown flags before
 * they'd ever reach the test file.)
 */

type Client = SupabaseClient<Database>;

const NUM_MEMBERS = 20;
const NUM_EXPENSES = 200;

const tripRow = {
  id: "t1",
  name: "Big group trip",
  location: "Lisbon",
  starts_on: "2026-01-01",
  ends_on: "2026-01-10",
  invite_code: "ABC12345",
  completed_at: null,
  created_by: "u0",
  created_at: "2026-01-01T00:00:00Z",
};

const memberRows = Array.from({ length: NUM_MEMBERS }, (_, i) => ({
  id: `m${i}`,
  trip_id: "t1",
  user_id: `u${i}`,
  display_name: `Member ${i}`,
  joined_at: `2026-01-0${(i % 9) + 1}`,
  is_placeholder: false,
}));

const expenseRows = Array.from({ length: NUM_EXPENSES }, (_, i) => ({
  id: `e${i}`,
  trip_id: "t1",
  paid_by: `u${i % NUM_MEMBERS}`,
  amount: (10 + (i % 50)).toFixed(2),
  description: `Expense ${i}`,
  date: `2026-01-0${(i % 9) + 1}`,
  created_at: `2026-01-0${(i % 9) + 1}T00:00:00Z`,
}));

const summaryRows = memberRows.map((m, i) => ({
  member_id: m.id,
  display_name: m.display_name,
  paid_cents: (1000 + i * 37) % 5000,
  share_cents: 2000,
  invite_code: tripRow.invite_code,
}));

// Home's "N to get" row subtitle (redesign-ui follow-up): `getMyTrips` now also queries
// `shopping_list_items` (`.select("trip_id, status").in("trip_id", tripIds).neq("status",
// "logged")`) to count open items per trip. A handful of rows are enough to exercise the same
// chain shape under the bench without materially changing its timing characteristics.
const shoppingListItemRows = Array.from({ length: 10 }, (_, i) => ({
  trip_id: "t1",
  status: i % 3 === 0 ? "logged" : "open",
}));

function makeClient(): Client {
  const from = (table: string) => {
    const data =
      table === "trip_members"
        ? memberRows
        : table === "expenses"
          ? expenseRows
          : table === "shopping_list_items"
            ? shoppingListItemRows
            : [tripRow];
    const single = () => Promise.resolve({ data: data[0], error: null });
    const resultPromise = Promise.resolve({ data, error: null });
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      // `expenses` chains `.order().order()` (date, then created_at) before resolving,
      // `trip_members` chains `.in().order()`, `shopping_list_items` chains `.in().neq()`, and
      // plain `expenses` (in getMyTrips) ends at `.in()` — every `order()`/`in()`/`neq()` call
      // returns a thenable that's also still chainable, so any of these chain shapes resolves
      // without a second, table-specific builder.
      order: () => ({ then: resultPromise.then.bind(resultPromise), order: () => resultPromise }),
      in: () => ({
        then: resultPromise.then.bind(resultPromise),
        order: () => resultPromise,
        neq: () => resultPromise,
      }),
      neq: () => resultPromise,
      single,
      then: resultPromise.then.bind(resultPromise),
    };
    return builder;
  };
  const rpc = () => Promise.resolve({ data: summaryRows, error: null });
  return { from, rpc } as unknown as Client;
}

describe("local perf bench: core surfaces (performance-scaling)", () => {
  it("measures getMyTrips / getTripView / getTripSummary and reports p50/p95", async () => {
    const client = makeClient();

    // Each function under measurement is itself wrapped in `timing.ts`'s `timeAsync`, which logs
    // one `[perf] {...}` line per Supabase call via `console.log` — real signal in production,
    // but 50 iterations x several calls each would otherwise drown out this bench's own report in
    // noise. Silence only `console.log` (not `console.warn`/`console.table`, used below for the
    // report itself) for the measurement window, then restore it before printing anything.
    const originalLog = console.log;
    console.log = () => {};
    let results;
    try {
      results = await Promise.all([
        runBench("getMyTrips", () => getMyTrips(client, "u0")),
        runBench("getTripView", () => getTripView(client, "t1", "u0")),
        runBench("getTripSummary", () => getTripSummary(client, "t1")),
      ]);
    } finally {
      console.log = originalLog;
    }

    printBenchTable(results);

    const updateBaseline = process.env.PERF_BENCH_UPDATE_BASELINE === "1";
    if (updateBaseline) {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const out: Baseline = Object.fromEntries(results.map((r) => [r.name, { p50: r.p50, p95: r.p95 }]));
      fs.writeFileSync(path.join(import.meta.dirname, "local-baseline.json"), JSON.stringify(out, null, 2) + "\n");
      console.log("Baseline updated: src/lib/perf/local-baseline.json");
      return;
    }

    const { warnings, failures } = checkRegressions(results, baseline as Baseline);
    for (const w of warnings) {
      console.warn(
        `[perf-bench] WARN: ${w.name} p95 ${w.currentP95.toFixed(2)}ms vs baseline ${w.baselineP95.toFixed(2)}ms (${w.ratio.toFixed(2)}x)`,
      );
    }
    if (failures.length > 0) {
      const msg = failures
        .map((f) => `${f.name} p95 ${f.currentP95.toFixed(2)}ms vs baseline ${f.baselineP95.toFixed(2)}ms (${f.ratio.toFixed(2)}x)`)
        .join("; ");
      expect.fail(`[perf-bench] FAIL: severe regression (>=4x baseline p95): ${msg}`);
    }
  });
});
