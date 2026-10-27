#!/usr/bin/env node
/**
 * Generates /switch-from-{slug} migration pages for each SSL/TLS competitor.
 * Run: node apps/web/scripts/generate-ssl-switch-pages.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chrome, escapeHtml } from "./lib/chrome.mjs";
import { SSL_COMPETITORS } from "./data/ssl-competitors.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");

function buildJsonLd(c) {
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://docstoc.io/" },
            { "@type": "ListItem", position: 2, name: "SSL", item: "https://docstoc.io/ssl" },
            {
              "@type": "ListItem",
              position: 3,
              name: `Switch from ${c.name}`,
              item: `https://docstoc.io/switch-from-${c.slug}`,
            },
          ],
        },
        {
          "@type": "HowTo",
          name: `How to switch from ${c.name} to docstoc SSL`,
          step: c.switchSteps.map((s) => ({
            "@type": "HowToStep",
            name: s.title,
            text: s.body,
          })),
        },
        {
          "@type": "FAQPage",
          mainEntity: c.switchFaq.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        },
      ],
    },
    null,
    2
  );
}

function buildMain(c) {
  const stepsHtml = c.switchSteps
    .map(
      (s) => `      <li>
        <strong>${escapeHtml(s.title)}</strong>
        <p>${escapeHtml(s.body)}</p>
      </li>`
    )
    .join("\n");

  const faqHtml = c.switchFaq
    .map(
      (item) =>
        `<details class="faq-item"><summary>${escapeHtml(item.q)}</summary>\n<p>${escapeHtml(item.a)}</p>\n</details>`
    )
    .join("\n");

  return `<p class="crumb"><a href="/">Home</a> / <a href="/ssl">SSL</a> / Switch from ${escapeHtml(c.name)}</p>
<h1>Switch from ${escapeHtml(c.name)} to docstoc SSL/TLS</h1>
  <p class="lede">${escapeHtml(c.switchWhy)}</p>

  <h2>Why teams make the move</h2>
  <p>${escapeHtml(c.pickDocstoc)}</p>
  <p><strong>When to stay on ${escapeHtml(c.name)}:</strong> ${escapeHtml(c.stayWithThem)}</p>

  <h2>Migration steps</h2>
  <ol class="switch-steps">
${stepsHtml}
  </ol>

  <h2>What transfers (and what does not)</h2>
  <p>${escapeHtml(c.whatTransfers)}</p>

  <p style="margin-top:28px">
    <a href="/app/login?start=1" class="nav-cta">Start free — add your domain</a>
    &nbsp; <a href="/docstoc-vs-${escapeHtml(c.slug)}">Compare docstoc vs ${escapeHtml(c.name)}</a>
    &nbsp; · <a href="/ssl">SSL overview</a>
    &nbsp; · <a href="/ssl">TLS overview</a>
    &nbsp; · <a href="/tools/ssl-certificate-calculator">Expiry calculator</a>
  </p>

  <h2>FAQ</h2>
  ${faqHtml}`;
}

mkdirSync(publicDir, { recursive: true });

for (const c of SSL_COMPETITORS) {
  const pathSlug = `switch-from-${c.slug}`;
  const title = `Switch from ${c.name} to docstoc SSL — Migration Guide | docstoc`;
  const description = `Leave ${c.name} for docstoc automated Let's Encrypt SSL/TLS: DNS TXT setup, renewals, what transfers, and when to stay on ${c.name}.`;

  const html = chrome({
    title,
    description,
    canonical: `/${pathSlug}`,
    activeNav: "",
    mainHtml: buildMain(c),
    jsonLd: buildJsonLd(c),
    depth: 0,
  });

  writeFileSync(join(publicDir, `${pathSlug}.html`), html, "utf8");
  console.log(`Generated ${pathSlug}.html`);
}

console.log(`Done — ${SSL_COMPETITORS.length} SSL switch-from pages.`);
