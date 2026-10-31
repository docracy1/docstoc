import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { verifyTotp } from "./totp";
import type { Env } from "../types";
import { getAdminEmail } from "./adminAuth";
import { isPaidPlan, type Plan } from "./billing";
import { timingSafeEqual } from "./cryptoUtils";
import { checkRateLimit } from "./rateLimit";
import { generateOpaqueToken, hashOpaqueToken, hashOpaqueTokenLookup, hashOpaqueTokenLegacy } from "./token";
import { purgeExpiredSessions } from "./sessionCleanup";
import { sendMagicLinkEmail } from "./email";
import { detectLocaleFromHeader, normalizeLocale, type Locale } from "./locale";
import { normalizePlan } from "./plan";

const MAGIC_LINK_TTL_SECONDS = 15 * 60;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_COOKIE_NAME = "chasa_session";

export interface AccountContext {
  /** Session account id (the signed-in user). */
  id: string;
  email: string;
  plan: Plan;
  isPaid: boolean;
  /**
   * Workspace data scope — owner account id when this user is a team member,
   * otherwise same as `id`. Use for aging/clients/connectors/etc.
   */
  workspaceId: string;
  /** Role in the workspace; owners are always admin. */
  role: "admin" | "member";
}

function isHttps(url: string): boolean {
  return url.startsWith("https://");
}

export function sessionCookieOptions(env: Env) {
  const https = isHttps(env.PUBLIC_APP_URL);
  let domain: string | undefined;
  if (https) {
    try {
      const host = new URL(env.PUBLIC_APP_URL).hostname;
      if (host === "docstoc.io" || host.endsWith(".docstoc.io")) {
        domain = ".docstoc.io";
      } else if (host === "chasa.io" || host.endsWith(".chasa.io")) {
        domain = ".chasa.io";
      }
    } catch {
      /* ignore */
    }
  }
  return {
    httpOnly: true as const,
    secure: https,
    // The app reaches the API through the same-origin Pages proxy or from a *.docstoc.io sibling,
    // so nothing needs this cookie on a cross-site request.
    sameSite: "Lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    ...(domain ? { domain } : {}),
  };
}

async function findOrCreateAccount(
  env: Env,
  email: string,
  locale: Locale = "en"
): Promise<{ id: string; plan: Plan; isPaid: boolean; isNew: boolean }> {
  const normalized = email.trim().toLowerCase();
  const existing = await env.CHASA_DB.prepare(`SELECT id, is_paid, plan FROM accounts WHERE email = ?`)
    .bind(normalized)
    .first<{ id: string; is_paid: number; plan: string | null }>();

  if (existing) {
    await env.CHASA_DB.prepare(`UPDATE accounts SET last_login_at = ? WHERE id = ?`)
      .bind(new Date().toISOString(), existing.id)
      .run();
    const plan = normalizePlan(existing.plan, existing.is_paid === 1);
    return { id: existing.id, plan, isPaid: isPaidPlan(plan), isNew: false };
  }

  const id = crypto.randomUUID();
  await env.CHASA_DB.prepare(
    `INSERT INTO accounts (id, email, created_at, is_paid, plan, locale) VALUES (?, ?, ?, 0, 'free', ?)`
  )
    .bind(id, normalized, new Date().toISOString(), locale)
    .run();
  return { id, plan: "free", isPaid: false, isNew: true };
}

/** Soft cooldown between magic-link emails for the same address (Turnstile is the main bot gate). */
const MAGIC_LINK_COOLDOWN_SECONDS = 60;

export async function requestMagicLink(
  env: Env,
  email: string,
  appOrigin: string,
  acceptLanguage?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (env.ADMIN_TOTP_SECRET && normalized === getAdminEmail(env)) {
    return { ok: false, error: "Sign in with your password and code." };
  }

  // Prefer an existing account's stored preference over the current browser's language — a
  // returning user on a borrowed device shouldn't suddenly get emails in the wrong language.
  const existingAccount = await env.CHASA_DB.prepare(`SELECT locale FROM accounts WHERE email = ?`)
    .bind(normalized)
    .first<{ locale: string | null }>();
  const locale: Locale = existingAccount
    ? normalizeLocale(existingAccount.locale)
    : detectLocaleFromHeader(acceptLanguage);

  const now = new Date();
  const cooldownSince = new Date(now.getTime() - MAGIC_LINK_COOLDOWN_SECONDS * 1000).toISOString();
  const recent = await env.CHASA_DB.prepare(
    `SELECT 1 as hit FROM magic_links WHERE email = ? AND created_at > ? LIMIT 1`
  )
    .bind(normalized, cooldownSince)
    .first<{ hit: number }>();
  if (recent) {
    return { ok: false, error: "Please wait a minute before requesting another link." };
  }

  const token = generateOpaqueToken();
  const tokenHash = await hashOpaqueToken(token, env.TOKEN_SECRET, "magic-link");
  const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_SECONDS * 1000);

  await env.CHASA_DB.prepare(
    `INSERT INTO magic_links (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)`
  )
    .bind(tokenHash, normalized, now.toISOString(), expiresAt.toISOString())
    .run();

  // Go through the app origin (Pages /api proxy), not api.docstoc.io directly — otherwise the
  // session cookie is set on the API host and never sent with same-origin /api calls from the app.
  // Cookie options omit Domain= so the browser scopes the cookie to the app host (pages.dev or docstoc.io).
  const verifyUrl = `${appOrigin}/api/auth/verify?token=${encodeURIComponent(token)}`;
  const sent = await sendMagicLinkEmail(env, normalized, verifyUrl, locale);
  if (!sent.ok) {
    await env.CHASA_DB.prepare(`DELETE FROM magic_links WHERE token_hash = ?`).bind(tokenHash).run();
    return {
      ok: false,
      error: "We couldn't send the sign-in email. Try again in a moment.",
    };
  }

  return { ok: true };
}

export async function consumeMagicLink(
  env: Env,
  token: string,
  acceptLanguage?: string | null
): Promise<
  | { ok: true; sessionToken: string; isPaid: boolean; plan: Plan; accountId: string; isNew: boolean }
  | { ok: false; error: string }
> {
  const tokenHash = await hashOpaqueToken(token, env.TOKEN_SECRET, "magic-link");
  const now = new Date().toISOString();

  const consumed = await env.CHASA_DB.prepare(
    `UPDATE magic_links SET consumed_at = ? WHERE token_hash = ? AND expires_at > ? AND consumed_at IS NULL`
  )
    .bind(now, tokenHash, now)
    .run();

  if (!consumed.meta.changes) {
    const [, legacyHash] = await hashOpaqueTokenLookup(token, env.TOKEN_SECRET, "magic-link");
    const legacyConsumed = await env.CHASA_DB.prepare(
      `UPDATE magic_links SET consumed_at = ? WHERE token_hash = ? AND expires_at > ? AND consumed_at IS NULL`
    )
      .bind(now, legacyHash, now)
      .run();
    if (!legacyConsumed.meta.changes) {
      return { ok: false, error: "That link is invalid or has expired. Request a new one." };
    }
  }

  const [primaryHash, legacyHash] = await hashOpaqueTokenLookup(token, env.TOKEN_SECRET, "magic-link");
  let row = await env.CHASA_DB.prepare(`SELECT email FROM magic_links WHERE token_hash = ?`)
    .bind(primaryHash)
    .first<{ email: string }>();
  if (!row) {
    row = await env.CHASA_DB.prepare(`SELECT email FROM magic_links WHERE token_hash = ?`)
      .bind(legacyHash)
      .first<{ email: string }>();
  }

  if (!row) {
    return { ok: false, error: "That link is invalid or has expired. Request a new one." };
  }

  if (env.ADMIN_TOTP_SECRET && row.email.trim().toLowerCase() === getAdminEmail(env)) {
    return { ok: false, error: "Sign in with your password and code." };
  }
  const account = await findOrCreateAccount(env, row.email, detectLocaleFromHeader(acceptLanguage));
  await purgeExpiredSessions(env);
  await env.CHASA_DB.prepare(`DELETE FROM sessions WHERE account_id = ?`).bind(account.id).run();
  const sessionToken = await createSession(env, account.id);
  return {
    ok: true,
    sessionToken,
    isPaid: account.isPaid,
    plan: account.plan,
    accountId: account.id,
    isNew: account.isNew,
  };
}

export async function createSession(env: Env, accountId: string): Promise<string> {
  const token = generateOpaqueToken();
  const tokenHash = await hashOpaqueToken(token, env.TOKEN_SECRET, "session");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);

  await env.CHASA_DB.prepare(
    `INSERT INTO sessions (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)`
  )
    .bind(tokenHash, accountId, now.toISOString(), expiresAt.toISOString())
    .run();

  return token;
}

/**
 * Password sign-in for ADMIN_EMAIL — same shared ADMIN_PASSWORD as /api/admin/login, but
 * creates a normal app session (Docracy-style) so the founder can enter the product without
 * waiting on a magic link. Generic error text avoids admin-email enumeration.
 */
export async function adminPasswordLogin(
  env: Env,
  email: string,
  password: string,
  ip: string,
  totpCode?: string
): Promise<
  | { ok: true; sessionToken: string; accountId: string; isNew: boolean; isPaid: boolean; plan: Plan }
  | { ok: false; error: string; status?: number }
> {
  const rl = await checkRateLimit(env, `auth_admin_login:${ip}`, 10, 900);
  if (!rl.ok) {
    return { ok: false, error: "Too many sign-in attempts. Try again later.", status: 429 };
  }

  if (!env.ADMIN_PASSWORD) {
    return { ok: false, error: "Admin password sign-in isn't configured yet." };
  }

  const normalized = email.trim().toLowerCase();
  const emailOk = timingSafeEqual(normalized, getAdminEmail(env));
  const passOk = timingSafeEqual(password, env.ADMIN_PASSWORD);
  if (!emailOk || !passOk) {
    return { ok: false, error: "Invalid email or password." };
  }
  if (env.ADMIN_TOTP_SECRET && !(await verifyTotp(env.ADMIN_TOTP_SECRET, totpCode))) {
    return { ok: false, error: "Invalid email, password or code." };
  }

  const account = await findOrCreateAccount(env, normalized);
  await purgeExpiredSessions(env);
  await env.CHASA_DB.prepare(`DELETE FROM sessions WHERE account_id = ?`).bind(account.id).run();
  const sessionToken = await createSession(env, account.id);
  return {
    ok: true,
    sessionToken,
    accountId: account.id,
    isNew: account.isNew,
    isPaid: account.isPaid,
    plan: account.plan,
  };
}

async function findSessionRow(env: Env, sessionToken: string, now: string) {
  const [primaryHash, legacyHash] = await hashOpaqueTokenLookup(sessionToken, env.TOKEN_SECRET, "session");
  type Row = {
    id: string;
    email: string;
    is_paid: number;
    plan: string | null;
    workspace_owner_id: string | null;
    token_hash: string;
  };
  const sql = `SELECT a.id as id, a.email as email, a.is_paid as is_paid, a.plan as plan,
            a.workspace_owner_id as workspace_owner_id, s.token_hash as token_hash
     FROM sessions s JOIN accounts a ON a.id = s.account_id
     WHERE s.token_hash = ? AND s.expires_at > ?`;
  let row = await env.CHASA_DB.prepare(sql).bind(primaryHash, now).first<Row>();
  if (!row) row = await env.CHASA_DB.prepare(sql).bind(legacyHash, now).first<Row>();
  return row;
}

export async function resolveAccount(env: Env, sessionToken: string): Promise<AccountContext | null> {
  const now = new Date().toISOString();
  const row = await findSessionRow(env, sessionToken, now);
  if (!row) return null;

  env.CHASA_DB.prepare(`UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?`)
    .bind(now, row.token_hash)
    .run()
    .catch((err) => console.error("session last_seen_at update failed", err));

  let workspaceId = row.id;
  let role: "admin" | "member" = "admin";
  let plan = normalizePlan(row.plan, row.is_paid === 1);

  if (row.workspace_owner_id) {
    const owner = await env.CHASA_DB.prepare(
      `SELECT id, is_paid, plan FROM accounts WHERE id = ?`
    )
      .bind(row.workspace_owner_id)
      .first<{ id: string; is_paid: number; plan: string | null }>();
    if (owner) {
      workspaceId = owner.id;
      plan = normalizePlan(owner.plan, owner.is_paid === 1);
      const membership = await env.CHASA_DB.prepare(
        `SELECT role FROM workspace_members
         WHERE account_id = ? AND email = ? AND status = 'active'`
      )
        .bind(owner.id, row.email)
        .first<{ role: string }>();
      if (membership?.role === "member" || membership?.role === "admin") {
        role = membership.role;
      } else {
        role = "member";
      }
    }
  }

  return {
    id: row.id,
    email: row.email,
    plan,
    isPaid: isPaidPlan(plan),
    workspaceId,
    role,
  };
}

export async function destroySession(env: Env, sessionToken: string): Promise<void> {
  const [primaryHash, legacyHash] = await hashOpaqueTokenLookup(sessionToken, env.TOKEN_SECRET, "session");
  await env.CHASA_DB.prepare(`DELETE FROM sessions WHERE token_hash IN (?, ?)`)
    .bind(primaryHash, legacyHash)
    .run();
}

type AuthVariables = { account: AccountContext | null };
export type AuthEnv = { Bindings: Env; Variables: AuthVariables };

export const optionalAccount: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  const account = sessionToken ? await resolveAccount(c.env, sessionToken) : null;
  c.set("account", account);
  await next();
};

export const requireAccount: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  const account = sessionToken ? await resolveAccount(c.env, sessionToken) : null;
  if (!account) return c.json({ error: "Sign in required" }, 401);
  c.set("account", account);
  await next();
};

/**
 * Pro ($14.99) / Business ($39.99) — any paid plan.
 * Use for connectors, webhooks, branding, chase plans, tracking, team, QBO/Xero, SMS drafts.
 * Do NOT gate those to requireProAccount — parity features are Pro+.
 */
export const requirePaidAccount: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  const account = sessionToken ? await resolveAccount(c.env, sessionToken) : null;
  if (!account) return c.json({ error: "Sign in required" }, 401);
  if (!account.isPaid) return c.json({ error: "This requires a paid account (Pro or Business)" }, 402);
  c.set("account", account);
  await next();
};

/** @deprecated Prefer requirePaidAccount — parity features are Pro+. Kept for rare Business-only gates. */
export const requireProAccount: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  const account = sessionToken ? await resolveAccount(c.env, sessionToken) : null;
  if (!account) return c.json({ error: "Sign in required" }, 401);
  if (account.plan !== "business") {
    return c.json({ error: "This requires the Business plan" }, 402);
  }
  c.set("account", account);
  await next();
};

/** Workspace admin only (owner or invited admin). */
export const requireWorkspaceAdmin: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  const account = sessionToken ? await resolveAccount(c.env, sessionToken) : null;
  if (!account) return c.json({ error: "Sign in required" }, 401);
  if (!account.isPaid) return c.json({ error: "This requires a paid account (Pro or Business)" }, 402);
  if (account.role !== "admin") return c.json({ error: "Admin role required" }, 403);
  c.set("account", account);
  await next();
};

export function setSessionCookie(c: Context, env: Env, token: string) {
  setCookie(c, SESSION_COOKIE_NAME, token, sessionCookieOptions(env));
}

export function clearSessionCookie(c: Context, env?: Env) {
  const opts = env ? sessionCookieOptions(env) : { path: "/" };
  deleteCookie(c, SESSION_COOKIE_NAME, {
    path: "/",
    ...("domain" in opts && opts.domain ? { domain: opts.domain as string } : {}),
  });
}

const GOOGLE_LOGIN_STATE_TTL_SECONDS = 10 * 60;

export const GOOGLE_STATE_COOKIE = "chasa_google_state";

/** Same host scope as the session cookie: the flow starts on docstoc.io and returns to the API host. */
export function googleStateCookieOptions(env: Env) {
  return { ...sessionCookieOptions(env), path: "/api/auth/google", maxAge: GOOGLE_LOGIN_STATE_TTL_SECONDS };
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createGoogleLoginState(env: Env): Promise<string> {
  const expiry = String(Math.floor(Date.now() / 1000) + GOOGLE_LOGIN_STATE_TTL_SECONDS);
  const nonce = generateOpaqueToken().slice(0, 16);
  const payload = `${expiry}.${nonce}`;
  const sig = await hashOpaqueToken(payload, env.TOKEN_SECRET, "google-login-state");
  return `${payload}.${sig}`;
}

async function parseGoogleLoginState(env: Env, state: string): Promise<boolean> {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [expiry, nonce, sig] = parts;
  if (!expiry || !nonce || !sig) return false;
  if (Number(expiry) < Math.floor(Date.now() / 1000)) return false;
  const payload = `${expiry}.${nonce}`;
  const expected = await hashOpaqueToken(payload, env.TOKEN_SECRET, "google-login-state");
  const legacyExpected = await hashOpaqueTokenLegacy(payload, env.TOKEN_SECRET);
  return timingSafeEqual(expected, sig) || timingSafeEqual(legacyExpected, sig);
}

export async function getGoogleLoginAuthorizeUrl(
  env: Env
): Promise<{ ok: true; url: string; state: string } | { ok: false; error: string }> {
  if (!env.GOOGLE_LOGIN_CLIENT_ID || !env.GOOGLE_LOGIN_CLIENT_SECRET) {
    return { ok: false, error: "Google sign-in isn't configured" };
  }
  const state = await createGoogleLoginState(env);
  const redirectUri = `${env.PUBLIC_WORKER_URL.replace(/\/$/, "")}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: env.GOOGLE_LOGIN_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "openid email profile",
    state,
  });
  return { ok: true, state, url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` };
}

export async function handleGoogleLoginCallback(
  env: Env,
  code: string,
  state: string,
  acceptLanguage?: string | null
): Promise<
  | { ok: true; sessionToken: string; accountId: string; isNew: boolean; isPaid: boolean; plan: Plan }
  | { ok: false; error: string }
> {
  if (!env.GOOGLE_LOGIN_CLIENT_ID || !env.GOOGLE_LOGIN_CLIENT_SECRET) {
    return { ok: false, error: "Google sign-in isn't configured" };
  }
  if (!(await parseGoogleLoginState(env, state))) {
    return { ok: false, error: "Invalid or expired state" };
  }
  const redirectUri = `${env.PUBLIC_WORKER_URL.replace(/\/$/, "")}/api/auth/google/callback`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: env.GOOGLE_LOGIN_CLIENT_ID,
      client_secret: env.GOOGLE_LOGIN_CLIENT_SECRET,
      redirect_uri: redirectUri,
    }).toString(),
  });
  if (!tokenRes.ok) return { ok: false, error: "Token exchange failed" };
  const tokenJson = (await tokenRes.json()) as { id_token?: string };
  const idToken = tokenJson.id_token;
  if (!idToken) return { ok: false, error: "Missing id_token from Google" };
  const tokenInfoRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!tokenInfoRes.ok) return { ok: false, error: "id_token validation failed" };
  const tokenInfo = (await tokenInfoRes.json()) as {
    email?: string;
    email_verified?: boolean | string;
    aud?: string;
  };
  const email = tokenInfo.email?.trim().toLowerCase();
  if (!email) return { ok: false, error: "Missing email from Google" };
  const verified =
    tokenInfo.email_verified === true ||
    tokenInfo.email_verified === "true" ||
    tokenInfo.email_verified === "1";
  if (!verified) return { ok: false, error: "Email isn't verified" };
  if (tokenInfo.aud && tokenInfo.aud !== env.GOOGLE_LOGIN_CLIENT_ID) {
    return { ok: false, error: "Invalid token audience" };
  }
  if (env.ADMIN_TOTP_SECRET && email.trim().toLowerCase() === getAdminEmail(env)) {
    return { ok: false, error: "Sign in with your password and code." };
  }
  const account = await findOrCreateAccount(env, email, detectLocaleFromHeader(acceptLanguage));
  await purgeExpiredSessions(env);
  await env.CHASA_DB.prepare(`DELETE FROM sessions WHERE account_id = ?`).bind(account.id).run();
  const sessionToken = await createSession(env, account.id);
  return {
    ok: true,
    sessionToken,
    accountId: account.id,
    isNew: account.isNew,
    isPaid: account.isPaid,
    plan: account.plan,
  };
}
