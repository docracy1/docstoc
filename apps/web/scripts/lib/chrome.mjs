/** Shared HTML chrome for generated marketing pages. */

import { ORG_JSON_LD, SITE_BRAND, SITE_URL, SOCIAL, TWITTER_SITE } from "../data/seo-config.mjs";
import { renderSeoHead } from "./seo-head.mjs";
import { EN_TO_ES, ES_TO_EN } from "../data/es-alternates.mjs";

/** Bump when site.css / site-nav.js / site-lang.js change so Pages edge caches refresh. */
export const ASSET_V = "20261125a";

function faviconHead(link) {
  return `<link rel="icon" href="${link("/favicon.ico")}" sizes="48x48">
<link rel="icon" href="${link(`/favicon.png?v=${ASSET_V}`)}" type="image/png" sizes="96x96">
<link rel="icon" href="${link(`/favicon.svg?v=${ASSET_V}`)}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${link(`/apple-touch-icon.png?v=${ASSET_V}`)}" sizes="180x180">`;
}

/** Small inline icon set for the header mega-menus (mirrors the app's NavIcon component). */
const ICON_PATHS = {
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />',
  duplicate: '<rect x="8" y="8" width="12" height="13" rx="1.5" /><path d="M4 15V4.5A1.5 1.5 0 0 1 5.5 3H15" />',
  bolt: '<path d="M12.5 2.5L4 14h6l-1 7.5L20 10h-6l-1.5-7.5z" />',
  briefcase:
    '<rect x="3" y="7.5" width="18" height="12" rx="1.5" /><path d="M8 7.5V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5" /><path d="M3 12.5h18" />',
  users:
    '<circle cx="9" cy="8" r="3" /><path d="M3.5 19.5c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5" /><circle cx="17" cy="9" r="2.25" /><path d="M15.5 14.2c2.3.4 4 2.4 4 5.3" />',
  shield: '<path d="M12 3l7 3v5.5c0 5-3.5 8-7 9.5-3.5-1.5-7-4.5-7-9.5V6l7-3z" /><path d="M9 12l2 2 4-4" />',
  book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5v-13z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H12v16h6.5a1.5 1.5 0 0 0 1.5-1.5v-13z" />',
  lifering:
    '<circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.5" /><path d="M6.1 6.1l3.3 3.3M17.9 6.1l-3.3 3.3M6.1 17.9l3.3-3.3M17.9 17.9l-3.3-3.3" />',
  info: '<circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 8v.01" />',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="1.5" /><path d="M3.5 6.5L12 13l8.5-6.5" />',
  scale: '<path d="M12 3v18M7 8H3l3 6a3 3 0 0 0 4 0l-3-6zM21 8h-4l3 6a3 3 0 0 0 4 0l-3-6z" /><path d="M8 21h8" />',
  megaphone: '<path d="M3 10v4h3l6 4V6L6 10H3z" /><path d="M16 9.5a3 3 0 0 1 0 5" />',
  building:
    '<rect x="5" y="3.5" width="10" height="17" rx="1" /><path d="M15 20.5h4v-8l-4-3" /><path d="M8.5 7.5h.01M11.5 7.5h.01M8.5 11h.01M11.5 11h.01M8.5 14.5h.01M11.5 14.5h.01" />',
  hammer: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5l3 3 5.8-5.8a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5 2.5-2.5z" />',
  store:
    '<path d="M4 9.5l1-4h14l1 4" /><path d="M4 9.5a2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0 2.25 2.25 0 0 0 4.5 0" /><path d="M5.5 11v9h13v-9" />',
  lock: '<rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />',
};

function navIcon(name, small = false, large = false) {
  const size = large ? 24 : small ? 20 : 22;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;
}

function megaMenuItem({ href, icon, titleKey, title, descKey, desc, small = false, large = false }) {
  const isMailto = href.startsWith("mailto:");
  const anchor = `<a href="${href}" class="nav-megamenu-item${small ? " nav-megamenu-side-item" : ""}${large ? " nav-megamenu-item-lg" : ""}">
    <span class="nav-megamenu-icon${small ? " nav-megamenu-icon-sm" : ""}${large ? " nav-megamenu-icon-lg" : ""}">${navIcon(icon, small, large)}</span>
    <span>
      <span class="nav-megamenu-item-title"${titleKey ? ` data-i18n="${titleKey}"` : ""}>${title}</span>
      <span class="nav-megamenu-item-desc"${descKey ? ` data-i18n="${descKey}"` : ""}>${desc}</span>
    </span>
  </a>`;
  // Opt this one mailto out of Cloudflare's email obfuscation, same as the footer Contact link —
  // otherwise it gets rewritten to /cdn-cgi/l/email-protection, which crawlers then flag as a 4XX.
  return isMailto ? `<!--email_off-->${anchor}<!--/email_off-->` : anchor;
}

/** Simple title + chevron row, no icon/description — LimeWire's site-menu pattern, used for the
 *  Resources dropdown (About/Press/Help/Blog-style links) rather than the feature/icon grid. */
function simpleMenuItem({ href, titleKey, title }) {
  const isMailto = href.startsWith("mailto:");
  const anchor = `<a href="${href}" class="nav-simplemenu-item">
    <span class="nav-simplemenu-item-title"${titleKey ? ` data-i18n="${titleKey}"` : ""}>${title}</span>
    <svg class="nav-simplemenu-item-chevron" width="8" height="14" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
  </a>`;
  return isMailto ? `<!--email_off-->${anchor}<!--/email_off-->` : anchor;
}

/** Hover/click dropdown with an icon+title+desc grid — Docracy's NavMegaMenu pattern, static-site version. */
function megaMenu({ triggerKey, triggerLabel, items, panel, columns = 2, simple = false, large = false }) {
  const itemsHtml = simple
    ? items.map((it) => simpleMenuItem(it)).join("\n")
    : items.map((it) => megaMenuItem({ ...it, large })).join("\n");
  const panelHtml = panel
    ? `<div class="nav-megamenu-side">
        <h4 data-i18n="${panel.titleKey}">${panel.title}</h4>
        ${panel.items.map((it) => megaMenuItem({ ...it, small: true })).join("\n")}
        <a href="${panel.footerHref}" class="nav-megamenu-side-footer" data-i18n="${panel.footerKey}">${panel.footerLabel} →</a>
      </div>`
    : "";
  const gridHtml = simple
    ? `<div class="nav-simplemenu-list">${itemsHtml}</div>`
    : `<div class="nav-megamenu-grid" style="grid-template-columns: repeat(${columns}, 1fr)">${itemsHtml}</div>`;
  return `<div class="nav-megamenu header-nav-collapse" data-mega-menu>
    <button type="button" class="nav-megamenu-trigger header-nav-link" aria-haspopup="true" aria-expanded="false" data-mega-trigger>
      <span data-i18n="${triggerKey}">${triggerLabel}</span>
      <svg class="nav-megamenu-chevron" width="10" height="10" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <div class="nav-megamenu-panel${simple ? " nav-megamenu-panel-simple" : ""}" data-mega-panel hidden>
      ${gridHtml}
      ${panelHtml}
    </div>
  </div>`;
}

/** The main products, big-icon grid — LimeWire's "Products" dropdown pattern. Templates only (owner decision
 *  25.11.2026: invoice chasing leaves the public surface; the app and its plans stay). */
const PRODUCTS_ITEMS = [
  { path: "/document-templates/", icon: "store", titleKey: "nav.mega.products.templates.title", title: "Document templates", desc: "1,000+ business and legal templates for US small businesses." },
  { path: "/business-kits/", icon: "duplicate", title: "Business kits", desc: "The documents for one occasion, bundled: starting out, renting, collections." },
  { path: "/payment-reminder", icon: "sparkles", title: "Payment reminder letters", desc: "Reminder, final notice and demand letter templates, free to copy." },
  { path: "/document-templates/?q=invoice", icon: "briefcase", title: "Invoice templates", desc: "Service, commercial, proforma and tax invoice templates." },
  { path: "/tools/template-finder", icon: "bolt", title: "Template finder", desc: "Answer three questions and get the document you need." },
];

const FEATURE_ITEMS = [
  { path: "/document-templates/", icon: "store", title: "Business and legal templates", desc: "Contracts, agreements, letters and forms." },
  { path: "/business-kits/", icon: "duplicate", title: "Business kits", desc: "Several documents for one occasion." },
  { path: "/free-templates/", icon: "duplicate", title: "Free email templates", desc: "Copy-paste payment reminder emails, no account needed." },
  { path: "/#pricing", icon: "sparkles", title: "Fill in with AI", desc: "Pro fills a template with your company and client details." },
];

const COMPARE_ITEMS = [
  { path: "/legalzoom-alternative", icon: "scale", titleKey: "footer.vsLegalzoom", title: "vs LegalZoom", descKey: "nav.mega.compare.legalzoom.desc", desc: "Free templates, no membership." },
  { path: "/rocket-lawyer-alternative", icon: "scale", title: "vs Rocket Lawyer", desc: "Free templates, no subscription to read them." },
];

const USE_CASE_ITEMS = [
  { path: "/document-templates/", icon: "store", titleKey: "nav.mega.useCase.marketplace.title", title: "Document templates", desc: "1,000+ business and legal templates." },
  { path: "/use-cases/freelance-contract-templates", icon: "duplicate", titleKey: "nav.mega.useCase.templates.title", title: "Freelance contract templates", descKey: "nav.mega.useCase.templates.desc", desc: "Free Independent Contractor Agreement, ready to send." },
  { path: "/invoices", icon: "briefcase", titleKey: "nav.mega.useCase.invoices.title", title: "Shareable invoices", desc: "Create an invoice and share the link." },
  { path: "/payment-reminder", icon: "sparkles", title: "Payment reminder letters", desc: "The right letter for how late the invoice is." },
];

const INDUSTRY_ITEMS = [
  { path: "/industry/freelancers", icon: "briefcase", titleKey: "nav.mega.industry.freelancers.title", title: "Freelancers & Consultants", descKey: "nav.mega.industry.freelancers.desc", desc: "Client invoices and repeat-client follow-ups." },
  { path: "/industry/creative-agencies", icon: "megaphone", titleKey: "nav.mega.industry.creative.title", title: "Creative & Marketing Agencies", descKey: "nav.mega.industry.creative.desc", desc: "Retainers, project bills, and scope-change invoices." },
  { path: "/industry/real-estate", icon: "building", titleKey: "nav.mega.industry.realEstate.title", title: "Real Estate & Property", descKey: "nav.mega.industry.realEstate.desc", desc: "Vendor and contractor invoices for property teams." },
  { path: "/industry/construction", icon: "hammer", titleKey: "nav.mega.industry.construction.title", title: "Construction & Trades", descKey: "nav.mega.industry.construction.desc", desc: "Payment chasing for completed job stages." },
  { path: "/industry/small-business", icon: "store", titleKey: "nav.mega.industry.smallBusiness.title", title: "Small Business & Local Services", descKey: "nav.mega.industry.smallBusiness.desc", desc: "Invoice chasing with no dedicated AR staff." },
];

const RESOURCE_ITEMS = [
  { path: "/about", titleKey: "nav.mega.resource.about.title", title: "About" },
  { path: "/press", titleKey: "nav.mega.resource.press.title", title: "Press" },
  { path: "/docs/", titleKey: "nav.mega.resource.docs.title", title: "Help Center" },
  { path: "/blog/", titleKey: "nav.mega.resource.blog.title", title: "Blog" },
];

/** Everything besides Products lives here as a flat LimeWire-style list — one trigger instead
 *  of six, to match the 3-item nav density of the LimeWire reference (Products / Tools / More). */
const MORE_ITEMS = [
  { path: "/app/login?start=1", titleKey: "nav.tryFree", title: "Try free" },
  { path: "/document-templates/", titleKey: "nav.mega.products.templates.title", title: "Document templates" },
  { path: "/business-kits/", title: "Business kits" },
  { path: "/payment-reminder", titleKey: "nav.paymentReminder", title: "Payment reminders" },
  { path: "/free-templates/", titleKey: "nav.freeTemplates", title: "Free email templates" },
  { path: "/#pricing", titleKey: "nav.pricing", title: "Pricing" },
  { path: "/about", titleKey: "nav.mega.resource.about.title", title: "About" },
  { path: "/press", titleKey: "nav.mega.resource.press.title", title: "Press" },
  { path: "/docs/", titleKey: "nav.mega.resource.docs.title", title: "Help Center" },
  { path: "/blog/", titleKey: "nav.mega.resource.blog.title", title: "Blog" },
];

export function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Truthful trust badges for template/document detail pages. Deliberately excludes unverified
 *  claims (customer counts, certifications not actually held) — see conversionSectionHtml() note. */
export function trustBadgesHtml() {
  return `<ul class="trust-badges">
    <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5.5c0 5-3.5 8-7 9.5-3.5-1.5-7-4.5-7-9.5V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg><span>SSL-secured</span></li>
    <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 4l5 5-9.5 9.5H6v-4.5L15 4z"/><path d="M4 20c2-1.2 4-1.2 6 0"/></svg><span>No signup required</span></li>
    <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M8 21h8"/><path d="M5 7h5M14 7h5"/><path d="M2 7l3 6a3 3 0 0 0 6 0L8 7"/><path d="M13 7l3 6a3 3 0 0 0 6 0l-3-6"/></svg><span>Free, always</span></li>
  </ul>`;
}

/** "Why [product]" conversion section for template/document detail pages. Every claim here must
 *  be true today — do not add customer counts, certifications, or testimonials that aren't real.
 *  Placeholders are commented inline for whoever adds real numbers/testimonials later. */
export function conversionSectionHtml() {
  return `<section class="why-docstoc">
    <h2>Why use this instead of a generic template</h2>
    <div class="why-docstoc-grid">
      <div class="why-docstoc-item">
        <h3>Security</h3>
        <p>Served over SSL from Cloudflare's edge network — no ad trackers, no third-party scripts on template pages.</p>
      </div>
      <div class="why-docstoc-item">
        <h3>Legality</h3>
        <p>Templates are drafted for general use, not a substitute for legal advice — check the note on each page for specifics.</p>
      </div>
      <div class="why-docstoc-item">
        <h3>Privacy</h3>
        <p>No account or signup needed to copy a template — nothing you type here is stored unless you choose to sign up.</p>
      </div>
      <div class="why-docstoc-item">
        <h3>Speed</h3>
        <p>Copy the subject and body directly — no form to fill in, no export step, no waiting on a download link.</p>
      </div>
      <div class="why-docstoc-item">
        <h3>Mobile-friendly</h3>
        <p>Every template page works the same on a phone as a desktop — copy on the go, no app required.</p>
      </div>
      <div class="why-docstoc-item">
        <h3>API available</h3>
        <p>Building your own tool? docstoc's <a href="/docs/">API</a> serves the templates directly.</p>
      </div>
    </div>
  </section>`;
  // TODO(real data): once there are real customer counts / a security cert / actual testimonials,
  // add a <ul class="trust-badges"> entry or a <section class="testimonials"> here — do not
  // fabricate placeholder numbers or quotes in the meantime.
}

/** Docracy-style seo-* campaign slug from a canonical path — ported verbatim from
 *  public/analytics.js's client-side seoCampaignFromPath() so build-time tagging and the
 *  runtime fallback agree on exactly which pages count and what slug they produce. */
export function seoCampaignFromPath(path) {
  const p = (path || "/").replace(/\/+$/, "") || "/";
  if (p === "/") return null;
  const segs = p.split("/").filter(Boolean);
  const last = segs[segs.length - 1] || "";
  if (p.indexOf("/document-templates/") === 0 && segs.length >= 2 && last !== "document-templates") {
    return "seo-" + last.replace(/-template$/, "");
  }
  if (p.indexOf("/blog/") === 0 && segs.length >= 2) return "seo-blog-" + last;
  if (p.indexOf("/free-templates/") === 0 && segs.length >= 2) return "seo-" + last.replace(/\.html$/, "");
  if (p.indexOf("/guides/") === 0 && segs.length >= 2) return "seo-" + last;
  if (p.indexOf("/tools/") === 0 && segs.length >= 2) return "seo-tool-" + last.replace(/\.html$/, "");
  if (p.indexOf("/compare/") === 0 && segs.length >= 2) return "seo-compare-" + last;
  if (p.indexOf("/industry/") === 0 && segs.length >= 2) return "seo-industry-" + last;
  if (p.indexOf("/import-from-") === 0) return "seo-" + last;
  if (/-alternative$/.test(last)) return "seo-" + last;
  if (p.indexOf("/use-cases/") === 0 && segs.length >= 2) return "seo-" + last;
  if (p.indexOf("/features/") === 0 && segs.length >= 2) return "seo-" + last;
  return null;
}

/** Bakes utm_source=seo-{tag} onto every /app link in the rendered page at BUILD time, instead
 *  of relying solely on analytics.js to inject it at click time — so the tag survives even for
 *  a visitor who never runs JS (crawlers, some in-app browsers) and doesn't depend on the CTA
 *  still being on the page by the time the script wires up. analytics.js's decorate() explicitly
 *  no-ops when utm_source is already present, so this and the runtime fallback don't conflict. */
export function decorateAppLinksWithSeoTag(html, tag) {
  if (!tag) return html;
  // Matches both the absolute form ("/app/login...", depth 0) and the relative form nested
  // pages use via chrome()'s link() helper ("../app/...", "../../app/...", depth > 0). Either
  // way "app" must be followed by "/", "?", or the closing quote — not just any string starting
  // with those three letters (e.g. "/apple-touch-icon.png", which a plain /app prefix would
  // wrongly match and get an unrelated utm_source stamped onto a <link> favicon href).
  return html.replace(/href="(\/app(?:[/?][^"]*)?|(?:\.\.\/)+app(?:[/?][^"]*)?)"/g, (match, href) => {
    if (/[?&]utm_source=/.test(href)) return match;
    const sep = href.includes("?") ? "&" : "?";
    return `href="${href}${sep}utm_source=${tag}"`;
  });
}

export function chrome({ title, description, canonical, activeNav = "", mainHtml, jsonLd, depth = 0, extraHead = "", lang = "en", fullBleedMain = false, mainClass = "" }) {
  const prefix = depth > 0 ? "../".repeat(depth) : "";
  const root = depth > 0 ? "../".repeat(depth).slice(0, -1) || "." : "";
  const base = depth === 0 ? "" : "../".repeat(depth).replace(/\/$/, "") || ".";

  const pathPrefix = depth > 0 ? "../".repeat(depth) : "/";
  const link = (p) => (depth > 0 ? `${pathPrefix}${p.replace(/^\//, "")}` : p);
  // Prefer path-only canonicals; if a full URL is passed (legacy generators), force SITE_URL host.
  const canonicalUrl = (() => {
    if (!canonical.startsWith("http")) return `${SITE_URL}${canonical}`;
    try {
      const u = new URL(canonical);
      if (u.hostname === "api.docstoc.io") return canonical;
      return `${SITE_URL}${u.pathname}${u.search}${u.hash}` || SITE_URL;
    } catch {
      return `${SITE_URL}${canonical}`;
    }
  })();
  // Generators often pass full SITE_URL/... URLs — hreflang maps are path-keyed.
  const canonicalPath = (() => {
    try {
      if (canonical.startsWith("http")) return new URL(canonical).pathname.replace(/\/$/, "") || "/";
    } catch {
      /* ignore */
    }
    const p = canonical.startsWith("/") ? canonical : `/${canonical}`;
    return p === "/" ? "/" : p.replace(/\/$/, "") || "/";
  })();
  const lookupPath = EN_TO_ES[canonicalPath]
    ? canonicalPath
    : ES_TO_EN[canonicalPath]
      ? canonicalPath
      : EN_TO_ES[`${canonicalPath}/`]
        ? `${canonicalPath}/`
        : ES_TO_EN[`${canonicalPath}/`]
          ? `${canonicalPath}/`
          : canonicalPath;
  const defaultJsonLd = JSON.stringify(ORG_JSON_LD, null, 2);
  const seoHead = renderSeoHead({ link });

  // Only pages with a REAL generated counterpart (see es-alternates.mjs) get hreflang tags —
  // claiming an alternate that doesn't exist would send crawlers into a 404.
  const enPath = EN_TO_ES[lookupPath] ? lookupPath : ES_TO_EN[lookupPath];
  const esPath = EN_TO_ES[lookupPath] || lookupPath;
  const hasAlternate = Boolean(EN_TO_ES[lookupPath] || ES_TO_EN[lookupPath]);
  const hreflangHead = hasAlternate
    ? `<link rel="alternate" hreflang="en" href="${SITE_URL}${enPath}">
<link rel="alternate" hreflang="es" href="${SITE_URL}${esPath}">
<link rel="alternate" hreflang="x-default" href="${SITE_URL}${enPath}">`
    : "";
  const localeSwitchAttrs = hasAlternate
    ? lang === "es"
      ? ` data-en-href="${enPath}"`
      : ` data-es-href="${esPath}"`
    : "";

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${canonicalUrl}">
${hreflangHead}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_BRAND}">
<meta property="og:locale" content="${lang === "es" ? "es_ES" : "en_US"}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:image" content="${SITE_URL}/brand/og/docstoc-og-1200x630.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="${TWITTER_SITE}">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${SITE_URL}/brand/og/docstoc-og-1200x630.png">
${seoHead}
${extraHead}
${jsonLd ? `<script type="application/ld+json">\n${jsonLd}\n</script>` : `<script type="application/ld+json">\n${defaultJsonLd}\n</script>`}
${faviconHead(link)}
<link rel="preload" href="${link("/fonts/inter-400.woff2")}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${link("/fonts/inter-700.woff2")}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${link(`/site.css?v=${ASSET_V}`)}">
</head>
<body>
<header class="site-header">
  <div class="wrap site-header-inner">
    <div class="logo-group">
      <a href="${link("/")}" class="logo" aria-label="${SITE_BRAND} home"><img class="logo-mark" src="${link("/brand/docstoc-icon.png")}" alt="" width="28" height="28" /><span class="logo-word">${SITE_BRAND}</span></a>
    </div>
    <nav class="header-nav-right">
      <div class="header-nav-links">
        ${megaMenu({
          triggerKey: "nav.products",
          triggerLabel: "Products",
          items: PRODUCTS_ITEMS.map((it) => ({ ...it, href: link(it.path) })),
          columns: 2,
          large: true,
        })}
        <a href="${link("/document-templates/")}" class="header-nav-link header-nav-collapse" data-i18n="nav.templates">Templates</a>
        ${megaMenu({
          triggerKey: "nav.more",
          triggerLabel: "More",
          items: MORE_ITEMS.map((it) => ({ ...it, href: link(it.path) })),
          simple: true,
        })}
      </div>
      <div class="header-nav-actions">
        <div class="locale-switch" data-locale-switch role="group" data-i18n-aria="nav.language"${localeSwitchAttrs}></div>
        <!--email_off-->
        <a href="mailto:sales@docstoc.io" class="header-nav-sales header-nav-collapse" data-sales-mail data-sales-subject="docstoc sales" data-i18n="nav.contactSales">Contact sales</a>
        <!--/email_off-->
        <a href="${link("/app/")}login?start=1" class="nav-cta" data-i18n="nav.tryFree">Try free</a>
        <a href="${link("/app/login")}" class="header-login-btn header-nav-collapse" data-i18n="nav.signIn">Sign in</a>
        <button class="header-menu-toggle" type="button" aria-label="Open menu" aria-expanded="false" data-menu-toggle data-i18n-aria="nav.openMenu">
          <span></span><span></span><span></span>
        </button>
      </div>
    </nav>
    <button type="button" class="header-revival-badge header-nav-collapse" data-open-revival-video aria-label="Watch: docstoc is back">
      <span class="header-revival-badge-thumb" aria-hidden="true"></span>
      <span class="header-revival-badge-text">
        <span class="header-revival-badge-title" data-i18n="nav.revivalBadge">docstoc is back</span>
        <span class="header-revival-badge-sub">business documents, back again: watch the story</span>
      </span>
      <span class="header-revival-badge-play" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
      </span>
    </button>
  </div>
</header>
<div class="mobile-panel-backdrop" data-mobile-backdrop></div>
<div class="mobile-panel" data-mobile-panel>
  <button class="mobile-panel-close" type="button" aria-label="Close menu" data-mobile-close data-i18n-aria="nav.closeMenu">✕</button>
  <nav class="mobile-panel-nav">
      <a href="${link("/document-templates/")}" class="mobile-panel-nav-link" data-i18n="nav.templates">Document templates</a>
      <a href="${link("/business-kits/")}" class="mobile-panel-nav-link">Business kits</a>
      <a href="${link("/payment-reminder")}" class="mobile-panel-nav-link" data-i18n="nav.paymentReminder">Payment reminders</a>
      <a href="${link("/#pricing")}" class="mobile-panel-nav-link" data-i18n="nav.pricing">Pricing</a>
      <a href="${link("/blog/")}" class="mobile-panel-nav-link" data-i18n="nav.blog">Blog</a>
      <a href="${link("/about")}" class="mobile-panel-nav-link" data-i18n="nav.about">About</a>
      <a href="${link("/app/login")}" class="mobile-panel-nav-link" data-i18n="nav.signIn">Sign in</a>
      <a href="${link("/app/")}login?start=1" class="mobile-panel-nav-link" data-i18n="nav.tryFree">Try free</a>
  </nav>
  <div class="mobile-panel-ctas">
    <a href="${link("/app/")}login?start=1" class="mobile-panel-cta-primary" data-i18n="nav.tryFree">Try free</a>
    <a href="${link("/app/login")}" class="mobile-panel-cta-secondary" data-i18n="nav.signIn">Sign in</a>
    <!--email_off-->
    <a href="mailto:sales@docstoc.io" class="mobile-panel-cta-secondary" data-sales-mail data-sales-subject="docstoc sales" data-i18n="nav.contactSales">Contact sales</a>
    <!--/email_off-->
  </div>
</div>
<main class="${fullBleedMain ? "tool-sell-main" : mainClass || "wrap page-main"}">
${mainHtml.replace(/<(\/?)main\b/g, "<$1div")}
</main>
<footer class="site-footer">
  <div class="wrap site-footer-inner">
    <div class="site-footer-brand">
      <a href="${link("/")}" class="logo" aria-label="${SITE_BRAND} home"><img class="logo-mark" src="${link("/brand/docstoc-icon.png")}" alt="" width="24" height="24" /><span class="logo-word">${SITE_BRAND}</span></a>
      <p>Business document templates for US small businesses: find the document, fill it in, download it.</p>
    </div>
    <div class="site-footer-col">
      <h4 data-i18n="footer.product">Product</h4>
      <a href="${link("/")}" data-i18n="footer.home">Homepage</a>
      <a href="${link("/app/login?start=1")}" data-i18n="footer.tryFree">Try free</a>
      <a href="${link("/#pricing")}" data-i18n="footer.pricing">Pricing</a>
      <a href="${link("/document-templates/")}">Document templates</a>
      <a href="${link("/business-kits/")}">Business kits</a>
      <a href="${link("/tools/template-finder")}">Template finder</a>
      <a href="${link("/document-templates/?q=invoice")}">Invoice templates</a>
      <a href="${link("/blog/")}" data-i18n="footer.blog">Blog</a>
      <a href="${link("/docs/")}" data-i18n="footer.docs">API & Docs</a>
    </div>
    <div class="site-footer-col">
      <h4>Documents by occasion</h4>
      <a href="${link("/document-templates/category/business")}">Starting a business</a>
      <a href="${link("/document-templates/category/hr")}">Hiring and employees</a>
      <a href="${link("/document-templates/category/finance")}">Clients and invoices</a>
      <a href="${link("/document-templates/category/real-estate")}">Renting and property</a>
      <a href="${link("/document-templates/category/legal")}">Legal letters and notices</a>
      <a href="${link("/payment-reminder")}">Payment reminders</a>
      <a href="${link("/free-templates/")}">Free email templates</a>
    </div>
    <div class="site-footer-col">
      <h4 data-i18n="footer.compareCol">Compare</h4>
      <a href="${link("/legalzoom-alternative")}">vs LegalZoom</a>
      <a href="${link("/rocket-lawyer-alternative")}">vs Rocket Lawyer</a>
    </div>
    <div class="site-footer-col">
      <h4 data-i18n="footer.company">Company</h4>
      <a href="${link("/about")}" data-i18n="footer.about">About</a>
      <a href="${link("/docstoc-alternative")}">Docstoc history</a>
      <a href="${link("/press")}" data-i18n="footer.press">Press</a>
      <a href="${link("/imprint")}" data-i18n="footer.imprint">Imprint</a>
      <!--email_off--><a href="mailto:founder@docstoc.io" data-i18n="footer.contact">Contact</a><!--/email_off-->
    </div>
    <div class="site-footer-col">
      <h4 data-i18n="footer.legal">Legal</h4>
      <a href="${link("/privacy")}" data-i18n="footer.privacy">Privacy</a>
      <a href="${link("/terms")}" data-i18n="footer.terms">Terms</a>
      <a href="${link("/sitemap.xml")}" data-i18n="footer.sitemap">Sitemap</a>
      <a href="${link("/blog/feed.xml")}" data-i18n="footer.rss">RSS</a>
    </div>
  </div>
  <div class="site-footer-bottom" data-i18n-year="footer.copyright">© ${new Date().getFullYear()} docstoc — a product of RELACON GmbH</div>
</footer>
<div class="how-modal-backdrop" id="revival-modal" hidden>
  <div class="how-modal" role="dialog" aria-modal="true" aria-labelledby="revival-modal-title">
    <h2 id="revival-modal-title" class="sr-only" data-i18n="nav.revivalBadge">docstoc is back</h2>
    <button type="button" class="how-modal-close" data-close-revival-video aria-label="Close video">×</button>
    <video
      id="revival-modal-video"
      class="how-modal-video"
      src="${link(`/videos/docstoc-is-back.webm?v=${ASSET_V}`)}"
      poster="${link(`/videos/docstoc-is-back-poster.jpg?v=${ASSET_V}`)}"
      controls
      playsinline
      preload="metadata"
    >
      <track kind="captions" src="${link(`/videos/docstoc-is-back.en.vtt?v=${ASSET_V}`)}" srclang="en" label="English" default>
      <track kind="captions" src="${link(`/videos/docstoc-is-back.es.vtt?v=${ASSET_V}`)}" srclang="es" label="Español">
    </video>
  </div>
</div>
<script src="${link(`/site-lang.js?v=${ASSET_V}`)}" defer></script>
<script src="${link(`/site-nav.js?v=${ASSET_V}`)}" defer></script>
<script src="${link(`/cookie-consent.js?v=${ASSET_V}`)}" defer></script>
<script src="${link(`/analytics.js?v=${ASSET_V}`)}" defer></script>
<script>
/* Contact sales → docstoc Assistant (Docracy pattern). */
(function () {
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest
      ? e.target.closest("[data-sales-mail], .header-nav-sales, a[data-i18n='nav.contactSales'], a[data-i18n='home.pricing.contactSales']")
      : null;
    if (!el) return;
    var api = window.docstocAssistant || window.chasaAssistant;
    if (api && typeof api.open === "function") {
      e.preventDefault();
      api.open({ intent: "sales" });
      return;
    }
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("docstoc:open-chat", { detail: { intent: "sales" } }));
    window.dispatchEvent(new CustomEvent("chasa:open-chat", { detail: { intent: "sales" } }));
  }, true);
})();
</script>
</body>
</html>`;

  return decorateAppLinksWithSeoTag(html, seoCampaignFromPath(canonicalPath));
}
