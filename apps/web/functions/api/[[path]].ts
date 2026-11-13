// Proxies /api/* same-origin to the worker, so the browser sees the Pages host on both ends instead of
// a cross-site request to the API host. Without this, the session cookie set on login is
// a third-party cookie and gets blocked by default in Chrome/Safari — login "succeeds"
// server-side but the browser never keeps the cookie.
//
// redirect: "manual" is required so OAuth Connect (302 → Dropbox/Microsoft/Box) and
// magic-link verify (302 → /app/account) reach the browser instead of being followed
// inside the Pages Function.
export const onRequest: PagesFunction<{ WORKER_URL: string }> = async (context) => {
  const url = new URL(context.request.url);
  const workerBase = context.env.WORKER_URL || "https://api.docstoc.io";
  const target = `${workerBase}${url.pathname}${url.search}`;

  // Tell the worker which host the browser is on so emailed links and redirects come back here,
  // rather than to whatever PUBLIC_APP_URL happens to be. set() overwrites any client-sent value.
  const headers = new Headers(context.request.headers);
  headers.set("X-Docstoc-App-Origin", url.origin);

  // The cookieless visitor count (worker src/lib/visits.ts) needs the visitor's IP for its daily hash and the
  // network's ASN for "dc"/"isp"; on this hop the worker only sees Cloudflare. set() overwrites client values.
  // The worker stores neither: the IP only goes into the hash, the ASN only into one word.
  if (url.pathname === "/api/analytics/visit") {
    const cf = (context.request as Request & { cf?: { asn?: number; asOrganization?: string; country?: string } }).cf;
    headers.set("X-Docstoc-Visit-Ip", context.request.headers.get("cf-connecting-ip") ?? "");
    headers.set("X-Docstoc-Visit-Asn", cf?.asn ? String(cf.asn) : "");
    headers.set("X-Docstoc-Visit-As-Org", (cf?.asOrganization ?? "").replace(/[^\x20-\x7e]/g, "").slice(0, 120));
    headers.set("X-Docstoc-Visit-Country", cf?.country ?? context.request.headers.get("cf-ipcountry") ?? "");
  }

  // Buffer POST/PUT bodies — streaming request.body into subfetch can hang in Pages Functions.
  const method = context.request.method.toUpperCase();
  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await context.request.arrayBuffer();
  }

  const upstream = await fetch(
    new Request(target, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(55_000),
    })
  );

  // Opaque redirect responses from fetch({ redirect: "manual" }) — re-expose Location to the browser.
  if (upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get("Location");
    if (location) {
      const headers = new Headers(upstream.headers);
      headers.set("Location", location);
      return new Response(null, { status: upstream.status, headers });
    }
  }

  // Materialize the upstream body so the browser response completes reliably.
  const responseBody = upstream.body ? await upstream.arrayBuffer() : null;
  return new Response(responseBody, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
};
