#!/usr/bin/env node
/**
 * Aggregates the `[perf]`-tagged log lines emitted by `src/lib/perf/timing.ts` /
 * `src/app/api/perf-log/route.ts` (see docs/adr/0010-interim-per-call-timing-instrumentation.md)
 * into p50/p95/p99 per surface+call, for the `performance-scaling` feature's deferred
 * post-deploy baseline (docs/features/performance-scaling/requirements.md).
 *
 * This only aggregates logs you already have — it does not generate traffic or deploy
 * anything. Get raw log text into it first, e.g.:
 *
 *   vercel logs <deployment-url> --since 24h > perf.log
 *   node scripts/perf-baseline.mjs < perf.log
 *
 * or pipe `vercel logs` directly:
 *
 *   vercel logs <deployment-url> --since 24h | node scripts/perf-baseline.mjs
 *
 * Non-`[perf]` lines (everything else in a normal log stream) are silently skipped, so it's
 * safe to pipe an entire raw log export in without pre-filtering.
 *
 * Flags:
 *   --json   print machine-readable JSON instead of the markdown table (for scripting/diffing
 *            a later "after" run against a saved "before" run)
 *   --min-samples <n>   flag groups with fewer than n samples as low-confidence (default 30)
 */

import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const minSamplesFlagIndex = args.indexOf("--min-samples");
const minSamples = minSamplesFlagIndex !== -1 ? Number(args[minSamplesFlagIndex + 1]) : 30;

const PERF_PREFIX = "[perf] ";

/** @type {Map<string, { surface: string, call: string, durations: number[], okCount: number, errCount: number }>} */
const groups = new Map();
let tsMin = Infinity;
let tsMax = -Infinity;
let parsedCount = 0;
let malformedCount = 0;

function ingest(line) {
  const idx = line.indexOf(PERF_PREFIX);
  if (idx === -1) return;
  const jsonText = line.slice(idx + PERF_PREFIX.length).trim();
  let entry;
  try {
    entry = JSON.parse(jsonText);
  } catch {
    malformedCount++;
    return;
  }
  const { surface, call, durationMs, ok, ts } = entry ?? {};
  if (typeof surface !== "string" || typeof call !== "string" || typeof durationMs !== "number") {
    malformedCount++;
    return;
  }

  const key = `${surface}::${call}`;
  if (!groups.has(key)) {
    groups.set(key, { surface, call, durations: [], okCount: 0, errCount: 0 });
  }
  const group = groups.get(key);
  group.durations.push(durationMs);
  if (ok === false) group.errCount++;
  else group.okCount++;

  if (typeof ts === "number") {
    tsMin = Math.min(tsMin, ts);
    tsMax = Math.max(tsMax, ts);
  }
  parsedCount++;
}

function percentile(sortedDurations, p) {
  if (sortedDurations.length === 0) return null;
  const idx = Math.ceil((p / 100) * sortedDurations.length) - 1;
  return sortedDurations[Math.min(Math.max(idx, 0), sortedDurations.length - 1)];
}

function round(n) {
  return n === null ? null : Math.round(n * 10) / 10;
}

function summarize() {
  const rows = [...groups.values()]
    .map((g) => {
      const sorted = [...g.durations].sort((a, b) => a - b);
      const total = g.okCount + g.errCount;
      return {
        surface: g.surface,
        call: g.call,
        samples: total,
        errorRate: total > 0 ? round((g.errCount / total) * 100) : null,
        p50: round(percentile(sorted, 50)),
        p95: round(percentile(sorted, 95)),
        p99: round(percentile(sorted, 99)),
        mean: round(sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1)),
        min: round(sorted[0] ?? null),
        max: round(sorted[sorted.length - 1] ?? null),
        lowConfidence: total < minSamples,
      };
    })
    .sort((a, b) => a.surface.localeCompare(b.surface) || a.call.localeCompare(b.call));

  return rows;
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", ingest);
rl.on("close", () => {
  const rows = summarize();

  if (parsedCount === 0) {
    console.error(
      "No [perf]-tagged lines found in input. Did you pipe real log output? " +
        "(e.g. `vercel logs <deployment-url> --since 24h | node scripts/perf-baseline.mjs`)",
    );
    process.exitCode = 1;
    return;
  }

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          parsedCount,
          malformedCount,
          windowStart: Number.isFinite(tsMin) ? new Date(tsMin).toISOString() : null,
          windowEnd: Number.isFinite(tsMax) ? new Date(tsMax).toISOString() : null,
          groups: rows,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`# Performance baseline\n`);
  console.log(
    `Window: ${Number.isFinite(tsMin) ? new Date(tsMin).toISOString() : "?"} — ${
      Number.isFinite(tsMax) ? new Date(tsMax).toISOString() : "?"
    }`,
  );
  console.log(`Samples parsed: ${parsedCount}${malformedCount ? ` (${malformedCount} malformed lines skipped)` : ""}\n`);
  console.log("| Surface | Call | Samples | Error % | p50 (ms) | p95 (ms) | p99 (ms) | Mean (ms) | Min | Max |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    const flag = r.lowConfidence ? " ⚠️ low-N" : "";
    console.log(
      `| ${r.surface} | ${r.call} | ${r.samples}${flag} | ${r.errorRate ?? "–"} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.mean} | ${r.min} | ${r.max} |`,
    );
  }
  const lowConfidenceGroups = rows.filter((r) => r.lowConfidence);
  if (lowConfidenceGroups.length > 0) {
    console.log(
      `\n⚠️  ${lowConfidenceGroups.length} group(s) have fewer than ${minSamples} samples — their p95/p99 are unreliable. ` +
        `Capture a longer window or more traffic before treating them as a real baseline.`,
    );
  }
});
