import type { Env } from "../types";
import { timingSafeEqual } from "./cryptoUtils";
import { generateOpaqueToken, hashOpaqueToken, hashOpaqueTokenLegacy } from "./token";
import { decryptSecret, encryptSecret } from "./secretCrypto";
import {
  extractPdfText,
  isPdfMagic,
  parseInvoiceHints,
  type InvoiceHints,
} from "./pdfInvoiceHints";

export type { InvoiceHints };

const MAX_IMPORT_BYTES = 8 * 1024 * 1024; // 8 MB

const GOOGLE_CONNECTOR_SCOPE = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
].join(" ");

function dropboxClientCreds(env: Env): { clientId: string; clientSecret: string } {
  return {
    clientId: env.DROPBOX_CLIENT_ID!.trim(),
    clientSecret: env.DROPBOX_CLIENT_SECRET!.trim(),
  };
}

function dropboxBasicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

async function dropboxOAuthErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { error?: string; error_description?: string };
    if (data.error && data.error_description) return `${data.error}: ${data.error_description}`;
    if (data.error) return data.error;
    if (data.error_description) return data.error_description;
  } catch {
    /* not JSON */
  }
  return text.slice(0, 200) || `HTTP ${res.status}`;
}

export type CloudProvider = "dropbox" | "onedrive" | "box" | "google";

export const CLOUD_PROVIDERS: CloudProvider[] = ["dropbox", "onedrive", "box", "google"];

export function isCloudProvider(v: string): v is CloudProvider {
  return (CLOUD_PROVIDERS as string[]).includes(v);
}

export type CloudConnectorStatus = {
  provider: CloudProvider;
  connected: boolean;
  externalEmail: string | null;
  externalUserId: string | null;
  connectedAt: string | null;
  configured: boolean;
};

export type CloudFile = {
  id: string;
  name: string;
  path: string | null;
  mimeType: string | null;
  size: number | null;
  modifiedAt: string | null;
};

type ConnectorRow = {
  id: string;
  account_id: string;
  provider: string;
  access_token_enc: string;
  refresh_token_enc: string | null;
  expires_at: string | null;
  external_user_id: string | null;
  external_email: string | null;
  connected_at: string;
};

type TokenBundle = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
};

function providerConfigured(env: Env, provider: CloudProvider): boolean {
  switch (provider) {
    case "dropbox":
      return !!(env.DROPBOX_CLIENT_ID && env.DROPBOX_CLIENT_SECRET);
    case "onedrive":
      return !!(env.ONEDRIVE_CLIENT_ID && env.ONEDRIVE_CLIENT_SECRET);
    case "box":
      return !!(env.BOX_CLIENT_ID && env.BOX_CLIENT_SECRET);
    case "google":
      return !!(env.GOOGLE_INTEGRATIONS_CLIENT_ID && env.GOOGLE_INTEGRATIONS_CLIENT_SECRET);
  }
}

export function redirectUri(env: Env, provider: CloudProvider): string {
  const base = env.PUBLIC_WORKER_URL.replace(/\/$/, "");
  return `${base}/api/account/connectors/${provider}/callback`;
}

export function appConnectorUrl(env: Env, query: Record<string, string>): string {
  const u = new URL("/app/connector", env.PUBLIC_APP_URL);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  return u.toString();
}

/** Human-readable OAuth / connect failure hints for the connector test dashboard. */
export function explainConnectorError(code: string): string {
  const c = code.toLowerCase();
  if (c === "access_denied" || c === "user_denied") {
    return "You denied access in the provider consent screen. Click Connect and approve again.";
  }
  if (c.includes("redirect") || c === "redirect_uri_mismatch") {
    return "Redirect URI mismatch — register the exact callback URIs shown under Operator notes.";
  }
  if (c.includes("scope") || c === "invalid_scope" || c === "consent_required") {
    return "Required scopes were not granted. Reconnect and accept Files.Read / offline_access (OneDrive) or equivalent.";
  }
  if (c === "token_exchange") {
    return "Token exchange failed — check client ID/secret and that the redirect URI matches exactly.";
  }
  if (c === "missing_code") {
    return "Provider returned no authorization code. Try Connect again.";
  }
  if (c === "invalid_state") {
    return "OAuth state expired or invalid (15 min). Click Connect again from this tab.";
  }
  if (c === "not_configured" || c === "not_configured_yet") {
    return "OAuth secrets are not set on the worker yet. Expand Operator notes for wrangler secret put …";
  }
  if (c === "not_connected") {
    return "Not connected — click Connect first, then Test.";
  }
  return code.slice(0, 160);
}

export type CloudConnectorTestResult = {
  ok: boolean;
  provider: CloudProvider;
  configured: boolean;
  connected: boolean;
  message: string;
  externalEmail: string | null;
  filesFound: number | null;
  hint: string | null;
};

/**
 * Lightweight connectivity check: refresh token if needed, list recent PDFs.
 * Does not download file contents.
 */
export async function testCloudConnector(
  env: Env,
  accountId: string,
  provider: CloudProvider
): Promise<CloudConnectorTestResult> {
  const configured = providerConfigured(env, provider);
  if (!configured) {
    return {
      ok: false,
      provider,
      configured: false,
      connected: false,
      message: `${provider} OAuth secrets are missing on this worker.`,
      externalEmail: null,
      filesFound: null,
      hint: `Set ${provider.toUpperCase()}_CLIENT_ID and ${provider.toUpperCase()}_CLIENT_SECRET, then redeploy.`,
    };
  }

  const statuses = await listConnectorStatuses(env, accountId);
  const status = statuses.find((s) => s.provider === provider);
  if (!status?.connected) {
    return {
      ok: false,
      provider,
      configured: true,
      connected: false,
      message: "Not connected yet.",
      externalEmail: null,
      filesFound: null,
      hint: "Click Connect, approve access, then run Test again.",
    };
  }

  try {
    const files = await listRecentFiles(env, accountId, provider);
    return {
      ok: true,
      provider,
      configured: true,
      connected: true,
      message:
        files.length > 0
          ? `OK — listed ${files.length} recent PDF${files.length === 1 ? "" : "s"}.`
          : "OK — connection works (no PDFs found in the usual locations).",
      externalEmail: status.externalEmail,
      filesFound: files.length,
      hint: null,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Could not reach provider";
    let hint: string | null = null;
    if (/401|403|unauthorized|invalid_token|expired/i.test(raw)) {
      hint = "Token rejected — Disconnect, then Connect again (scopes or refresh may have been revoked).";
    } else if (/scope|insufficient/i.test(raw)) {
      hint = "Missing file scopes — reconnect and grant file read access.";
    } else if (/redirect/i.test(raw)) {
      hint = "Redirect URI mismatch on the OAuth app — see Operator notes.";
    }
    return {
      ok: false,
      provider,
      configured: true,
      connected: true,
      message: raw,
      externalEmail: status.externalEmail,
      filesFound: null,
      hint,
    };
  }
}

/** Signed OAuth state: accountId.expiry.nonce.sig */
export async function createOAuthState(env: Env, accountId: string): Promise<string> {
  const expiry = String(Math.floor(Date.now() / 1000) + 15 * 60);
  const nonce = generateOpaqueToken().slice(0, 16);
  const payload = `${accountId}.${expiry}.${nonce}`;
  const sig = await hashOpaqueToken(payload, env.TOKEN_SECRET, "oauth-state");
  return `${payload}.${sig}`;
}

export async function parseOAuthState(
  env: Env,
  state: string
): Promise<{ accountId: string } | null> {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [accountId, expiry, nonce, sig] = parts;
  if (!accountId || !expiry || !nonce || !sig) return null;
  const payload = `${accountId}.${expiry}.${nonce}`;
  const expected = await hashOpaqueToken(payload, env.TOKEN_SECRET, "oauth-state");
  const legacyExpected = await hashOpaqueTokenLegacy(payload, env.TOKEN_SECRET);
  if (!timingSafeEqual(expected, sig) && !timingSafeEqual(legacyExpected, sig)) return null;
  if (Number(expiry) < Math.floor(Date.now() / 1000)) return null;
  return { accountId };
}

export async function listConnectorStatuses(
  env: Env,
  accountId: string
): Promise<CloudConnectorStatus[]> {
  const rows = await env.CHASA_DB.prepare(
    `SELECT provider, external_email, external_user_id, connected_at
     FROM cloud_connectors WHERE account_id = ?`
  )
    .bind(accountId)
    .all<{
      provider: string;
      external_email: string | null;
      external_user_id: string | null;
      connected_at: string;
    }>();

  const byProvider = new Map((rows.results ?? []).map((r) => [r.provider, r]));

  return CLOUD_PROVIDERS.map((provider) => {
    const row = byProvider.get(provider);
    return {
      provider,
      connected: !!row,
      externalEmail: row?.external_email ?? null,
      externalUserId: row?.external_user_id ?? null,
      connectedAt: row?.connected_at ?? null,
      configured: providerConfigured(env, provider),
    };
  });
}

export function buildAuthorizeUrl(env: Env, provider: CloudProvider, state: string): string | null {
  if (!providerConfigured(env, provider)) return null;
  const redirect = redirectUri(env, provider);

  switch (provider) {
    case "dropbox": {
      const { clientId } = dropboxClientCreds(env);
      const u = new URL("https://www.dropbox.com/oauth2/authorize");
      u.searchParams.set("client_id", clientId);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("redirect_uri", redirect);
      u.searchParams.set("token_access_type", "offline");
      // Dropbox's scoped-app permission model requires these listed explicitly here — omitting
      // `scope` was issuing tokens with no effective file access, so the connection succeeded
      // (get_current_account needs no file scope) but every listRecentFiles call 401'd, surfaced
      // generically as "Could not list Dropbox files".
      u.searchParams.set("scope", "account_info.read files.metadata.read files.content.read");
      u.searchParams.set("state", state);
      return u.toString();
    }
    case "onedrive": {
      const u = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
      u.searchParams.set("client_id", env.ONEDRIVE_CLIENT_ID!);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("redirect_uri", redirect);
      u.searchParams.set("response_mode", "query");
      u.searchParams.set("scope", "offline_access User.Read Files.Read");
      u.searchParams.set("state", state);
      return u.toString();
    }
    case "box": {
      const u = new URL("https://account.box.com/api/oauth2/authorize");
      u.searchParams.set("client_id", env.BOX_CLIENT_ID!);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("redirect_uri", redirect);
      u.searchParams.set("state", state);
      return u.toString();
    }
    case "google": {
      const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      u.searchParams.set("client_id", env.GOOGLE_INTEGRATIONS_CLIENT_ID!);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("redirect_uri", redirect);
      u.searchParams.set("scope", GOOGLE_CONNECTOR_SCOPE);
      u.searchParams.set("access_type", "offline");
      u.searchParams.set("prompt", "consent");
      u.searchParams.set("state", state);
      return u.toString();
    }
  }
}

async function exchangeCode(
  env: Env,
  provider: CloudProvider,
  code: string
): Promise<TokenBundle & { externalUserId: string | null; externalEmail: string | null }> {
  const redirect = redirectUri(env, provider);

  if (provider === "dropbox") {
    const { clientId, clientSecret } = dropboxClientCreds(env);
    const body = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: redirect,
    });
    const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: dropboxBasicAuth(clientId, clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) {
      throw new Error(await dropboxOAuthErrorMessage(res));
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    const accountRes = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const account = accountRes.ok
      ? ((await accountRes.json()) as {
          account_id?: string;
          email?: string;
        })
      : null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null,
      externalUserId: account?.account_id ?? null,
      externalEmail: account?.email ?? null,
    };
  }

  if (provider === "onedrive") {
    const body = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: env.ONEDRIVE_CLIENT_ID!,
      client_secret: env.ONEDRIVE_CLIENT_SECRET!,
      redirect_uri: redirect,
      scope: "offline_access User.Read Files.Read",
    });
    const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`OneDrive token exchange failed (${res.status})`);
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const me = meRes.ok
      ? ((await meRes.json()) as { id?: string; mail?: string; userPrincipalName?: string })
      : null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null,
      externalUserId: me?.id ?? null,
      externalEmail: me?.mail || me?.userPrincipalName || null,
    };
  }

  if (provider === "google") {
    const body = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: env.GOOGLE_INTEGRATIONS_CLIENT_ID!,
      client_secret: env.GOOGLE_INTEGRATIONS_CLIENT_SECRET!,
      redirect_uri: redirect,
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const me = meRes.ok ? ((await meRes.json()) as { id?: string; email?: string }) : null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null,
      externalUserId: me?.id ?? null,
      externalEmail: me?.email ?? null,
    };
  }

  // box
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: env.BOX_CLIENT_ID!,
    client_secret: env.BOX_CLIENT_SECRET!,
    redirect_uri: redirect,
  });
  const res = await fetch("https://api.box.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Box token exchange failed (${res.status})`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const meRes = await fetch("https://api.box.com/2.0/users/me", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const me = meRes.ok ? ((await meRes.json()) as { id?: string; login?: string }) : null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null,
    externalUserId: me?.id ?? null,
    externalEmail: me?.login ?? null,
  };
}

export async function upsertConnectorFromCode(
  env: Env,
  accountId: string,
  provider: CloudProvider,
  code: string
): Promise<void> {
  const tokens = await exchangeCode(env, provider, code);
  const accessEnc = await encryptSecret(tokens.accessToken, env.TOKEN_SECRET);
  const refreshEnc = tokens.refreshToken
    ? await encryptSecret(tokens.refreshToken, env.TOKEN_SECRET)
    : null;
  const id = crypto.randomUUID();
  const connectedAt = new Date().toISOString();

  await env.CHASA_DB.prepare(
    `INSERT INTO cloud_connectors
      (id, account_id, provider, access_token_enc, refresh_token_enc, expires_at,
       external_user_id, external_email, connected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id, provider) DO UPDATE SET
       access_token_enc = excluded.access_token_enc,
       refresh_token_enc = excluded.refresh_token_enc,
       expires_at = excluded.expires_at,
       external_user_id = excluded.external_user_id,
       external_email = excluded.external_email,
       connected_at = excluded.connected_at`
  )
    .bind(
      id,
      accountId,
      provider,
      accessEnc,
      refreshEnc,
      tokens.expiresAt,
      tokens.externalUserId,
      tokens.externalEmail,
      connectedAt
    )
    .run();
}

export async function disconnectConnector(
  env: Env,
  accountId: string,
  provider: CloudProvider
): Promise<boolean> {
  const result = await env.CHASA_DB.prepare(
    `DELETE FROM cloud_connectors WHERE account_id = ? AND provider = ?`
  )
    .bind(accountId, provider)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

async function refreshAccessToken(
  env: Env,
  provider: CloudProvider,
  refreshToken: string
): Promise<TokenBundle> {
  if (provider === "dropbox") {
    const { clientId, clientSecret } = dropboxClientCreds(env);
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: dropboxBasicAuth(clientId, clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) {
      throw new Error(await dropboxOAuthErrorMessage(res));
    }
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null,
    };
  }

  if (provider === "onedrive") {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env.ONEDRIVE_CLIENT_ID!,
      client_secret: env.ONEDRIVE_CLIENT_SECRET!,
      scope: "offline_access User.Read Files.Read",
    });
    const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error("OneDrive token refresh failed");
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null,
    };
  }

  if (provider === "google") {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env.GOOGLE_INTEGRATIONS_CLIENT_ID!,
      client_secret: env.GOOGLE_INTEGRATIONS_CLIENT_SECRET!,
    });
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error("Google token refresh failed");
    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null,
    };
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: env.BOX_CLIENT_ID!,
    client_secret: env.BOX_CLIENT_SECRET!,
  });
  const res = await fetch("https://api.box.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("Box token refresh failed");
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null,
  };
}

async function getValidAccessToken(
  env: Env,
  accountId: string,
  provider: CloudProvider
): Promise<string> {
  const row = await env.CHASA_DB.prepare(
    `SELECT * FROM cloud_connectors WHERE account_id = ? AND provider = ?`
  )
    .bind(accountId, provider)
    .first<ConnectorRow>();

  if (!row) throw new Error("Not connected");

  const accessToken = await decryptSecret(row.access_token_enc, env.TOKEN_SECRET);
  const expiresSoon =
    row.expires_at && new Date(row.expires_at).getTime() < Date.now() + 60_000;

  if (!expiresSoon) return accessToken;
  if (!row.refresh_token_enc) return accessToken;

  const refreshToken = await decryptSecret(row.refresh_token_enc, env.TOKEN_SECRET);
  const refreshed = await refreshAccessToken(env, provider, refreshToken);
  const accessEnc = await encryptSecret(refreshed.accessToken, env.TOKEN_SECRET);
  const refreshEnc = refreshed.refreshToken
    ? await encryptSecret(refreshed.refreshToken, env.TOKEN_SECRET)
    : row.refresh_token_enc;

  await env.CHASA_DB.prepare(
    `UPDATE cloud_connectors
     SET access_token_enc = ?, refresh_token_enc = ?, expires_at = ?
     WHERE account_id = ? AND provider = ?`
  )
    .bind(accessEnc, refreshEnc, refreshed.expiresAt, accountId, provider)
    .run();

  return refreshed.accessToken;
}

/** Used by Google Gmail/Sheets/Calendar helpers. */
export async function getCloudAccessToken(
  env: Env,
  accountId: string,
  provider: CloudProvider
): Promise<string> {
  return getValidAccessToken(env, accountId, provider);
}

function looksLikeInvoicePdf(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".pdf");
}

export async function listRecentFiles(
  env: Env,
  accountId: string,
  provider: CloudProvider
): Promise<CloudFile[]> {
  const accessToken = await getValidAccessToken(env, accountId, provider);

  if (provider === "dropbox") {
    const res = await fetch("https://api.dropboxapi.com/2/files/search_v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: ".pdf",
        options: { file_status: "active", max_results: 20, filename_only: true },
      }),
    });
    if (!res.ok) {
      // Fall back to root listing if search isn't available for the app type
      const listRes = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ path: "", limit: 50, recursive: false }),
      });
      if (!listRes.ok) throw new Error("Could not list Dropbox files");
      const listData = (await listRes.json()) as {
        entries?: {
          ".tag"?: string;
          id?: string;
          name?: string;
          path_display?: string;
          size?: number;
          client_modified?: string;
        }[];
      };
      return (listData.entries ?? [])
        .filter((e) => e[".tag"] === "file" && e.name && looksLikeInvoicePdf(e.name))
        .slice(0, 20)
        .map((e) => ({
          id: e.id ?? e.path_display ?? e.name!,
          name: e.name!,
          path: e.path_display ?? null,
          mimeType: "application/pdf",
          size: e.size ?? null,
          modifiedAt: e.client_modified ?? null,
        }));
    }
    const data = (await res.json()) as {
      matches?: {
        metadata?: {
          metadata?: {
            ".tag"?: string;
            id?: string;
            name?: string;
            path_display?: string;
            size?: number;
            client_modified?: string;
          };
        };
      }[];
    };
    return (data.matches ?? [])
      .map((m) => m.metadata?.metadata)
      .filter(
        (m): m is NonNullable<typeof m> =>
          !!m && m[".tag"] === "file" && !!m.name && looksLikeInvoicePdf(m.name)
      )
      .slice(0, 20)
      .map((e) => ({
        id: e.id ?? e.path_display ?? e.name!,
        name: e.name!,
        path: e.path_display ?? null,
        mimeType: "application/pdf",
        size: e.size ?? null,
        modifiedAt: e.client_modified ?? null,
      }));
  }

  if (provider === "onedrive") {
    const res = await fetch(
      "https://graph.microsoft.com/v1.0/me/drive/root/search(q='.pdf')?$top=20&$select=id,name,size,lastModifiedDateTime,file,webUrl",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error("Could not list OneDrive files");
    const data = (await res.json()) as {
      value?: {
        id?: string;
        name?: string;
        size?: number;
        lastModifiedDateTime?: string;
        file?: { mimeType?: string };
        webUrl?: string;
      }[];
    };
    return (data.value ?? [])
      .filter((f) => f.name && looksLikeInvoicePdf(f.name))
      .map((f) => ({
        id: f.id ?? f.name!,
        name: f.name!,
        path: f.webUrl ?? null,
        mimeType: f.file?.mimeType ?? "application/pdf",
        size: f.size ?? null,
        modifiedAt: f.lastModifiedDateTime ?? null,
      }));
  }

  if (provider === "google") {
    const q = "mimeType='application/pdf' and trashed=false";
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&pageSize=20&orderBy=modifiedTime desc`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error("Could not list Google Drive files");
    const data = (await res.json()) as {
      files?: {
        id?: string;
        name?: string;
        mimeType?: string;
        size?: string;
        modifiedTime?: string;
        webViewLink?: string;
      }[];
    };
    return (data.files ?? [])
      .filter((f) => f.name && looksLikeInvoicePdf(f.name))
      .map((f) => ({
        id: f.id ?? f.name!,
        name: f.name!,
        path: f.webViewLink ?? null,
        mimeType: f.mimeType ?? "application/pdf",
        size: f.size ? Number(f.size) : null,
        modifiedAt: f.modifiedTime ?? null,
      }));
  }

  if (provider !== "box") throw new Error(`Unsupported provider: ${provider}`);

  // box — root folder items
  const res = await fetch(
    "https://api.box.com/2.0/folders/0/items?limit=50&fields=id,name,size,modified_at,type",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error("Could not list Box files");
  const data = (await res.json()) as {
    entries?: {
      type?: string;
      id?: string;
      name?: string;
      size?: number;
      modified_at?: string;
    }[];
  };
  return (data.entries ?? [])
    .filter((e) => e.type === "file" && e.name && looksLikeInvoicePdf(e.name))
    .slice(0, 20)
    .map((e) => ({
      id: e.id ?? e.name!,
      name: e.name!,
      path: null,
      mimeType: "application/pdf",
      size: e.size ?? null,
      modifiedAt: e.modified_at ?? null,
    }));
}

export type CloudFileImportResult = {
  file: CloudFile;
  hints: InvoiceHints;
  textPreview: string;
  extractedChars: number;
};

async function downloadFileBytes(
  env: Env,
  accountId: string,
  provider: CloudProvider,
  fileId: string,
  path: string | null
): Promise<{ bytes: ArrayBuffer; meta: CloudFile }> {
  const accessToken = await getValidAccessToken(env, accountId, provider);

  if (provider === "dropbox") {
    const dropboxPath = path || fileId;
    if (!dropboxPath) throw new Error("Missing Dropbox file path");
    const res = await fetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Dropbox-API-Arg": JSON.stringify({ path: dropboxPath }),
      },
    });
    if (!res.ok) throw new Error(`Could not download Dropbox file (${res.status})`);
    const apiMeta = res.headers.get("Dropbox-API-Result");
    let name = "invoice.pdf";
    let size: number | null = null;
    let modifiedAt: string | null = null;
    let resolvedPath: string | null = path;
    let resolvedId = fileId;
    if (apiMeta) {
      try {
        const meta = JSON.parse(apiMeta) as {
          name?: string;
          size?: number;
          client_modified?: string;
          path_display?: string;
          id?: string;
        };
        name = meta.name ?? name;
        size = meta.size ?? null;
        modifiedAt = meta.client_modified ?? null;
        resolvedPath = meta.path_display ?? path;
        if (meta.id) resolvedId = meta.id;
      } catch {
        /* ignore malformed header */
      }
    }
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_IMPORT_BYTES) {
      throw new Error(`File too large (max ${MAX_IMPORT_BYTES / (1024 * 1024)} MB)`);
    }
    return {
      bytes,
      meta: {
        id: resolvedId,
        name,
        path: resolvedPath,
        mimeType: "application/pdf",
        size: size ?? bytes.byteLength,
        modifiedAt,
      },
    };
  }

  if (provider === "onedrive") {
    const metaRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}?$select=id,name,size,lastModifiedDateTime,file,webUrl`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!metaRes.ok) throw new Error(`Could not read OneDrive file (${metaRes.status})`);
    const meta = (await metaRes.json()) as {
      id?: string;
      name?: string;
      size?: number;
      lastModifiedDateTime?: string;
      file?: { mimeType?: string };
      webUrl?: string;
    };
    if (meta.size != null && meta.size > MAX_IMPORT_BYTES) {
      throw new Error(`File too large (max ${MAX_IMPORT_BYTES / (1024 * 1024)} MB)`);
    }
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}/content`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Could not download OneDrive file (${res.status})`);
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_IMPORT_BYTES) {
      throw new Error(`File too large (max ${MAX_IMPORT_BYTES / (1024 * 1024)} MB)`);
    }
    return {
      bytes,
      meta: {
        id: meta.id ?? fileId,
        name: meta.name ?? "invoice.pdf",
        path: meta.webUrl ?? path,
        mimeType: meta.file?.mimeType ?? "application/pdf",
        size: meta.size ?? bytes.byteLength,
        modifiedAt: meta.lastModifiedDateTime ?? null,
      },
    };
  }

  if (provider === "google") {
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,size,modifiedTime,mimeType,webViewLink`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!metaRes.ok) throw new Error(`Could not read Google Drive file (${metaRes.status})`);
    const meta = (await metaRes.json()) as {
      id?: string;
      name?: string;
      size?: string;
      modifiedTime?: string;
      mimeType?: string;
      webViewLink?: string;
    };
    const sizeNum = meta.size ? Number(meta.size) : null;
    if (sizeNum != null && sizeNum > MAX_IMPORT_BYTES) {
      throw new Error(`File too large (max ${MAX_IMPORT_BYTES / (1024 * 1024)} MB)`);
    }
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) throw new Error(`Could not download Google Drive file (${res.status})`);
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength > MAX_IMPORT_BYTES) {
      throw new Error(`File too large (max ${MAX_IMPORT_BYTES / (1024 * 1024)} MB)`);
    }
    return {
      bytes,
      meta: {
        id: meta.id ?? fileId,
        name: meta.name ?? "invoice.pdf",
        path: meta.webViewLink ?? path,
        mimeType: meta.mimeType ?? "application/pdf",
        size: sizeNum ?? bytes.byteLength,
        modifiedAt: meta.modifiedTime ?? null,
      },
    };
  }

  if (provider !== "box") throw new Error(`Unsupported provider: ${provider}`);

  // box
  const metaRes = await fetch(
    `https://api.box.com/2.0/files/${encodeURIComponent(fileId)}?fields=id,name,size,modified_at`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!metaRes.ok) throw new Error(`Could not read Box file (${metaRes.status})`);
  const meta = (await metaRes.json()) as {
    id?: string;
    name?: string;
    size?: number;
    modified_at?: string;
  };
  if (meta.size != null && meta.size > MAX_IMPORT_BYTES) {
    throw new Error(`File too large (max ${MAX_IMPORT_BYTES / (1024 * 1024)} MB)`);
  }
  const res = await fetch(
    `https://api.box.com/2.0/files/${encodeURIComponent(fileId)}/content`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Could not download Box file (${res.status})`);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_IMPORT_BYTES) {
    throw new Error(`File too large (max ${MAX_IMPORT_BYTES / (1024 * 1024)} MB)`);
  }
  return {
    bytes,
    meta: {
      id: meta.id ?? fileId,
      name: meta.name ?? "invoice.pdf",
      path: null,
      mimeType: "application/pdf",
      size: meta.size ?? bytes.byteLength,
      modifiedAt: meta.modified_at ?? null,
    },
  };
}

/**
 * Download a connected PDF, scrape text, and return invoice field hints for the Tool.
 * Never returns raw PDF bytes or OAuth tokens to the client.
 */
export async function importCloudPdf(
  env: Env,
  accountId: string,
  provider: CloudProvider,
  fileId: string,
  path: string | null = null
): Promise<CloudFileImportResult> {
  if (!fileId?.trim()) throw new Error("Missing file id");
  const { bytes, meta } = await downloadFileBytes(env, accountId, provider, fileId.trim(), path);
  if (!looksLikeInvoicePdf(meta.name)) {
    throw new Error("Only PDF files can be imported");
  }
  if (bytes.byteLength === 0) {
    throw new Error("Downloaded file was empty");
  }
  if (!isPdfMagic(bytes)) {
    throw new Error("File does not look like a PDF (corrupt or wrong type)");
  }
  const text = extractPdfText(bytes);
  const hints = parseInvoiceHints(meta.name, text);
  const textPreview = text.slice(0, 2500);
  return {
    file: meta,
    hints,
    textPreview,
    extractedChars: text.length,
  };
}
