import { Hono, type MiddlewareHandler } from "hono";
import type { AuthEnv } from "../lib/auth";
import { requireAccount } from "../lib/auth";
import {
  createOrder,
  dns01RecordName,
  finalizeAndDownload,
  getAllDns01Challenges,
  getOrder,
  loadOrCreateAccount,
  probeAcmeConnectivity,
  verifyDns01,
} from "../lib/acme";
import {
  challengesFromRow,
  createCertificateRow,
  deleteCertificateRow,
  getCertificateRow,
  hostnamesFromRow,
  listCertificatesForAccount,
  setFailed,
  setIssued,
  setOrderDetails,
  setVerifying,
  type Dns01ChallengeStored,
} from "../lib/customerCertificates";
import { encryptSecret, decryptSecret } from "../lib/secretCrypto";
import { customHostnameCreateSchema, parseJsonBody } from "../lib/schemas";
import { ensureTrustProfile, submitTrustProfileTimestamp } from "../lib/trustProfile";
import {
  sslAllowsAcmeApi,
  sslAllowsMultiSan,
  sslAllowsWildcard,
  sslDomainLimit,
  sslMaxSansPerCert,
  sslWildcardLimit,
} from "../lib/plan";

const ssl = new Hono<AuthEnv>();

/**
 * Managed Let's Encrypt automation (not certificate resale).
 * Free: 5 × 90-day DV via product UI.
 * Pro: same 5 + multi-SAN + ACME API.
 * Business: Pro features + 1 wildcard (within the 5 slots).
 */
ssl.use("*", requireAccount);

/** Private keys and the certificate's lifecycle are for admins; members can see status. Not
 *  requireWorkspaceAdmin, which also demands a paid plan: the free tier includes certificates. */
const requireCertAdmin: MiddlewareHandler<AuthEnv> = async (c, next) => {
  if (c.get("account")!.role !== "admin") return c.json({ error: "Admin role required" }, 403);
  await next();
};

/** Live Let's Encrypt connectivity check via the ACME relay. Always 200 — `ok` in the body. */
ssl.get("/health", async (c) => {
  const probe = await probeAcmeConnectivity(c.env);
  return c.json(probe);
});

function limitError(plan: string, limit: number): string {
  if (plan === "free") {
    return `Free includes ${limit} Let's Encrypt certificates (90-day DV). Upgrade to Pro for multi-SAN and ACME API, or Business for 1 wildcard.`;
  }
  if (plan === "pro") {
    return `Pro includes ${limit} certificates with multi-SAN and ACME API. Upgrade to Business for 1 wildcard.`;
  }
  return `Business includes ${limit} certificates (including up to 1 wildcard).`;
}

function assertPlanAllowsHostnames(
  plan: "free" | "pro" | "business",
  hostnames: string[],
  existingWildcardCount: number
): { ok: true } | { ok: false; error: string; status: 402 | 400 } {
  const hasWildcard = hostnames.some((h) => h.startsWith("*."));
  if (hasWildcard && !sslAllowsWildcard(plan)) {
    return {
      ok: false,
      status: 402,
      error: "Wildcard certificates (*.example.com) are included on Business — 1 wildcard among your 5 certificate slots.",
    };
  }
  if (hasWildcard && existingWildcardCount >= sslWildcardLimit(plan)) {
    return {
      ok: false,
      status: 402,
      error: "Business includes 1 wildcard certificate. Remove the existing wildcard to issue another, or use multi-SAN names instead.",
    };
  }
  if (hostnames.length > 1 && !sslAllowsMultiSan(plan)) {
    return {
      ok: false,
      status: 402,
      error: "Multi-SAN certificates (several hostnames on one cert) require Pro or Business.",
    };
  }
  const maxSans = sslMaxSansPerCert(plan);
  if (hostnames.length > maxSans) {
    return { ok: false, status: 400, error: `This plan allows up to ${maxSans} names per certificate.` };
  }
  return { ok: true };
}

function challengesToStored(
  challenges: Array<{
    identifier: string;
    recordName: string;
    txtValue: string;
    token: string;
    challengeUrl: string;
    authorizationUrl: string;
  }>
): Dns01ChallengeStored[] {
  return challenges.map((c) => ({
    identifier: c.identifier,
    recordName: c.recordName || dns01RecordName(c.identifier),
    txtValue: c.txtValue,
    token: c.token,
    challengeUrl: c.challengeUrl,
    authorizationUrl: c.authorizationUrl,
  }));
}

function dnsRecordsFromChallenges(challenges: Dns01ChallengeStored[]) {
  return challenges.map((c) => ({
    name: c.recordName,
    type: "TXT" as const,
    value: c.txtValue,
    identifier: c.identifier,
  }));
}

ssl.get("/domains", async (c) => {
  const acc = c.get("account")!;
  const certificates = await listCertificatesForAccount(c.env, acc.workspaceId);
  return c.json({
    certificates,
    limit: sslDomainLimit(acc.plan),
    features: {
      multiSan: sslAllowsMultiSan(acc.plan),
      wildcard: sslAllowsWildcard(acc.plan),
      wildcardLimit: sslWildcardLimit(acc.plan),
      maxSansPerCert: sslMaxSansPerCert(acc.plan),
      acmeApi: sslAllowsAcmeApi(acc.plan),
    },
  });
});

ssl.post("/domains", async (c) => {
  const acc = c.get("account")!;
  const parsed = await parseJsonBody(c.req, customHostnameCreateSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const hostnames = parsed.data.hostnames;

  const existing = await listCertificatesForAccount(c.env, acc.workspaceId);
  const existingWildcardCount = existing.filter((cert) =>
    (cert.hostnames?.length ? cert.hostnames : [cert.domain]).some((h) => h.startsWith("*.") )
  ).length;

  const allowed = assertPlanAllowsHostnames(acc.plan, hostnames, existingWildcardCount);
  if (!allowed.ok) return c.json({ error: allowed.error }, allowed.status);

  const limit = sslDomainLimit(acc.plan);
  if (existing.length >= limit) {
    return c.json({ error: limitError(acc.plan, limit), limit, used: existing.length }, 402);
  }

  const row = await createCertificateRow(c.env, acc.workspaceId, hostnames);
  try {
    const account = await loadOrCreateAccount(c.env);
    const order = await createOrder(account, hostnames);
    const challenges = challengesToStored(await getAllDns01Challenges(account, order));
    const primary = challenges[0]!;
    await setOrderDetails(c.env, row.id, {
      orderUrl: order.orderUrl,
      dns01Token: primary.token,
      dns01TxtValue: primary.txtValue,
      dns01Challenges: challenges,
    });
    const certificate = {
      ...row,
      dns01Token: primary.token,
      dns01TxtValue: primary.txtValue,
      dns01Challenges: challenges,
    };
    return c.json({
      certificate,
      dnsRecord: dnsRecordsFromChallenges(challenges)[0],
      dnsRecords: dnsRecordsFromChallenges(challenges),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ACME order failed";
    await setFailed(c.env, row.id, message);
    return c.json({ error: message }, 502);
  }
});

/** Customer clicks this after adding the TXT record(s). */
ssl.post("/domains/:id/verify", async (c) => {
  const acc = c.get("account")!;
  const row = await getCertificateRow(c.env, acc.workspaceId, c.req.param("id"));
  if (!row) return c.json({ error: "Not found" }, 404);
  if (!row.order_url) return c.json({ error: "No pending order for this domain" }, 400);

  await setVerifying(c.env, row.id);
  try {
    const account = await loadOrCreateAccount(c.env);
    const order = await getOrder(account, row.order_url);
    let challenges = challengesFromRow(row).filter((ch) => ch.authorizationUrl && ch.challengeUrl);
    if (challenges.length === 0) {
      challenges = challengesToStored(await getAllDns01Challenges(account, order));
    }

    for (const ch of challenges) {
      const verified = await verifyDns01(account, ch.authorizationUrl, ch.challengeUrl);
      if (verified.status === "invalid") {
        await setFailed(c.env, row.id, verified.error ?? `DNS-01 validation failed for ${ch.identifier}`);
        return c.json({ status: "invalid", error: verified.error });
      }
      if (verified.status === "pending") {
        return c.json({ status: "pending" });
      }
    }

    const names = hostnamesFromRow(row);
    const issued = await finalizeAndDownload(account, order, names);
    if ("pending" in issued) {
      return c.json({ status: "pending" });
    }

    const certKeyEnc = await encryptSecret(JSON.stringify(issued.privateKeyJwk), c.env.TOKEN_SECRET);
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    await setIssued(c.env, row.id, { certKeyEnc, certPem: issued.certPem, expiresAt });

    const newProfile = await ensureTrustProfile(c.env, acc.workspaceId);
    if (newProfile) {
      c.executionCtx.waitUntil(
        submitTrustProfileTimestamp(c.env, acc.workspaceId, newProfile.hash).catch((err) =>
          console.error("Trust profile timestamp submission threw:", err)
        )
      );
    }

    return c.json({ status: "issued" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    await setFailed(c.env, row.id, message);
    return c.json({ status: "error", error: message }, 502);
  }
});

ssl.post("/domains/:id/renew", requireCertAdmin, async (c) => {
  const acc = c.get("account")!;
  const row = await getCertificateRow(c.env, acc.workspaceId, c.req.param("id"));
  if (!row) return c.json({ error: "Not found" }, 404);
  const hostnames = hostnamesFromRow(row);

  try {
    const account = await loadOrCreateAccount(c.env);
    const order = await createOrder(account, hostnames);
    const challenges = challengesToStored(await getAllDns01Challenges(account, order));
    const primary = challenges[0]!;
    await setOrderDetails(c.env, row.id, {
      orderUrl: order.orderUrl,
      dns01Token: primary.token,
      dns01TxtValue: primary.txtValue,
      dns01Challenges: challenges,
    });
    return c.json({
      certificate: {
        ...row,
        domain: row.domain,
        hostnames,
        dns01Token: primary.token,
        dns01TxtValue: primary.txtValue,
        dns01Challenges: challenges,
      },
      dnsRecord: dnsRecordsFromChallenges(challenges)[0],
      dnsRecords: dnsRecordsFromChallenges(challenges),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ACME renewal order failed";
    await setFailed(c.env, row.id, message);
    return c.json({ error: message }, 502);
  }
});

ssl.delete("/domains/:id", requireCertAdmin, async (c) => {
  const acc = c.get("account")!;
  const deleted = await deleteCertificateRow(c.env, acc.workspaceId, c.req.param("id"));
  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

ssl.get("/domains/:id/download", requireCertAdmin, async (c) => {
  const acc = c.get("account")!;
  const row = await getCertificateRow(c.env, acc.workspaceId, c.req.param("id"));
  if (!row) return c.json({ error: "Not found" }, 404);
  if (row.status !== "issued" && row.status !== "expiring") {
    return c.json({ error: "Certificate is not issued yet" }, 400);
  }
  if (!row.cert_pem || !row.cert_key_enc) {
    return c.json({ error: "Certificate files are not available" }, 404);
  }

  try {
    const jwkJson = await decryptSecret(row.cert_key_enc, c.env.TOKEN_SECRET);
    const jwk = JSON.parse(jwkJson) as JsonWebKey;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", key);
    if (!(pkcs8 instanceof ArrayBuffer)) {
      return c.json({ error: "Unexpected private key format" }, 500);
    }
    const privateKeyPem = arrayBufferToPem(pkcs8, "PRIVATE KEY");
    return c.json({
      domain: row.domain,
      hostnames: hostnamesFromRow(row),
      certificatePem: row.cert_pem,
      privateKeyPem,
      expiresAt: row.expires_at,
      formats: {
        nginx: "Use certificatePem as fullchain (or split leaf+chain) and privateKeyPem as the key file.",
        apache: "Use certificatePem for SSLCertificateFile and privateKeyPem for SSLCertificateKeyFile.",
        caddy: "Point tls directives at the PEM files, or paste into your Caddyfile as needed.",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not export certificate";
    return c.json({ error: message }, 500);
  }
});

function arrayBufferToPem(buf: ArrayBuffer, label: string): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  const b64 = btoa(binary);
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

export default ssl;
