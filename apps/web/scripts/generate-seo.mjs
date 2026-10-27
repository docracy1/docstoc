#!/usr/bin/env node
/**
 * Generates sitemap.xml, robots.txt, blog RSS, IndexNow key file.
 * Patches index.html + ai.html with verification meta when env vars are set.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  INDEXNOW_KEY,
  SITE_URL,
  SITEMAP_ROUTES,
  SITEMAP_EXCLUDE_PATHS,
  HOME_PAGE_TITLE,
  HOME_PAGE_DESCRIPTION,
  HIGH_PRIORITY_DOC_TEMPLATE_SLUGS,
} from "./data/seo-config.mjs";
import { renderSeoHead } from "./lib/seo-head.mjs";
import { en as marketingEn } from "./data/marketing-i18n.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../public");
const blogPostsPath = join(__dirname, "data/blog-posts.json");
const today = new Date().toISOString().slice(0, 10);

function walkHtml(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkHtml(p, out);
    else if (name.endsWith(".html") && name !== "404.html") out.push(p);
  }
  return out;
}

function htmlPathToUrl(filePath) {
  const rel = relative(publicDir, filePath).replace(/\\/g, "/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return `/${rel.slice(0, -"/index.html".length)}/`;
  return `/${rel.replace(/\.html$/, "")}`;
}

function mtime(filePath) {
  return statSync(filePath).mtime.toISOString().slice(0, 10);
}

function shouldExcludeFromSitemap(urlPath) {
  if (urlPath.startsWith("/import-from-")) return true;
  if (SITEMAP_EXCLUDE_PATHS.has(urlPath)) return true;
  if (urlPath.startsWith("/compliance/soc") || urlPath === "/compliance/iso27001") return true;
  return false;
}

/** Static file Cloudflare Pages serves for a URL path, or null (SPA route, function, unknown). */
function fileForUrlPath(urlPath) {
  const candidates = urlPath.endsWith("/")
    ? [`${urlPath}index.html`]
    : [`${urlPath}.html`, `${urlPath}/index.html`];
  for (const c of candidates) {
    const p = join(publicDir, c);
    try {
      if (statSync(p).isFile()) return p;
    } catch {
      /* not there */
    }
  }
  return null;
}

/** Why a built page must stay out of the sitemap, or null. Search Console flags every sitemap URL
 *  that is noindex ("Excluded by noindex"), points its canonical elsewhere ("Alternate page with
 *  proper canonical tag", e.g. /docstoc-vs-x → /x-alternative) or redirects (a slashless path
 *  served from dir/index.html gets a 308 to the slashed form). */
function sitemapRejection(urlPath, file) {
  if (!file) return null;
  if (!urlPath.endsWith("/") && file.endsWith("/index.html")) {
    return `redirects to ${urlPath}/`;
  }
  const html = readFileSync(file, "utf8");
  const robots = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? "";
  if (/noindex/i.test(robots)) return "noindex";
  const canonical = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i)?.[1];
  if (canonical) {
    const canonicalPath = canonical.replace(/^https?:\/\/[^/]+/, "") || "/";
    if (canonicalPath !== urlPath) return `canonical is ${canonicalPath}`;
  }
  return null;
}

const rejected = [];

function keepInSitemap(urlPath, file) {
  const why = sitemapRejection(urlPath, file);
  if (why) rejected.push(`${urlPath} (${why})`);
  return !why;
}

function buildSitemapUrls() {
  const byPath = new Map();

  for (const route of SITEMAP_ROUTES) {
    if (shouldExcludeFromSitemap(route.path)) continue;
    if (!keepInSitemap(route.path, fileForUrlPath(route.path))) continue;
    byPath.set(route.path, {
      loc: `${SITE_URL}${route.path}`,
      lastmod: today,
      changefreq: route.changefreq,
      priority: route.priority,
    });
  }

  for (const file of walkHtml(publicDir)) {
    const urlPath = htmlPathToUrl(file);
    // The app shell is noindex (login + SPA); it has no place in the sitemap.
    if (urlPath.startsWith("/app/")) continue;
    if (urlPath === "/blog/post") continue;
    if (urlPath.startsWith("/blog/_shot-fixtures")) continue;
    if (shouldExcludeFromSitemap(urlPath)) continue;
    if (!keepInSitemap(urlPath, file)) continue;
    if (byPath.has(urlPath)) {
      byPath.get(urlPath).lastmod = mtime(file);
      continue;
    }
    const isBlog = urlPath.startsWith("/blog/");
    const isFreeTpl = urlPath.startsWith("/free-templates/");
    const isDocTpl = urlPath.startsWith("/document-templates/");
    const isKit = urlPath.startsWith("/business-kits/");
    const isImportFrom = urlPath.startsWith("/import-from-");
    const isAlternative = urlPath.endsWith("-alternative");
    const docSlug = isDocTpl && urlPath !== "/document-templates/"
      ? urlPath.slice("/document-templates/".length).replace(/\/$/, "")
      : "";
    let priority = 0.6;
    if (isBlog) priority = 0.72;
    else if (isFreeTpl) priority = 0.82;
    else if (isDocTpl) priority = HIGH_PRIORITY_DOC_TEMPLATE_SLUGS.has(docSlug) ? 0.72 : 0.58;
    else if (isKit) priority = 0.58;
    else if (isImportFrom) priority = 0.4;
    else if (isAlternative) priority = 0.5;
    byPath.set(urlPath, {
      loc: `${SITE_URL}${urlPath}`,
      lastmod: mtime(file),
      changefreq: "monthly",
      priority,
    });
  }

  return [...byPath.values()].sort((a, b) => a.loc.localeCompare(b.loc));
}

function writeSitemap(urls) {
  const body = urls
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority.toFixed(2)}</priority>
  </url>`
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
  writeFileSync(join(publicDir, "sitemap.xml"), xml, "utf8");
  console.log(`Wrote sitemap.xml (${urls.length} URLs, ${new Set(rejected).size} left out)`);
  for (const line of [...new Set(rejected)].sort()) console.log(`  sitemap skip: ${line}`);
}

function writeRobots() {
  // Deliberately NOT an allowlist (no "Allow:" lines): a robots.txt built only from narrow
  // "Allow: /specific-path$" rules reads, to Bing's crawler at least, as "only these paths are
  // cleared to crawl" — everything else (compliance/, use-cases/, industry/, docstoc-vs-*, security,
  // es/*, ...) got flagged as "Blocked by robots.txt" in Bing Webmaster Tools even though none of
  // it was ever explicitly disallowed. Per spec a path with no matching rule is allowed by
  // default, so the fix is to only list what's genuinely private and let everything else fall
  // through to that default instead of trying to enumerate every public path.
  const txt = `User-agent: *
Disallow: /app/account
Disallow: /app/admin
Disallow: /app/team
Disallow: /app/connector
Disallow: /app/branding
Disallow: /app/webhooks

# LLM / agent context (chasa)
# https://docstoc.io/llms.txt
# https://docstoc.io/llms-full.txt
# https://docstoc.io/ai.txt

Sitemap: ${SITE_URL}/sitemap.xml
`;
  writeFileSync(join(publicDir, "robots.txt"), txt, "utf8");
  console.log("Wrote robots.txt");
}

function escapeXml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function writeBlogFeed() {
  let posts = [];
  try {
    posts = JSON.parse(readFileSync(blogPostsPath, "utf8"));
  } catch {
    console.warn("No blog-posts.json — skipping RSS feed");
    return;
  }
  const items = posts
    .map(
      (p) => `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${SITE_URL}/blog/${escapeXml(p.slug)}/</link>
      <guid isPermaLink="true">${SITE_URL}/blog/${escapeXml(p.slug)}/</guid>
      <description>${escapeXml(p.description || "")}</description>
      ${p.publishedAt ? `<pubDate>${new Date(p.publishedAt).toUTCString()}</pubDate>` : ""}
    </item>`
    )
    .join("\n");
  // Deterministic: max post pubDate (not wall-clock), so rebuilds stay git-clean.
  const latestMs = posts.reduce((max, p) => {
    if (!p.publishedAt) return max;
    const t = new Date(`${p.publishedAt}T12:00:00Z`).getTime();
    return Number.isFinite(t) && t > max ? t : max;
  }, 0);
  const lastBuildDate = new Date(latestMs || Date.parse("2026-01-01T00:00:00Z")).toUTCString();
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>docstoc Blog</title>
    <link>${SITE_URL}/blog/</link>
    <description>Invoice follow-up, payment reminders, and freelancer cash flow.</description>
    <language>en</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  writeFileSync(join(publicDir, "blog/feed.xml"), rss, "utf8");
  console.log(`Wrote blog/feed.xml (${posts.length} items)`);
}

function writeIndexNowKey() {
  writeFileSync(join(publicDir, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY, "utf8");
  console.log(`Wrote ${INDEXNOW_KEY}.txt (IndexNow)`);
}

function stripInjectedSeoHead(html) {
  return html
    .replace(/\n?<link rel="alternate" type="application\/rss\+xml"[^>]*>/gi, "")
    .replace(/\n?<link rel="me" href="https:\/\/(www\.linkedin\.com\/company\/(?:docstoc-io|docstochq|chasa-io)|x\.com\/(?:docstocHQ|DocstocHQ|chasaHQ)|www\.facebook\.com\/profile\.php\?id=(?:61593805566159|61593311134413))"[^>]*>/gi, "")
    .replace(/\n?<meta name="google-site-verification"[^>]*>/gi, "")
    .replace(/\n?<meta name="msvalidate\.01"[^>]*>/gi, "");
}


function patchHomepageTitle() {
  const path = join(publicDir, "index.html");
  let html = readFileSync(path, "utf8");
  const escTitle = HOME_PAGE_TITLE.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const escDesc = HOME_PAGE_DESCRIPTION.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${HOME_PAGE_TITLE}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*"/,
    `<meta name="description" content="${escDesc}"`
  );
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escTitle}$2`);
  html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escDesc}$2`);
  html = html.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${escTitle}$2`);
  html = html.replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${escDesc}$2`);
  writeFileSync(path, html, "utf8");
  console.log("Patched index.html homepage title + description from seo-config");
}

/** Keep static fallback text in sync with marketing-i18n (crawlers read before site-lang.js). */
function patchHomepageI18nFallbacks() {
  const path = join(publicDir, "index.html");
  let html = readFileSync(path, "utf8");
  let patched = 0;
  for (const [key, value] of Object.entries(marketingEn)) {
    if (!key.startsWith("home.")) continue;
    const escKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escValue = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const re = new RegExp(`(data-i18n="${escKey}"[^>]*>)([^<]*)(</)`, "g");
    const next = html.replace(re, `$1${escValue}$3`);
    if (next !== html) patched++;
    html = next;
  }
  writeFileSync(path, html, "utf8");
  console.log(`Patched index.html i18n fallbacks (${patched} keys)`);
}

function patchSeoHead(fileName) {
  const path = join(publicDir, fileName);
  let html = stripInjectedSeoHead(readFileSync(path, "utf8"));
  const seoHead = renderSeoHead();
  const marker = "<!-- seo-head -->";
  if (html.includes(marker)) {
    html = html.replace(marker, seoHead);
  } else if (html.includes('name="viewport"')) {
    html = html.replace(/(<meta name="viewport"[^>]*>)/i, `$1\n${seoHead}`);
  } else {
    return;
  }
  writeFileSync(path, html, "utf8");
  console.log(`Patched ${fileName} with SEO head`);
}

const urls = buildSitemapUrls();
writeSitemap(urls);
writeRobots();
writeBlogFeed();
writeIndexNowKey();
patchHomepageTitle();
patchHomepageI18nFallbacks();
for (const file of ["index.html"]) {
  patchSeoHead(file);
}
