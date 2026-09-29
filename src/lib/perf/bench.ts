/**
 * Local, synthetic performance-regression harness — separate from `timing.ts`'s production
 * request-timing instrumentation (which measures real Supabase network latency and needs a live
 * deployment to be meaningful, see `scripts/perf-baseline.mjs`). This harness times pure in-process
 * computation (the balance/settlement/shaping logic in `src/lib/data/trips.ts`) against fixed
 * in-memory fixtures, so it runs in `npm test` on any machine with no deployment and no network —
 * at the cost of only catching algorithmic regressions (e.g. an accidental O(n^2) introduced into
 * balance calculation), never real query/network latency regressions.
 *
 * Because wall-clock timing is inherently noisy across machines/CI runners, this does not hard-fail
 * on small deltas — see `checkRegressions`' threshold discussion.
 */

export type BenchResult = {
  name: string;
  iterations: number;
  p50: number;
  p95: number;
  mean: number;
};

/** Runs `fn` `iterations` times (plus a few untimed warmup runs) and returns p50/p95/mean in ms. */
export async function runBench(
  name: string,
  fn: () => Promise<unknown> | unknown,
  iterations = 50,
): Promise<BenchResult> {
  // Warmup: let the JIT settle so the first few real iterations aren't outliers.
  for (let i = 0; i < 5; i++) await fn();

  const durations: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);

  const p50 = durations[Math.floor(durations.length * 0.5)];
  const p95 = durations[Math.floor(durations.length * 0.95)];
  const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;

  return { name, iterations, p50, p95, mean };
}

export function printBenchTable(results: BenchResult[]): void {
  const rows = results.map((r) => ({
    name: r.name,
    "p50 (ms)": r.p50.toFixed(3),
    "p95 (ms)": r.p95.toFixed(3),
    "mean (ms)": r.mean.toFixed(3),
    n: r.iterations,
  }));
  console.table(rows);
}

export type Baseline = Record<string, { p50: number; p95: number }>;

export function toBaseline(results: BenchResult[]): Baseline {
  return Object.fromEntries(results.map((r) => [r.name, { p50: r.p50, p95: r.p95 }]));
}

export type Regression = {
  name: string;
  baselineP95: number;
  currentP95: number;
  ratio: number;
};

/**
 * Flags any benchmark whose current p95 exceeds its baseline p95 by more than `warnRatio` (default
 * 1.5x, i.e. 50% slower) as a WARN-level regression, and by more than `failRatio` (default 4x) as a
 * hard failure. The gap between the two is deliberately wide: local timing on a shared/CI machine
 * can easily swing 30-50% run to run with zero code change, but a 4x blowup is essentially never
 * noise — it's a real algorithmic regression (e.g. an accidental O(n^2)) worth blocking on. A
 * benchmark with no baseline entry (new benchmark, or baseline not yet generated) is skipped, never
 * flagged.
 */
export function checkRegressions(
  results: BenchResult[],
  baseline: Baseline,
  { warnRatio = 1.5, failRatio = 4 }: { warnRatio?: number; failRatio?: number } = {},
): { warnings: Regression[]; failures: Regression[] } {
  const warnings: Regression[] = [];
  const failures: Regression[] = [];
  for (const r of results) {
    const base = baseline[r.name];
    if (!base) continue;
    const ratio = r.p95 / base.p95;
    if (ratio >= failRatio) failures.push({ name: r.name, baselineP95: base.p95, currentP95: r.p95, ratio });
    else if (ratio >= warnRatio) warnings.push({ name: r.name, baselineP95: base.p95, currentP95: r.p95, ratio });
  }
  return { warnings, failures };
}
