#!/usr/bin/env node
/** Fail CI if static HTML regresses to Google Fonts or drops site.css. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

// Standalone iframe-embeddable widgets (noindex, self-contained inline <style>, deliberately
// no site.css so they don't leak the full site stylesheet into a third-party host page).
const SITE_CSS_EXEMPT_PREFIX = "/tools/embed/";

const errors = [];
for (const file of walk(publicDir)) {
  const html = readFileSync(file, "utf8");
  const rel = file.replace(publicDir, "");
  if (html.includes("fonts.googleapis.com") || html.includes("fonts.gstatic.com")) {
    errors.push(`${rel}: still references Google Fonts`);
  }
  if (!html.includes("site.css") && !rel.startsWith(SITE_CSS_EXEMPT_PREFIX)) {
    errors.push(`${rel}: missing site.css link`);
  }
}

if (errors.length) {
  console.error("Static HTML validation failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

console.log(`Validated ${walk(publicDir).length} HTML files.`);
