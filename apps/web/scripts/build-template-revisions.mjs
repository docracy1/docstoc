#!/usr/bin/env node
/**
 * Writes scripts/data/template-revisions.json: for every document template, the date of the last change
 * to its text and a hash of that text. The date comes from `git blame` on the lines that hold the template
 * (INLINE_DOCUMENT_TEMPLATES in generate-free-templates.mjs, or data/weekly-document-templates.json):
 * the newest commit date among them. Lines not yet committed count as today.
 *
 * Run after changing a template and after `node scripts/generate-free-templates.mjs` (it reads the
 * generated public/document-templates/templates.json), then run the generator once more and commit all.
 *
 *   node scripts/build-template-revisions.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { templateContentHash } from "./lib/template-jurisdiction.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDir = join(__dirname, "..");
const today = new Date().toISOString().slice(0, 10);

/** Line number (1-based) → commit date (YYYY-MM-DD in the committer's time zone). */
function blameDates(relPath) {
  const out = execFileSync("git", ["blame", "--line-porcelain", "--", relPath], { cwd: webDir, maxBuffer: 1 << 30, encoding: "utf8" });
  const dates = [];
  let sha = null;
  let time = null;
  let tz = null;
  let line = null;
  for (const row of out.split("\n")) {
    const head = row.match(/^([0-9a-f]{40}) \d+ (\d+)/);
    if (head) {
      sha = head[1];
      line = Number(head[2]);
    } else if (row.startsWith("committer-time ")) time = Number(row.slice(15));
    else if (row.startsWith("committer-tz ")) tz = row.slice(13);
    else if (row.startsWith("\t")) {
      if (/^0+$/.test(sha)) dates[line] = today;
      else {
        const sign = tz.startsWith("-") ? -1 : 1;
        const offset = sign * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(3, 5))) * 60;
        dates[line] = new Date((time + offset) * 1000).toISOString().slice(0, 10);
      }
    }
  }
  return dates;
}

/** slug → newest date among the lines of that template's object in the file. */
function datesBySlug(relPath, slugPattern, startMarker, endMarker) {
  const lines = readFileSync(join(webDir, relPath), "utf8").split("\n");
  const start = startMarker ? lines.findIndex((l) => l.startsWith(startMarker)) : 0;
  const endIdx = endMarker ? lines.findIndex((l, i) => i > start && l.startsWith(endMarker)) : lines.length;
  if (start < 0 || endIdx < 0) throw new Error(`${relPath}: markers not found`);
  const slugLines = [];
  for (let i = start; i < endIdx; i++) {
    const m = lines[i].match(slugPattern);
    if (m) slugLines.push({ slug: m[1], idx: i });
  }
  const dates = blameDates(relPath);
  const result = new Map();
  slugLines.forEach(({ slug, idx }, n) => {
    // The object opens on the line before `slug` and ends just before the next object's opening line.
    const from = idx - 1;
    const to = n + 1 < slugLines.length ? slugLines[n + 1].idx - 2 : endIdx - 1;
    let newest = null;
    for (let i = from; i <= to; i++) {
      const d = dates[i + 1];
      if (d && (!newest || d > newest)) newest = d;
    }
    result.set(slug, newest);
  });
  return result;
}

const inline = datesBySlug(
  "scripts/generate-free-templates.mjs",
  /^ {4}slug: "([^"]+)",$/,
  "const INLINE_DOCUMENT_TEMPLATES = [",
  "const weeklyDocTemplatesPath"
);
const weekly = datesBySlug("data/weekly-document-templates.json", /^ {4}"slug": "([^"]+)",$/);

const templates = JSON.parse(readFileSync(join(webDir, "public/document-templates/templates.json"), "utf8"));
const revisions = {};
const missing = [];
for (const t of templates) {
  const updated = inline.get(t.slug) ?? weekly.get(t.slug);
  if (!updated) {
    missing.push(t.slug);
    continue;
  }
  revisions[t.slug] = { updated, hash: templateContentHash(t) };
}
if (missing.length) throw new Error(`No source lines found for: ${missing.join(", ")}`);

const sorted = Object.fromEntries(Object.entries(revisions).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(join(__dirname, "data/template-revisions.json"), `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`template-revisions.json: ${Object.keys(sorted).length} templates`);
