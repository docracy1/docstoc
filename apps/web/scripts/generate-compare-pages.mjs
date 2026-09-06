#!/usr/bin/env node
/**
 * Attractive /compare hub + Docracy-style alternative and import-from landings.
 * Also restyles existing /docstoc-vs-{slug} pages to the same alternative layout
 * (canonical stays on /{slug}-alternative).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMPETITORS, hubSectors } from "./data/compare-competitors.mjs";
import {
  alternativeMainHtml,
  compareHubMainHtml,
  importMainHtml,
  writeLanding,
  altUrl,
  importUrl,
} from "./lib/alt-landing.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");

function altJsonLd(c) {
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://docstoc.io/" },
            { "@type": "ListItem", position: 2, name: "Compare", item: "https://docstoc.io/compare/" },
            {
              "@type": "ListItem",
              position: 3,
              name: `${c.name} alternative`,
              item: `https://docstoc.io${altUrl(c)}`,
            },
          ],
        },
        {
          "@type": "WebPage",
          name: `${c.name} alternative`,
          url: `https://docstoc.io${altUrl(c)}`,
          description: c.sub,
        },
      ],
    },
    null,
    2
  );
}

function importJsonLd(c) {
  const steps = (c.import?.exportSteps || []).map((text, i) => ({
    "@type": "HowToStep",
    position: i + 1,
    text,
  }));
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://docstoc.io/" },
            { "@type": "ListItem", position: 2, name: "Compare", item: "https://docstoc.io/compare/" },
            {
              "@type": "ListItem",
              position: 3,
              name: `Import from ${c.name}`,
              item: `https://docstoc.io${importUrl(c)}`,
            },
          ],
        },
        {
          "@type": "HowTo",
          name: `Import from ${c.name} to docstoc`,
          description: c.importLede,
          step: steps,
        },
      ],
    },
    null,
    2
  );
}

mkdirSync(join(publicDir, "compare"), { recursive: true });

const hubHtml = writeLanding({
  title: "Compare docstoc — templates, invoices, SSL, certificates",
  description:
    "docstoc alternatives and import guides, grouped by product. Templates first — then invoices, SSL, file certificates, invoice chasing, and SOX AR evidence.",
  canonical: "/compare/",
  mainHtml: compareHubMainHtml(hubSectors()),
  jsonLd: JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Compare docstoc",
      url: "https://docstoc.io/compare/",
    },
    null,
    2
  ),
});
writeFileSync(join(publicDir, "compare/index.html"), hubHtml, "utf8");

let n = 0;
for (const c of COMPETITORS) {
  if (c.customLanding) continue;
  const altMain = alternativeMainHtml(c);
  const altPage = writeLanding({
    title: `${c.name} Alternative — ${c.headline.replace(/\.$/, "")} | docstoc`,
    description: `${c.sub} Compare docstoc with ${c.name} and import what you already have.`,
    canonical: altUrl(c),
    mainHtml: altMain,
    jsonLd: altJsonLd(c),
  });
  writeFileSync(join(publicDir, `${c.slug}-alternative.html`), altPage, "utf8");

  const vsPage = writeLanding({
    title: `docstoc vs ${c.name} | docstoc`,
    description: c.sub,
    canonical: altUrl(c),
    mainHtml: altMain,
    jsonLd: altJsonLd(c),
  });
  writeFileSync(join(publicDir, `docstoc-vs-${c.slug}.html`), vsPage, "utf8");

  const impPage = writeLanding({
    title: `Import from ${c.name} to docstoc`,
    description: c.importLede,
    canonical: importUrl(c),
    mainHtml: importMainHtml(c),
    jsonLd: importJsonLd(c),
    robots: "noindex, follow",
  });
  writeFileSync(join(publicDir, `import-from-${c.slug}.html`), impPage, "utf8");
  n += 1;
}

console.log(`Compare hub + ${n} alternative + ${n} import-from pages (and restyled vs pages).`);
