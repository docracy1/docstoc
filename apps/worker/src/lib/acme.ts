// Hand-rolled ACME v2 (RFC 8555) client for Let's Encrypt, using only Web Crypto + fetch — no
// npm ACME library targets Workers (they all assume Node's `crypto`/`fs`/`dns`), and Workers has
// no native CSR/X.509 support, so lib/asn1.ts builds the PKCS#10 CSR by hand.
//
// Every request to Let's Encrypt goes through a small external relay (apps/acme-relay), not a
// direct fetch() — Cloudflare Workers cannot reliably reach Let's Encrypt's ACME API (a known,
// unresolved 525 SSL-handshake platform issue; confirmed by testing both directly). The relay is
// a dumb, stateless forwarder with no secrets of its own — see relayFetch() below and
// apps/acme-relay/README.md for why and how it's deployed.
//
// Defaults to Let's Encrypt PRODUCTION (env.ACME_DIRECTORY_URL overrides).
// For safe dry-runs set ACME_DIRECTORY_URL to https://acme-staging-v02.api.letsencrypt.org/directory
// — staging certs are not browser-trusted.
import type { Env } from "../types";
import { decryptSecret, encryptSecret } from "./secretCrypto";
import {
  concat,
  derBitString,
  derContextConstructed,
  derContextPrimitive,
  derOctetString,
  derOid,
  derSequence,
  derSet,
  derSmallInt,
  rawEcdsaSignatureToDer,
} from "./asn1";

const STAGING_DIRECTORY = "https://acme-staging-v02.api.letsencrypt.org/directory";
const PRODUCTION_DIRECTORY = "https://acme-v02.api.letsencrypt.org/directory";

function directoryUrl(env: Env): string {
  // Prefer explicit override; otherwise production. Staging certs are not browser-trusted.
  return env.ACME_DIRECTORY_URL?.trim() || PRODUCTION_DIRECTORY;
}

export function acmeDirectoryLabel(env: Env): "production" | "staging" | "custom" {
  const url = directoryUrl(env);
  if (url === PRODUCTION_DIRECTORY || url.startsWith("https://acme-v02.api.letsencrypt.org/")) return "production";
  if (url === STAGING_DIRECTORY || url.includes("acme-staging-v02")) return "staging";
  return "custom";
}

/** Live probe: relay up → Let's Encrypt directory reachable → nonce available. */
export async function probeAcmeConnectivity(env: Env): Promise<{
  ok: boolean;
  relayConfigured: boolean;
  relayReachable: boolean;
  letsEncryptReachable: boolean;
  directory: "production" | "staging" | "custom";
  directoryUrl: string;
  error?: string;
}> {
  const directory = acmeDirectoryLabel(env);
  const dirUrl = directoryUrl(env);
  const base = {
    relayConfigured: !!(env.ACME_RELAY_URL && env.ACME_RELAY_SECRET),
    relayReachable: false,
    letsEncryptReachable: false,
    directory,
    directoryUrl: dirUrl,
  };
  if (!env.ACME_RELAY_URL || !env.ACME_RELAY_SECRET) {
    return {
      ok: false,
      ...base,
      error: "ACME relay isn't configured (ACME_RELAY_URL / ACME_RELAY_SECRET)",
    };
  }
  try {
    const live = await fetch(env.ACME_RELAY_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${env.ACME_RELAY_SECRET}` },
    });
    if (live.status === 404) {
      const body = await live.text();
      if (body.includes("DEPLOYMENT_NOT_FOUND")) {
        return {
          ok: false,
          ...base,
          error:
            "ACME relay URL points at Deno Deploy Classic (*.deno.dev) — update ACME_RELAY_URL to https://docstoc-acme-relay.docracy1.deno.net (see apps/acme-relay/README.md)",
        };
      }
    }
    // 200 = current relay with GET liveness; 405 = older deploy without GET (still alive).
    if (!live.ok && live.status !== 405) {
      return {
        ok: false,
        ...base,
        error: `ACME relay HTTP ${live.status} — redeploy apps/acme-relay on Deno Deploy (see apps/acme-relay/README.md)`,
      };
    }
    base.relayReachable = true;
  } catch (err) {
    return {
      ok: false,
      ...base,
      error: `ACME relay unreachable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  try {
    const dir = await getDirectory(env);
    if (!dir.newNonce || !dir.newOrder) {
      return { ok: false, ...base, error: "Let's Encrypt directory missing newNonce/newOrder" };
    }
    await fetchNonce(env, dir);
    return { ok: true, ...base, letsEncryptReachable: true };
  } catch (err) {
    return {
      ok: false,
      ...base,
      letsEncryptReachable: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeString(s: string): string {
  return base64UrlEncode(new TextEncoder().encode(s));
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

type Directory = {
  newNonce: string;
  newAccount: string;
  newOrder: string;
  [key: string]: string;
};

/** Forwards a request to Let's Encrypt via apps/acme-relay, since a direct fetch() from inside
 *  the Worker fails (see the module comment above). Reconstructs a real Response so every
 *  existing `res.ok`/`res.status`/`res.headers.get(...)`/`res.json()` call site below works
 *  unchanged regardless of how the response was actually obtained. */
async function relayFetch(env: Env, url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<Response> {
  if (!env.ACME_RELAY_URL || !env.ACME_RELAY_SECRET) {
    throw new Error("ACME relay isn't configured (ACME_RELAY_URL / ACME_RELAY_SECRET) — see apps/acme-relay/README.md");
  }
  const relayRes = await fetch(env.ACME_RELAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.ACME_RELAY_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: init?.body ?? null,
    }),
  });
  if (!relayRes.ok) throw new Error(`ACME relay unreachable or misconfigured: ${relayRes.status}`);
  const { status, headers, body, error } = (await relayRes.json()) as {
    status?: number;
    headers?: Record<string, string>;
    body?: string;
    error?: string;
  };
  if (error) throw new Error(`ACME relay could not reach Let's Encrypt: ${error}`);
  return new Response(body ?? "", { status: status ?? 502, headers: headers ?? {} });
}

async function getDirectory(env: Env): Promise<Directory> {
  const res = await relayFetch(env, directoryUrl(env));
  if (!res.ok) throw new Error(`ACME directory fetch failed: ${res.status}`);
  return res.json();
}

async function fetchNonce(env: Env, directory: Directory): Promise<string> {
  const res = await relayFetch(env, directory.newNonce, { method: "HEAD" });
  const nonce = res.headers.get("Replay-Nonce");
  if (!nonce) throw new Error("ACME server did not return a nonce");
  return nonce;
}

/** Minimal JWK shape Let's Encrypt's account keys use — only the fields JWS/thumbprint need. */
export type EcJwk = { kty: "EC"; crv: "P-256"; x: string; y: string; d?: string };

async function exportPublicJwk(publicKey: CryptoKey): Promise<EcJwk> {
  const jwk = (await crypto.subtle.exportKey("jwk", publicKey)) as JsonWebKey;
  return { kty: "EC", crv: "P-256", x: jwk.x!, y: jwk.y! };
}

/** RFC 7638 JWK thumbprint — canonical form is the exact key set {crv, kty, x, y} in that sorted
 *  order, no whitespace. */
async function jwkThumbprint(jwk: EcJwk): Promise<string> {
  const canonical = `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}","y":"${jwk.y}"}`;
  return base64UrlEncode(await sha256(new TextEncoder().encode(canonical)));
}

type JwsAuth = { kid: string } | { jwk: EcJwk };

async function signJws(
  privateKey: CryptoKey,
  auth: JwsAuth,
  nonce: string,
  url: string,
  payload: unknown
): Promise<string> {
  const protectedHeader = { alg: "ES256", nonce, url, ...auth };
  const protectedB64 = base64UrlEncodeString(JSON.stringify(protectedHeader));
  // ACME's "POST-as-GET" convention is a literal empty string payload, not "{}" or null.
  const payloadB64 = payload === null ? "" : base64UrlEncodeString(JSON.stringify(payload));
  const signingInput = new TextEncoder().encode(`${protectedB64}.${payloadB64}`);
  // JOSE/JWS ECDSA signatures are the raw fixed-length r||s — never DER (that's X.509/CSR-only,
  // see rawEcdsaSignatureToDer in asn1.ts, used only for the CSR itself below).
  const sigRaw = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, signingInput)
  );
  return JSON.stringify({
    protected: protectedB64,
    payload: payloadB64,
    signature: base64UrlEncode(sigRaw),
  });
}

type AcmeResponse<T> = { ok: boolean; status: number; body: T; nonce: string; location?: string };

async function acmePost<T>(
  env: Env,
  url: string,
  privateKey: CryptoKey,
  auth: JwsAuth,
  nonce: string,
  payload: unknown
): Promise<AcmeResponse<T>> {
  const body = await signJws(privateKey, auth, nonce, url, payload);
  const res = await relayFetch(env, url, {
    method: "POST",
    headers: { "Content-Type": "application/jose+json" },
    body,
  });
  const nextNonce = res.headers.get("Replay-Nonce") ?? nonce;
  const contentType = res.headers.get("Content-Type") ?? "";
  const responseBody = contentType.includes("json") || contentType.includes("problem")
    ? await res.json().catch(() => null)
    : await res.text();
  return {
    ok: res.ok,
    status: res.status,
    body: responseBody as T,
    nonce: nextNonce,
    location: res.headers.get("Location") ?? undefined,
  };
}

export type AcmeAccount = {
  privateKey: CryptoKey;
  jwk: EcJwk;
  accountUrl: string;
  directory: Directory;
  env: Env;
};

/** Loads the single stored ACME account, registering a new one with Let's Encrypt on first use.
 *  One account per docstoc deployment, shared across all customer certificates (the normal ACME
 *  pattern — Let's Encrypt rate-limits are per-account, not per-domain-owner). */
export async function loadOrCreateAccount(env: Env): Promise<AcmeAccount> {
  const directory = await getDirectory(env);
  const existing = await env.CHASA_DB.prepare(
    `SELECT account_key_jwk_enc, account_url, directory_url FROM acme_account WHERE id = 'default'`
  ).first<{ account_key_jwk_enc: string; account_url: string; directory_url: string }>();

  if (existing && existing.directory_url === directoryUrl(env)) {
    const jwkJson = await decryptSecret(existing.account_key_jwk_enc, env.TOKEN_SECRET);
    const jwk: EcJwk = JSON.parse(jwkJson);
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign"]
    );
    return { privateKey, jwk, accountUrl: existing.account_url, directory, env };
  }

  // First use (or the directory changed, e.g. staging -> production) — register a fresh account.
  const keyPair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", keyPair.privateKey)) as EcJwk;
  const publicJwk = await exportPublicJwk(keyPair.publicKey);

  const nonce = await fetchNonce(env, directory);
  const res = await acmePost<{ status: string }>(
    env,
    directory.newAccount,
    keyPair.privateKey,
    { jwk: publicJwk },
    nonce,
    { termsOfServiceAgreed: true }
  );
  if (!res.ok || !res.location) {
    throw new Error(`ACME account registration failed: ${JSON.stringify(res.body)}`);
  }

  const encJwk = await encryptSecret(JSON.stringify(jwk), env.TOKEN_SECRET);
  const now = new Date().toISOString();
  await env.CHASA_DB.prepare(
    `INSERT INTO acme_account (id, account_key_jwk_enc, account_url, directory_url, created_at)
     VALUES ('default', ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET account_key_jwk_enc = excluded.account_key_jwk_enc,
       account_url = excluded.account_url, directory_url = excluded.directory_url`
  )
    .bind(encJwk, res.location, directoryUrl(env), now)
    .run();

  return { privateKey: keyPair.privateKey, jwk: publicJwk, accountUrl: res.location, directory, env };
}

export type AcmeOrder = {
  orderUrl: string;
  authorizationUrls: string[];
  /** @deprecated use authorizationUrls[0] — kept for single-name call sites */
  authorizationUrl: string;
  finalizeUrl: string;
  status: string;
};

/** DNS TXT name for an ACME identifier (wildcards validate on the parent domain). */
export function dns01RecordName(identifier: string): string {
  const host = identifier.startsWith("*.") ? identifier.slice(2) : identifier;
  return `_acme-challenge.${host}`;
}

export async function createOrder(account: AcmeAccount, domains: string | string[]): Promise<AcmeOrder> {
  const identifiers = (Array.isArray(domains) ? domains : [domains]).map((value) => ({
    type: "dns" as const,
    value: value.toLowerCase(),
  }));
  if (identifiers.length === 0) throw new Error("At least one hostname is required");

  const nonce = await fetchNonce(account.env, account.directory);
  const res = await acmePost<{ status: string; authorizations: string[]; finalize: string }>(
    account.env,
    account.directory.newOrder,
    account.privateKey,
    { kid: account.accountUrl },
    nonce,
    { identifiers }
  );
  if (!res.ok || !res.location) throw new Error(`ACME order creation failed: ${JSON.stringify(res.body)}`);
  const authorizationUrls = res.body.authorizations ?? [];
  if (authorizationUrls.length === 0) throw new Error("ACME order returned no authorizations");
  return {
    orderUrl: res.location,
    authorizationUrls,
    authorizationUrl: authorizationUrls[0]!,
    finalizeUrl: res.body.finalize,
    status: res.body.status,
  };
}

/** Re-fetches an existing order (POST-as-GET) — used to resume a flow across requests without
 *  persisting every intermediate URL, since the order itself always re-exposes them. */
export async function getOrder(account: AcmeAccount, orderUrl: string): Promise<AcmeOrder> {
  const nonce = await fetchNonce(account.env, account.directory);
  const res = await acmePost<{ status: string; authorizations: string[]; finalize: string }>(
    account.env,
    orderUrl,
    account.privateKey,
    { kid: account.accountUrl },
    nonce,
    null
  );
  if (!res.ok) throw new Error(`ACME order fetch failed: ${JSON.stringify(res.body)}`);
  const authorizationUrls = res.body.authorizations ?? [];
  return {
    orderUrl,
    authorizationUrls,
    authorizationUrl: authorizationUrls[0]!,
    finalizeUrl: res.body.finalize,
    status: res.body.status,
  };
}

export type Dns01Challenge = {
  identifier: string;
  challengeUrl: string;
  token: string;
  txtValue: string;
  status: string;
  authorizationUrl: string;
  recordName: string;
};

/** Fetches the order's authorization and returns its dns-01 challenge plus the exact TXT record
 *  value the customer needs to publish (RFC 8555 §8.1/§8.4). */
export async function getDns01Challenge(
  account: AcmeAccount,
  authorizationUrl: string
): Promise<Dns01Challenge> {
  const nonce = await fetchNonce(account.env, account.directory);
  const res = await acmePost<{
    status: string;
    identifier?: { type: string; value: string };
    challenges: Array<{ type: string; url: string; token: string; status: string }>;
  }>(account.env, authorizationUrl, account.privateKey, { kid: account.accountUrl }, nonce, null);
  if (!res.ok) throw new Error(`ACME authorization fetch failed: ${JSON.stringify(res.body)}`);

  const challenge = res.body.challenges.find((c) => c.type === "dns-01");
  if (!challenge) throw new Error("No dns-01 challenge offered for this order");

  const identifier = (res.body.identifier?.value || "").toLowerCase();
  const thumbprint = await jwkThumbprint(account.jwk);
  const keyAuthorization = `${challenge.token}.${thumbprint}`;
  const txtValue = base64UrlEncode(await sha256(new TextEncoder().encode(keyAuthorization)));

  return {
    identifier,
    challengeUrl: challenge.url,
    token: challenge.token,
    txtValue,
    status: challenge.status,
    authorizationUrl,
    recordName: dns01RecordName(identifier),
  };
}

/** Collect DNS-01 challenges for every authorization on an order (multi-SAN / wildcard). */
export async function getAllDns01Challenges(account: AcmeAccount, order: AcmeOrder): Promise<Dns01Challenge[]> {
  const out: Dns01Challenge[] = [];
  for (const authUrl of order.authorizationUrls) {
    out.push(await getDns01Challenge(account, authUrl));
  }
  return out;
}

/** Tells Let's Encrypt the challenge is ready to be checked, then polls the authorization a
 *  bounded number of times (a Worker request has a CPU-time budget — this is one manual "Check
 *  status" click's worth of polling, not indefinite background polling). */
export async function verifyDns01(
  account: AcmeAccount,
  authorizationUrl: string,
  challengeUrl: string
): Promise<{ status: "valid" | "pending" | "invalid"; error?: string }> {
  let nonce = await fetchNonce(account.env, account.directory);
  const notify = await acmePost<{ status: string }>(
    account.env,
    challengeUrl,
    account.privateKey,
    { kid: account.accountUrl },
    nonce,
    {}
  );
  nonce = notify.nonce;

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await acmePost<{
      status: string;
      challenges: Array<{ type: string; status: string; error?: { detail: string } }>;
    }>(account.env, authorizationUrl, account.privateKey, { kid: account.accountUrl }, nonce, null);
    nonce = res.nonce;
    if (res.body.status === "valid") return { status: "valid" };
    if (res.body.status === "invalid") {
      const dns01 = res.body.challenges.find((c) => c.type === "dns-01");
      return { status: "invalid", error: dns01?.error?.detail ?? "Validation failed" };
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { status: "pending" };
}

async function buildCsr(domains: string[], keyPair: CryptoKeyPair): Promise<Uint8Array> {
  const names = domains.map((d) => d.toLowerCase());
  const spkiDer = new Uint8Array((await crypto.subtle.exportKey("spki", keyPair.publicKey)) as ArrayBuffer);

  const sanNames = concat(...names.map((d) => derContextPrimitive(2, new TextEncoder().encode(d))));
  const sanExtensionValue = derSequence(sanNames);
  const sanExtension = derSequence(concat(derOid("2.5.29.17"), derOctetString(sanExtensionValue)));
  const extensionRequestAttr = derSequence(
    concat(derOid("1.2.840.113549.1.9.14"), derSet(derSequence(sanExtension)))
  );
  const attributes = derContextConstructed(0, extensionRequestAttr);

  const csrInfo = derSequence(concat(derSmallInt(0), derSequence(), spkiDer, attributes));
  const sigRaw = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keyPair.privateKey, csrInfo)
  );
  const sigAlg = derSequence(derOid("1.2.840.10045.4.3.2"));
  return derSequence(concat(csrInfo, sigAlg, derBitString(rawEcdsaSignatureToDer(sigRaw))));
}

export type IssuedCertificate = { certPem: string; privateKeyJwk: EcJwk };

/** Generates a fresh per-certificate key pair, builds and submits the CSR, polls for issuance,
 *  and downloads the certificate chain. Called once DNS-01 has already validated. */
export async function finalizeAndDownload(
  account: AcmeAccount,
  order: AcmeOrder,
  domains: string | string[]
): Promise<IssuedCertificate | { pending: true }> {
  const names = Array.isArray(domains) ? domains : [domains];
  const certKeyPair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const csrDer = await buildCsr(names, certKeyPair);

  let nonce = await fetchNonce(account.env, account.directory);
  const finalizeRes = await acmePost<{ status: string; certificate?: string }>(
    account.env,
    order.finalizeUrl,
    account.privateKey,
    { kid: account.accountUrl },
    nonce,
    { csr: base64UrlEncode(csrDer) }
  );
  nonce = finalizeRes.nonce;
  if (!finalizeRes.ok) throw new Error(`ACME finalize failed: ${JSON.stringify(finalizeRes.body)}`);

  let certUrl = finalizeRes.body.certificate;
  for (let attempt = 0; !certUrl && attempt < 5; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const orderRes = await acmePost<{ status: string; certificate?: string }>(
      account.env,
      order.orderUrl,
      account.privateKey,
      { kid: account.accountUrl },
      nonce,
      null
    );
    nonce = orderRes.nonce;
    certUrl = orderRes.body.certificate;
  }
  if (!certUrl) return { pending: true };

  nonce = (
    await acmePost<null>(account.env, order.orderUrl, account.privateKey, { kid: account.accountUrl }, nonce, null)
  ).nonce;
  const certRes = await acmePost<string>(account.env, certUrl, account.privateKey, { kid: account.accountUrl }, nonce, null);
  if (!certRes.ok) throw new Error("ACME certificate download failed");

  const privateKeyJwk = (await crypto.subtle.exportKey("jwk", certKeyPair.privateKey)) as EcJwk;
  return { certPem: certRes.body, privateKeyJwk };
}
