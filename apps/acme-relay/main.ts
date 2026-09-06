// Dumb, stateless HTTPS forwarder for docstoc's ACME client (apps/worker/src/lib/acme.ts).
//
// Why this exists: Cloudflare Workers cannot reliably reach Let's Encrypt's ACME API — a known,
// unresolved platform issue (outbound fetch from a deployed Worker to acme-v02/acme-staging-v02
// .api.letsencrypt.org fails with a 525 SSL handshake error, while the exact same request works
// fine from outside Cloudflare's network). This relay runs on Deno Deploy, outside Cloudflare, so
// it can actually reach Let's Encrypt; the Worker sends it an already-built request (already
// JWS-signed where relevant) and this just forwards it byte-for-byte and returns the raw response.
//
// This process holds no secrets and no state — it never sees an account key, a certificate
// private key, or D1. It only needs RELAY_SECRET (a shared bearer token so randoms can't use it
// as an open proxy) and an allowlist restricting where it will forward to.
//
// Deployed with: deno deploy (see README.md)

const RELAY_SECRET = Deno.env.get("RELAY_SECRET");
if (!RELAY_SECRET) {
  console.error("RELAY_SECRET is required — set it as an env var and configure the same value");
  console.error("as the ACME_RELAY_SECRET worker secret in docstoc.");
  Deno.exit(1);
}

const ALLOWED_HOSTS = new Set([
  "acme-v02.api.letsencrypt.org",
  "acme-staging-v02.api.letsencrypt.org",
]);

Deno.serve(async (req: Request) => {
  const authorized = req.headers.get("authorization") === `Bearer ${RELAY_SECRET}`;

  // Liveness probe for the worker SSL health check and uptime monitors — requires the same
  // shared secret as POST so this isn't an open, unauthenticated target for internet scanners.
  if (req.method === "GET") {
    if (!authorized) return new Response("Unauthorized", { status: 401 });
    return new Response(JSON.stringify({ ok: true, service: "docstoc-acme-relay" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!authorized) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { url?: string; method?: string; headers?: Record<string, string>; body?: string };
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { url, method, headers, body } = payload;
  let target: URL;
  try {
    target = new URL(url ?? "");
  } catch {
    return new Response("Invalid target url", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return new Response("Forbidden target host", { status: 403 });
  }

  try {
    const upstream = await fetch(target, {
      method: method || "GET",
      headers: headers || {},
      body: body ?? undefined,
    });
    const responseBody = await upstream.text();
    const responseHeaders: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    return new Response(
      JSON.stringify({ status: upstream.status, headers: responseHeaders, body: responseBody }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
});
