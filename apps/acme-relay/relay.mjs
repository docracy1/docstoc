#!/usr/bin/env node
// Dumb, stateless HTTPS forwarder for chasa's ACME client (apps/worker/src/lib/acme.ts).
//
// Why this exists: Cloudflare Workers cannot reliably reach Let's Encrypt's ACME API — a known,
// unresolved platform issue (outbound fetch from a deployed Worker to acme-v02/acme-staging-v02
// .api.letsencrypt.org fails with a 525 SSL handshake error, while the exact same request works
// fine from curl/Node outside Cloudflare's network). This relay runs OUTSIDE Cloudflare so it can
// actually reach Let's Encrypt; the Worker sends it an already-built request (already JWS-signed
// where relevant) and this just forwards it byte-for-byte and returns the raw response.
//
// This process holds no secrets and no state — it never sees an account key, a certificate
// private key, or D1. It only needs RELAY_SECRET (a shared bearer token so randoms can't use it
// as an open proxy) and an allowlist restricting where it will forward to.
//
// Run anywhere with Node 18+: `RELAY_SECRET=... node relay.mjs`
import { createServer } from "node:http";

const PORT = process.env.PORT || 8787;
const RELAY_SECRET = process.env.RELAY_SECRET;
if (!RELAY_SECRET) {
  console.error("RELAY_SECRET is required — set it to a long random value and configure the");
  console.error("same value as the ACME_RELAY_SECRET worker secret in chasa.");
  process.exit(1);
}

const ALLOWED_HOSTS = new Set([
  "acme-v02.api.letsencrypt.org",
  "acme-staging-v02.api.letsencrypt.org",
]);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const authorized = req.headers["authorization"] === `Bearer ${RELAY_SECRET}`;

  if (req.method === "GET") {
    if (!authorized) {
      res.writeHead(401).end("Unauthorized");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "docstoc-acme-relay" }));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405).end("Method not allowed");
    return;
  }
  if (!authorized) {
    res.writeHead(401).end("Unauthorized");
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch {
    res.writeHead(400).end("Invalid JSON body");
    return;
  }

  const { url, method, headers, body } = payload;
  let target;
  try {
    target = new URL(url);
  } catch {
    res.writeHead(400).end("Invalid target url");
    return;
  }
  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    res.writeHead(403).end("Forbidden target host");
    return;
  }

  try {
    const upstream = await fetch(target, {
      method: method || "GET",
      headers: headers || {},
      body: body ?? undefined,
    });
    const responseBody = await upstream.text();
    const responseHeaders = {};
    upstream.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: upstream.status, headers: responseHeaders, body: responseBody }));
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
});

server.listen(PORT, () => {
  console.log(`acme-relay listening on :${PORT}`);
});
