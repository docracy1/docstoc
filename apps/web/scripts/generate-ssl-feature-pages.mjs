#!/usr/bin/env node
/**
 * ZeroSSL-style SSL feature explanation pages under /ssl/features/* and /ssl/developer.
 * Honest about what docstoc ships (Let's Encrypt DNS-01, monitoring, trust badges) —
 * does not claim malware Protect parity or HID enterprise PKI.
 * Run: node apps/web/scripts/generate-ssl-feature-pages.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chrome, escapeHtml } from "./lib/chrome.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");

const FEATURE_NAV = [
  { href: "/ssl/features/certificates", label: "SSL certificates" },
  { href: "/ssl/features/validation", label: "DNS validation" },
  { href: "/ssl/features/installation", label: "Installation" },
  { href: "/ssl/features/wildcards", label: "Wildcards" },
  { href: "/ssl/features/monitoring", label: "SSL monitoring" },
  { href: "/ssl/features/protection", label: "Trust & protection" },
  { href: "/ssl/features/acme", label: "ACME automation" },
  { href: "/ssl/features/enterprise", label: "Business SSL" },
  { href: "/ssl/developer", label: "Developer API" },
];

const EXTRA_HEAD = `<style>
.ssl-feat-nav { display:flex; flex-wrap:wrap; gap:8px 14px; margin:18px 0 28px; padding:14px 16px; background:#f7f5f2; border-radius:12px; font-size:13.5px; }
.ssl-feat-nav a { font-weight:600; text-decoration:none; color:#1f2937; }
.ssl-feat-nav a:hover { color: var(--accent, #c45c26); }
.ssl-feat-nav a[aria-current="page"] { color: var(--accent, #c45c26); text-decoration:underline; }
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
.ssl-feat-block { margin: 0 0 8px; }
.ssl-feat-limits { background:#f7f5f2; border-radius:12px; padding:18px 20px; margin:18px 0 28px; }
.ssl-feat-limits ul { margin:8px 0 0; padding-left:18px; }
.ssl-feat-code { display:block; background:#0f172a; color:#e2e8f0; padding:14px 16px; border-radius:10px; font-size:13px; overflow-x:auto; white-space:pre; margin:12px 0; }
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
</style>`;

function featureNav(activeHref) {
  return `<nav class="ssl-feat-nav" aria-label="SSL features">\n  ${FEATURE_NAV.map((item) => {
    const cur = item.href === activeHref ? ' aria-current="page"' : "";
    return `<a href="${item.href}"${cur}>${escapeHtml(item.label)}</a>`;
  }).join("\n  ")}\n</nav>`;
}

function blocks(items) {
  return items
    .map(
      (b) => `  <div class="ssl-feat-block">
    <h2>${escapeHtml(b.title)}</h2>
    <p>${b.body}</p>
    ${b.bullets ? `<ul>${b.bullets.map((x) => `<li>${x}</li>`).join("")}</ul>` : ""}
  </div>`
    )
    .join("\n");
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
        { "@type": "ListItem", position: 2, name: "SSL", item: "https://docstoc.io/ssl" },
        { "@type": "ListItem", position: 3, name, item: `https://docstoc.io${path}` },
      ],
    },
    {
      "@type": "WebPage",
      name: `docstoc ${name}`,
      url: `https://docstoc.io${path}`,
      isPartOf: { "@type": "WebSite", name: "docstoc", url: "https://docstoc.io/" },
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

function pageShell({ crumb, h1, lede, path, ctaPrimary, ctaSecondary, body, faqs }) {
  return `<section class="tpl-hero">
  <div class="wrap tpl-hero-inner">
    <h1>${escapeHtml(h1)}</h1>
    <p class="tpl-hero-lede">${lede}</p>
  </div>
</section>
<div class="prod-body">
  <p class="crumb"><a href="/">Home</a> / <a href="/ssl">SSL</a> / ${escapeHtml(crumb)}</p>
  ${featureNav(path)}
  ${body}
  <div class="prod-try">
    <h2>Try it</h2>
    <p>Tools for a quick check — or open the product when you’re ready to issue.</p>
    <a href="${ctaPrimary.href}" class="nav-cta">${escapeHtml(ctaPrimary.label)}</a>
    ${ctaSecondary ? ` · <a href="${ctaSecondary.href}">${escapeHtml(ctaSecondary.label)}</a>` : ""}
  </div>
  ${faqs?.length ? `<h2>FAQ</h2>\n${faqHtml(faqs)}` : ""}
</div>`;
}

const PAGES = [
  {
    file: "ssl/features/index.html",
    depth: 2,
    canonical: "/ssl/features/",
    title: "SSL Features — Certificates, Validation, Monitoring & API | docstoc",
    description:
      "docstoc SSL features: Let's Encrypt automation (not a reseller), DNS-01 validation, wildcards on Business, PEM installs, monitoring, and REST API.",
    name: "SSL features",
    faqs: [
      {
        q: "Is this the same as ZeroSSL features?",
        a: "Same job class (issue and manage HTTPS certs) with different packaging. docstoc is an automation layer on Let's Encrypt inside your business account — not a certificate reseller. We do not sell OV/EV or malware Protect add-ons.",
      },
    ],
    body: () => `${blocks([
      {
        title: "What you get",
        body: "Each feature page explains how the product works and what it does <em>not</em> claim — so you can compare honestly to ZeroSSL-style dashboards and commercial CAs.",
        bullets: FEATURE_NAV.map((f) => `<a href="${f.href}"><strong>${escapeHtml(f.label)}</strong></a>`),
      },
    ])}
    <div class="ssl-feat-limits">
      <strong>Honest limits</strong>
      <ul>
        <li><strong>Automation layer</strong> — CA is Let's Encrypt; you pay for managed issuance/renewal, not a retail cert SKU.</li>
        <li><strong>DV only</strong> — domain validation. Not OV/EV.</li>
        <li><strong>Not malware scanning</strong> — trust badges and domain verification, not ZeroSSL Protect-style surface/core scans.</li>
        <li><strong>Not enterprise PKI</strong> — Business wildcards + volume + team workspace, not HID/CLM enterprise.</li>
      </ul>
    </div>`,
    shell: {
      crumb: "Features",
      h1: "SSL features that replace a separate certificate dashboard",
      lede: "Issue, validate, install, monitor, and automate domain SSL inside the same workspace as invoices and documents — powered by Let's Encrypt ACME. We are an automation layer, not a certificate reseller.",
      ctaPrimary: { href: "/app/login?start=1", label: "Secure a domain →" },
      ctaSecondary: { href: "/ssl", label: "Product overview" },
    },
  },
  {
    file: "ssl/features/certificates.html",
    depth: 2,
    canonical: "/ssl/features/certificates",
    title: "SSL Certificates — Automated Let's Encrypt DV | docstoc",
    description:
      "Get trusted SSL certificates with docstoc: real Let's Encrypt DV via managed automation. Free 5 × 90-day, Pro multi-SAN, Business wildcards — no reseller markup.",
    name: "SSL certificates",
    faqs: [
      {
        q: "Are these free SSL certificates?",
        a: "Let's Encrypt does not charge for the DV cert. Free on docstoc includes 5 × 90-day certificates. Pro and Business unlock multi-SAN, wildcards, and higher slot counts for the automation layer.",
      },
      {
        q: "Do you resell certificates?",
        a: "No. The issuing CA is Let's Encrypt. docstoc manages ACME orders and DNS-01 challenges in your workspace and guides each renewal.",
      },
      {
        q: "How long do certificates last?",
        a: "Let's Encrypt lifetimes are short (~90 days historically, industry direction is shorter). docstoc emails you before expiry and gives you the fresh DNS value to publish, so you do not babysit the calendar.",
      },
    ],
    body: () =>
      blocks([
        {
          title: "Real Let's Encrypt DV",
          body: "Every certificate is signed by Let's Encrypt — the same CA millions of sites already trust. You get industry-standard HTTPS encryption and the browser padlock. We automate that path; we do not resell a commercial CA SKU.",
          bullets: [
            "Domain-validated (DV) certificates",
            "Trusted by modern browsers",
            "No separate per-certificate CA checkout",
            "Email reminder before expiry, guided renewal in the app",
          ],
        },
        {
          title: "Plans that match how you work",
          body: "Free is the ZeroSSL-style wedge: five 90-day certs. Pro adds multi-SAN. Business unlocks wildcards and volume — competing with dedicated SSL Premium pricing while LE remains the CA.",
          bullets: [
            "Free — 5 × 90-day Let's Encrypt certificates",
            "Pro — higher limit + multi-SAN on one cert",
            "Business — wildcards (*.example.com) + up to 25 cert slots",
          ],
        },
        {
          title: "What we do not sell",
          body: "If procurement requires OV, EV, multi-year commercial warranties, or a retail wildcard SKU from a commercial CA, use that vendor. We say so on every comparison page.",
          bullets: [
            "Not OV / EV validation",
            "Not a certificate reseller storefront",
            "Not a replacement for host/CDN edge SSL when that architecture fits better",
          ],
        },
      ]),
    shell: {
      crumb: "Certificates",
      h1: "Trusted SSL certificates without a reseller storefront",
      lede: "docstoc issues real Let's Encrypt domain-validated certificates for hostnames you control. Browser-trusted HTTPS, guided renewals — you pay for the automation layer, not a marked-up cert SKU.",
      ctaPrimary: { href: "/app/login?start=1", label: "Issue a certificate →" },
      ctaSecondary: { href: "/blog/types-of-ssl-certificates/", label: "Certificate types guide" },
    },
  },
  {
    file: "ssl/features/validation.html",
    depth: 2,
    canonical: "/ssl/features/validation",
    title: "SSL Domain Validation — One DNS TXT Record | docstoc",
    description:
      "Validate SSL ownership with one ACME DNS-01 TXT record. No email validation queue, no HTTP file upload, no nameserver move — copy, publish, verify in docstoc.",
    name: "DNS validation",
    faqs: [
      {
        q: "How long does validation take?",
        a: "Usually a few minutes after the TXT record is visible worldwide. Click Check status in the app; if DNS is still propagating you will see pending and can retry.",
      },
    ],
    body: () =>
      blocks([
        {
          title: "Automatic key material",
          body: "You do not paste a CSR by hand. docstoc generates the ACME account and order material, then shows the exact TXT name and value to publish.",
          bullets: [
            "No manual CSR forms",
            "Clear TXT name: _acme-challenge.yourdomain",
            "Check status when DNS has propagated",
          ],
        },
        {
          title: "Why DNS-01",
          body: "DNS validation works even when the site is not yet live on HTTP, sits behind a CDN, or lives on a host you do not want to drop challenge files onto.",
          bullets: [
            "Works without serving /.well-known on origin",
            "No admin@ email alias requirement",
            "Fits agencies validating client domains they do not host",
          ],
        },
        {
          title: "What we do not offer (on purpose)",
          body: "ZeroSSL-style email or HTTP file validation are not in the product. One method keeps the flow short, also at renewal.",
          bullets: [
            "No one-step email validation",
            "No HTTP/HTTPS file upload challenges",
            "No CNAME-as-a-second-path UI",
          ],
        },
      ]),
    shell: {
      crumb: "Validation",
      h1: "Validate domain control in one DNS step",
      lede: "docstoc uses ACME DNS-01: we generate a TXT challenge, you publish it at your DNS provider, then click verify. No email alias hunting, no webroot file drops, no moving nameservers.",
      ctaPrimary: { href: "/app/ssl-domains", label: "Open SSL domains →" },
      ctaSecondary: { href: "/blog/acme-protocol-certificate-automation/", label: "How ACME works" },
    },
  },
  {
    file: "ssl/features/installation.html",
    depth: 2,
    canonical: "/ssl/features/installation",
    title: "SSL Certificate Installation — Download PEM for Your Server | docstoc",
    description:
      "Download your issued certificate and private key as PEM files, then install on nginx, Apache, Caddy, or your host panel. Install guidance included in the docstoc SSL console.",
    name: "Installation",
    faqs: [
      {
        q: "Do you push certificates into Cloudflare or my host automatically?",
        a: "Not today. You download PEMs and install them where TLS terminates. Edge platforms that issue their own certs (e.g. Cloudflare Universal SSL) remain a separate architecture choice.",
      },
    ],
    body: () => `${blocks([
      {
        title: "Download what servers expect",
        body: "Issued domains expose a download action that returns certificatePem and privateKeyPem. Save them as fullchain/cert and key files on the machine that terminates TLS.",
        bullets: [
          "Certificate PEM (leaf + chain as issued)",
          "Private key PEM (keep secret; never commit to git)",
          "In-app notes for nginx, Apache, and Caddy",
        ],
      },
      {
        title: "Typical install flow",
        body: "Issue → validate DNS → download PEMs → configure your web server or load balancer → reload → confirm HTTPS in a browser.",
        bullets: [
          "nginx: ssl_certificate + ssl_certificate_key",
          "Apache: SSLCertificateFile + SSLCertificateKeyFile",
          "Caddy / panels: paste or point at the PEM paths",
        ],
      },
      {
        title: "Keep hosting separate",
        body: "docstoc is not your CDN or shared host. Installation stays on your infrastructure — we automate the certificate lifecycle, not the HTML.",
      },
    ])}
    <div class="ssl-feat-limits">
      <strong>Security note</strong>
      <ul>
        <li>Treat private keys like passwords. Download over HTTPS while signed in; store only on the server that needs them.</li>
        <li>After renewals, replace the files and reload the web server (or automate that step yourself).</li>
      </ul>
    </div>`,
    shell: {
      crumb: "Installation",
      h1: "Install SSL certificates with clear PEM downloads",
      lede: "After issuance, download the certificate PEM and private key PEM from your SSL domains page. Point nginx, Apache, Caddy, or your panel at those files — keep hosting where it is.",
      ctaPrimary: { href: "/app/ssl-domains", label: "Download from SSL console →" },
      ctaSecondary: { href: "/ssl/features/monitoring", label: "Then set up monitoring" },
    },
  },
  {
    file: "ssl/features/wildcards.html",
    depth: 2,
    canonical: "/ssl/features/wildcards",
    title: "Wildcard SSL Certificates — *.example.com via Let's Encrypt | docstoc",
    description:
      "Business plan wildcard SSL (*.example.com) with Let's Encrypt DNS-01 — automation layer, not a reseller. Compete with ZeroSSL Premium pricing while LE remains the CA.",
    name: "Wildcards",
    faqs: [
      {
        q: "Which plan includes wildcards?",
        a: "Business. Free and Pro issue single-name (and Pro multi-SAN) certificates; Business unlocks *.example.com wildcards plus higher volume.",
      },
      {
        q: "Is this a sold wildcard SKU from a commercial CA?",
        a: "No. docstoc is an automation layer. The certificate is a Let's Encrypt DV wildcard. You pay for managed ACME and workspace features — not a marked-up retail wildcard product.",
      },
      {
        q: "Why DNS-01 for wildcards?",
        a: "Let's Encrypt requires DNS-01 for wildcards. docstoc shows the TXT challenge(s) to publish; HTTP file validation cannot issue *.example.com.",
      },
    ],
    body: () => `${blocks([
      {
        title: "Cover every first-level subdomain with one cert",
        body: "A wildcard like <code>*.example.com</code> secures app.example.com, staging.example.com, and other first-level names under that parent — without issuing a separate cert for each. The apex (<code>example.com</code>) is a separate name unless you add it as a SAN.",
        bullets: [
          "Business plan only",
          "Let's Encrypt DV wildcard via DNS-01",
          "Download PEMs and install where TLS terminates",
          "Same renewals flow as single-name certs",
        ],
      },
      {
        title: "Vs ZeroSSL Premium–style pricing",
        body: "Dedicated SSL dashboards often gate wildcards behind a Premium tier (~$55–$70/mo range historically). docstoc Business bundles wildcards with the rest of the workspace at Business pricing — still LE as the CA, still automation not resale.",
        bullets: [
          "No separate “buy a wildcard” checkout",
          "Competes on automation + plan value, not CA brand shopping",
          "Stay on a commercial CA if you need OV/EV wildcards or warranties",
        ],
      },
      {
        title: "Risks to understand",
        body: "One private key covers many hostnames. Treat key storage carefully; prefer per-host certs when blast radius matters more than convenience.",
        bullets: [
          "Key compromise affects every name under the wildcard",
          "Does not cover nested names like a.b.example.com",
          "Not more “secure” than a single-name cert — only more convenient",
        ],
      },
    ])}
    <div class="ssl-feat-limits">
      <strong>Plan ladder</strong>
      <ul>
        <li><strong>Free</strong> — 5 × 90-day single-name LE certs</li>
        <li><strong>Pro</strong> — multi-SAN + higher slot count</li>
        <li><strong>Business</strong> — wildcards + volume (up to 25 cert slots)</li>
      </ul>
    </div>`,
    shell: {
      crumb: "Wildcards",
      h1: "Wildcard SSL without buying a retail CA SKU",
      lede: "Business unlocks *.example.com Let's Encrypt wildcards via DNS-01. docstoc manages the ACME order — we are an automation layer, not a certificate reseller.",
      ctaPrimary: { href: "/app/account", label: "Upgrade to Business →" },
      ctaSecondary: { href: "/import-from-zerossl", label: "Coming from ZeroSSL?" },
    },
  },
  {
    file: "ssl/features/monitoring.html",
    depth: 2,
    canonical: "/ssl/features/monitoring",
    title: "SSL Certificate Monitoring & Renewal Alerts | docstoc",
    description:
      "SSL monitoring that emails before expiry and gives a one-click renewal path with a fresh DNS challenge — no cron spreadsheet, no missed renewals.",
    name: "SSL monitoring",
    faqs: [
      {
        q: "Do you monitor arbitrary third-party certificates?",
        a: "Primary path is domains issued through docstoc. For expiry math on any cert, use the SSL certificate calculator tool.",
      },
    ],
    body: () =>
      blocks([
        {
          title: "Expiry awareness without a spreadsheet",
          body: "Certificates you manage in docstoc surface status (active, expiring, pending, failed). When renewal is due, renew in-app instead of hunting an old certbot host.",
          bullets: [
            "Status in the SSL domains console",
            "Email before expiry for domains you manage",
            "Renewal starts a fresh ACME order + DNS TXT",
          ],
        },
        {
          title: "Tied to issuance, not a third-party uptime tool",
          body: "Monitoring here means certificate lifecycle for domains you issued through docstoc — complementary to general site uptime monitors, not a replacement for them.",
        },
        {
          title: "Related guides",
          body: "Deep-dive pages:",
          bullets: [
            `<a href="/monitoringssl">SSL monitoring product page</a>`,
            `<a href="/monitoringtls">TLS monitoring product page</a>`,
            `<a href="/blog/ssl-tls-certificate-lifetime-shortening/">Why lifetimes keep shrinking</a>`,
          ],
        },
      ]),
    shell: {
      crumb: "Monitoring",
      h1: "SSL monitoring that leads to renewal, not just an alert",
      lede: "Short certificate lifetimes make monitoring mandatory. docstoc watches your managed domains, emails before expiry, and gives you the renewal DNS value to paste — then verify.",
      ctaPrimary: { href: "/monitoringssl", label: "SSL monitoring landing →" },
      ctaSecondary: { href: "/monitoringtls", label: "TLS monitoring" },
    },
  },
  {
    file: "ssl/features/protection.html",
    depth: 2,
    canonical: "/ssl/features/protection",
    title: "Domain Trust & Protection — Badges and Verification | docstoc",
    description:
      "Protect customer trust with verified domain status and embeddable trust badges — Bitcoin-timestamped domain proof after SSL issuance. Not a malware scanner.",
    name: "Trust & protection",
    faqs: [
      {
        q: "Is this the same as ZeroSSL Protect?",
        a: "No. Protect is a malware/vuln add-on. docstoc offers domain trust profiles and badges after SSL verification.",
      },
    ],
    body: () => `${blocks([
      {
        title: "What protection means here",
        body: "HTTPS encrypts traffic. Trust badges communicate that you proved domain control. Together they reduce “is this legit?” friction for freelancers and small businesses.",
        bullets: [
          "Public trust profile after domain SSL issuance",
          "Embeddable badge script for sites and proposals",
          "Timestamped verification independent of a marketing claim alone",
        ],
      },
      {
        title: "Honest comparison to ZeroSSL Protect",
        body: "ZeroSSL Protect markets malware, XSS, and SQL injection scanning. docstoc does not claim that product. If you need vulnerability scanning, use a dedicated security scanner — we will not pretend otherwise.",
        bullets: [
          "No surface malware / XSS / SQLi scan suite",
          "No server-side “core scan” agent",
          "Focus: domain verification + trust signaling + SSL lifecycle",
        ],
      },
    ])}
    <div class="ssl-feat-limits">
      <strong>Choose the right tool</strong>
      <ul>
        <li>Need padlock + renewals → <a href="/ssl/features/certificates">SSL certificates</a></li>
        <li>Need client-facing verification → <a href="/trust-badges">trust badges</a></li>
        <li>Need malware/vuln scanning → use a security scanner product (not docstoc)</li>
      </ul>
    </div>`,
    shell: {
      crumb: "Trust & protection",
      h1: "Protect trust with verified domains — not fake antivirus",
      lede: "After your first custom domain SSL is issued, docstoc can create a public trust profile with a Bitcoin-anchored “verified since” claim and an embeddable badge for your site or proposals.",
      ctaPrimary: { href: "/trust-badges", label: "Trust badges →" },
      ctaSecondary: { href: "/ssl/features/certificates", label: "Start with SSL" },
    },
  },
  {
    file: "ssl/features/acme.html",
    depth: 2,
    canonical: "/ssl/features/acme",
    title: "ACME Automation — Let's Encrypt Without Certbot Ops | docstoc",
    description:
      "ACME certificate automation for small businesses: DNS-01 challenges, issuance, and renewal inside docstoc — same Let's Encrypt protocol, no server-side certbot.",
    name: "ACME automation",
    faqs: [
      {
        q: "Can I point certbot at docstoc as a CA?",
        a: "No — docstoc is not a public ACME CA endpoint. We are a managed client of Let's Encrypt for domains in your account.",
      },
    ],
    body: () =>
      blocks([
        {
          title: "Same protocol, different ops model",
          body: "ACME is the open protocol Let's Encrypt and other CAs use. DIY means certbot or another client on a server. docstoc means one DNS TXT and guided renewals beside your invoices.",
          bullets: [
            "Let's Encrypt as the issuing CA",
            "DNS-01 challenge path",
            "Renewal orders without SSH",
          ],
        },
        {
          title: "When to stay DIY",
          body: "Large fleets with existing ACME clients, or hosts that already auto-issue on their panel, may not need another control plane. Use docstoc when you want SSL next to business workflows.",
        },
      ]),
    shell: {
      crumb: "ACME",
      h1: "ACME automation without running certbot yourself",
      lede: "docstoc speaks ACME to Let's Encrypt on your behalf. You manage domains in the product UI (or API); we handle orders and challenges, and you publish the DNS value at each renewal.",
      ctaPrimary: { href: "/app/login?start=1", label: "Automate a domain →" },
      ctaSecondary: { href: "/blog/acme-protocol-certificate-automation/", label: "ACME deep dive" },
    },
  },
  {
    file: "ssl/features/enterprise.html",
    depth: 2,
    canonical: "/ssl/features/enterprise",
    title: "Business SSL — Multi-Domain Certificates for Teams | docstoc",
    description:
      "Business plan SSL for agencies and small teams: more custom domains, trust badges, and workspace tooling — not HID enterprise PKI or OV/EV subscriptions.",
    name: "Business SSL",
    faqs: [
      {
        q: "Is Business the same as ZeroSSL Enterprise?",
        a: "No. ZeroSSL Enterprise is HID-powered PKI. docstoc Business is multi-domain DV automation and workspace features for SMBs and agencies.",
      },
    ],
    body: () => `${blocks([
      {
        title: "What Business unlocks for SSL",
        body: "Move past Free/Pro when you need wildcards, more slots, or agency-scale hostnames — still Let's Encrypt DV automation, not a commercial CA storefront.",
        bullets: [
          "Wildcard certificates (*.example.com)",
          "Up to 25 certificate slots + multi-SAN",
          "Trust profile and badge after verified SSL",
          "Same Business workspace for invoices, templates, and chase",
        ],
      },
      {
        title: "Predictable pricing",
        body: "No per-certificate retail markup. You pay for the automation layer and workspace — monthly or annual depending on how you bill the account.",
        bullets: [
          "Free — 5 × 90-day LE certs",
          "Pro — multi-SAN + higher limit",
          "Business — wildcards + volume + team features",
        ],
      },
      {
        title: "What this is not",
        body: "If you need OV/EV, government-grade CLM, role-based certificate policy engines, or HID Account Certificate Manager, buy that stack from an enterprise PKI vendor. We will not rebrand Business as that.",
        bullets: [
          "Not OV / EV commercial CA wildcards",
          "Not HID partnership CLM",
          "Not SLA-backed dedicated PKI support desks",
        ],
      },
    ])}
    <div class="ssl-feat-limits">
      <strong>Need true enterprise PKI?</strong>
      <p style="margin:8px 0 0;font-size:14.5px;color:#4b5563">Use a commercial CA or CLM platform. Prefer docstoc when the goal is automated DV HTTPS (including wildcards on Business) inside a small-business ops suite.</p>
    </div>`,
    shell: {
      crumb: "Business SSL",
      h1: "Business SSL for wildcards and volume — not enterprise PKI theater",
      lede: "ZeroSSL “Enterprise” pairs with HID for OV/EV/CLM at scale. docstoc Business is for freelancers, agencies, and SMBs who need wildcards, more domains, trust badges, and one workspace — automation on Let's Encrypt, not a cert reseller.",
      ctaPrimary: { href: "/app/account", label: "See plans in account →" },
      ctaSecondary: { href: "/ssl/features/wildcards", label: "Wildcard guide" },
    },
  },
  {
    file: "ssl/developer.html",
    depth: 1,
    canonical: "/ssl/developer",
    title: "SSL Developer API — Manage Domains over REST | docstoc",
    description:
      "Automate SSL domains with the docstoc REST API: list, create, verify, renew, download, and delete custom hostnames using your workspace API key.",
    name: "Developer API",
    faqs: [
      {
        q: "Is the API free?",
        a: "Developer / ACME-style API access is on Pro and Business. Free still uses managed ACME in the product UI for its 5 certificates.",
      },
      {
        q: "Where are full docs?",
        a: "Start at /docs for auth and general API keys; SSL routes are listed on this page and implemented under /api/ssl.",
      },
    ],
    body: () => `${blocks([
      {
        title: "Auth",
        body: "Paid plan required for API keys. Create a key under Webhooks &amp; API, then send it as a Bearer token.",
      },
    ])}
    <pre class="ssl-feat-code">Authorization: Bearer YOUR_API_KEY
Base URL: https://docstoc.io/api</pre>
    ${blocks([
      {
        title: "SSL endpoints",
        body: "All routes are under <code>/api/ssl</code>. Slot limits and multi-SAN/wildcard gates follow your plan.",
        bullets: [
          "<code>GET /ssl/domains</code> — list certificates, plan limit, and feature flags",
          "<code>POST /ssl/domains</code> — start issuance (<code>{\"hostname\":\"example.com\"}</code> or <code>hostnames</code> array)",
          "<code>POST /ssl/domains/:id/verify</code> — after publishing TXT record(s)",
          "<code>POST /ssl/domains/:id/renew</code> — start renewal order",
          "<code>GET /ssl/domains/:id/download</code> — certificatePem + privateKeyPem",
          "<code>DELETE /ssl/domains/:id</code> — remove domain",
        ],
      },
      {
        title: "What this is not",
        body: "This is not a public ACME directory you point certbot at, and not a ZeroSSL-compatible drop-in REST clone. It is docstoc’s workspace API for domains you manage here — automation on Let's Encrypt, not a CA reseller API.",
        bullets: [
          "No public ACME CA endpoint",
          "No unlimited free-tier API CA console",
          "Download returns PEM material for your install path",
        ],
      },
    ])}`,
    shell: {
      crumb: "Developer",
      h1: "SSL REST API for domain automation",
      lede: "Use the same API key as webhooks and Zapier to manage custom-domain SSL: create orders, verify DNS-01, renew, download PEMs, and delete domains.",
      ctaPrimary: { href: "/docs/#webhooks-api", label: "API docs →" },
      ctaSecondary: { href: "/app/webhooks", label: "Create an API key" },
    },
  },
];

for (const p of PAGES) {
  const outPath = join(publicDir, p.file);
  mkdirSync(dirname(outPath), { recursive: true });
  const mainHtml = pageShell({
    ...p.shell,
    path: p.canonical,
    body: p.body(),
    faqs: p.faqs,
  });
  writeFileSync(
    outPath,
    chrome({
      title: p.title,
      description: p.description,
      canonical: p.canonical,
      activeNav: "",
      mainHtml,
      jsonLd: buildJsonLd(p.canonical, p.name, p.faqs),
      extraHead: EXTRA_HEAD,
      depth: p.depth,
    }),
    "utf8"
  );
}

console.log(`Generated ${PAGES.length} SSL feature pages under /ssl/features and /ssl/developer`);
