import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import {
  requirePaidAccount,
  requireWorkspaceAdmin,
  resolveAccount,
  SESSION_COOKIE_NAME,
  type AuthEnv,
} from "../lib/auth";
import {
  appConnectorUrl,
  buildAuthorizeUrl,
  createOAuthState,
  disconnectConnector,
  explainConnectorError,
  importCloudPdf,
  isCloudProvider,
  listConnectorStatuses,
  listRecentFiles,
  parseOAuthState,
  testCloudConnector,
  upsertConnectorFromCode,
  type CloudProvider,
} from "../lib/cloudConnectors";
import {
  buildAccountingAuthorizeUrl,
  disconnectAccounting,
  fetchOverdueInvoices,
  isAccountingProvider,
  listAccountingStatuses,
  upsertAccountingFromCode,
  type AccountingProvider,
} from "../lib/accountingConnectors";

/**
 * Cloud storage (Dropbox / OneDrive / Box) + native accounting (QuickBooks / Xero).
 *
 * Redirect URIs:
 *   https://api.docstoc.io/api/account/connectors/dropbox/callback
 *   https://api.docstoc.io/api/account/connectors/onedrive/callback
 *   https://api.docstoc.io/api/account/connectors/box/callback
 *   https://api.docstoc.io/api/account/connectors/quickbooks/callback
 *   https://api.docstoc.io/api/account/connectors/xero/callback
 *
 * Secrets: DROPBOX_*, ONEDRIVE_*, BOX_*, QBO_CLIENT_ID/SECRET, XERO_CLIENT_ID/SECRET
 */
const cloudConnectors = new Hono<AuthEnv>();

/**
 * The signed state only proves we issued it, not that this browser asked for it. Without this
 * check, an attacker sends a victim their own authorize URL and the victim's Dropbox or Google
 * tokens land in the attacker's workspace. The provider redirects top-level to api.docstoc.io, so
 * the session cookie (SameSite=Lax, Domain=.docstoc.io) is present.
 */
async function sessionMatchesState(c: Context<AuthEnv>, stateAccountId: string): Promise<boolean> {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  const account = token ? await resolveAccount(c.env, token) : null;
  return account?.workspaceId === stateAccountId && account.role === "admin";
}

async function handleCallback(c: Context<AuthEnv>, provider: CloudProvider) {
  const err = c.req.query("error");
  const errDesc = c.req.query("error_description");
  if (err) {
    const code = err.slice(0, 80);
    return c.redirect(
      appConnectorUrl(c.env, {
        cloud: provider,
        error: code,
        ...(errDesc ? { error_description: errDesc.slice(0, 160) } : {}),
      }),
      302
    );
  }
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) {
    return c.redirect(appConnectorUrl(c.env, { cloud: provider, error: "missing_code" }), 302);
  }
  const parsed = await parseOAuthState(c.env, state);
  if (!parsed || !(await sessionMatchesState(c, parsed.accountId))) {
    return c.redirect(appConnectorUrl(c.env, { cloud: provider, error: "invalid_state" }), 302);
  }
  try {
    await upsertConnectorFromCode(c.env, parsed.accountId, provider, code);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "token_exchange";
    console.error(`${provider} token exchange failed`, detail);
    return c.redirect(
      appConnectorUrl(c.env, {
        cloud: provider,
        error: "token_exchange",
        error_description: detail.slice(0, 160),
      }),
      302
    );
  }
  return c.redirect(appConnectorUrl(c.env, { connected: provider }), 302);
}

async function handleAccountingCallback(c: Context<AuthEnv>, provider: AccountingProvider) {
  const err = c.req.query("error");
  if (err) {
    return c.redirect(appConnectorUrl(c.env, { accounting: provider, error: err.slice(0, 80) }), 302);
  }
  const code = c.req.query("code");
  const state = c.req.query("state");
  const realmId = c.req.query("realmId") || c.req.query("realm_id") || null;
  if (!code || !state) {
    return c.redirect(appConnectorUrl(c.env, { accounting: provider, error: "missing_code" }), 302);
  }
  const parsed = await parseOAuthState(c.env, state);
  if (!parsed || !(await sessionMatchesState(c, parsed.accountId))) {
    return c.redirect(appConnectorUrl(c.env, { accounting: provider, error: "invalid_state" }), 302);
  }
  try {
    await upsertAccountingFromCode(c.env, parsed.accountId, provider, code, realmId);
  } catch (e) {
    console.error(`${provider} token exchange failed`, e);
    return c.redirect(appConnectorUrl(c.env, { accounting: provider, error: "token_exchange" }), 302);
  }
  return c.redirect(appConnectorUrl(c.env, { connected: provider }), 302);
}

cloudConnectors.get("/", requirePaidAccount, async (c) => {
  const acc = c.get("account")!;
  const [connectors, accounting] = await Promise.all([
    listConnectorStatuses(c.env, acc.workspaceId),
    listAccountingStatuses(c.env, acc.workspaceId),
  ]);
  return c.json({ connectors, accounting });
});

cloudConnectors.get("/dropbox/callback", (c) => handleCallback(c, "dropbox"));
cloudConnectors.get("/onedrive/callback", (c) => handleCallback(c, "onedrive"));
cloudConnectors.get("/box/callback", (c) => handleCallback(c, "box"));
cloudConnectors.get("/google/callback", (c) => handleCallback(c, "google"));
cloudConnectors.get("/quickbooks/callback", (c) => handleAccountingCallback(c, "quickbooks"));
cloudConnectors.get("/xero/callback", (c) => handleAccountingCallback(c, "xero"));

cloudConnectors.get("/:provider/connect", requireWorkspaceAdmin, async (c) => {
  const providerParam = c.req.param("provider");
  const acc = c.get("account")!;

  if (isAccountingProvider(providerParam)) {
    const authorizeUrl = buildAccountingAuthorizeUrl(
      c.env,
      providerParam,
      await createOAuthState(c.env, acc.workspaceId)
    );
    if (!authorizeUrl) {
      const secrets =
        providerParam === "quickbooks"
          ? "QBO_CLIENT_ID and QBO_CLIENT_SECRET"
          : "XERO_CLIENT_ID and XERO_CLIENT_SECRET";
      const wantsJson = (c.req.header("Accept") || "").includes("application/json");
      if (wantsJson) {
        return c.json(
          {
            error: `${providerParam} OAuth is not configured. Set ${secrets}.`,
            code: "not_configured",
            redirectUri: `${c.env.PUBLIC_WORKER_URL.replace(/\/$/, "")}/api/account/connectors/${providerParam}/callback`,
          },
          503
        );
      }
      return c.redirect(
        appConnectorUrl(c.env, { accounting: providerParam, error: "not_configured" }),
        302
      );
    }
    return c.redirect(authorizeUrl, 302);
  }

  if (!isCloudProvider(providerParam)) {
    return c.json({ error: "Unknown provider" }, 404);
  }
  const provider = providerParam as CloudProvider;
  const authorizeUrl = buildAuthorizeUrl(
    c.env,
    provider,
    await createOAuthState(c.env, acc.workspaceId)
  );
  if (!authorizeUrl) {
    const wantsJson = (c.req.header("Accept") || "").includes("application/json");
    const message = `${provider} OAuth is not configured yet. Set ${provider.toUpperCase()}_CLIENT_ID and ${provider.toUpperCase()}_CLIENT_SECRET on the worker (see Operator notes on /app/connector).`;
    if (wantsJson) {
      return c.json(
        {
          error: message,
          code: "not_configured",
          configured: false,
          redirectUri: `${c.env.PUBLIC_WORKER_URL.replace(/\/$/, "")}/api/account/connectors/${provider}/callback`,
        },
        503
      );
    }
    return c.redirect(appConnectorUrl(c.env, { cloud: provider, error: "not_configured" }), 302);
  }
  return c.redirect(authorizeUrl, 302);
});

cloudConnectors.post("/:provider/test", requireWorkspaceAdmin, async (c) => {
  const providerParam = c.req.param("provider");
  if (!isCloudProvider(providerParam)) {
    return c.json({ error: "Unknown provider" }, 404);
  }
  const result = await testCloudConnector(c.env, c.get("account")!.workspaceId, providerParam);
  let explanation: string | null = null;
  if (!result.ok) {
    if (!result.configured) explanation = explainConnectorError("not_configured");
    else if (!result.connected) explanation = explainConnectorError("not_connected");
    else explanation = result.hint;
  }
  return c.json({ ...result, explanation });
});

cloudConnectors.delete("/:provider", requireWorkspaceAdmin, async (c) => {
  const providerParam = c.req.param("provider");
  const acc = c.get("account")!;
  if (isAccountingProvider(providerParam)) {
    const ok = await disconnectAccounting(c.env, acc.workspaceId, providerParam);
    if (!ok) return c.json({ error: "Not connected" }, 404);
    return c.json({ ok: true });
  }
  if (!isCloudProvider(providerParam)) {
    return c.json({ error: "Unknown provider" }, 404);
  }
  const ok = await disconnectConnector(c.env, acc.workspaceId, providerParam);
  if (!ok) return c.json({ error: "Not connected" }, 404);
  return c.json({ ok: true });
});

cloudConnectors.get("/:provider/invoices", requirePaidAccount, async (c) => {
  const providerParam = c.req.param("provider");
  if (!isAccountingProvider(providerParam)) {
    return c.json({ error: "Not an accounting provider" }, 404);
  }
  try {
    const invoices = await fetchOverdueInvoices(c.env, c.get("account")!.workspaceId, providerParam);
    return c.json({
      invoices,
      note: "Overdue unpaid invoices. Import into aging — docstoc never auto-sends.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not fetch invoices";
    return c.json({ error: message }, 502);
  }
});

cloudConnectors.post("/:provider/import-invoices", requireWorkspaceAdmin, async (c) => {
  const providerParam = c.req.param("provider");
  if (!isAccountingProvider(providerParam)) {
    return c.json({ error: "Not an accounting provider" }, 404);
  }
  const acc = c.get("account")!;
  let invoices: Awaited<ReturnType<typeof fetchOverdueInvoices>>;
  try {
    invoices = await fetchOverdueInvoices(c.env, acc.workspaceId, providerParam);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not fetch invoices";
    return c.json({ error: message }, 502);
  }

  const now = new Date().toISOString();
  const mapped: Array<{ id: string; clientName: string; amount: number; dueDate: string }> = [];

  for (const inv of invoices) {
    const id = await stableId(`${acc.workspaceId}:${providerParam}:${inv.externalId}`);
    const clientId = await findOrCreateClient(c.env.CHASA_DB, acc.workspaceId, inv.clientName);
    await c.env.CHASA_DB.prepare(
      `INSERT INTO aging_invoices
         (id, account_id, client_id, client_name, amount, due_date, last_chase_status, last_chase_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         client_id = excluded.client_id,
         client_name = excluded.client_name,
         amount = excluded.amount,
         due_date = excluded.due_date,
         updated_at = excluded.updated_at
       WHERE aging_invoices.account_id = excluded.account_id`
    )
      .bind(id, acc.workspaceId, clientId, inv.clientName, inv.amount, inv.dueDate, now, now)
      .run();
    mapped.push({ id, clientName: inv.clientName, amount: inv.amount, dueDate: inv.dueDate });
  }

  return c.json({ imported: mapped.length, invoices: mapped });
});

cloudConnectors.get("/:provider/files", requirePaidAccount, async (c) => {
  const providerParam = c.req.param("provider");
  if (!isCloudProvider(providerParam)) {
    return c.json({ error: "Unknown provider" }, 404);
  }
  try {
    const files = await listRecentFiles(c.env, c.get("account")!.workspaceId, providerParam);
    return c.json({ files });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not list files";
    if (msg === "Not connected") return c.json({ error: msg }, 404);
    return c.json({ error: msg }, 502);
  }
});

cloudConnectors.post("/:provider/files/import", requireWorkspaceAdmin, async (c) => {
  const providerParam = c.req.param("provider");
  if (!isCloudProvider(providerParam)) {
    return c.json({ error: "Unknown provider" }, 404);
  }
  let body: { id?: string; path?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  if (!body?.id || typeof body.id !== "string") {
    return c.json({ error: "id is required" }, 400);
  }
  const path = typeof body.path === "string" ? body.path : null;
  try {
    const result = await importCloudPdf(
      c.env,
      c.get("account")!.workspaceId,
      providerParam,
      body.id,
      path
    );
    return c.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not import file";
    if (msg === "Not connected") return c.json({ error: msg }, 404);
    if (msg.startsWith("File too large") || msg.startsWith("Only PDF") || msg.startsWith("Missing")) {
      return c.json({ error: msg }, 400);
    }
    return c.json({ error: msg }, 502);
  }
});

async function stableId(seed: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  const bytes = new Uint8Array(digest).slice(0, 16);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function findOrCreateClient(
  db: D1Database,
  accountId: string,
  clientName: string
): Promise<string> {
  const existing = await db
    .prepare(`SELECT id FROM clients WHERE account_id = ? AND name = ? COLLATE NOCASE LIMIT 1`)
    .bind(accountId, clientName)
    .first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO clients (id, account_id, name, email, notes, created_at, updated_at)
       VALUES (?, ?, ?, NULL, NULL, ?, ?)`
    )
    .bind(id, accountId, clientName, now, now)
    .run();
  return id;
}

export default cloudConnectors;
