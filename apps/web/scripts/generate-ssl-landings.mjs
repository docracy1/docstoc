#!/usr/bin/env node
/**
 * Generates /ssl and /tls product landings in document-templates style (tpl-hero).
 * Run: node apps/web/scripts/generate-ssl-landings.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chrome, escapeHtml } from "./lib/chrome.mjs";
import { SSL_COMPETITORS } from "./data/ssl-competitors.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");

function competitorGrid() {
  const cards = SSL_COMPETITORS.map(
    (c) => `      <article class="ssl-comp-card">
        <h3>${escapeHtml(c.name)}</h3>
        <p>${escapeHtml(c.bestFit)}</p>
        <p class="ssl-comp-links">
          <a href="/docstoc-vs-${escapeHtml(c.slug)}">Compare</a>
          · <a href="/switch-from-${escapeHtml(c.slug)}">Switch from ${escapeHtml(c.name)}</a>
        </p>
      </article>`
  ).join("\n");
  return `<div class="ssl-comp-grid">\n${cards}\n    </div>`;
}

const EXTRA_HEAD = `<style>
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
.ssl-steps { display:grid; gap:16px; margin:20px 0 28px; }
@media (min-width:720px){ .ssl-steps { grid-template-columns: repeat(3, 1fr); } }
.ssl-step { border:1px solid #e5e7eb; border-radius:12px; padding:18px 16px; background:#fff; }
.ssl-step strong { display:block; margin-bottom:8px; font-size:15px; color: var(--ink); }
.ssl-step p { margin:0; font-size:14.5px; line-height:1.55; color:#4b5563; }
.ssl-comp-grid { display:grid; gap:14px; margin:18px 0 28px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
.ssl-comp-card { border:1px solid #e5e7eb; border-radius:12px; padding:16px; background:#fff; }
.ssl-comp-card h3 { margin:0 0 8px; font-size:16px; }
.ssl-comp-card p { margin:0 0 10px; font-size:13.5px; line-height:1.5; color:#4b5563; }
.ssl-comp-links { margin:0 !important; font-size:13.5px !important; font-weight:600; }
.ssl-limits { background:#f9fafb; border:1px solid #e5e7eb; border-radius:12px; padding:18px 20px; margin:18px 0 28px; }
.ssl-limits ul { margin:8px 0 0; padding-left:18px; }
</style>`;

function sharedSections(kind) {
  // /tls 301s to /ssl (public/_redirects), so only the TLS wording links across, never the reverse.
  const peer = kind === "ssl" ? null : ["SSL", "/ssl"];
  return `
  <h2>What it can do</h2>
  <p>docstoc automates real Let's Encrypt domain-validated certificates for hostnames you control — one DNS TXT record, guided renewals, same account as invoices and documents.</p>
  <ul>
    <li><strong>Add a domain</strong> — Free: 5 × 90-day LE certs; Pro: multi-SAN; Business: wildcards + volume.</li>
    <li><strong>DNS-01 validation</strong> — publish TXT record(s); no HTTP file drop or nameserver move.</li>
    <li><strong>Renewal reminders</strong> — we email you before expiry; publish a fresh DNS value and reissue in the app.</li>
    <li><strong>Download PEMs</strong> — install on nginx, Apache, Caddy, or your host panel.</li>
  </ul>

  <h2>How it works</h2>
  <div class="ssl-steps">
    <div class="ssl-step"><strong>1. Add your domain</strong><p>Sign in and add the hostname you want secured in SSL certificates.</p></div>
    <div class="ssl-step"><strong>2. Publish one DNS TXT</strong><p>Copy the challenge to your DNS provider. No CDN proxy required.</p></div>
    <div class="ssl-step"><strong>3. Install &amp; renew</strong><p>Download PEMs for your server; we remind you before expiry and guide the renewal.</p></div>
  </div>

  <h2>Who it’s for</h2>
  <ul>
    <li>Freelancers and small businesses who need HTTPS without running certbot</li>
    <li>Agencies putting client sites or portals on custom domains</li>
    <li>Teams that already use docstoc for invoices or documents and want SSL in the same account</li>
  </ul>

  <div class="ssl-limits">
    <strong>Honest limits</strong>
    <ul>
      <li><strong>Automation layer, not a reseller</strong> — the CA is Let's Encrypt; you pay for managed issuance/renewal in your workspace.</li>
      <li><strong>DV only</strong> — Let's Encrypt domain validation. Not OV/EV.</li>
      <li><strong>Not a commercial CA replacement</strong> for warranties or enterprise PKI.</li>
      <li><strong>Not your host/CDN</strong> — keep hosting; docstoc automates the certificate lifecycle.</li>
    </ul>
  </div>

  <h2>Compare providers</h2>
  <p>Side-by-side pages and migration guides — ZeroSSL, Cloudflare, DigiCert, Hostinger, and more.</p>
  ${competitorGrid()}

  <h2>Feature deep-dives</h2>
  <ul>
    <li><a href="/ssl/features/">SSL features hub</a></li>
    <li><a href="/ssl/features/certificates">Certificates</a> · <a href="/ssl/features/validation">Validation</a> · <a href="/ssl/features/installation">Installation</a></li>
    <li><a href="/ssl/features/wildcards">Wildcards</a> · <a href="/ssl/features/monitoring">Monitoring</a> · <a href="/ssl/features/protection">Trust &amp; protection</a> · <a href="/ssl/features/acme">ACME</a></li>
    <li><a href="/ssl/features/enterprise">Business SSL</a> · <a href="/ssl/developer">Developer API</a></li>
  </ul>

  <h2>Related</h2>
  <ul>
    ${peer ? `<li><a href="${peer[1]}">${peer[0]} overview</a> — same product, ${peer[0].toLowerCase()}-oriented wording</li>` : ""}
    <li><a href="/use-cases/free-ssl-for-your-domain">Free SSL for a client's domain</a></li>
    <li><a href="/monitoringssl">SSL monitoring</a> · <a href="/monitoringtls">TLS monitoring</a></li>
  </ul>`;
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
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://docstoc.io/" },
            { "@type": "ListItem", position: 2, name, item: `https://docstoc.io${path}` },
          ],
        },
        {
          "@type": "WebApplication",
          name: `docstoc ${name}`,
          url: `https://docstoc.io${path}`,
          applicationCategory: "SecurityApplication",
          operatingSystem: "Any",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          provider: { "@type": "Organization", name: "docstoc", url: "https://docstoc.io/" },
        },
        {
          "@type": "FAQPage",
          mainEntity: faqs.map((item) => ({
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

const sslFaqs = [
  {
    q: "Is this a free SSL certificate?",
    a: "The CA (Let's Encrypt) does not charge for the DV cert. docstoc is an automation layer: Free includes 5 × 90-day certs; Pro/Business unlock multi-SAN, wildcards, and higher limits.",
  },
  {
    q: "Are you a certificate reseller?",
    a: "No. We do not resell commercial CA SKUs. We manage Let's Encrypt ACME orders for domains you control; you pay for the automation and workspace.",
  },
  {
    q: "SSL or TLS — which do I need?",
    a: "Modern browsers use TLS. People still search “SSL certificate” for the same HTTPS padlock. Same product either way.",
  },
  {
    q: "Do I need to move my site to docstoc hosting?",
    a: "No. Keep your host. Add DNS TXT record(s); each renewal gives you a fresh value to publish.",
  },
  {
    q: "Can I get OV or EV certificates?",
    a: "Not from docstoc. We automate DV Let's Encrypt certificates. Use a commercial CA if procurement requires OV/EV.",
  },
];

const tlsFaqs = [
  {
    q: "What is a TLS certificate?",
    a: "A TLS certificate lets browsers establish encrypted HTTPS. “SSL certificate” is the everyday name for the same idea.",
  },
  {
    q: "Is TLS better than SSL?",
    a: "TLS is the modern protocol; legacy SSL versions are retired. When vendors say SSL, they mean TLS under the hood.",
  },
  {
    q: "How is docstoc different from certbot?",
    a: "Same CA (Let's Encrypt). Different ops: one DNS TXT and guided renewals beside invoices and documents.",
  },
  {
    q: "Where do I compare alternatives?",
    a: "Use the provider grid on this page for docstoc vs and switch-from guides.",
  },
];

function pageMain({ crumbLabel, h1, lede, kind, faqs }) {
  return `<section class="tpl-hero">
  <div class="wrap tpl-hero-inner">
    <h1>${escapeHtml(h1)}</h1>
    <p class="tpl-hero-lede">${lede}</p>
    <p class="tpl-hero-actions" style="margin-top:20px;display:flex;flex-wrap:wrap;gap:12px;align-items:center">
      <a href="/app/ssl-domains" class="nav-cta">Issue an SSL certificate →</a>
      <a href="/#pricing" class="prod-try-secondary" style="margin-left:0">See pricing</a>
    </p>
  </div>
</section>
<div class="prod-body">
  <p class="crumb"><a href="/">Home</a> / ${escapeHtml(crumbLabel)}</p>
  ${sharedSections(kind)}
  <div class="prod-try">
    <h2>Open the SSL product</h2>
    <p>Add your domain, publish one DNS TXT record, and download PEMs — we remind you before expiry.</p>
    <a href="/app/ssl-domains" class="nav-cta">Manage SSL domains →</a>
    <a class="prod-try-secondary" href="/tools/ssl-certificate-calculator">SSL expiry calculator</a>
  </div>
  <h2>FAQ</h2>
  ${faqHtml(faqs)}
</div>`;
}

mkdirSync(publicDir, { recursive: true });

writeFileSync(
  join(publicDir, "ssl.html"),
  chrome({
    title: "SSL / TLS Automation — Let's Encrypt for Your Domain | docstoc",
    description:
      "Automated Let's Encrypt SSL for your domain: one DNS TXT record, renewal reminders, PEM download. Compare and switch from ZeroSSL, Cloudflare, DigiCert, and more.",
    canonical: "/ssl",
    activeNav: "",
    mainHtml: pageMain({
      crumbLabel: "SSL",
      h1: "SSL / TLS automation",
      lede: "Add a domain, publish one DNS TXT record, get a real Let's Encrypt certificate — renewal reminders by email, no certbot to maintain.",
      kind: "ssl",
      faqs: sslFaqs,
    }),
    jsonLd: buildJsonLd("/ssl", "SSL", sslFaqs),
    extraHead: EXTRA_HEAD,
    depth: 0,
  }),
  "utf8"
);

writeFileSync(
  join(publicDir, "tls.html"),
  chrome({
    title: "TLS Certificates Automated — Let's Encrypt Without Certbot | docstoc",
    description:
      "Automate TLS certificates for your domain with Let's Encrypt DV — one DNS record, renewal reminders. Compare docstoc to commercial CAs, free SSL tools, and hosts.",
    canonical: "/tls",
    activeNav: "",
    mainHtml: pageMain({
      crumbLabel: "TLS",
      h1: "TLS certificates without ACME ops",
      lede: "Modern HTTPS is TLS. Same automated Let's Encrypt flow as our SSL product — described here for TLS search intent.",
      kind: "tls",
      faqs: tlsFaqs,
    }),
    jsonLd: buildJsonLd("/tls", "TLS", tlsFaqs),
    extraHead: EXTRA_HEAD,
    depth: 0,
  }),
  "utf8"
);

console.log("Generated ssl.html and tls.html (templates style)");
