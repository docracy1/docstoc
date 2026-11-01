/**
 * Response headers for api.docstoc.io. The Pages site gets its set from public/_headers; the API
 * answered without any. A route that sets one of these itself (the click notice sets its own policy)
 * keeps its value.
 */
const JSON_POLICY = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";
// The unsubscribe page in routes/leads.ts loads site.css, and with it the fonts, from the app origin.
const HTML_POLICY =
  "default-src 'none'; style-src 'unsafe-inline' https://docstoc.io; font-src https://docstoc.io; img-src 'self' data: https://docstoc.io; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

export function applySecurityHeaders(headers: Headers, pathname: string): void {
  const defaults: Record<string, string> = {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Resource-Policy": "same-site",
  };
  const type = headers.get("content-type") ?? "";
  defaults["Content-Security-Policy"] = /^text\/html\b/i.test(type) ? HTML_POLICY : JSON_POLICY;
  // Account data must not land in a shared or browser cache. Static answers set their own value.
  if (pathname.startsWith("/api/")) defaults["Cache-Control"] = "no-store";
  for (const [name, value] of Object.entries(defaults)) {
    if (!headers.has(name)) headers.set(name, value);
  }
}
