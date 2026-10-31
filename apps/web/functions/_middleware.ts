/** Host cutover redirects + Docracy-style edge pageview/referrer logging.
 *
 * Google (and most SEO) landings never accept cookies and often bounce before
 * analytics.js runs — so client-only referral_source_detected stays empty while
 * Search Console shows clicks. Fire-and-forget to the worker with the original
 * Referer so Admin → Traffic sources can credit Google / SEO the same way Docracy does.
 */
const HOST_TO_APEX: Record<string, string> = {
  "www.docstoc.io": "docstoc.io",
  "chasa.io": "docstoc.io",
  "www.chasa.io": "docstoc.io",
};

const TRACKED_EXACT = new Set([
  "/",
  "/es",
  "/es/",
  "/pricing",
  "/about",
  "/press",
  "/docs",
  "/ssl",
  "/tls",
  "/certificate",
  "/invoices",
  "/chase-invoices",
  "/invoice-follow-up",
  "/payment-reminder",
  "/document-templates",
  "/free-templates",
  "/business-kits",
  "/tools",
  "/compare",
  "/marketplace",
  "/blog",
]);

function isTrackedRoute(pathname: string): boolean {
  if (/\.[a-z0-9]+$/i.test(pathname)) return false;
  const path = pathname.replace(/\/+$/, "") || "/";
  // /app CTAs carry utm_source=seo-* (wired by analytics.js on marketing pages). The SPA shell
  // does not load analytics.js, so edge must credit those landings — same role as Docracy's
  // /prepare?ref=seo-* pageviews.
  if (path === "/app" || pathname.startsWith("/app/")) return true;
  if (TRACKED_EXACT.has(path) || TRACKED_EXACT.has(pathname)) return true;
  const prefixes = [
    "/blog/",
    "/document-templates/",
    "/free-templates/",
    "/business-kits/",
    "/tools/",
    "/ssl/",
    "/guides/",
    "/industry/",
    "/use-cases/",
    "/features/",
    "/compare/",
    "/es/",
    "/docstoc-vs-",
    "/switch-from-",
    "/import-from-",
  ];
  return prefixes.some((p) => pathname.startsWith(p));
}

export const onRequest: PagesFunction<{ WORKER_URL: string }> = async (context) => {
  const url = new URL(context.request.url);
  const apex = HOST_TO_APEX[url.hostname];
  if (apex) {
    url.hostname = apex;
    return Response.redirect(url.toString(), 301);
  }

  if (context.request.method === "GET" && isTrackedRoute(url.pathname)) {
    const workerBase = (context.env.WORKER_URL || "https://api.docstoc.io").replace(/\/$/, "");
    context.waitUntil(
      fetch(`${workerBase}/api/analytics/pageview`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": context.request.headers.get("user-agent") ?? "",
          cookie: context.request.headers.get("cookie") ?? "",
          // Original visitor Referer — not this Function→worker hop.
          "x-referrer": context.request.headers.get("referer") ?? "",
          // Preserve visitor IP / country for bot classification + rate limits.
          "cf-connecting-ip": context.request.headers.get("cf-connecting-ip") ?? "",
          "cf-ipcountry": context.request.headers.get("cf-ipcountry") ?? "",
        },
        body: JSON.stringify({
          path: url.pathname,
          query: url.search,
          edge: true,
        }),
      }).catch(() => {})
    );
  }

  const response = await context.next();
  // The pages.dev host serves the same site, so search engines must only index docstoc.io.
  if (url.hostname.endsWith(".pages.dev")) {
    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag", "noindex");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  return response;
};
