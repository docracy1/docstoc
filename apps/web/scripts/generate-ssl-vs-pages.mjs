#!/usr/bin/env node
/**
 * Generates "docstoc vs {Provider}" SSL/TLS comparison pages from shared competitor data.
 * Run: node apps/web/scripts/generate-ssl-vs-pages.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chrome, escapeHtml } from "./lib/chrome.mjs";
import { DOCSTOC_SSL, SSL_COMPETITORS } from "./data/ssl-competitors.mjs";

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
              name: `docstoc vs ${c.name}`,
              item: `https://docstoc.io/docstoc-vs-${c.slug}`,
            },
          ],
        },
        {
          "@type": "FAQPage",
          mainEntity: c.faq.map((item) => ({
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
  const title = `docstoc vs ${c.name}`;
  const rows = [
    ["Best fit", DOCSTOC_SSL.bestFit, c.bestFit],
    ["Pricing", DOCSTOC_SSL.pricing, c.pricing],
    ["Certificate types", DOCSTOC_SSL.certTypes, c.certTypes],
    ["Automation", DOCSTOC_SSL.automation, c.automation],
    ["Setup", DOCSTOC_SSL.setup, c.setup],
    ["Bundled with a business platform", DOCSTOC_SSL.bundled, c.bundled],
    ["Free / included tier", DOCSTOC_SSL.freeTier, c.freeTier],
  ];

  const tableRows = rows
    .map(
      ([label, docstocVal, otherVal]) => `          <tr>
            <td>${escapeHtml(label)}</td>
            <td class="col-docstoc">${escapeHtml(docstocVal)}</td>
            <td>${escapeHtml(otherVal)}</td>
          </tr>`
    )
    .join("\n");

  const faqHtml = c.faq
    .map(
      (item) =>
        `<details class="faq-item"><summary>${escapeHtml(item.q)}</summary>\n<p>${escapeHtml(item.a)}</p>\n</details>`
    )
    .join("\n");

  return `<p class="crumb"><a href="/">Home</a> / <a href="/ssl">SSL</a> / ${escapeHtml(title)}</p>
<h1>${escapeHtml(title)} — free automated SSL/TLS, compared</h1>
  <p class="lede">${escapeHtml(c.summary)}</p>

  <h2>docstoc vs ${escapeHtml(c.name)} at a glance</h2>
  <div class="compare-table-wrap">
    <table class="compare-table">
      <thead>
        <tr>
          <th scope="col"></th>
          <th scope="col" class="col-docstoc">docstoc</th>
          <th scope="col">${escapeHtml(c.name)}</th>
        </tr>
      </thead>
      <tbody>
${tableRows}
      </tbody>
    </table>
  </div>
  <p class="pc-note">Pricing and feature figures reflect publicly available information as of August 2026 — certificate vendors change plans often, so check <a href="${escapeHtml(c.pricingUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.name)}'s own site</a> before you buy.</p>

  <h2>Who should pick which</h2>
  <p><strong>Pick docstoc</strong> — ${escapeHtml(c.pickDocstoc)}</p>
  <p><strong>Stay with ${escapeHtml(c.name)}</strong> — ${escapeHtml(c.stayWithThem)}</p>

  <h2>Honest limits (read this)</h2>
  <ul>
    <li>docstoc issues <strong>domain-validated (DV)</strong> Let's Encrypt certificates — enough for the browser padlock on most small-business sites.</li>
    <li>docstoc does <strong>not</strong> replace OV/EV organization validation, commercial warranties, or enterprise PKI fleets.</li>
    <li>You add <strong>one DNS TXT record</strong>; docstoc is not your CDN, nameserver, or web host.</li>
  </ul>

  <h2>Switching from ${escapeHtml(c.name)}</h2>
  <p>${escapeHtml(c.switchWhy)}</p>
  <p><a href="/switch-from-${escapeHtml(c.slug)}">Step-by-step: switch from ${escapeHtml(c.name)} to docstoc →</a></p>

  <p style="margin-top:28px">
    <a href="/app/login?start=1" class="nav-cta">Try docstoc free</a>
    &nbsp; <a href="/ssl">SSL product overview</a>
    &nbsp; · <a href="/ssl">TLS overview</a>
    &nbsp; · <a href="/tools/ssl-certificate-calculator">SSL expiry calculator</a>
    &nbsp; · <a href="/trust-badges">Trust badges</a>
  </p>

  <h2>FAQ</h2>
  ${faqHtml}`;
}

mkdirSync(publicDir, { recursive: true });

for (const c of SSL_COMPETITORS) {
  const slug = `docstoc-vs-${c.slug}`;
  const title = `docstoc vs ${c.name} — Free Automated SSL/TLS Compared | docstoc`;
  const description = `docstoc vs ${c.name}: pricing, automation, DV vs OV/EV, and setup effort for small-business SSL/TLS — plus when to stay on ${c.name}.`;

  const html = chrome({
    title,
    description,
    canonical: `/${slug}`,
    activeNav: "",
    mainHtml: buildMain(c),
    jsonLd: buildJsonLd(c),
    depth: 0,
  });

  writeFileSync(join(publicDir, `${slug}.html`), html, "utf8");
  console.log(`Generated ${slug}.html`);
}

console.log(`Done — ${SSL_COMPETITORS.length} SSL/TLS vs pages.`);
