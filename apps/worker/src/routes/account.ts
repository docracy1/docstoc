import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import type { Env } from "../types";
import { requireAccount, requirePaidAccount, requireWorkspaceAdmin, type AuthEnv } from "../lib/auth";
import { isAdminEmail } from "../lib/adminAuth";
import { NOTRACK_COOKIE_NAME, noTrackCookieOptions } from "../lib/analytics";
import cloudConnectors from "./cloudConnectors";
import googleIntegrations from "./googleIntegrations";
import { importLocalPdfBytes } from "../lib/pdfInvoiceHints";
import {
  brandingUpdateSchema,
  digestSettingsSchema,
  marketingOptInSchema,
  parseJsonBody,
  validateWorkspaceName,
} from "../lib/schemas";

const account = new Hono<AuthEnv>();

account.route("/connectors", cloudConnectors);
account.route("/google", googleIntegrations);

type BrandingRow = {
  workspace_name: string | null;
  logo_data: string | null;
  payment_link: string | null;
  late_fee_enabled: number | null;
  late_fee_hint: string | null;
  business_address: string | null;
  business_state: string | null;
  business_postal: string | null;
  business_country: string | null;
  business_vat: string | null;
};

/** Single source of truth for reading an account's branding row — used by the account's own
 *  /branding endpoint and by public routes (e.g. certificate verification pages) that need to
 *  render another account's branding without duplicating this query. */
export async function getBrandingRow(env: Env, accountId: string): Promise<BrandingRow | null> {
  return env.CHASA_DB.prepare(
    `SELECT workspace_name, logo_data, payment_link, late_fee_enabled, late_fee_hint,
            business_address, business_state, business_postal, business_country, business_vat
     FROM accounts WHERE id = ?`
  )
    .bind(accountId)
    .first<BrandingRow>();
}

account.get("/me", requireAccount, async (c) => {
  const acc = c.get("account")!;
  const row = await c.env.CHASA_DB.prepare(
    `SELECT workspace_name, logo_data, payment_link, late_fee_enabled, late_fee_hint, digest_enabled, marketing_opt_in FROM accounts WHERE id = ?`
  )
    .bind(acc.workspaceId)
    .first<{
      workspace_name: string | null;
      logo_data: string | null;
      payment_link: string | null;
      late_fee_enabled: number | null;
      late_fee_hint: string | null;
      digest_enabled: number | null;
      marketing_opt_in: number | null;
    }>();

  if (isAdminEmail(c.env, acc.email)) {
    setCookie(c, NOTRACK_COOKIE_NAME, "1", noTrackCookieOptions(c.env));
  }

  // Marketing consent belongs to the person, the rest of this row to the workspace.
  const personal =
    acc.id === acc.workspaceId
      ? row
      : await c.env.CHASA_DB.prepare(`SELECT marketing_opt_in FROM accounts WHERE id = ?`)
          .bind(acc.id)
          .first<{ marketing_opt_in: number | null }>();

  return c.json({
    email: acc.email,
    plan: acc.plan,
    workspaceName: row?.workspace_name ?? null,
    logoDataUrl: row?.logo_data ?? null,
    paymentLink: row?.payment_link ?? null,
    lateFeeEnabled: !!(row?.late_fee_enabled),
    lateFeeHint: row?.late_fee_hint ?? null,
    digestEnabled: row?.digest_enabled !== 0,
    marketingOptIn: !!personal?.marketing_opt_in,
    role: acc.role,
    workspaceId: acc.workspaceId,
    isAdmin: isAdminEmail(c.env, acc.email),
  });
});

account.get("/branding", requireAccount, async (c) => {
  const acc = c.get("account")!;
  const row = await getBrandingRow(c.env, acc.workspaceId);

  return c.json({
    workspaceName: row?.workspace_name ?? null,
    logoDataUrl: row?.logo_data ?? null,
    paymentLink: row?.payment_link ?? null,
    lateFeeEnabled: !!(row?.late_fee_enabled),
    lateFeeHint: row?.late_fee_hint ?? null,
    businessAddress: row?.business_address ?? null,
    businessState: row?.business_state ?? null,
    businessPostal: row?.business_postal ?? null,
    businessCountry: row?.business_country ?? null,
    businessVat: row?.business_vat ?? null,
    paid: acc.isPaid,
  });
});

const MAX_LOGO_CHARS = 140_000; // ~100KB binary as data URL

account.put("/branding", requireWorkspaceAdmin, async (c) => {
  const acc = c.get("account")!;
  const parsed = await parseJsonBody(c.req, brandingUpdateSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const body = parsed.data;

  const current = await c.env.CHASA_DB.prepare(
    `SELECT workspace_name, logo_data, payment_link, late_fee_enabled, late_fee_hint,
            business_address, business_state, business_postal, business_country, business_vat
     FROM accounts WHERE id = ?`
  )
    .bind(acc.workspaceId)
    .first<{
      workspace_name: string | null;
      logo_data: string | null;
      payment_link: string | null;
      late_fee_enabled: number | null;
      late_fee_hint: string | null;
      business_address: string | null;
      business_state: string | null;
      business_postal: string | null;
      business_country: string | null;
      business_vat: string | null;
    }>();

  let workspaceName = current?.workspace_name ?? null;
  let logoData = current?.logo_data ?? null;
  let paymentLink = current?.payment_link ?? null;
  let lateFeeEnabled = !!(current?.late_fee_enabled);
  let lateFeeHint = current?.late_fee_hint ?? null;
  let businessAddress = current?.business_address ?? null;
  let businessState = current?.business_state ?? null;
  let businessPostal = current?.business_postal ?? null;
  let businessCountry = current?.business_country ?? null;
  let businessVat = current?.business_vat ?? null;

  if (body.removeName === true) {
    workspaceName = null;
  } else if (typeof body.workspaceName === "string") {
    const name = body.workspaceName.trim();
    if (name.length === 0) {
      workspaceName = null;
    } else if (name.length < 3 || name.length > 30 || !validateWorkspaceName(name)) {
      return c.json(
        { error: "Workspace name: 3–30 characters, letters and numbers only (spaces/_/- ok in the middle)." },
        400
      );
    } else {
      workspaceName = name;
    }
  }

  if (body.removeLogo === true) {
    logoData = null;
  } else if (typeof body.logoDataUrl === "string") {
    const dataUrl = body.logoDataUrl.trim();
    if (!dataUrl.startsWith("data:image/")) {
      return c.json({ error: "Logo must be a PNG, JPEG, or WebP image." }, 400);
    }
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(dataUrl)) {
      return c.json({ error: "Logo must be a PNG, JPEG, or WebP image." }, 400);
    }
    if (dataUrl.length > MAX_LOGO_CHARS) {
      return c.json({ error: "Logo is too large — keep under ~100KB." }, 400);
    }
    logoData = dataUrl;
  }

  if (body.removePaymentLink === true) {
    paymentLink = null;
  } else if (typeof body.paymentLink === "string") {
    const link = body.paymentLink.trim();
    if (link.length === 0) {
      paymentLink = null;
    } else if (!/^https?:\/\//i.test(link) || link.length > 500) {
      return c.json(
        { error: "Payment link must be an http(s) URL under 500 characters." },
        400
      );
    } else {
      paymentLink = link;
    }
  }

  if (typeof body.lateFeeEnabled === "boolean") {
    lateFeeEnabled = body.lateFeeEnabled;
  }
  if (typeof body.lateFeeHint === "string") {
    const hint = body.lateFeeHint.trim().slice(0, 200);
    lateFeeHint = hint.length ? hint : null;
  }
  if (!lateFeeEnabled) {
    // keep hint stored but disabled
  }

  if (typeof body.businessAddress === "string") {
    const v = body.businessAddress.trim().slice(0, 300);
    businessAddress = v.length ? v : null;
  }
  if (typeof body.businessState === "string") {
    const v = body.businessState.trim().slice(0, 120);
    businessState = v.length ? v : null;
  }
  if (typeof body.businessPostal === "string") {
    const v = body.businessPostal.trim().slice(0, 32);
    businessPostal = v.length ? v : null;
  }
  if (typeof body.businessCountry === "string") {
    const v = body.businessCountry.trim().slice(0, 120);
    businessCountry = v.length ? v : null;
  }
  if (typeof body.businessVat === "string") {
    const v = body.businessVat.trim().slice(0, 64);
    businessVat = v.length ? v : null;
  }

  await c.env.CHASA_DB.prepare(
    `UPDATE accounts SET workspace_name = ?, logo_data = ?, payment_link = ?, late_fee_enabled = ?, late_fee_hint = ?,
       business_address = ?, business_state = ?, business_postal = ?, business_country = ?, business_vat = ?
     WHERE id = ?`
  )
    .bind(
      workspaceName,
      logoData,
      paymentLink,
      lateFeeEnabled ? 1 : 0,
      lateFeeHint,
      businessAddress,
      businessState,
      businessPostal,
      businessCountry,
      businessVat,
      acc.workspaceId
    )
    .run();

  return c.json({
    workspaceName,
    logoDataUrl: logoData,
    paymentLink,
    lateFeeEnabled,
    lateFeeHint,
    businessAddress,
    businessState,
    businessPostal,
    businessCountry,
    businessVat,
    paid: true,
  });
});

account.patch("/digest", requireAccount, async (c) => {
  const acc = c.get("account")!;
  if (!acc.isPaid) {
    return c.json({ error: "Daily chase digest requires a Pro or Business plan." }, 403);
  }
  if (acc.role !== "admin") return c.json({ error: "Admin role required" }, 403);
  const parsed = await parseJsonBody(c.req, digestSettingsSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  await c.env.CHASA_DB.prepare(`UPDATE accounts SET digest_enabled = ? WHERE id = ?`)
    .bind(parsed.data.digestEnabled ? 1 : 0, acc.workspaceId)
    .run();
  return c.json({ digestEnabled: parsed.data.digestEnabled });
});

account.patch("/marketing-opt-in", requireAccount, async (c) => {
  const acc = c.get("account")!;
  const parsed = await parseJsonBody(c.req, marketingOptInSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  if (parsed.data.marketingOptIn) {
    // Set-once: an account that already has a token keeps it, so a previously emailed unsubscribe
    // link never goes stale just because they opted back in later.
    await c.env.CHASA_DB.prepare(
      `UPDATE accounts SET marketing_opt_in = 1, marketing_unsub_token = COALESCE(marketing_unsub_token, ?) WHERE id = ?`
    )
      .bind(crypto.randomUUID(), acc.id)
      .run();
  } else {
    await c.env.CHASA_DB.prepare(`UPDATE accounts SET marketing_opt_in = 0 WHERE id = ?`)
      .bind(acc.id)
      .run();
  }
  return c.json({ marketingOptIn: parsed.data.marketingOptIn });
});

/** Public, token-based — same one-click pattern as the templates-pack unsubscribe link. */
account.get("/marketing-unsubscribe", async (c) => {
  const token = c.req.query("token")?.trim();
  if (!token) return c.text("Missing token", 400);
  const result = await c.env.CHASA_DB.prepare(
    `UPDATE accounts SET marketing_opt_in = 0 WHERE marketing_unsub_token = ?`
  )
    .bind(token)
    .run();
  if (!result.meta.changes) return c.text("That unsubscribe link is invalid or already used.", 404);
  return c.html(`<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#1B3155">
    <h1 style="font-size:22px">You're unsubscribed</h1>
    <p>You won't receive further product news/update emails. Transactional emails (sign-in links, receipts, digests you've enabled) are unaffected.</p>
  </body></html>`);
});

/** Local PDF upload from New chase — same hint shape as cloud connector import. */
account.post("/pdf/import", requirePaidAccount, async (c) => {
  let body: { filename?: string; base64?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const filename = typeof body.filename === "string" ? body.filename : "";
  const base64 = typeof body.base64 === "string" ? body.base64.replace(/^data:application\/pdf;base64,/, "") : "";
  if (!base64) return c.json({ error: "base64 is required" }, 400);
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const result = importLocalPdfBytes(filename || "invoice.pdf", bytes.buffer);
    return c.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not import PDF";
    if (
      msg.startsWith("File too large") ||
      msg.startsWith("Only PDF") ||
      msg.startsWith("File does not") ||
      msg.startsWith("Uploaded file")
    ) {
      return c.json({ error: msg }, 400);
    }
    return c.json({ error: msg }, 502);
  }
});

export default account;
