/** Pure HTML passes run by generate-seo.mjs over every generated page. */

const SITE_SUFFIX = /\s+(?:\||—)\s+docstoc(?: Blog)?$/;
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 160;

/** Search results cut long titles anyway: the brand suffix goes first, then a leading "Free ",
 *  which the template pages repeat in their text. Anything left needs its own wording below. */
export function fitTitle(html) {
  return html.replace(/<title>([^<]*)<\/title>/i, (full, title) => {
    let next = title;
    if (next.length > TITLE_MAX) next = next.replace(SITE_SUFFIX, "");
    if (next.length > TITLE_MAX) next = next.replace(/^Free /, "");
    return next === title ? full : `<title>${next}</title>`;
  });
}

/** Hand-written short titles for pages whose generated one does not fit, by URL path. */
export const SHORT_TITLES = {
  "/": "docstoc: Templates, Invoices, SSL & AI Collections",
  "/es/": "docstoc: plantillas, facturas, SSL y cobros con IA",
  "/about": "About docstoc: The Trust Automation Layer",
  "/polite-payment-reminder-email": "Polite Payment Reminder Email: Free Template",
  "/marketplace": "Document Template Marketplace: 1,000+ Free Templates",
  "/unpaid-invoice-follow-up-templates": "Unpaid Invoice Follow-Up: 12 Free Email Templates",
  "/switch-to-docstoc": "Switch to docstoc: Migration Guide",
  "/docstoc-alternative": "docstoc is Back: Free Business & Legal Templates",
  "/chase-invoices": "Chase Invoices: Free Reminder Templates & AI Drafts",
  "/payment-reminder": "Payment Reminder Email: 28 Free Templates",
  "/freetemplates": "Free Business, Legal & Invoice Document Templates",
  "/invoice-follow-up": "Invoice Follow-Up Email: Free Templates & AI Drafts",
  "/ssl/features/": "SSL Features: Certificates, Monitoring & API",
  "/tools/": "Free Tools: Templates, Hash, SSL, Invoice Generator",
  "/tools/trust-badges": "Corporate Identity & Trust Badges: Lookup & Embed",
  "/tools/invoice-generator": "Free Invoice Generator: Create Shareable Invoices",
  "/blog/": "docstoc Blog: Templates, SSL, Certificates & Invoices",
  "/blog/free-business-legal-document-templates/": "Free Business & Legal Document Templates, No Signup",
  "/blog/freelancer-invoicing-mistakes-that-delay-payment/": "Freelancer Invoicing Mistakes That Delay Payment",
  "/blog/ssl-certificate-authorities-market-share/": "SSL Certificate Authorities: Who Issues the Padlock?",
  "/blog/document-certificates-tamper-evident-verification/": "Document Certificates: Proving a File Is Unchanged",
  "/blog/how-to-set-up-a-payment-plan-with-a-client-who-cant-pay-in-full/": "How to Set Up a Payment Plan With a Client",
  "/blog/how-freelancers-can-avoid-scope-creep-and-late-payment-together/": "How Freelancers Avoid Scope Creep and Late Payment",
  "/blog/net-30-vs-net-60-payment-terms-for-freelancers/": "Net 30 vs Net 60 Payment Terms for Freelancers",
  "/blog/ssl-tls-certificate-lifetime-shortening/": "47-Day SSL Certificates: The Lifetime Schedule",
  "/blog/free-ssl-automation-lets-encrypt-domain/": "Free SSL for Your Domain With Let's Encrypt",
  "/blog/how-to-write-a-late-payment-email-that-gets-a-response/": "How to Write a Late Payment Email That Gets a Reply",
  "/business-kits/collections-and-lending-kit": "Collections & Lending Kit: Free Letter & Note Templates",
  "/business-kits/independent-landlord-kit": "Independent Landlord Kit: Free Lease Templates",
  "/business-kits/us-small-business-starter-kit": "US Small Business Starter Kit: Free LLC & NDA Templates",
  "/use-cases/": "docstoc Use Cases: Templates, Invoices & SSL",
  "/document-templates/qualified-exchange-accommodation-agreement-template": "1031 Qualified Exchange Accommodation Agreement Template",
  "/document-templates/compromise-agreement-minor-personal-injury-template": "Compromise Agreement: Minor's Injury Claim Template",
  "/document-templates/conditional-waiver-and-release-template": "Conditional Waiver and Release Template (Progress Pay)",
  "/document-templates/unconditional-waiver-and-release-final-payment-template": "Unconditional Waiver and Release Template (Final Pay)",
  "/document-templates/commercial-tenant-improvement-construction-contract-template": "Commercial Tenant Improvement Contract Template",
  "/document-templates/statement-of-qualifications-template": "Statement of Qualifications (SOQ) Template",
  "/document-templates/co-manufacturing-sales-distribution-agreement-template": "Co-Manufacturing Sales & Distribution Agreement Template",
  "/document-templates/authorization-temporary-guardianship-minor-template": "Temporary Guardianship of a Minor Authorization Template",
  "/document-templates/oem-agreement-template": "OEM (Original Equipment Manufacturer) Agreement Template",
};

export function applyShortTitle(html, urlPath) {
  const short = SHORT_TITLES[urlPath];
  if (!short) return html;
  const safe = short.replace(/&/g, "&amp;");
  return html.replace(/<title>[^<]*<\/title>/i, () => `<title>${safe}</title>`);
}

/** Extra text for thin pages. Idempotent: replaces its own block on a rebuild. */
export function applyExtraSections(html, extra, esc, faqHeading = "FAQ") {
  const block = [
    ...extra.sections.map((s) =>
      `<section class="wrap alt-body"><h2>${esc(s.h2)}</h2>${(s.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join("")}${
        s.bullets?.length ? `<ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>` : ""
      }</section>`
    ),
    `<section class="wrap alt-body"><h2>${esc(faqHeading)}</h2>${extra.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}</section>`,
  ].join("\n");
  const marked = `<!-- extra-copy -->${block}<!-- /extra-copy -->`;
  const clean = html.replace(/<!-- extra-copy -->[\s\S]*?<!-- \/extra-copy -->/, "");
  const end = clean.lastIndexOf("</main>");
  return end < 0 ? clean : `${clean.slice(0, end)}${marked}${clean.slice(end)}`;
}

/** Cuts at the last sentence end that fits, otherwise the last word. Only the search snippet:
 *  og:description keeps the full text. */
export function fitDescription(html) {
  return html.replace(/(<meta\s+name="description"\s+content=")([^"]*)(")/i, (full, open, text, close) => {
    if (text.length <= DESCRIPTION_MAX) return full;
    const head = text.slice(0, DESCRIPTION_MAX);
    const sentence = head.lastIndexOf(". ");
    const cut = sentence >= 80 ? head.slice(0, sentence + 1) : head.slice(0, head.lastIndexOf(" ")).replace(/[\s,;:—–-]+$/, "");
    return `${open}${cut}${close}`;
  });
}

/** Points internal links straight at a page's canonical URL, so link equity does not depend on
 *  a page that is left out of the sitemap. `canonicalByPath` holds only paths that differ. */
export function rewriteCanonicalLinks(html, canonicalByPath) {
  return html.replace(/href="(?:https:\/\/docstoc\.io)?(\/[^"#?]*)"/g, (full, path) => {
    const target = canonicalByPath.get(path);
    return target ? `href="${target}"` : full;
  });
}

/** `git log --format=@%cs --name-only` output, newest first → path to last commit date. */
export function parseGitLastmods(log) {
  const dates = new Map();
  let date = null;
  for (const line of log.split("\n")) {
    if (line.startsWith("@")) date = line.slice(1).trim();
    else if (line.trim() && date && !dates.has(line.trim())) dates.set(line.trim(), date);
  }
  return dates;
}
