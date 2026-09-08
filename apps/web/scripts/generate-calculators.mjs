#!/usr/bin/env node
/**
 * Generates selling landing pages under /tools/ — dark hero style matching the homepage.
 * Run: node apps/web/scripts/generate-calculators.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chrome } from "./lib/chrome.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../public/tools");
mkdirSync(outDir, { recursive: true });

const uploadIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M12 4l-4 4M12 4l4 4" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>`;
const searchIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`;
const lockIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
const calendarIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/></svg>`;
const cashIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5c.8-1 2-1.5 2.5-1.5s1.7.5 1.7 1.5-1 1.5-2.7 2-2.7 1.2-2.7 2.5 1.2 2.2 2.7 2.2 1.8-.5 2.5-1.5"/></svg>`;
const invoiceIcon = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h8l4 4v14H7V3z"/><path d="M15 3v4h4"/><path d="M10 12h6M10 16h6M10 8h2"/></svg>`;

const extraHead = `<style>
.tool-sell-main { max-width: none; padding: 0; margin: 0; }
body:has(.tool-sell-main) { background: #060504; }
.tool-hero {
  --hero-body: rgba(255, 255, 255, 0.78);
  position: relative;
  background:
    radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent) 30%, transparent) 0%, transparent 55%),
    radial-gradient(ellipse at 15% 85%, color-mix(in srgb, var(--accent) 16%, transparent) 0%, transparent 50%),
    linear-gradient(180deg, #14100d 0%, #0b0908 55%, #060504 100%);
  color: #fff;
  padding: 36px 24px 64px;
  overflow: hidden;
  text-align: center;
}
.tool-hero-inner {
  position: relative;
  z-index: 1;
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.tool-hero-pill {
  width: 42px;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  margin: 0 0 22px;
}
.tool-hero h1 {
  font-family: Inter, system-ui, sans-serif;
  font-weight: 800;
  font-size: clamp(34px, 5vw, 56px);
  line-height: 1.1;
  letter-spacing: -0.025em;
  color: #fff;
  margin: 0 0 14px;
  max-width: 14em;
}
.tool-hero h1 .accent { color: var(--accent); }
.tool-hero-sub {
  font-size: 17px;
  line-height: 1.45;
  color: var(--hero-body);
  margin: 0 0 22px;
  max-width: 34em;
}
.tool-ring {
  width: 260px;
  height: 260px;
  border-radius: 50%;
  background: conic-gradient(from -90deg, var(--accent) 0% 88%, rgba(255, 255, 255, 0.14) 88% 100%);
  padding: 8px;
  box-shadow: 0 30px 70px rgba(245, 128, 37, 0.22);
  margin: 0 auto 14px;
}
.tool-circle {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 22px;
  box-sizing: border-box;
  color: var(--ink);
  position: relative;
}
.tool-circle.is-action {
  cursor: pointer;
  border: 2px dashed transparent;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.tool-circle.is-action:hover,
.tool-circle.is-action:focus-visible,
.tool-circle.is-action.is-drag {
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
  background: color-mix(in srgb, var(--accent) 8%, #fff);
}
.tool-circle-file {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  opacity: 0;
  cursor: pointer;
  border-radius: 50%;
  z-index: 2;
  font-size: 0;
}
.tool-circle[data-hash-drop] .tool-circle-icon,
.tool-circle[data-hash-drop] .tool-circle-title,
.tool-circle[data-hash-drop] .tool-circle-sub {
  position: relative;
  z-index: 1;
  pointer-events: none;
}
.tool-circle-icon {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  display: grid;
  place-items: center;
  margin-bottom: 10px;
  flex-shrink: 0;
}
.tool-circle-title {
  font-size: 15px;
  font-weight: 800;
  margin: 0 0 4px;
  line-height: 1.3;
  color: var(--ink);
}
.tool-circle-sub {
  font-size: 12.5px;
  color: var(--ink-soft);
  margin: 0;
  line-height: 1.35;
}
.tool-circle-form {
  cursor: default;
  padding: 18px 16px;
}
.tool-circle-form .tool-circle-title,
.tool-circle-form .tool-circle-sub {
  pointer-events: none;
}
.tool-circle-input {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 11.5rem;
  margin: 10px 0 0;
  padding: 8px 10px;
  border: 1px solid var(--line, #e5e2dc);
  border-radius: 999px;
  font: inherit;
  font-size: 12px;
  text-align: center;
  background: #fff;
  color: var(--ink);
  box-sizing: border-box;
}
.tool-circle-input:focus {
  outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 1px;
  border-color: var(--accent);
}
.tool-circle-extra {
  position: relative;
  z-index: 2;
  margin: 8px 0 0;
  font-size: 11.5px;
  font-weight: 700;
}
.tool-circle-extra a {
  color: var(--accent);
  text-decoration: none;
}
.tool-circle-extra a:hover { text-decoration: underline; }
.tool-circle-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 0;
  margin: 10px 0 0;
  max-width: 11.5rem;
  line-height: 1.45;
  font-size: 12.5px;
  font-weight: 700;
}
.tool-circle-links a {
  color: var(--accent);
  text-decoration: none;
}
.tool-circle-links a:hover,
.tool-circle-links a:focus-visible {
  text-decoration: underline;
}
.tool-circle-links .sep {
  color: var(--ink-soft);
  font-weight: 500;
  margin: 0 0.28em;
  user-select: none;
}
.finder-card.is-hidden { display: none; }
.tool-panel.is-flash,
.tool-results.is-flash,
.tool-section.is-flash {
  animation: tool-flash 0.9s ease;
}
@keyframes tool-flash {
  0%, 100% { box-shadow: none; }
  35% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 45%, transparent); }
}
.tool-section[id] {
  scroll-margin-top: 96px;
}
a.tool-circle {
  text-decoration: none;
  color: inherit;
}
.tool-circle-stat {
  font-size: clamp(22px, 4vw, 30px);
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--ink);
  margin: 0 0 4px;
  line-height: 1.15;
  word-break: break-word;
}
.tool-caption {
  margin: 0 0 22px;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.6);
}
.tool-signup {
  display: flex;
  align-items: stretch;
  width: 100%;
  max-width: 480px;
  border-radius: 999px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
}
.tool-signup-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  padding: 14px 18px;
  font: inherit;
  font-size: 15px;
  color: var(--ink);
  background: transparent;
}
.tool-signup-input::placeholder { color: #8a96a8; }
.tool-signup-btn {
  flex-shrink: 0;
  border: none;
  cursor: pointer;
  padding: 14px 22px;
  font: inherit;
  font-size: 15px;
  font-weight: 800;
  background: var(--signal, #F58025);
  color: var(--on-signal, #fff);
  white-space: nowrap;
}
.tool-signup-btn:hover { background: var(--signal-hover, #FF9A47); }
.tool-cta-hint {
  margin: 12px 0 0;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.55);
}
.tool-section {
  background: #0b0908;
  color: rgba(255, 255, 255, 0.86);
  padding: 48px 24px 64px;
}
.tool-section-inner {
  max-width: 860px;
  margin: 0 auto;
}
.tool-section h2 {
  font-family: Inter, system-ui, sans-serif;
  font-size: clamp(22px, 3vw, 28px);
  font-weight: 800;
  color: #fff;
  margin: 0 0 12px;
  letter-spacing: -0.02em;
}
.tool-section h3 {
  font-family: Inter, system-ui, sans-serif;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin: 28px 0 12px;
}
.tool-section p, .tool-section li {
  font-size: 15.5px;
  line-height: 1.65;
  color: rgba(255, 255, 255, 0.72);
}
.tool-section a { color: var(--accent); font-weight: 600; }
.tool-section ul, .tool-section ol { padding-left: 1.2em; margin: 0 0 12px; }
.tool-panel-grid {
  display: grid;
  gap: 16px;
  margin: 24px 0 8px;
}
@media (min-width: 800px) {
  .tool-panel-grid { grid-template-columns: 1.05fr 0.95fr; align-items: start; }
}
.tool-panel, .tool-results {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  padding: 20px 22px;
  background: rgba(255, 255, 255, 0.04);
  text-align: left;
}
.tool-results { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.tool-field { margin-bottom: 14px; }
.tool-field label {
  display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: rgba(255,255,255,0.88);
}
.tool-field input, .tool-field select {
  width: 100%; box-sizing: border-box; padding: 11px 12px;
  border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 10px;
  font: inherit; background: rgba(0,0,0,0.35); color: #fff;
}
.tool-field input[type="range"] { padding: 0; background: transparent; border: none; }
.tool-hint { font-size: 12.5px; color: rgba(255,255,255,0.5); margin-top: 4px; }
.tool-stat { margin: 0 0 14px; }
.tool-stat span { display: block; font-size: 12.5px; color: rgba(255,255,255,0.55); font-weight: 600; }
.tool-stat strong { display: block; font-size: 26px; margin-top: 2px; font-weight: 800; color: #fff; }
.tool-note { font-size: 12.5px; color: rgba(255,255,255,0.5); margin-top: 12px; line-height: 1.45; }
.tool-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
.tool-actions button {
  font-size: 13px; font-weight: 700; padding: 10px 14px;
  border: 1px solid rgba(255,255,255,0.18); border-radius: 999px;
  background: rgba(255,255,255,0.06); color: #fff; cursor: pointer;
}
.tool-actions button[data-trust-lookup],
.tool-actions button.primary {
  background: var(--accent); border-color: var(--accent); color: #fff;
}
.tool-card-grid {
  display: grid;
  gap: 14px;
  margin: 22px 0 8px;
  text-align: left;
}
@media (min-width: 700px) { .tool-card-grid { grid-template-columns: 1fr 1fr; } }
@media (min-width: 1040px) { .tool-card-grid { grid-template-columns: 1fr 1fr 1fr; } }
.tool-card {
  display: block; text-decoration: none; color: inherit;
  border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 18px 20px;
  background: rgba(255,255,255,0.04); transition: border-color 0.15s ease, transform 0.12s ease;
}
.tool-card:hover { border-color: var(--accent); transform: translateY(-1px); }
.tool-card h2 { font-size: 18px; margin: 0 0 8px; font-weight: 800; color: #fff; font-family: Inter, system-ui, sans-serif; }
.tool-card p { margin: 0; color: rgba(255,255,255,0.62); font-size: 14.5px; line-height: 1.45; }
.finder-grid {
  display: grid; gap: 12px; margin: 18px 0 8px; text-align: left;
}
@media (min-width: 700px) { .finder-grid { grid-template-columns: 1fr 1fr; } }
.finder-card {
  display: block; text-decoration: none; color: inherit;
  border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 14px 16px;
  background: rgba(255,255,255,0.04);
}
.finder-card:hover { border-color: var(--accent); }
.finder-card strong { display: block; font-size: 15px; margin-bottom: 3px; color: #fff; }
.finder-card span { font-size: 13px; color: rgba(255,255,255,0.55); }
.tool-faq { margin-top: 8px; text-align: left; }
.tool-faq details {
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding: 14px 0;
}
.tool-faq summary {
  cursor: pointer;
  font-weight: 700;
  color: #fff;
  list-style: none;
}
.tool-faq summary::-webkit-details-marker { display: none; }
.tool-faq p { margin-top: 8px; }
.trust-badge-demo {
  display: inline-flex; align-items: center; gap: 6px;
  font: 12px/1.2 -apple-system, system-ui, sans-serif; color: #1B3155;
  text-decoration: none; border: 1px solid #d8dee8; border-radius: 6px;
  padding: 6px 10px; background: #fafbfc;
}
.tool-line-items { display: grid; gap: 10px; margin-bottom: 12px; }
.tool-line-item {
  display: grid; gap: 8px;
  grid-template-columns: 1fr 70px 90px auto;
  align-items: end;
}
@media (max-width: 640px) {
  .tool-line-item { grid-template-columns: 1fr 1fr; }
  .tool-line-item .tool-field:first-child { grid-column: 1 / -1; }
}
.tool-line-item button {
  font-size: 12px; font-weight: 700; padding: 10px 12px; margin-bottom: 1px;
  border: 1px solid rgba(255,255,255,0.18); border-radius: 10px;
  background: rgba(255,255,255,0.06); color: #fff; cursor: pointer;
}
.tool-embed-callout { margin-top: 18px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.1); }
.tool-actions a {
  font-size: 13px; font-weight: 700; padding: 10px 14px;
  border: 1px solid rgba(255,255,255,0.18); border-radius: 999px;
  background: rgba(255,255,255,0.06); color: #fff; text-decoration: none;
}
.tool-actions a:hover { border-color: var(--accent); }
.tool-embed-code {
  display: block; margin-top: 10px; font-size: 12px; word-break: break-all; padding: 10px 12px;
  background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: rgba(255,255,255,0.85);
}
.tool-embed-code[hidden] { display: none; }
.hash-out { margin-top: 16px; text-align: left; }
.hash-out-row { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
.hash-out-row code {
  flex: 1; font-size: 12.5px; word-break: break-all; padding: 8px 10px;
  background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: #fff;
}
.hash-copy-btn {
  flex-shrink: 0; font-size: 12.5px; font-weight: 700; padding: 8px 12px;
  border: 1px solid rgba(255,255,255,0.18); border-radius: 999px; background: rgba(255,255,255,0.06); color: #fff; cursor: pointer;
}
@media (max-width: 640px) {
  .tool-ring { width: 210px; height: 210px; }
  .tool-hero { padding: 28px 18px 48px; }
}
</style>
<script src="/tools-calc.js" defer></script>`;

const EMBED_SITE_URL = "https://docstoc.io";

/** The late-payment interest calculator panel — shared between the full /tools page and the standalone embed. */
function latePaymentPanelHtml() {
  return `<div class="tool-panel-grid" data-calc="late-payment">
      <div class="tool-panel">
        <div class="tool-field">
          <label for="lp-currency">Currency</label>
          <select id="lp-currency" data-lp-currency>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="AUD">AUD</option>
            <option value="CAD">CAD</option>
          </select>
        </div>
        <div class="tool-field">
          <label for="lp-amount">Invoice amount</label>
          <input id="lp-amount" data-lp-amount type="number" min="0" step="0.01" value="2500" />
        </div>
        <div class="tool-field">
          <label for="lp-overdue">Date payment became overdue</label>
          <input id="lp-overdue" data-lp-overdue type="date" />
        </div>
        <div class="tool-field">
          <label for="lp-paid">Date of payment (or today if still unpaid)</label>
          <input id="lp-paid" data-lp-paid type="date" />
        </div>
        <div class="tool-field">
          <label for="lp-rate">Annual interest rate (<span data-lp-rate-label>8.0%</span>)</label>
          <input id="lp-rate" data-lp-rate type="range" min="0" max="30" step="0.1" value="8" />
        </div>
        <div class="tool-field">
          <label for="lp-fee">Optional one-time late fee (% of invoice)</label>
          <input id="lp-fee" data-lp-fee type="number" min="0" max="100" step="0.1" value="0" />
        </div>
      </div>
      <div class="tool-results" aria-live="polite">
        <p class="tool-stat"><span>Days overdue</span><strong data-lp-out-days>—</strong></p>
        <p class="tool-stat"><span>Interest accrued</span><strong data-lp-out-interest>—</strong></p>
        <p class="tool-stat"><span>Late fee</span><strong data-lp-out-fee>—</strong></p>
        <p class="tool-stat"><span>Updated total due</span><strong data-lp-out-total>—</strong></p>
        <p class="tool-note">Simple interest: amount × annual rate × (days ÷ 365). Not legal advice.</p>
      </div>
    </div>`;
}

/** The SSL certificate expiry calculator panel — shared between the full /tools page and the standalone embed. */
function sslExpiryPanelHtml() {
  return `<div class="tool-panel-grid" data-calc="ssl-expiry">
      <div class="tool-panel">
        <div class="tool-field">
          <label for="ssl-issued">Date the certificate was issued</label>
          <input id="ssl-issued" data-ssl-issued type="date" />
        </div>
        <div class="tool-field">
          <label for="ssl-validity">Validity period (days)</label>
          <select id="ssl-validity" data-ssl-validity>
            <option value="90">90 days — Let's Encrypt (default)</option>
            <option value="398">398 days — max allowed by browsers today</option>
            <option value="365">365 days — 1 year</option>
          </select>
          <p class="tool-hint">docstoc issues 90-day Let's Encrypt certificates and reminds you before renewal is due.</p>
        </div>
      </div>
      <div class="tool-results" aria-live="polite">
        <p class="tool-stat"><span>Expiry date</span><strong data-ssl-out-expiry>—</strong></p>
        <p class="tool-stat"><span>Days remaining</span><strong data-ssl-out-remaining-panel>—</strong></p>
        <p class="tool-note">Renew with margin — DNS propagation and validation can take time.</p>
      </div>
    </div>`;
}

function faqJsonLd(faqs) {
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    null,
    2
  );
}

function breadcrumbJsonLd(items) {
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((it, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: it.name,
        item: it.item,
      })),
    },
    null,
    2
  );
}

function webAppJsonLd({ name, description, url }) {
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name,
      description,
      url,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      provider: { "@type": "Organization", name: "docstoc", url: "https://docstoc.io/" },
    },
    null,
    2
  );
}

function multiJsonLd(...blocks) {
  return `[${blocks.join(",\n")}]`;
}

function signupForm(source) {
  return `
<form class="tool-signup" action="/app/login" method="get">
  <input type="hidden" name="start" value="1" />
  <input class="tool-signup-input" type="email" name="email" autocomplete="email" placeholder="Enter your work email" aria-label="Enter your work email" required />
  <button type="submit" class="tool-signup-btn" data-cta data-cta-source="${source}">Start free →</button>
</form>
<p class="tool-cta-hint">No credit card required · your account in one click</p>`.trim();
}

/** File-drop circle — hash checker + SSL cert parser only. */
function dropCircle({
  sub,
  intent = "hash",
  title = "Click or drag a file here",
  accept = "",
  icon = uploadIcon,
  ariaLabel = "Drop a file or click to choose one",
}) {
  const acceptAttr = accept ? ` accept="${accept}"` : "";
  return `<div class="tool-circle is-action" data-hash-drop data-drop-intent="${intent}" tabindex="0" role="button" aria-label="${ariaLabel}">
      <span class="tool-circle-icon" aria-hidden="true">${icon}</span>
      <p class="tool-circle-title">${title}</p>
      <p class="tool-circle-sub">${sub}</p>
      <input type="file" class="tool-circle-file" data-hash-input${acceptAttr} aria-label="Choose a file" />
    </div>`;
}

/** Click/keyboard circle that jumps into the page tool (invoice, chase). Uses a real href so it works even if JS fails. */
function actionCircle({ action, title, sub, icon, ariaLabel, href }) {
  const label = ariaLabel || title;
  if (href) {
    return `<a class="tool-circle is-action" href="${href}" data-tool-action="${action}" aria-label="${label}">
      <span class="tool-circle-icon" aria-hidden="true">${icon}</span>
      <p class="tool-circle-title">${title}</p>
      <p class="tool-circle-sub">${sub}</p>
    </a>`;
  }
  return `<div class="tool-circle is-action" data-tool-action="${action}" tabindex="0" role="button" aria-label="${label}">
      <span class="tool-circle-icon" aria-hidden="true">${icon}</span>
      <p class="tool-circle-title">${title}</p>
      <p class="tool-circle-sub">${sub}</p>
    </div>`;
}

/** Index hero circle — short links to every tool page. */
function toolsIndexCircle() {
  const links = [
    ["Templates", "/tools/template-finder"],
    ["Hash", "/tools/file-hash-checker"],
    ["SSL", "/tools/ssl-certificate-calculator"],
    ["Badges", "/tools/trust-badges"],
    ["Invoice", "/tools/invoice-generator"],
    ["Chase", "/tools/invoice-chase-calculator"],
  ];
  const linked = links
    .map(([label, href], i) => {
      const sep = i === 0 ? "" : `<span class="sep" aria-hidden="true">·</span>`;
      return `${sep}<a href="${href}">${label}</a>`;
    })
    .join("");
  return `<div class="tool-circle" role="navigation" aria-label="Free tools">
      <span class="tool-circle-icon" aria-hidden="true">${searchIcon}</span>
      <p class="tool-circle-title">Choose a tool</p>
      <p class="tool-circle-links">${linked}</p>
    </div>`;
}

/** Circle with an inline input (template search, trust lookup). */
function inputCircle({ action, title, sub, icon, placeholder, extraHtml = "" }) {
  return `<div class="tool-circle is-action tool-circle-form" data-tool-action="${action}">
      <span class="tool-circle-icon" aria-hidden="true">${icon}</span>
      <p class="tool-circle-title">${title}</p>
      <p class="tool-circle-sub">${sub}</p>
      <input class="tool-circle-input" data-tool-input type="search" placeholder="${placeholder}" aria-label="${placeholder}" autocomplete="off" />
      ${extraHtml}
    </div>`;
}

function hashResultBlock(extraHtml = "") {
  return `<div class="hash-out" data-hash-out hidden>
  <div class="hash-out-row">
    <code data-hash-value>—</code>
    <button type="button" class="hash-copy-btn" data-hash-copy>Copy</button>
  </div>
  <p class="tool-note" data-hash-meta></p>
  <p class="tool-note" data-hash-next hidden></p>
  ${extraHtml}
</div>`;
}

function hero({ accent, rest, sub, ringInner, caption, source }) {
  return `
<section class="tool-hero">
  <div class="tool-hero-inner">
    <div class="tool-hero-pill" aria-hidden="true"></div>
    <h1><span class="accent">${accent}</span>${rest ? `<br>${rest}` : ""}</h1>
    <p class="tool-hero-sub">${sub}</p>
    <div class="tool-ring">${ringInner}</div>
    ${caption ? `<p class="tool-caption">${caption}</p>` : ""}
    ${signupForm(source)}
  </div>
</section>`.trim();
}

function faqsHtml(faqs) {
  return `<div class="tool-faq">${faqs
    .map((f) => `<details><summary>${f.q}</summary><p>${f.a}</p></details>`)
    .join("\n")}</div>`;
}

const chaseFaqs = [
  {
    q: "How do you calculate late payment interest on an unpaid invoice?",
    a: "Multiply the invoice amount by the annual interest rate, then by days overdue divided by 365. Example: $1,000 × 8% × (30 ÷ 365) ≈ $6.58 interest.",
  },
  {
    q: "What interest rate should I use for late invoices?",
    a: "Use the rate in your contract or invoice terms. Many freelancers use 1–1.5% per month (about 12–18% annually). Some countries set a statutory rate for commercial late payments — check local rules.",
  },
  {
    q: "How does this savings estimate work?",
    a: "It divides your unpaid AR balance by current average days outstanding to estimate daily cash tied up, then multiplies by the days you expect to shorten with consistent follow-ups.",
  },
  {
    q: "Does docstoc email clients for me?",
    a: "No. docstoc drafts follow-up emails; you review and send from your own inbox. That keeps your client relationship in your control.",
  },
];

const finderFaqs = [
  {
    q: "Do I need an account to use these templates?",
    a: "No. Every template is free to view and copy without signing up — an account only matters if you want to submit your own template or use docstoc's other tools.",
  },
  {
    q: "What if my situation isn't listed?",
    a: "The situations above are common starting points, not the full list. Browse all 1,000+ templates for anything more specific — business, legal, real estate, finance, and HR documents are all covered.",
  },
  {
    q: "Can I edit the template after copying it?",
    a: "Yes. Templates are plain text you copy into your own document — there's no lock-in format or proprietary editor involved.",
  },
];

const hashFaqs = [
  {
    q: "Is my file uploaded anywhere?",
    a: "No. The hash is computed entirely in your browser using the Web Crypto API — the file's bytes never leave your device or get sent to any server.",
  },
  {
    q: "What is SHA-256 used for?",
    a: "SHA-256 produces a fixed-length fingerprint of a file. If even one byte changes, the hash changes completely — making it a reliable way to prove a file hasn't been altered.",
  },
  {
    q: "How is this different from a docstoc certificate?",
    a: "This tool just shows you the hash. A docstoc certificate stores that hash with a timestamp and gives you a shareable link anyone can use to verify the file later — this calculator is the same math, without the record-keeping.",
  },
];

const sslFaqs = [
  {
    q: "Why 90 days for the default validity period?",
    a: "Let's Encrypt — the certificate authority docstoc automates — issues certificates valid for 90 days by default, shorter than the 1-year certificates some paid providers sell.",
  },
  {
    q: "What happens if a certificate expires?",
    a: "Browsers show a security warning and block or flag the site as untrusted. Renewing before expiry avoids any visible disruption to visitors.",
  },
  {
    q: "Can docstoc remind me automatically instead of me tracking this by hand?",
    a: "Yes — once a domain is added in docstoc, it tracks expiry for you and emails a reminder before the certificate lapses, with a one-click renewal path.",
  },
];

const invoiceFaqs = [
  {
    q: "Is this a free invoice generator?",
    a: "Yes for the preview on this page — totals update in your browser with no signup. Creating a real shareable invoice link (and tracking sent/paid status) happens in your docstoc account.",
  },
  {
    q: "What happens after I create an invoice in docstoc?",
    a: "You get a public /invoice/… link your client can open and print. Mark it sent and it can flow into chase follow-ups if it goes overdue, plus an optional tamper-evident certificate.",
  },
  {
    q: "Can clients pay from the invoice page?",
    a: "If you've set a payment link in branding, it appears on the public invoice. docstoc doesn't process card payments itself — it links out to whatever you already use.",
  },
  {
    q: "Does creating an invoice auto-email my client?",
    a: "No. You share the link yourself. Follow-up emails are also drafts you review and send from your own inbox.",
  },
];

const trustBadgeFaqs = [
  {
    q: "Is this a legal-entity or business-registry check?",
    a: "No. The badge confirms DNS control of a domain (via a real Let's Encrypt certificate issued through docstoc) and, once Bitcoin-confirmed, the date that verified status began. It does not check company registries or claim KYC/identity verification.",
  },
  {
    q: "Do I need an account to look up someone else's badge?",
    a: "No. Paste a workspace account ID or a /trust/… link below — the lookup is public. Getting your own badge requires securing a domain in docstoc first.",
  },
  {
    q: "Where does the embed script go?",
    a: "Anywhere HTML is allowed — your website footer, proposals, or a client portal. The script loads a small domain-verified badge that links to the public trust profile.",
  },
  {
    q: "When does the Bitcoin timestamp show up?",
    a: "Usually within a few hours of first verification. Until then the badge still says domain-verified; once confirmed it upgrades to include the verified-since date.",
  },
];

const trustBadgeSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;

const toolsIndexMain = `
${hero({
  accent: "Free tools.",
  rest: "One workflow.",
  sub: "Templates, file hash, SSL expiry, trust badges, invoice generator, and chase estimates — open any tool from the circle.",
  ringInner: toolsIndexCircle(),
  caption: "Each link opens that tool — cards below have the full descriptions",
  source: "tool_index_hero",
})}
<section class="tool-section" id="tool-list">
  <div class="tool-section-inner">
    <h2>Choose your tool</h2>
    <div class="tool-card-grid">
      <a class="tool-card" href="/tools/template-finder"><h2>Template finder</h2><p>Pick your situation, get a direct link to the right free business or legal template.</p></a>
      <a class="tool-card" href="/tools/file-hash-checker"><h2>File hash checker</h2><p>Compute a file's SHA-256 hash in your browser — the same check behind docstoc certificates.</p></a>
      <a class="tool-card" href="/tools/ssl-certificate-calculator"><h2>SSL expiry calculator</h2><p>Drop a cert file or enter dates — get the exact expiry date and days remaining.</p></a>
      <a class="tool-card" href="/tools/trust-badges"><h2>Trust badges</h2><p>Preview the domain-verified badge, look up a public trust profile, copy the embed snippet.</p></a>
      <a class="tool-card" href="/tools/invoice-generator"><h2>Invoice generator</h2><p>Build a professional invoice with line items and tax — preview totals free, then create a shareable client link.</p></a>
      <a class="tool-card" href="/tools/invoice-chase-calculator"><h2>Invoice chase calculator</h2><p>Estimate late payment interest and the cash you unlock when overdue invoices get paid sooner.</p></a>
    </div>
  </div>
</section>
`.trim();

const templateFinderMain = `
${hero({
  accent: "Find. Copy.",
  rest: "Ship the doc.",
  sub: "Search situations below or submit a template you've already used. No signup to browse.",
  ringInner: inputCircle({
    action: "templates",
    icon: searchIcon,
    title: "Find a template",
    sub: "Type a situation or document type",
    placeholder: "NDA, lease, offer…",
    extraHtml: `<p class="tool-circle-extra"><a href="/free-templates/submit">Submit a template →</a></p>`,
  }),
  caption: "Filter the situations below · or browse all 1,000+ templates",
  source: "tool_template_finder",
})}
<section class="tool-section" id="situations">
  <div class="tool-section-inner">
    <h2>Pick your situation</h2>
    <p class="tool-note" data-template-filter-note hidden style="margin-bottom:12px"></p>
    <div class="finder-grid">
      <a class="finder-card" data-finder-tags="freelance contractor independent hire" href="/document-templates/independent-contractor-agreement-template"><strong>Hiring a freelance contractor</strong><span>Independent Contractor Agreement</span></a>
      <a class="finder-card" data-finder-tags="nda confidential non-disclosure secrecy" href="/document-templates/non-disclosure-and-non-circumvention-agreement-template"><strong>Sharing confidential information</strong><span>Non-Disclosure &amp; Non-Circumvention Agreement</span></a>
      <a class="finder-card" data-finder-tags="employee hire offer letter job" href="/document-templates/employee-offer-letter-template"><strong>Hiring a new employee</strong><span>Employee Offer Letter</span></a>
      <a class="finder-card" data-finder-tags="termination fire end employment" href="/document-templates/employment-termination-letter-template"><strong>Ending someone's employment</strong><span>Employment Termination Letter</span></a>
      <a class="finder-card" data-finder-tags="commercial lease rent property office" href="/document-templates/commercial-lease-agreement-template"><strong>Renting out a commercial property</strong><span>Commercial Lease Agreement</span></a>
      <a class="finder-card" data-finder-tags="eviction tenant landlord notice" href="/document-templates/eviction-notice-template"><strong>Evicting a tenant</strong><span>Eviction Notice</span></a>
      <a class="finder-card" data-finder-tags="unpaid invoice demand payment overdue" href="/document-templates/demand-letter-unpaid-invoice-template"><strong>An invoice went unpaid</strong><span>Demand Letter for Unpaid Invoice</span></a>
      <a class="finder-card" data-finder-tags="browse all other something else" href="/document-templates/"><strong>Something else</strong><span>Browse all 1,000+ free templates →</span></a>
    </div>
    <p style="margin-top:16px"><a href="/free-templates/submit">Got a template that worked for you? Submit it →</a></p>
    <h3>After you pick a template</h3>
    <p>Copy it directly — no account needed. If it's the final version of something a client needs proof of receiving, <a href="/app/certificates">certify it</a>. If it's tied to an invoice that goes unpaid, docstoc can <a href="/app/">draft the follow-up</a> for you.</p>
    <h3>FAQs</h3>
    ${faqsHtml(finderFaqs)}
  </div>
</section>
`.trim();

const hashCheckerMain = `
${hero({
  accent: "Hash. Prove.",
  rest: "Never upload.",
  sub: "Drop any file to compute its SHA-256 fingerprint in your browser — the same math behind docstoc's free tamper-evident certificates.",
  ringInner: dropCircle({
    intent: "hash",
    icon: uploadIcon,
    title: "Click or drag a file here",
    sub: "Get a free tamper-evident fingerprint",
  }),
  caption: "SHA-256 · computed in your browser · nothing ever uploaded",
  source: "tool_file_hash",
})}
<section class="tool-section">
  <div class="tool-section-inner">
    ${hashResultBlock(`<p style="margin-top:12px"><a href="/app/certificates">Turn this into a shareable certificate →</a></p>`)}
    <h2>What this proves</h2>
    <p>Hash the same file twice — even on different computers — and you get the exact same result. Change a single character and the hash changes completely. That's how you confirm a file wasn't altered after you last checked it.</p>
    <p style="margin-top:16px"><a href="/app/certificates">Turn this into a shareable certificate →</a></p>
    <h3>FAQs</h3>
    ${faqsHtml(hashFaqs)}
  </div>
</section>
`.trim();

const sslCalcMain = `
${hero({
  accent: "Know the expiry.",
  rest: "Before browsers do.",
  sub: "Drop a certificate file (.pem / .crt) to read issue and expiry dates — or enter them in the calculator below.",
  ringInner: dropCircle({
    intent: "ssl",
    icon: lockIcon,
    title: "Drop a certificate",
    sub: ".pem / .crt · fills expiry below",
    accept: ".pem,.crt,.cer,.cert",
    ariaLabel: "Drop a certificate file or click to choose one",
  }),
  caption: "Cert dates filled when we can read them · nothing uploaded",
  source: "tool_ssl_calc",
})}
<section class="tool-section">
  <div class="tool-section-inner">
    ${hashResultBlock("")}
    <h2>Calculate expiry</h2>
    ${sslExpiryPanelHtml()}
    <div class="tool-embed-callout">
      <p class="tool-note" style="margin:0 0 8px">Got a blog or client-facing site? Embed this calculator directly — readers use it, you get credit.</p>
      <div class="tool-actions">
        <button type="button" data-copy-embed="#ssl-embed-code">Copy embed code</button>
        <a href="${EMBED_SITE_URL}/tools/embed/ssl-certificate-calculator" target="_blank" rel="noopener noreferrer">Preview embed →</a>
      </div>
      <code id="ssl-embed-code" class="tool-embed-code" hidden>&lt;iframe src="${EMBED_SITE_URL}/tools/embed/ssl-certificate-calculator" width="100%" height="360" style="border:0;max-width:480px" loading="lazy" title="SSL Certificate Expiry Calculator by docstoc.io"&gt;&lt;/iframe&gt;</code>
    </div>
    <h3>Why this matters</h3>
    <p>An expired SSL/TLS certificate shows visitors a security warning and can block access. Automated renewal reminders exist because manually tracking expiry across every domain doesn't scale.</p>
    <p style="margin-top:12px"><a href="/ssl">How SSL automation works →</a> · <a href="/tools/trust-badges">Trust badges →</a></p>
    <h3>FAQs</h3>
    ${faqsHtml(sslFaqs)}
  </div>
</section>
`.trim();

const trustBadgesMain = `
${hero({
  accent: "Verified domain.",
  rest: "Visible trust.",
  sub: "Look up any public trust profile, preview the domain-verified badge, and copy the embed snippet for your site.",
  ringInner: inputCircle({
    action: "trust",
    icon: lockIcon,
    title: "Look up a badge",
    sub: "Paste account ID or /trust/… URL",
    placeholder: "ID or trust URL…",
  }),
  caption: "Public profiles only · embed when SSL is active",
  source: "tool_trust_badges",
})}
<section class="tool-section">
  <div class="tool-section-inner">
    <h2>Look up a public profile</h2>
    <div class="tool-panel-grid" data-calc="trust-badge">
      <div class="tool-panel">
        <div class="tool-field">
          <label for="trust-id">Account ID or trust profile URL</label>
          <input id="trust-id" data-trust-id type="text" placeholder="e.g. abc123… or https://docstoc.io/trust/…" autocomplete="off" />
          <p class="tool-hint">Find the ID on SSL Certificates after a domain is verified, or in any /trust/… link.</p>
        </div>
        <div class="tool-actions">
          <button type="button" data-trust-lookup>Look up profile</button>
          <button type="button" data-trust-copy-embed hidden>Copy embed code</button>
        </div>
      </div>
      <div class="tool-results" aria-live="polite">
        <p class="tool-stat"><span>Workspace</span><strong data-trust-out-name>—</strong></p>
        <p class="tool-stat"><span>Domain</span><strong data-trust-out-domain>—</strong></p>
        <p class="tool-stat"><span>SSL status</span><strong data-trust-out-status>—</strong></p>
        <p class="tool-stat"><span>Verified since</span><strong data-trust-out-since>—</strong></p>
        <p style="margin: 8px 0 12px"><span class="trust-badge-demo" data-trust-badge-preview>${trustBadgeSvg} Domain-verified via docstoc</span></p>
        <p class="tool-note" data-trust-out-note>Paste an ID above to load a live public profile.</p>
        <p class="trust-embed-box" data-trust-embed hidden></p>
        <p style="margin-top:14px" data-trust-profile-link-wrap hidden>
          <a href="#" data-trust-profile-link target="_blank" rel="noopener noreferrer">Open public trust profile →</a>
        </p>
      </div>
    </div>
    <h3>What this verifies</h3>
    <p>When you issue a domain's SSL certificate through docstoc, the platform proves DNS control. That creates a public trust profile with a verified-since date — and once OpenTimestamps confirms, anyone can check the claim independently.</p>
    <h3>What it does not claim</h3>
    <p>docstoc does not check business registries or government IDs. The badge never says it does.</p>
    <p style="margin-top:12px"><a href="/trust-badges">Full product overview →</a> · <a href="/ssl">SSL automation →</a></p>
    <h3>FAQs</h3>
    ${faqsHtml(trustBadgeFaqs)}
  </div>
</section>
`.trim();

const invoiceGeneratorMain = `
${hero({
  accent: "Create. Share.",
  rest: "Get paid.",
  sub: "Build a professional invoice with line items and tax. Preview totals free — then create a shareable client link in docstoc.",
  ringInner: actionCircle({
    action: "invoice",
    icon: invoiceIcon,
    title: "Create an invoice",
    sub: "Add line items · live totals below",
    ariaLabel: "Jump to the invoice generator form",
    href: "#invoice-builder",
  }),
  caption: "Preview free · shareable /invoice/… link when you create it",
  source: "tool_invoice_generator",
})}
<section class="tool-section" id="invoice-builder">
  <div class="tool-section-inner">
    <h2>Preview an invoice</h2>
    <p style="margin-bottom:16px">Totals update live below. Nothing is saved until you create the invoice in your account.</p>
    <div class="tool-panel-grid" data-calc="invoice-preview">
      <div class="tool-panel">
        <div class="tool-field">
          <label for="inv-client">Client name</label>
          <input id="inv-client" data-inv-client type="text" value="Acme Studio" />
        </div>
        <div class="tool-field">
          <label for="inv-currency">Currency</label>
          <select id="inv-currency" data-inv-currency>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="AUD">AUD</option>
            <option value="CAD">CAD</option>
          </select>
        </div>
        <div class="tool-field">
          <label for="inv-tax">Tax %</label>
          <input id="inv-tax" data-inv-tax type="number" min="0" max="100" step="0.1" value="0" />
        </div>
        <div class="tool-line-items" data-inv-items>
          <div class="tool-line-item">
            <div class="tool-field">
              <label>Description</label>
              <input data-inv-desc type="text" value="Website design — phase 1" />
            </div>
            <div class="tool-field">
              <label>Qty</label>
              <input data-inv-qty type="number" min="0" step="1" value="1" />
            </div>
            <div class="tool-field">
              <label>Price</label>
              <input data-inv-price type="number" min="0" step="0.01" value="2500" />
            </div>
            <button type="button" data-inv-remove aria-label="Remove line">✕</button>
          </div>
        </div>
        <div class="tool-actions">
          <button type="button" class="primary" data-inv-add>Add line item</button>
        </div>
      </div>
      <div class="tool-results" aria-live="polite">
        <p class="tool-stat"><span>Client</span><strong data-inv-out-client>—</strong></p>
        <p class="tool-stat"><span>Subtotal</span><strong data-inv-out-subtotal>—</strong></p>
        <p class="tool-stat"><span>Tax</span><strong data-inv-out-tax>—</strong></p>
        <p class="tool-stat"><span>Total</span><strong data-inv-out-total-panel>—</strong></p>
        <p class="tool-note">Preview only — create the real invoice to get a shareable link and tracking.</p>
        <p style="margin-top:16px"><a href="/app/invoices" class="nav-cta" data-cta data-cta-source="tool_invoice_generator_body">Create this invoice in docstoc →</a></p>
      </div>
    </div>
    <h3>What you get when you create it</h3>
    <ul>
      <li><strong>Shareable client page</strong> at <code>/invoice/…</code> — open, print, or forward without login</li>
      <li><strong>Sent / paid tracking</strong> in your workspace</li>
      <li><strong>Chase-ready</strong> — overdue invoices can feed AI follow-up drafts</li>
      <li><strong>Optional certificate</strong> — tamper-evident proof of what you sent</li>
    </ul>
    <p style="margin-top:12px"><a href="/invoices">Invoices product overview →</a> · <a href="/tools/invoice-chase-calculator">Chase calculator →</a></p>
    <h3>FAQs</h3>
    ${faqsHtml(invoiceFaqs)}
  </div>
</section>
`.trim();

const chaseCalcMain = `
${hero({
  accent: "Late fees.",
  rest: "Cash unlocked.",
  sub: "Estimate late payment interest and the working capital you free when chasing shortens days outstanding.",
  ringInner: actionCircle({
    action: "chase",
    icon: cashIcon,
    title: "Run the calculator",
    sub: "Interest + cash unlocked below",
    ariaLabel: "Jump to the late payment calculator",
    href: "#chase-calc",
  }),
  caption: "Draft-only AI follow-ups · you stay in control of every send",
  source: "tool_invoice_chase",
})}
<section class="tool-section" id="chase-calc">
  <div class="tool-section-inner">
    <h2>Late payment interest</h2>
    ${latePaymentPanelHtml()}
    <div class="tool-embed-callout">
      <p class="tool-note" style="margin:0 0 8px">Got a blog or client-facing site? Embed this calculator directly — readers use it, you get credit.</p>
      <div class="tool-actions">
        <button type="button" data-copy-embed="#lp-embed-code">Copy embed code</button>
        <a href="${EMBED_SITE_URL}/tools/embed/late-payment-calculator" target="_blank" rel="noopener noreferrer">Preview embed →</a>
      </div>
      <code id="lp-embed-code" class="tool-embed-code" hidden>&lt;iframe src="${EMBED_SITE_URL}/tools/embed/late-payment-calculator" width="100%" height="560" style="border:0;max-width:480px" loading="lazy" title="Late Payment Interest Calculator by docstoc.io"&gt;&lt;/iframe&gt;</code>
    </div>

    <h2 style="margin-top:40px">Cash unlocked by chasing consistently</h2>
    <div class="tool-panel-grid" data-calc="chase-savings">
      <div class="tool-panel">
        <div class="tool-field">
          <label for="sv-currency">Currency</label>
          <select id="sv-currency" data-sv-currency>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="AUD">AUD</option>
            <option value="CAD">CAD</option>
          </select>
        </div>
        <div class="tool-field">
          <label for="sv-ar">Unpaid invoices / AR balance</label>
          <input id="sv-ar" data-sv-ar type="number" min="0" step="100" value="50000" />
        </div>
        <div class="tool-field">
          <label for="sv-dso">Current average days outstanding</label>
          <input id="sv-dso" data-sv-dso type="number" min="1" step="1" value="45" />
        </div>
        <div class="tool-field">
          <label for="sv-reduce">Days you could cut (<span data-sv-reduce-label>12</span>)</label>
          <input id="sv-reduce" data-sv-reduce type="range" min="0" max="40" step="1" value="12" />
        </div>
        <div class="tool-field">
          <label for="sv-hours">Hours per week spent chasing</label>
          <input id="sv-hours" data-sv-hours type="number" min="0" step="0.5" value="4" />
        </div>
        <div class="tool-field">
          <label for="sv-wage">Your hourly value (or staff cost)</label>
          <input id="sv-wage" data-sv-wage type="number" min="0" step="1" value="50" />
        </div>
      </div>
      <div class="tool-results" aria-live="polite">
        <p class="tool-stat"><span>Cash unlocked</span><strong data-sv-out-cash-panel>—</strong></p>
        <p class="tool-stat"><span>Chase time saved (est.)</span><strong data-sv-out-hours>—</strong></p>
        <p class="tool-stat"><span>Value of time saved / year</span><strong data-sv-out-timecost>—</strong></p>
        <p class="tool-stat"><span>Approx. ROI vs Pro ($14.99/mo)</span><strong data-sv-out-roi>—</strong></p>
        <p class="tool-note">Cash unlocked ≈ (AR ÷ days outstanding) × days cut. Illustrative only.</p>
      </div>
    </div>
    <p style="margin-top:20px"><a href="/app/">Draft the chase email →</a> · <a href="/tools/invoice-generator">Invoice generator →</a></p>
    <h3>FAQs</h3>
    ${faqsHtml(chaseFaqs)}
  </div>
</section>
`.trim();

const pages = [
  {
    file: "index.html",
    title: "Free Tools — Templates, Hash, SSL, Trust Badges, Invoice Generator, Chase | docstoc",
    description:
      "Free tools: find templates, check SHA-256 hashes, calculate SSL expiry, look up trust badges, preview invoices, and estimate invoice chase savings.",
    canonical: "/tools/",
    mainHtml: toolsIndexMain,
    jsonLd: multiJsonLd(
      breadcrumbJsonLd([
        { name: "Home", item: "https://docstoc.io/" },
        { name: "Tools", item: "https://docstoc.io/tools/" },
      ])
    ),
  },
  {
    file: "template-finder.html",
    title: "Template Finder — Find the Right Free Document | docstoc",
    description:
      "Pick your situation, get a direct link to the right free business or legal template. No search, no signup.",
    canonical: "/tools/template-finder",
    mainHtml: templateFinderMain,
    jsonLd: multiJsonLd(
      breadcrumbJsonLd([
        { name: "Home", item: "https://docstoc.io/" },
        { name: "Tools", item: "https://docstoc.io/tools/" },
        { name: "Template finder", item: "https://docstoc.io/tools/template-finder" },
      ]),
      faqJsonLd(finderFaqs)
    ),
  },
  {
    file: "file-hash-checker.html",
    title: "Free File Hash Checker (SHA-256) — No Upload | docstoc",
    description:
      "Compute a file's SHA-256 hash entirely in your browser. Nothing is uploaded. Free, instant, no signup.",
    canonical: "/tools/file-hash-checker",
    mainHtml: hashCheckerMain,
    jsonLd: multiJsonLd(
      breadcrumbJsonLd([
        { name: "Home", item: "https://docstoc.io/" },
        { name: "Tools", item: "https://docstoc.io/tools/" },
        { name: "File hash checker", item: "https://docstoc.io/tools/file-hash-checker" },
      ]),
      webAppJsonLd({
        name: "File hash checker",
        description: "Compute a file's SHA-256 hash in the browser, no upload required.",
        url: "https://docstoc.io/tools/file-hash-checker",
      }),
      faqJsonLd(hashFaqs)
    ),
  },
  {
    file: "ssl-certificate-calculator.html",
    title: "SSL Certificate Expiry Calculator | docstoc",
    description:
      "Enter a certificate's issue date and validity period to see the exact expiry date and days remaining. Free, no signup.",
    canonical: "/tools/ssl-certificate-calculator",
    mainHtml: sslCalcMain,
    jsonLd: multiJsonLd(
      breadcrumbJsonLd([
        { name: "Home", item: "https://docstoc.io/" },
        { name: "Tools", item: "https://docstoc.io/tools/" },
        { name: "SSL certificate expiry calculator", item: "https://docstoc.io/tools/ssl-certificate-calculator" },
      ]),
      webAppJsonLd({
        name: "SSL certificate expiry calculator",
        description: "Calculate SSL/TLS certificate expiry date and days remaining.",
        url: "https://docstoc.io/tools/ssl-certificate-calculator",
      }),
      faqJsonLd(sslFaqs)
    ),
  },
  {
    file: "trust-badges.html",
    title: "Verified Corporate Identity & Trust Badges — Lookup & Embed | docstoc",
    description:
      "Look up a public domain-verified trust profile, preview the embeddable badge, and copy the script. Free lookup, no signup.",
    canonical: "/tools/trust-badges",
    mainHtml: trustBadgesMain,
    jsonLd: multiJsonLd(
      breadcrumbJsonLd([
        { name: "Home", item: "https://docstoc.io/" },
        { name: "Tools", item: "https://docstoc.io/tools/" },
        { name: "Verified Corporate Identity & Trust Badges", item: "https://docstoc.io/tools/trust-badges" },
      ]),
      webAppJsonLd({
        name: "Verified Corporate Identity & Trust Badges",
        description: "Look up public trust profiles and preview embeddable domain-verified badges.",
        url: "https://docstoc.io/tools/trust-badges",
      }),
      faqJsonLd(trustBadgeFaqs)
    ),
  },
  {
    file: "invoice-generator.html",
    title: "Free Invoice Generator — Preview Totals & Create Shareable Invoices | docstoc",
    description:
      "Build a professional invoice with line items and tax. Preview totals free in your browser, then create a shareable client link in docstoc.",
    canonical: "/tools/invoice-generator",
    mainHtml: invoiceGeneratorMain,
    jsonLd: multiJsonLd(
      breadcrumbJsonLd([
        { name: "Home", item: "https://docstoc.io/" },
        { name: "Tools", item: "https://docstoc.io/tools/" },
        { name: "Invoice generator", item: "https://docstoc.io/tools/invoice-generator" },
      ]),
      webAppJsonLd({
        name: "Invoice generator",
        description: "Preview invoice totals with line items and tax, then create a shareable invoice in docstoc.",
        url: "https://docstoc.io/tools/invoice-generator",
      }),
      faqJsonLd(invoiceFaqs)
    ),
  },
  {
    file: "invoice-chase-calculator.html",
    title: "Invoice Chase Calculator — Late Fees & Savings | docstoc",
    description:
      "Free calculator for late payment interest and chase savings. Estimate fees on unpaid invoices and cash unlocked when you get paid faster.",
    canonical: "/tools/invoice-chase-calculator",
    mainHtml: chaseCalcMain,
    jsonLd: multiJsonLd(
      breadcrumbJsonLd([
        { name: "Home", item: "https://docstoc.io/" },
        { name: "Tools", item: "https://docstoc.io/tools/" },
        { name: "Invoice chase calculator", item: "https://docstoc.io/tools/invoice-chase-calculator" },
      ]),
      webAppJsonLd({
        name: "Invoice chase calculator",
        description: "Estimate late payment interest and cash unlocked from consistent invoice chasing.",
        url: "https://docstoc.io/tools/invoice-chase-calculator",
      }),
      faqJsonLd(chaseFaqs)
    ),
  },
];

for (const page of pages) {
  const html = chrome({
    title: page.title,
    description: page.description,
    canonical: page.canonical,
    activeNav: "tools",
    mainHtml: page.mainHtml,
    jsonLd: page.jsonLd,
    depth: 1,
    extraHead,
    fullBleedMain: true,
  });
  writeFileSync(join(outDir, page.file), html, "utf8");
  console.log(`Wrote tools/${page.file}`);
}

// --- Standalone embeddable widgets — meant to be iframed on other sites, not the docstoc chrome. ---
const embedOutDir = join(outDir, "embed");
mkdirSync(embedOutDir, { recursive: true });

const EMBED_STYLE = `<style>
html, body { margin: 0; background: #0b0908; color: rgba(255,255,255,0.86); font-family: Inter, system-ui, sans-serif; }
.embed-wrap { padding: 18px 18px 4px; box-sizing: border-box; }
.tool-panel-grid { display: grid; gap: 16px; }
.tool-panel, .tool-results {
  border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 16px; padding: 18px 20px;
  background: rgba(255, 255, 255, 0.04); text-align: left; box-sizing: border-box;
}
.tool-results { background: color-mix(in srgb, #F58025 10%, transparent); }
.tool-field { margin-bottom: 14px; }
.tool-field label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: rgba(255,255,255,0.88); }
.tool-field input, .tool-field select {
  width: 100%; box-sizing: border-box; padding: 11px 12px;
  border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 10px;
  font: inherit; background: rgba(0,0,0,0.35); color: #fff;
}
.tool-field input[type="range"] { padding: 0; background: transparent; border: none; }
.tool-stat { margin: 0 0 14px; }
.tool-stat span { display: block; font-size: 12.5px; color: rgba(255,255,255,0.55); font-weight: 600; }
.tool-stat strong { display: block; font-size: 24px; margin-top: 2px; font-weight: 800; color: #fff; }
.tool-note { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 12px; line-height: 1.4; }
.embed-foot {
  margin: 4px 0 0; padding: 12px 18px 16px; text-align: center; font-size: 11.5px;
  color: rgba(255,255,255,0.55); border-top: 1px solid rgba(255,255,255,0.1);
}
.embed-foot a { color: #F58025; font-weight: 700; text-decoration: none; }
.embed-foot a:hover { text-decoration: underline; }
</style>`;

function embedPageHtml({ title, description, bodyHtml, canonical, sourcePage, campaign, footerLabel = "Calculator" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="noindex, nofollow">
${EMBED_STYLE}
</head>
<body>
<div class="embed-wrap">
${bodyHtml}
</div>
<p class="embed-foot">${footerLabel} by <a href="${EMBED_SITE_URL}${sourcePage}?utm_source=embed&utm_medium=widget&utm_campaign=${campaign}" target="_blank" rel="noopener noreferrer">docstoc.io</a> — free invoice chasing software</p>
<script src="${EMBED_SITE_URL}/tools-calc.js" defer></script>
</body>
</html>`;
}

const embedPages = [
  {
    file: "late-payment-calculator.html",
    title: "Late Payment Interest Calculator — Free Embed | docstoc",
    description: "Free embeddable calculator for late payment interest and fees on overdue invoices.",
    canonical: `${EMBED_SITE_URL}/tools/embed/late-payment-calculator`,
    bodyHtml: latePaymentPanelHtml(),
    sourcePage: "/tools/invoice-chase-calculator",
    campaign: "late_payment_calc",
  },
  {
    file: "ssl-certificate-calculator.html",
    title: "SSL Certificate Expiry Calculator — Free Embed | docstoc",
    description: "Free embeddable calculator for SSL/TLS certificate expiry dates and days remaining.",
    canonical: `${EMBED_SITE_URL}/tools/embed/ssl-certificate-calculator`,
    bodyHtml: sslExpiryPanelHtml(),
    sourcePage: "/tools/ssl-certificate-calculator",
    campaign: "ssl_expiry_calc",
    footerLabel: "SSL expiry calculator",
  },
];

for (const page of embedPages) {
  const html = embedPageHtml(page);
  writeFileSync(join(embedOutDir, page.file), html, "utf8");
  console.log(`Wrote tools/embed/${page.file}`);
}

console.log("Done — tool pages generated.");
