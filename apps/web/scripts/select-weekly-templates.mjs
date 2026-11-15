#!/usr/bin/env node
/**
 * Weekly template-generation helper: hands back the next chunk of candidate document-template
 * families from the ranked research pool, and advances a persisted cursor so the same rows
 * aren't handed out twice.
 *
 * This script does NOT decide what's a duplicate of an existing template, does NOT write any
 * template content, and does NOT run the site build — those are judgment calls for whoever
 * (or whatever agent) consumes this list, same as the original 1,000 templates were written by
 * hand across 21 sessions. This script only exists so nobody has to re-scan a 10k-row CSV by
 * hand each week to figure out where the last batch left off.
 *
 * Usage: node scripts/select-weekly-templates.mjs [--window N] [--dry-run]
 *   --window N   candidates to return this run (default 150 — headroom over a 100/week target,
 *                since some candidates get skipped for being too close to an existing template)
 *   --dry-run    print the candidates but don't advance/persist the cursor
 *
 * Output: JSON to stdout — { cursorBefore, cursorAfter, poolExhausted, candidates: [...] }
 * where each candidate is { rank, uploadCount, family, source }.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const researchDir = join(__dirname, "../scratch/docstoc-research");
const statePath = join(__dirname, "../data/weekly-template-state.json");

// Paused (owner decision 15.11.2026, template library): no new templates each week. Of 1,195 templates, 189 had no
// impression in 90 days; the work goes into deepening the indexed ones instead. Set WEEKLY_TEMPLATES_RESUME=1 to run.
if (process.env.WEEKLY_TEMPLATES_RESUME !== "1") {
  console.log(JSON.stringify({ paused: true, reason: "Weekly template batch paused since 15.11.2026: deepen indexed templates instead.", candidates: [] }));
  process.exit(0);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const windowArg = args.indexOf("--window");
const WINDOW = windowArg !== -1 ? Number(args[windowArg + 1]) : 150;

/** Minimal CSV parser — good enough for these two well-formed, comma-only, no-quoted-commas files. */
function parseCsv(path, source) {
  const text = readFileSync(path, "utf8").trim();
  const [header, ...rows] = text.split("\n");
  const cols = header.split(",");
  const rankIdx = cols.indexOf("rank");
  const countIdx = cols.indexOf("docstoc_upload_count");
  const familyIdx = cols.indexOf("template_family");
  return rows.map((line) => {
    const parts = line.split(",");
    return {
      rank: Number(parts[rankIdx]),
      uploadCount: Number(parts[countIdx]),
      family: parts[familyIdx],
      source,
    };
  });
}

const pool = [
  ...parseCsv(join(researchDir, "launch_batch_top1500.csv"), "launch_batch_top1500"),
  ...parseCsv(join(researchDir, "weekly_pool_count2to4.csv"), "weekly_pool_count2to4"),
];

const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { cursor: 0 };
const cursorBefore = state.cursor ?? 0;

const candidates = pool.slice(cursorBefore, cursorBefore + WINDOW);
const cursorAfter = Math.min(cursorBefore + WINDOW, pool.length);
const poolExhausted = cursorAfter >= pool.length;

if (!dryRun) {
  writeFileSync(statePath, JSON.stringify({ cursor: cursorAfter }, null, 2) + "\n");
}

console.log(
  JSON.stringify(
    { cursorBefore, cursorAfter, poolSize: pool.length, poolExhausted, candidates },
    null,
    2
  )
);

if (poolExhausted) {
  console.error(
    "NOTE: the curated research pool (launch batch + extended pool, count>=2) is now fully " +
      "consumed. Re-mining the long tail (count=1, ~129k families, high noise) or a fresh " +
      "Wayback CDX pass is needed for further weeks — see docstoc-template-pipeline.md."
  );
}
