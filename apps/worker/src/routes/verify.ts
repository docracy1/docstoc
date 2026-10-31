import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "../types";
import type { AuthEnv } from "../lib/auth";
import { SESSION_COOKIE_NAME, requireAccount, resolveAccount } from "../lib/auth";
import {
  createCertificate,
  findCertificatesByHash,
  getCertificateByPublicId,
  getTimestampProof,
  hashIp,
  isValidSha256Hex,
  listCertificatesForAccount,
  recordTimestampFailed,
  recordTimestampSubmitted,
  revokeCertificate,
} from "../lib/certificates";
import { submitTimestamp } from "../lib/openTimestamps";
import { getBrandingRow } from "./account";
import { checkRateLimit, clientIpFromHeaders } from "../lib/rateLimit";
import { certificateCreateSchema, parseJsonBody } from "../lib/schemas";
import { clientIp, verifyTurnstile } from "../lib/turnstile";

const verify = new Hono<AuthEnv>();

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Public, no auth. Anonymous callers are Turnstile-gated + IP-rate-limited; signed-in accounts
 *  get a higher, session-scoped bucket instead since the session itself is a trust signal. */
verify.post("/certificates", async (c) => {
  const parsed = await parseJsonBody(c.req, certificateCreateSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const body = parsed.data;
  if (!isValidSha256Hex(body.sha256Hash)) {
    return c.json({ error: "Invalid hash" }, 400);
  }

  const ip = clientIp(c) || clientIpFromHeaders({ get: (n) => c.req.header(n) ?? null });

  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  const account = sessionToken ? await resolveAccount(c.env, sessionToken) : null;

  if (account) {
    const rl = await checkRateLimit(c.env, `cert_create_acct:${account.workspaceId}`, 50, 3600);
    if (!rl.ok) return c.json({ error: "Too many certificates created. Try again later." }, 429);
  } else {
    const rl = await checkRateLimit(c.env, `cert_create_anon:${ip}`, 5, 3600);
    if (!rl.ok) return c.json({ error: "Too many certificates created. Try again later." }, 429);

    const check = await verifyTurnstile(c.env, body.turnstileToken, ip);
    if (!check.ok) return c.json({ error: check.error }, 400);
  }

  let issuerName: string | null = null;
  if (!account) {
    issuerName = body.issuerName?.trim() || null;
  }

  const cert = await createCertificate(c.env, {
    accountId: account?.workspaceId ?? null,
    sha256Hash: body.sha256Hash.toLowerCase(),
    originalFilename: body.originalFilename?.trim() || null,
    fileSizeBytes: typeof body.fileSizeBytes === "number" ? body.fileSizeBytes : null,
    issuerName,
    plan: account?.plan ?? "free",
    ipHash: await hashIp(c.env, ip || "unknown"),
  });

  // Anchor the hash to Bitcoin via OpenTimestamps in the background — the response doesn't wait
  // on a third-party calendar server, and the certificate is already fully usable without it.
  c.executionCtx.waitUntil(
    (async () => {
      const result = await submitTimestamp(cert.sha256Hash);
      if (result.ok) {
        await recordTimestampSubmitted(c.env, cert.id, {
          calendarUrl: result.calendarUrl,
          proofBase64: result.proofBase64,
        });
      } else {
        await recordTimestampFailed(c.env, cert.id);
        console.error("OpenTimestamps submission failed:", result.error);
      }
    })().catch((err) => console.error("OpenTimestamps submission threw:", err))
  );

  return c.json({
    ok: true,
    publicId: cert.publicId,
    createdAt: cert.createdAt,
  });
});

async function resolveBranding(
  env: Env,
  accountId: string | null
): Promise<{ issuerName: string; logoDataUrl: string | null; isBranded: boolean }> {
  if (!accountId) {
    return { issuerName: "docstoc.io (Free Edition)", logoDataUrl: null, isBranded: false };
  }
  const acc = await env.CHASA_DB.prepare(`SELECT plan FROM accounts WHERE id = ?`)
    .bind(accountId)
    .first<{ plan: string | null }>();
  const isBusinessPlan = acc?.plan === "business";
  if (!isBusinessPlan) {
    return { issuerName: "docstoc.io (Free Edition)", logoDataUrl: null, isBranded: false };
  }
  const branding = await getBrandingRow(env, accountId);
  return {
    issuerName: branding?.workspace_name || "docstoc.io (Free Edition)",
    logoDataUrl: branding?.logo_data || null,
    isBranded: true,
  };
}

/** Public, no auth — this is the API the public /verify/:id Pages Function calls. */
verify.get("/certificates/:publicId", async (c) => {
  const cert = await getCertificateByPublicId(c.env, c.req.param("publicId"));
  if (!cert) return c.json({ error: "Not found" }, 404);

  const branding = await resolveBranding(c.env, cert.accountId);
  const displayIssuer = cert.accountId ? branding.issuerName : cert.issuerName || "Anonymous issuer";

  return c.json({
    publicId: cert.publicId,
    sha256Hash: cert.sha256Hash,
    originalFilename: cert.originalFilename,
    fileSizeBytes: cert.fileSizeBytes,
    issuerName: displayIssuer,
    // An anonymous issuer typed this name in; nothing ties it to a real person or company.
    issuerSelfDeclared: !cert.accountId,
    logoDataUrl: branding.isBranded ? branding.logoDataUrl : null,
    isBranded: branding.isBranded,
    status: cert.status,
    createdAt: cert.createdAt,
    otsStatus: cert.otsStatus,
    otsConfirmedAt: cert.otsConfirmedAt,
  });
});

/** Downloadable .ots proof file — public, no auth, since the verify page itself is public. The
 *  bytes are opaque to us; whoever downloads it verifies independently with the `ots` CLI or any
 *  OpenTimestamps-compatible verifier, against their own copy of the original file. */
verify.get("/certificates/:publicId/timestamp.ots", async (c) => {
  const proof = await getTimestampProof(c.env, c.req.param("publicId"));
  if (!proof) return c.json({ error: "No timestamp proof available yet" }, 404);
  const bytes = Uint8Array.from(atob(proof.proofBase64), (ch) => ch.charCodeAt(0));
  return c.body(bytes, 200, {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${c.req.param("publicId")}.ots"`,
    "Cache-Control": "public, max-age=300",
  });
});

verify.get("/by-hash/:hash", async (c) => {
  const hash = c.req.param("hash").toLowerCase();
  if (!isValidSha256Hex(hash)) return c.json({ error: "Invalid hash" }, 400);

  const ip = clientIp(c) || clientIpFromHeaders({ get: (n) => c.req.header(n) ?? null });
  const rl = await checkRateLimit(c.env, `verify_by_hash:${ip}`, 20, 3600);
  if (!rl.ok) return c.json({ error: "Too many requests. Try again later." }, 429);

  const matches = await findCertificatesByHash(c.env, hash);
  return c.json({ matches });
});

verify.get("/mine", requireAccount, async (c) => {
  const acc = c.get("account")!;
  const certs = await listCertificatesForAccount(c.env, acc.workspaceId);
  return c.json({ certificates: certs });
});

verify.delete("/certificates/:id", requireAccount, async (c) => {
  const acc = c.get("account")!;
  const result = await revokeCertificate(c.env, acc.workspaceId, c.req.param("id"));
  if (!result.ok) return c.json({ error: result.error }, 404);
  return c.json({ ok: true });
});

/** Small embeddable badge script for a business's own website — <1KB, no dependencies, branding
 *  resolved server-side so the snippet itself needs no client-side logic. */
verify.get("/badge/:publicIdJs", async (c) => {
  const publicId = c.req.param("publicIdJs").replace(/\.js$/i, "");
  const cert = await getCertificateByPublicId(c.env, publicId);
  if (!cert || cert.status !== "active") {
    return c.body("/* docstoc verification badge: certificate not found */", 404, {
      "Content-Type": "application/javascript; charset=utf-8",
    });
  }
  const branding = await resolveBranding(c.env, cert.accountId);
  const appOrigin = (c.env.PUBLIC_APP_URL || "https://docstoc.io").replace(/\/$/, "");
  const verifyUrl = `${appOrigin}/verify/${cert.publicId}`;
  // Only claim "Timestamped" once the Bitcoin anchor is actually confirmed — a pending
  // OpenTimestamps submission doesn't back that claim yet.
  const label =
    cert.otsStatus === "confirmed"
      ? branding.isBranded
        ? `Certified & Timestamped via ${branding.issuerName}`
        : "Certified & Timestamped via docstoc"
      : branding.isBranded
      ? `Verified by ${branding.issuerName}`
      : "Verified via docstoc.io";

  const script = `(function(){
  var a=document.createElement("a");
  a.href=${JSON.stringify(verifyUrl)};
  a.target="_blank";
  a.rel="noopener noreferrer";
  a.style.cssText="display:inline-flex;align-items:center;gap:6px;font:12px/1.2 -apple-system,system-ui,sans-serif;color:#1B3155;text-decoration:none;border:1px solid #d8dee8;border-radius:6px;padding:6px 10px;background:#fafbfc";
  a.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2e7d32" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>' + ${JSON.stringify(escapeHtml(label))};
  var s=document.currentScript;
  if(s&&s.parentNode){s.parentNode.insertBefore(a,s);}else{document.write(a.outerHTML);}
})();`;

  return c.body(script, 200, {
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=300",
  });
});

export default verify;
