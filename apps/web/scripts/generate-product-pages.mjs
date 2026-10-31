#!/usr/bin/env node
/**
 * Product + features pages in the document-templates style (tpl-hero + white body).
 * Products describe capabilities; Tools are for trying them out (CTA at page end).
 * Run: node apps/web/scripts/generate-product-pages.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chrome, escapeHtml } from "./lib/chrome.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");

const PRODUCT_EXTRA = `<style>
.prod-body { max-width: 720px; margin: 0 auto 48px; }
.prod-body h2 {
  font-family: 'Fraunces', serif;
  font-weight: 600;
  font-size: 1.45rem;
  margin: 36px 0 12px;
  color: var(--ink);
}
.prod-body h2:first-of-type { margin-top: 8px; }
.prod-body p { font-size: 15.5px; line-height: 1.65; color: var(--ink-soft); margin: 0 0 14px; }
.prod-body ul { margin: 0 0 18px; padding-left: 1.2em; color: var(--ink-soft); font-size: 15.5px; line-height: 1.65; }
.prod-body li { margin-bottom: 8px; }
.prod-body li strong { color: var(--ink); }
.prod-try {
  margin: 40px 0 8px;
  padding: 28px 24px;
  background: #f7f5f2;
  border-radius: 16px;
  text-align: center;
}
.prod-try h2 { margin: 0 0 10px; font-family: 'Fraunces', serif; font-size: 1.35rem; }
.prod-try p { margin: 0 0 18px; color: var(--ink-soft); font-size: 15px; }
.prod-try .nav-cta { display: inline-block; }
.prod-try-secondary { display: inline-block; margin-left: 14px; font-weight: 600; font-size: 14px; color: var(--accent); text-decoration: none; }
.prod-try-secondary:hover { text-decoration: underline; }
.prod-grid {
  display: grid;
  gap: 18px;
  margin: 24px 0 36px;
  grid-template-columns: 1fr;
}
@media (min-width: 640px) {
  .prod-grid { grid-template-columns: repeat(2, 1fr); }
}
.prod-card {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 18px 16px;
  text-decoration: none;
  color: inherit;
  border-radius: 14px;
  transition: background 0.15s ease;
}
.prod-card:hover { background: #f7f5f2; }
.prod-card-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 16px color-mix(in srgb, var(--accent) 35%, transparent);
}
.prod-card-icon svg { width: 24px; height: 24px; }
.prod-card-title { display: block; font-weight: 700; font-size: 16px; color: var(--ink); margin-bottom: 4px; }
.prod-card-desc { display: block; font-size: 13.5px; line-height: 1.45; color: var(--ink-soft); }
</style>`;

const ICONS = {
  store: '<path d="M4 9.5l1-4h14l1 4" /><path d="M4 9.5a2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0" /><path d="M5.5 11v9h13v-9" />',
  briefcase:
    '<rect x="3" y="7.5" width="18" height="12" rx="1.5" /><path d="M8 7.5V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5" /><path d="M3 12.5h18" />',
  shield: '<path d="M12 3l7 3v5.5c0 5-3.5 8-7 9.5-3.5-1.5-7-4.5-7-9.5V6l7-3z" /><path d="M9 12l2 2 4-4" />',
  lock: '<rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />',
  building:
    '<rect x="5" y="3.5" width="10" height="17" rx="1" /><path d="M15 20.5h4v-8l-4-3" /><path d="M8.5 7.5h.01M11.5 7.5h.01M8.5 11h.01M11.5 11h.01M8.5 14.5h.01M11.5 14.5h.01" />',
  bolt: '<path d="M12.5 2.5L4 14h6l-1 7.5L20 10h-6l-1.5-7.5z" />',
  duplicate: '<rect x="8" y="8" width="12" height="13" rx="1.5" /><path d="M4 15V4.5A1.5 1.5 0 0 1 5.5 3H15" />',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />',
};

function iconSvg(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

function faqHtml(faqs) {
  return faqs
    .map(
      (item) =>
        `<details class="faq-item"><summary>${escapeHtml(item.q)}</summary>\n<p>${escapeHtml(item.a)}</p>\n</details>`
    )
    .join("\n");
}

function buildJsonLd(path, name, faqs) {
  const graph = [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://docstoc.io/" },
        { "@type": "ListItem", position: 2, name, item: `https://docstoc.io${path}` },
      ],
    },
    {
      "@type": "WebPage",
      name: `docstoc ${name}`,
      url: `https://docstoc.io${path}`,
      isPartOf: { "@type": "WebSite", name: "docstoc", url: "https://docstoc.io/" },
    },
    {
      "@type": "SoftwareApplication",
      name: `docstoc — ${name}`,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: `https://docstoc.io${path}`,
      offers: [
        {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "Free tier — 5 AI drafts per month",
        },
        {
          "@type": "Offer",
          price: "14.99",
          priceCurrency: "USD",
          description: "Pro — unlimited AI, connectors, API",
        },
        {
          "@type": "Offer",
          price: "39.99",
          priceCurrency: "USD",
          description: "Business — smart reply, SSL automation, trust badge",
        },
      ],
      publisher: { "@type": "Organization", name: "docstoc", url: "https://docstoc.io/" },
    },
  ];
  if (faqs?.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faqs.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
}

function productPage({
  crumb,
  h1,
  lede,
  sections,
  tryTitle,
  tryBody,
  tryHref,
  tryLabel,
  trySecondary,
  faqs,
}) {
  const sectionsHtml = sections
    .map(
      (s) => `<h2>${escapeHtml(s.title)}</h2>
<p>${s.body}</p>
${s.bullets ? `<ul>${s.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>` : ""}`
    )
    .join("\n");

  return `<section class="tpl-hero">
  <div class="wrap tpl-hero-inner">
    <h1>${escapeHtml(h1)}</h1>
    <p class="tpl-hero-lede">${lede}</p>
  </div>
</section>
<div class="prod-body">
  <p class="crumb">${crumb}</p>
  ${sectionsHtml}
  <div class="prod-try">
    <h2>${escapeHtml(tryTitle)}</h2>
    <p>${tryBody}</p>
    <a href="${tryHref}" class="nav-cta">${escapeHtml(tryLabel)}</a>
    ${trySecondary ? `<a class="prod-try-secondary" href="${trySecondary.href}">${escapeHtml(trySecondary.label)}</a>` : ""}
  </div>
  ${faqs?.length ? `<h2>FAQ</h2>\n${faqHtml(faqs)}` : ""}
</div>`;
}

const PRODUCTS = [
  {
    file: "invoices.html",
    depth: 0,
    canonical: "/invoices",
    activeNav: "",
    title: "Invoice Generator — Create Shareable Invoices | docstoc",
    description:
      "Create professional shareable invoices with line items and tax, then chase overdue ones with AI drafts. Describe what the invoice generator can do — try it free in Tools.",
    name: "Invoice generator",
    page: {
      crumb: `<a href="/">Home</a> / Invoice generator`,
      h1: "Invoice generator",
      lede: "Build a professional invoice with line items, tax, and currency — then share a client link. When payment is late, chase it from the same workspace.",
      sections: [
        {
          title: "What it can do",
          body: "docstoc’s invoice product is built for freelancers and small teams who need a clean invoice out the door — and a way to follow up without starting from a blank email.",
          bullets: [
            "<strong>Line items &amp; totals</strong> — quantity, rate, tax, and currency with a clear preview before you share.",
            "<strong>Shareable client link</strong> — a public <code>/invoice/…</code> page your client can open or print.",
            "<strong>Chase when overdue</strong> — connect the same invoice to AI follow-up drafts matched to days late.",
            "<strong>Import when you already invoiced elsewhere</strong> — CSV plus QuickBooks, Xero, and other accounting sync for chase workflows.",
          ],
        },
        {
          title: "Who it’s for",
          body: "Solo operators and small agencies who invoice regularly and want one place for create → share → remind — without a heavy AR suite.",
        },
        {
          title: "What it is not",
          body: "docstoc does not auto-send emails on your behalf. You share the invoice link and send follow-ups from your own inbox after reviewing each draft.",
        },
      ],
      tryTitle: "Try it in Tools",
      tryBody: "Preview totals free in your browser, then create a shareable link in your account.",
      tryHref: "/tools/invoice-generator",
      tryLabel: "Open invoice generator →",
      trySecondary: { href: "/app/invoices", label: "Go to Invoices in app" },
      faqs: [
        {
          q: "Is the invoice generator free to try?",
          a: "Yes. The Tools preview runs in your browser. Creating a shareable link uses your docstoc account.",
        },
        {
          q: "Can I chase an invoice I created here?",
          a: "Yes. Overdue invoices can feed AI tone-matched follow-up drafts so create and chase stay in one product.",
        },
      ],
    },
  },
  {
    file: "certificate.html",
    depth: 0,
    canonical: "/certificate",
    activeNav: "",
    title: "Document Certificates — Tamper-Evident Hash Verification | docstoc",
    description:
      "Prove a file hasn’t changed since you certified it. Free tamper-evident document certificates with SHA-256 hash verification — try the hash checker in Tools.",
    name: "Document certificates",
    page: {
      crumb: `<a href="/">Home</a> / Document certificates`,
      h1: "Document certificates",
      lede: "Create a tamper-evident certificate for any file. Anyone can re-hash the original and confirm it still matches — no “I never got that” disputes.",
      sections: [
        {
          title: "What it can do",
          body: "A document certificate records a cryptographic fingerprint of your file at a point in time. Share the verification link with clients, counterparties, or auditors.",
          bullets: [
            "<strong>SHA-256 hash of the file</strong> — the file itself never needs to leave your machine for client-side checks.",
            "<strong>Public verification page</strong> — a durable link that shows what was certified and when.",
            "<strong>Works on any file type</strong> — contracts, invoices, designs, PDFs, zips.",
            "<strong>Optional Bitcoin timestamping</strong> — stronger independent proof for accounts that enable it.",
          ],
        },
        {
          title: "Who it’s for",
          body: "Anyone who sends important documents and needs a simple way to prove the exact bytes that were delivered — freelancers, agencies, and small legal/ops teams.",
        },
        {
          title: "What it is not",
          body: "This is not an e-signature product and not legal advice. It proves integrity of a file’s contents, not that a person legally signed a contract.",
        },
      ],
      tryTitle: "Try it in Tools",
      tryBody: "Hash a file in your browser, or open Certificates in the app to issue a full certificate.",
      tryHref: "/tools/file-hash-checker",
      tryLabel: "Open file hash checker →",
      trySecondary: { href: "/app/certificates", label: "Create a certificate in app" },
      faqs: [
        {
          q: "Do you store my document?",
          a: "Certification is based on the file hash. You control what you upload; verification compares hashes against the recorded fingerprint.",
        },
        {
          q: "Is this the same as SSL certificates?",
          a: "No. Document certificates prove file integrity. SSL/TLS certificates secure a domain’s HTTPS — see the SSL product page for that.",
        },
      ],
    },
  },
  {
    file: "trust-badges.html",
    depth: 0,
    canonical: "/trust-badges",
    activeNav: "",
    title: "Company Badge — Domain-Verified Trust Badge | docstoc",
    description:
      "Domain-verified corporate trust badges for your site and proposals — backed by a real Let's Encrypt certificate and an optional Bitcoin timestamp. Look up profiles free; manage yours in the app.",
    name: "Company badge",
    page: {
      crumb: `<a href="/">Home</a> / Company badge`,
      h1: "Company badge",
      lede: "Prove you control your domain — then show it. When docstoc issues your SSL certificate, you get a public trust profile and an embeddable badge clients can check themselves.",
      sections: [
        {
          title: "What it can do",
          body: "A company badge is a client-facing credibility signal tied to live domain control — not a generic seal you buy and forget.",
          bullets: [
            "<strong>Secure a domain</strong> with <a href=\"/ssl\">docstoc SSL automation</a> — real Let's Encrypt, DNS-01 challenge.",
            "<strong>Trust profile created automatically</strong> when that certificate goes active — no separate signup.",
            "<strong>Bitcoin timestamp</strong> anchors the “verified since” date (usually within a few hours).",
            "<strong>Embed the badge</strong> with one script tag on your site, proposals, or client portal.",
            "<strong>Live SSL status</strong> — always fetched fresh, never frozen into a stale “active” claim.",
          ],
        },
        {
          title: "Who it’s for",
          body: "Freelancers, agencies, and small businesses that need a simple credibility signal against larger vendors — and want clients to verify domain control themselves.",
        },
        {
          title: "What it is not",
          body: "The badge is deliberately narrow so it stays honest. It verifies DNS control of a domain (via a live certificate) and, once confirmed, the date verified status began. It does <strong>not</strong> claim business registration, legal-entity status, or government ID checks — docstoc doesn’t run those, so the badge never says it does.",
        },
      ],
      tryTitle: "Get your company badge",
      tryBody: "Manage your badge in the app after a domain is secured, or look up any public trust profile free in Tools.",
      tryHref: "/app/company-badge",
      tryLabel: "Open company badge →",
      trySecondary: { href: "/tools/trust-badges", label: "Look up a badge in Tools" },
      faqs: [
        {
          q: "Is this the same as a document certificate?",
          a: "No. Document certificates fingerprint a specific file. Company badges prove ongoing domain control for a workspace — complementary signals.",
        },
        {
          q: "Which plan includes company badges?",
          a: "They're created automatically with SSL automation on the Business plan. Looking up someone else's public profile is free for everyone.",
        },
        {
          q: "Can clients verify without trusting docstoc?",
          a: "Once the Bitcoin timestamp confirms, they can download the .ots proof from the public trust profile and check it with OpenTimestamps tools independently.",
        },
      ],
    },
  },
  {
    file: "features/ai-tone.html",
    depth: 1,
    canonical: "/features/ai-tone",
    activeNav: "ai",
    title: "AI Invoice Chasing — Tone-Matched Follow-Up Drafts | docstoc",
    description:
      "AI follow-up drafts that match how late an invoice is — friendly, professional, or direct. Soften, firm up, or shorten on paid plans. Try the chase calculator in Tools.",
    name: "AI invoice chasing",
    page: {
      crumb: `<a href="/">Home</a> / <a href="/features/">Features</a> / AI invoice chasing`,
      h1: "AI invoice chasing",
      lede: "The hard part of chasing invoices is tone. docstoc drafts follow-ups matched to days overdue — you review and send from your own inbox.",
      sections: [
        {
          title: "What it can do",
          body: "Every draft is calibrated to lateness so you don’t sound desperate on day three or vague on day forty.",
          bullets: [
            "<strong>Friendly</strong> (under ~7 days) — assumes an oversight, asks when payment is scheduled.",
            "<strong>Professional</strong> (about 8–30 days) — clear ask with invoice details and due date.",
            "<strong>Direct</strong> (30+ days) — firm language without empty threats.",
            "<strong>Soften / Firm up / Shorten</strong> (paid) — one-click rewrites after the first draft.",
            "<strong>Chase plans</strong> — multi-step sequences so you’re not inventing the next touch from scratch.",
          ],
        },
        {
          title: "Who it’s for",
          body: "Freelancers and small teams who hate writing awkward payment reminders but still want control over every send.",
        },
        {
          title: "What it is not",
          body: "docstoc does not auto-email your clients. Drafts stay in your account until you copy or send them yourself.",
        },
      ],
      tryTitle: "Try it in Tools",
      tryBody: "Estimate late fees and cash unlocked, or jump into the app for a full tone-matched draft.",
      tryHref: "/tools/invoice-chase-calculator",
      tryLabel: "Open chase calculator →",
      trySecondary: { href: "/app/login?start=1", label: "Draft a chase in app" },
      faqs: [
        {
          q: "How many AI drafts do I get free?",
          a: "The free tier includes a small monthly allowance of AI drafts. Paid plans unlock more drafts and rewrite tools.",
        },
        {
          q: "Can I use static email templates instead?",
          a: "Yes — browse free payment reminder templates when you want copy-paste instead of AI.",
        },
      ],
    },
  },
  {
    file: "features/templates.html",
    depth: 1,
    canonical: "/features/templates",
    activeNav: "templates",
    title: "Free Invoice Email Templates — Copy-Paste Reminders | docstoc",
    description:
      "Free payment reminder email templates for every stage of an overdue invoice. Copy, fill in, send — or switch to AI drafts when you want tone matching.",
    name: "Email templates",
    page: {
      crumb: `<a href="/">Home</a> / <a href="/features/">Features</a> / Email templates`,
      h1: "Free invoice email templates",
      lede: "Copy-paste payment reminders for every stage — from pre-due nudges to final notices. No account required to browse and copy.",
      sections: [
        {
          title: "What it can do",
          body: "A ready library of invoice follow-up emails so you’re never staring at a blank compose window.",
          bullets: [
            "Pre-due and due-today reminders",
            "Gentle overdue through formal 30–60 day notices",
            "Final notice before collections",
            "Payment plans, partial payments, disputes, and thank-you notes",
          ],
        },
        {
          title: "Templates vs AI drafts",
          body: "Templates are static — you fill placeholders yourself. AI drafts use your invoice data and days overdue. Use whichever fits the moment.",
        },
      ],
      tryTitle: "Browse the library",
      tryBody: "Open the free templates collection, or use the template finder tool to search by situation.",
      tryHref: "/free-templates/",
      tryLabel: "Browse free templates →",
      trySecondary: { href: "/tools/template-finder", label: "Template finder tool" },
      faqs: [
        {
          q: "Do I need an account?",
          a: "No for browsing and copying templates, or for your first 5 AI drafts a month. An account is needed for saving work in the app.",
        },
      ],
    },
  },
];

const FEATURES_HUB_CARDS = [
  {
    href: "/document-templates/",
    icon: "store",
    title: "Document templates",
    desc: "1,000+ free business & legal templates, plus kits.",
  },
  {
    href: "/invoices",
    icon: "briefcase",
    title: "Invoice generator",
    desc: "Create a shareable invoice — then chase it if it goes overdue.",
  },
  {
    href: "/certificate",
    icon: "shield",
    title: "Document certificates",
    desc: "Free tamper-evident hash verification for any file.",
  },
  {
    href: "/ssl",
    icon: "lock",
    title: "SSL / TLS automation",
    desc: "Free Let's Encrypt certificates for your own domain.",
  },
  {
    href: "/trust-badges",
    icon: "building",
    title: "Company badge",
    desc: "Domain-verified trust badge for your site and proposals.",
  },
  {
    href: "/features/ai-tone",
    icon: "bolt",
    title: "AI invoice chasing",
    desc: "Tone-matched follow-up drafts for overdue invoices.",
  },
  {
    href: "/features/templates",
    icon: "duplicate",
    title: "Email templates",
    desc: "18+ free payment reminder emails — copy and send.",
  },
];

function writePage({ file, depth, canonical, activeNav, title, description, name, mainHtml, faqs }) {
  const outPath = join(publicDir, file);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    chrome({
      title,
      description,
      canonical,
      activeNav: activeNav || "",
      mainHtml,
      jsonLd: buildJsonLd(canonical, name, faqs || []),
      extraHead: PRODUCT_EXTRA,
      depth,
    }),
    "utf8"
  );
}

for (const p of PRODUCTS) {
  writePage({
    ...p,
    mainHtml: productPage(p.page),
    faqs: p.page.faqs,
  });
}

const featuresHubMain = `<section class="tpl-hero">
  <div class="wrap tpl-hero-inner">
    <h1>docstoc features</h1>
    <p class="tpl-hero-lede">The Trust Automation Layer — templates, invoices, certificates, SSL, and AI collections. Each product below explains what it can do; Tools let you try it.</p>
  </div>
</section>
<div class="prod-body">
  <p class="crumb"><a href="/">Home</a> / Features</p>
  <h2>Products</h2>
  <p>Pick a product to read what it covers. When you’re ready to try, every product page links to the matching tool.</p>
  <div class="prod-grid">
${FEATURES_HUB_CARDS.map(
  (c) => `    <a class="prod-card" href="${c.href}">
      <span class="prod-card-icon">${iconSvg(c.icon)}</span>
      <span>
        <span class="prod-card-title">${escapeHtml(c.title)}</span>
        <span class="prod-card-desc">${escapeHtml(c.desc)}</span>
      </span>
    </a>`
).join("\n")}
  </div>
  <h2>Also in the platform</h2>
  <ul>
    <li><a href="/use-cases/">Use cases</a> — risk scoring, audit-ready workflows, compliance boards</li>
    <li><a href="/docs/">API &amp; docs</a> — webhooks, chase draft API, MCP</li>
  </ul>
  <div class="prod-try">
    <h2>Prefer to try first?</h2>
    <p>Jump into Tools for hash checks, invoice preview, SSL expiry math, and chase estimates.</p>
    <a href="/tools/" class="nav-cta">Open Tools →</a>
  </div>
</div>`;

writePage({
  file: "features/index.html",
  depth: 1,
  canonical: "/features/",
  activeNav: "features",
  title: "Features — Templates, Invoices, Certificates, SSL & AI | docstoc",
  description:
    "Explore docstoc products: document templates, invoice generator, certificates, SSL automation, and AI invoice chasing. Descriptions here; try them in Tools.",
  name: "Features",
  mainHtml: featuresHubMain,
  faqs: [],
});

console.log(`Generated ${PRODUCTS.length + 1} product/feature pages (templates style)`);
