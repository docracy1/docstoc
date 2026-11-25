#!/usr/bin/env node
/**
 * Generates /business-kits/index.html + one page per kit, bundling several document templates
 * together (e.g. "everything a new LLC needs"). Run AFTER generate-free-templates.mjs — this
 * reads the document-templates/templates.json it writes, so template names/descriptions/slugs
 * stay in one place instead of being duplicated here.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chrome, escapeHtml } from "./lib/chrome.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../public/business-kits");
const docTemplatesPath = join(__dirname, "../public/document-templates/templates.json");

mkdirSync(outDir, { recursive: true });

const documentTemplates = JSON.parse(readFileSync(docTemplatesPath, "utf8"));
const bySlug = new Map(documentTemplates.map((t) => [t.slug, t]));

/** Staff-curated starter kits — bundles a few related document templates under one SEO page to
 *  raise average time-on-site vs. a single template. Kit membership for admin-curated kits (via
 *  the template_kits/template_kit_items D1 tables) is merged in live below; these are the
 *  launch set baked at build time. */
const KITS = [
  {
    slug: "us-small-business-starter-kit",
    name: "US Small Business Starter Kit",
    seoTitle: "Free US Small Business Starter Kit — LLC, NDA & Business Plan Templates",
    description:
      "Everything a new small business needs to get the paperwork basics in place: an LLC operating agreement, a one-page business plan, and a mutual NDA.",
    category: "Business",
    templateSlugs: ["llc-operating-agreement-single-member-template", "one-page-business-plan-template", "mutual-nda-template"],
  },
  {
    slug: "independent-landlord-kit",
    name: "Independent Landlord Kit",
    seoTitle: "Free Independent Landlord Kit — Lease & Termination Notice Templates",
    description:
      "The core paperwork for managing a rental directly: a residential lease agreement and a lease termination notice.",
    category: "Real Estate",
    templateSlugs: ["residential-lease-agreement-template", "lease-termination-notice-template"],
  },
  {
    slug: "collections-and-lending-kit",
    name: "Collections & Lending Kit",
    seoTitle: "Free Collections & Lending Kit — Demand Letter & Promissory Note Templates",
    description:
      "Documents for the money side of doing business: a formal demand letter for an unpaid invoice, and a simple promissory note for a loan.",
    category: "Finance",
    templateSlugs: ["demand-letter-unpaid-invoice-template", "simple-promissory-note-template"],
  },
];

function kitCard(kit) {
  return `      <a class="tpl-card" href="/business-kits/${kit.slug}">
        <div class="tpl-meta"><span>${escapeHtml(kit.category)}</span><span>${kit.templateSlugs.length} templates</span></div>
        <h3>${escapeHtml(kit.name)}</h3>
        <p>${escapeHtml(kit.description)}</p>
      </a>`;
}

const indexJsonLd = JSON.stringify(
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: "Free Business Document Kits",
        url: "https://docstoc.io/business-kits/",
        description: `${KITS.length} bundled document template kits for common business situations.`,
        isPartOf: { "@type": "WebSite", name: "docstoc", url: "https://docstoc.io" },
      },
    ],
  },
  null,
  2
);

const indexHtml = chrome({
  title: "Free Business Document Kits | docstoc",
  description: "Bundled document template kits — the full set of paperwork for a common business situation, in one place.",
  canonical: "https://docstoc.io/business-kits/",
  activeNav: "templates",
  jsonLd: indexJsonLd,
  mainHtml: `<main class="wrap templates-index">
  <p class="crumb"><a href="/">Home</a> / Business kits</p>
  <h1>Business document kits</h1>
  <p class="lede">The full set of paperwork for a common situation, bundled together instead of hunting for each document one at a time.</p>
  <div class="tpl-grid" id="kits-grid">
${KITS.map(kitCard).join("\n")}
  </div>
  <section class="tpl-cat-section" id="admin-kits" hidden>
    <h2 class="tpl-cat-title">More kits</h2>
    <div class="tpl-grid" id="admin-kits-grid"></div>
  </section>
  <p class="tpl-index-note"><a href="/document-templates/">Browse all individual document templates →</a></p>
</main>
<script>
(function () {
  var section = document.getElementById("admin-kits");
  var grid = document.getElementById("admin-kits-grid");
  var knownSlugs = ${JSON.stringify(KITS.map((k) => k.slug))};
  if (!section || !grid) return;
  fetch("/api/marketplace/kits")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var rows = ((data && data.kits) || []).filter(function (k) { return knownSlugs.indexOf(k.slug) === -1; });
      if (!rows.length) return;
      function esc(s) { return String(s || "").replace(/</g, "&lt;"); }
      rows.forEach(function (k) {
        var card = document.createElement("a");
        card.className = "tpl-card";
        card.href = "/business-kits/" + esc(k.slug);
        card.innerHTML = '<div class="tpl-meta"><span>' + esc(k.category) + '</span></div><h3>' + esc(k.name) + '</h3><p>' + esc(k.description) + '</p>';
        grid.appendChild(card);
      });
      section.hidden = false;
    })
    .catch(function () {});
})();
</script>`,
});

writeFileSync(join(outDir, "index.html"), indexHtml);

for (const kit of KITS) {
  const templates = kit.templateSlugs.map((slug) => bySlug.get(slug)).filter(Boolean);

  const itemsHtml = templates
    .map(
      (t) => `<a class="tpl-card" href="/document-templates/${t.slug}">
        <div class="tpl-meta"><span>${escapeHtml(t.category)}</span></div>
        <h3>${escapeHtml(t.name)}</h3>
        <p>${escapeHtml(t.description)}</p>
      </a>`
    )
    .join("\n      ");

  const jsonLd = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "ItemList",
          name: kit.name,
          description: kit.description,
          url: `https://docstoc.io/business-kits/${kit.slug}`,
          itemListElement: templates.map((t, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `https://docstoc.io/document-templates/${t.slug}`,
            name: t.name,
          })),
        },
      ],
    },
    null,
    2
  );

  const page = chrome({
    title: `${kit.seoTitle} | docstoc`,
    description: kit.description,
    canonical: `https://docstoc.io/business-kits/${kit.slug}`,
    activeNav: "templates",
    jsonLd,
    mainHtml: `<main class="wrap template-detail">
  <p class="crumb"><a href="/">Home</a> / <a href="/business-kits/">Business kits</a> / ${escapeHtml(kit.name)}</p>
  <div class="tpl-meta"><span>${escapeHtml(kit.category)}</span><span>${templates.length} templates</span></div>
  <h1>${escapeHtml(kit.name)}</h1>
  <p class="lede">${escapeHtml(kit.description)}</p>

  <h2>What's in this kit</h2>
  <div class="tpl-grid">
      ${itemsHtml}
  </div>

</main>`,
  });

  writeFileSync(join(outDir, `${kit.slug}.html`), page);
}

console.log(`Wrote ${KITS.length} business kits + index → ${outDir}`);
