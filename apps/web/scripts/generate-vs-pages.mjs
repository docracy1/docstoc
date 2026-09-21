#!/usr/bin/env node
/**
 * Generates "docstoc vs {Competitor}" pages — but ONLY for the four competitors below
 * (Upflow, InvoiceSherpa, Gaviti, Quadient AR/YayPay) that aren't in data/compare-competitors.mjs.
 * Every other competitor's docstoc-vs-{slug}.html is written here first, then unconditionally
 * overwritten later in the build by generate-compare-pages.mjs (which restyles it to match that
 * competitor's {slug}-alternative page and points its canonical there) — so an entry for a
 * competitor that already exists in compare-competitors.mjs would just be dead content that never
 * ships. Adding a competitor here without adding a matching entry to that hub is fine (that's
 * exactly the case for these four) — the problem would be duplicating one that's already there.
 * Run: node apps/web/scripts/generate-vs-pages.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chrome, escapeHtml } from "./lib/chrome.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");

/** @type {Array<{
 *  slug: string; name: string; pricingUrl: string; bestFit: string; entryPrice: string;
 *  pricingModel: string; autoSend: string; ownInbox: string; aiDrafts: string; toneAdjust: string;
 *  tracking: string; qboXero: string; sms: string; paymentPortal: string; freeTier: string;
 *  summary: string; faq: Array<{q: string; a: string}>;
 * }>} */
const COMPETITORS = [
  {
    slug: "upflow",
    name: "Upflow",
    pricingUrl: "https://upflow.io/pricing",
    bestFit: "Mid-market / enterprise AR",
    entryPrice: "Custom (sales-led)",
    pricingModel: "ARR-tiered · contact sales",
    autoSend: "✓ auto-sends",
    ownInbox: "Not publicly disclosed",
    aiDrafts: "Templates (no AI drafting disclosed)",
    toneAdjust: "Manual tone control",
    tracking: "Aging/DSO analytics (no open/click tracking disclosed)",
    qboXero: "✓ (+ NetSuite, Sage Intacct)",
    sms: "Not disclosed",
    paymentPortal: "✓ branded portal",
    freeTier: `Free "Discover" tier (analytics only)`,
    summary:
      "Upflow targets mid-market and enterprise AR teams with automated multi-step reminder workflows and a branded payment portal, but every paid tier is sales-led — there's no public per-month price for Grow, Scale, or Strategic. docstoc is $14.99/mo flat, listed publicly, and never auto-sends: every AI draft waits for you to review and send it yourself.",
    faq: [
      {
        q: "Is docstoc an Upflow alternative?",
        a: "For freelancers and small teams, yes — docstoc is $14.99/mo flat with a public price, while Upflow is built for mid-market/enterprise AR and requires a sales call for pricing on every paid tier.",
      },
      {
        q: "Does Upflow publish its pricing?",
        a: "No. Upflow's Grow, Scale, and Strategic tiers are all \"contact sales,\" tiered by your company's ARR. docstoc Pro is a published $14.99/mo flat rate.",
      },
      {
        q: "Does docstoc auto-send reminders like Upflow?",
        a: "No. Upflow schedules multi-step reminder workflows automatically. docstoc always drafts the email and waits for you to send it — nothing goes out without your review.",
      },
    ],
  },
  {
    slug: "invoicesherpa",
    name: "InvoiceSherpa",
    pricingUrl: "https://www.invoicesherpa.com/pricing",
    bestFit: "SMBs on QuickBooks/Xero/Clio",
    entryPrice: "$49/mo (Sole Proprietor)",
    pricingModel: "Flat · tiered by open invoices",
    autoSend: "✓ auto-sends",
    ownInbox: "✓ domain-validated",
    aiDrafts: "Templates",
    toneAdjust: "—",
    tracking: "—",
    qboXero: "✓ (+ Clio)",
    sms: "✓ all plans",
    paymentPortal: "✓ + autopay",
    freeTier: "14-day trial",
    summary:
      "InvoiceSherpa auto-sends trigger-based reminders — due-soon, past-due, paid confirmation — from your own domain once validated, starting at $49/mo for up to 100 open invoices. It's template-based, not AI-drafted, and the wording doesn't change tone as an invoice gets later. docstoc is $14.99/mo flat, AI-drafts fresh wording matched to how overdue each invoice is, and leaves every send to you.",
    faq: [
      {
        q: "Is docstoc an InvoiceSherpa alternative?",
        a: "If you want AI-drafted wording and full control over what's sent, yes. InvoiceSherpa is a stronger fit if you specifically want fully automatic, trigger-based sending and SMS on every plan.",
      },
      {
        q: "Does docstoc cost less than InvoiceSherpa?",
        a: "Yes — docstoc Pro is $14.99/mo flat. InvoiceSherpa starts at $49/mo (or $41/mo billed annually) for up to 100 open invoices, and scales up from there by invoice volume.",
      },
      {
        q: "Does docstoc auto-send like InvoiceSherpa?",
        a: "No. InvoiceSherpa sends automatically once a trigger fires. docstoc writes the draft and waits for you to copy it in and send it yourself.",
      },
    ],
  },
  {
    slug: "gaviti",
    name: "Gaviti",
    pricingUrl: "https://gaviti.com/pricing/",
    bestFit: "Mid-market / enterprise AR",
    entryPrice: "Custom (sales-led)",
    pricingModel: "Usage-based · contact sales",
    autoSend: "✓ auto-sends",
    ownInbox: "Not publicly disclosed",
    aiDrafts: "✓ AI-generated",
    toneAdjust: "Not disclosed",
    tracking: "General dashboard tracking (no open/click specifics disclosed)",
    qboXero: "✓ (+ NetSuite, Sage Intacct)",
    sms: "✓ multi-channel",
    paymentPortal: "✓ zero-fee ACH",
    freeTier: "No trial — demo only",
    summary:
      "Gaviti is an enterprise AR platform with AI-generated collection emails and multi-channel (email, SMS, portal) chasing, priced per invoice volume with no public rate and no free trial — only a sales demo. docstoc is $14.99/mo flat with a published price, a free tier (5 AI drafts/month), and every message stays a draft until you send it.",
    faq: [
      {
        q: "Is docstoc a Gaviti alternative?",
        a: "For freelancers and small teams, yes — docstoc has a free tier and a published $14.99/mo price. Gaviti is built for enterprise AR teams and requires a sales demo, with no public pricing or free trial.",
      },
      {
        q: "Does Gaviti use AI like docstoc?",
        a: "Yes — Gaviti generates collection emails with AI, similar in spirit to docstoc. The difference is price and audience: Gaviti is quote-based for enterprise AR teams, docstoc is $14.99/mo flat for freelancers and small teams.",
      },
      {
        q: "Can I try Gaviti for free?",
        a: "No — Gaviti doesn't offer a free trial, only a sales demo. docstoc has a free tier (18 templates + 5 AI drafts/month) with no credit card required.",
      },
    ],
  },
  {
    slug: "yaypay",
    name: "Quadient AR",
    pricingUrl: "https://www.quadient.com/en/ar-automation",
    bestFit: "Regulated mid-market / enterprise finance teams",
    entryPrice: "~$500+/mo (reported, sales-led)",
    pricingModel: "Custom · contact sales",
    autoSend: "✓ auto-sends",
    ownInbox: "Not publicly disclosed",
    aiDrafts: "Rules + payment-behavior prediction (not drafting)",
    toneAdjust: "—",
    tracking: "Dashboard status (no open/click tracking disclosed)",
    qboXero: "✓ (+ SAP, NetSuite, Dynamics, Sage)",
    sms: "Not disclosed",
    paymentPortal: "✓ self-service portal",
    freeTier: "None disclosed",
    summary:
      "YayPay was acquired by Quadient and rebranded to Quadient Accounts Receivable in 2022. It targets regulated mid-market and enterprise finance teams with rule-based auto-send workflows, and its AI is focused on predicting payment behavior rather than writing the email itself. Pricing isn't public — third-party trackers report quotes starting around $500/mo. docstoc is $14.99/mo flat, published, and its AI drafts the actual wording of each follow-up.",
    faq: [
      {
        q: "Is YayPay still called YayPay?",
        a: `No — YayPay was acquired by Quadient in 2020 and formally rebranded to "Quadient Accounts Receivable" (Quadient AR) in November 2022. It's the same product and support team under a new name.`,
      },
      {
        q: "Is docstoc a Quadient AR / YayPay alternative?",
        a: "For freelancers and small teams, yes. Quadient AR targets regulated mid-market and enterprise finance teams with custom, sales-led pricing reported to start around $500/mo — a different market than docstoc's $14.99/mo flat plan.",
      },
      {
        q: "Does Quadient AR write AI drafts like docstoc?",
        a: "Not in the same sense — Quadient AR's AI is used to predict payment behavior and prioritize collections, not to draft the wording of each reminder. docstoc's AI writes the actual email, matched to how overdue the invoice is.",
      },
    ],
  },
];

function buildJsonLd(c) {
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://docstoc.io/" },
            {
              "@type": "ListItem",
              position: 2,
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
    ["Best fit", "Freelancers & small teams", c.bestFit],
    ["Entry paid price", "$14.99/mo Pro", c.entryPrice],
    ["Pricing model", "Flat workspace", c.pricingModel],
    ["Auto-sends chase emails", "✗ draft only", c.autoSend],
    ["You send from your inbox", "✓", c.ownInbox],
    ["AI-written drafts", "✓", c.aiDrafts],
    ["Soften / firm / shorten", "✓ paid", c.toneAdjust],
    ["Open / click tracking", "✓ Pro+ tracked HTML", c.tracking],
    ["Native QuickBooks / Xero sync", "✓ Pro+ OAuth", c.qboXero],
    ["SMS reminders", "✓ Pro+ drafts only", c.sms],
    ["Client payment portal", "✗ your pay link in drafts", c.paymentPortal],
    ["Free tier", "18 templates + 5 AI drafts", c.freeTier],
  ];

  const tableRows = rows
    .map(
      ([label, docstocVal, otherVal]) =>
        `          <tr>
            <td>${escapeHtml(label)}</td>
            <td class="col-docstoc">${docstocVal}</td>
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

  return `<p class="crumb"><a href="/">Home</a> / ${escapeHtml(title)}</p>
<h1>${escapeHtml(title)} — which invoice chase tool fits?</h1>
  <p class="lede">${c.summary}</p>

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
  <p class="pc-note">Figures reflect publicly available pricing and feature information as of August 2026 — check <a href="${c.pricingUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.name)}'s pricing page</a> directly before you buy, as plans change.</p>

  <p style="margin-top:28px"><a href="/app/" class="nav-cta">Try docstoc free</a></p>

  <h2>FAQ</h2>
  ${faqHtml}`;
}

mkdirSync(publicDir, { recursive: true });

for (const c of COMPETITORS) {
  const slug = `docstoc-vs-${c.slug}`;
  const title = `docstoc vs ${c.name} — Which Invoice Chase Tool Fits? | docstoc`;
  const description = `docstoc vs ${c.name}: price, auto-send vs draft-only, AI drafts, and tracking compared side by side — pick the right invoice chase tool for a freelancer or small team.`;

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

console.log(`Done — ${COMPETITORS.length} vs-competitor pages.`);
