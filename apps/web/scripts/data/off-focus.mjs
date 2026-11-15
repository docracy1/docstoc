/**
 * Pages outside the template library (owner decision 15.11.2026: docstoc becomes a business document template
 * library for US small businesses). SSL and certificates, SOX/SOC compliance, e-signature and the competitor
 * comparison pages stay online and reachable by link, but carry `noindex, follow` and leave the sitemap. Reversible:
 * a page that should rank again only needs to leave this rule. Search Console, 30 days to 13.11.2026: 307 clicks, of
 * them invoice tool 2, SSL 1, compliance 0; almost all from the home page and /document-templates.
 */

/** Whole groups by path prefix. */
const PREFIXES = [
  "/docstoc-vs-",
  "/import-from-",
  "/switch-from-",
  "/switch-to-",
  "/ssl",
  "/tls",
  "/tsl",
  "/monitoring",
  "/compliance",
  "/solutions/",
  "/es/solutions/",
  "/es/compliance",
];

/** Single pages, in English and, where a Spanish copy exists, under /es/. */
const PAGES = [
  "/certificate",
  "/trust-badges",
  "/accounts-receivable-sox",
  "/tools/trust-badges",
  "/tools/ssl-certificate-calculator",
  "/tools/file-hash-checker",
  "/use-cases/audit-ready-workflows",
  "/use-cases/auditor-evidence-pack",
  "/use-cases/compliance-dashboard",
  "/use-cases/docstoc-certificate-monitoring",
  "/use-cases/document-signing-api",
  "/use-cases/flat-fee-esign",
  "/use-cases/free-ssl-for-your-domain",
  "/use-cases/icfr-accounts-receivable",
  "/use-cases/maker-checker-invoice-chase",
  "/use-cases/risk-scoring-automation",
  "/use-cases/segregation-of-duties-collections",
  "/use-cases/sox-reporting",
  "/blog/acme-protocol-certificate-automation/",
  "/blog/certificate-authority-types-pros-cons/",
  "/blog/document-certificates-tamper-evident-verification/",
  "/blog/free-ssl-automation-lets-encrypt-domain/",
  "/blog/ssl-certificate-authorities-market-share/",
  "/blog/ssl-certificate-providers-compared/",
  "/blog/ssl-tls-certificate-lifetime-shortening/",
  "/blog/types-of-ssl-certificates/",
  "/blog/types-of-tls-certificates/",
  "/blog/invoice-chase-software-comparison/",
];

/** Comparison pages that belong to the library: the docstoc history page and the two template competitors. */
const KEEP = new Set(["/docstoc-alternative", "/legalzoom-alternative", "/rocket-lawyer-alternative"]);

const PAGE_SET = new Set([...PAGES, ...PAGES.map((p) => `/es${p}`)]);

/** True for a URL path (as htmlPathToUrl writes it) outside the template library. */
export function isOffFocus(urlPath) {
  const path = urlPath.split(/[?#]/)[0];
  if (PAGE_SET.has(path) || PAGE_SET.has(path.replace(/\/$/, "")) || PAGE_SET.has(`${path}/`)) return true;
  const bare = path.startsWith("/es/") ? path.slice(3) : path;
  if (KEEP.has(bare)) return false;
  if (/^\/[a-z0-9-]+-alternative$/.test(bare)) return true;
  return PREFIXES.some((p) => path.startsWith(p) || bare.startsWith(p));
}
