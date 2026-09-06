/**
 * Outreach short links: /go/dm, /go/li, /go/x, /go/try, …
 *
 * Logs an open server-side (before cookie consent), then 302s to the site with UTMs.
 * Optional personalization: /go/dm?who=alice  or  /go/dm?to=alice@studio.com
 *
 * Use in cold email: https://docstoc.io/go/dm?who=first-name
 */

type GoEntry = {
  to: string;
  source: string;
  medium: string;
  campaign: string;
};

const SHORT_LINKS: Record<string, GoEntry> = {
  dm: { to: "/", source: "outreach", medium: "dm", campaign: "dm" },
  ssl: { to: "/ssl", source: "outreach", medium: "email", campaign: "ssl" },
  li: { to: "/", source: "linkedin", medium: "social", campaign: "li" },
  x: { to: "/", source: "x", medium: "social", campaign: "x" },
  try: { to: "/app/", source: "try", medium: "shortlink", campaign: "try" },
  templates: { to: "/free-templates/", source: "templates", medium: "shortlink", campaign: "templates" },
  tools: { to: "/tools/", source: "tools", medium: "shortlink", campaign: "tools" },
  trust: { to: "/trust-badges", source: "trust", medium: "shortlink", campaign: "trust" },
  invoice: { to: "/tools/invoice-generator", source: "invoice", medium: "shortlink", campaign: "invoice" },
};

function sanitize(value: string | null, max = 64): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9@._+-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, max);
}

function resolveEntry(code: string | undefined): { code: string; entry: GoEntry } {
  const key = (code || "dm").toLowerCase();
  const entry = SHORT_LINKS[key];
  if (entry) return { code: key, entry };
  return {
    code: key.slice(0, 32) || "dm",
    entry: { to: "/", source: "outreach", medium: "go", campaign: key.slice(0, 32) || "unknown" },
  };
}

// Matches any nested sub-path under /go/<code>/... — mail-security scanners that fetch a page
// and then crawl its same-origin script/asset tags sometimes do so relative to the *scanned*
// link, landing here instead of at the real asset. Those aren't opens and shouldn't count.
const ASSET_EXT = /\.(js|css|png|jpe?g|gif|svg|ico|map|json|xml|txt|webp|woff2?)$/i;

function isNoiseRequest(codeRaw: string): boolean {
  return codeRaw.includes("/") || ASSET_EXT.test(codeRaw);
}

export const onRequest: PagesFunction<{ WORKER_URL: string }> = async (context) => {
  const url = new URL(context.request.url);
  const codeParam = context.params.code;
  const codeRaw = Array.isArray(codeParam) ? codeParam.join("/") : codeParam || "";

  // Sub-resource probe, not a real click — redirect (so nothing breaks) without logging it.
  if (isNoiseRequest(codeRaw)) {
    return Response.redirect(new URL("/", url.origin).toString(), 302);
  }

  const { code, entry } = resolveEntry(codeRaw);

  const who =
    sanitize(url.searchParams.get("who")) ||
    sanitize(url.searchParams.get("to")) ||
    sanitize(url.searchParams.get("ref"));

  const workerBase = context.env.WORKER_URL || "https://api.docstoc.io";
  const ua = context.request.headers.get("User-Agent")?.slice(0, 300) || "";

  // Fire-and-forget click log — don't block the redirect on analytics.
  context.waitUntil(
    fetch(`${workerBase}/api/analytics/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": ua,
        "X-Docstoc-App-Origin": url.origin,
      },
      body: JSON.stringify({
        name: "outreach_link_opened",
        path: url.pathname + url.search,
        properties: {
          code,
          source: entry.source,
          medium: entry.medium,
          campaign: entry.campaign,
          who: who || undefined,
          label: who ? `${entry.source}/${entry.campaign}/${who}` : `${entry.source}/${entry.campaign}`,
        },
      }),
    }).catch(() => {})
  );

  const dest = new URL(entry.to, url.origin);
  dest.searchParams.set("utm_source", entry.source);
  dest.searchParams.set("utm_medium", entry.medium);
  dest.searchParams.set("utm_campaign", entry.campaign);
  if (who) dest.searchParams.set("who", who);

  return Response.redirect(dest.toString(), 302);
};
