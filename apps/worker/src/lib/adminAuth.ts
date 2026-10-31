import type { Context, MiddlewareHandler } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../types";
import { resolveAccount, SESSION_COOKIE_NAME } from "./auth";
import { generateOpaqueToken, hashOpaqueToken, hashOpaqueTokenLookup } from "./token";
import { timingSafeEqual } from "./cryptoUtils";
import { checkRateLimit } from "./rateLimit";

const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;
export const ADMIN_COOKIE_NAME = "chasa_admin";

export interface AdminContext {
  email: string;
}

export function getAdminEmail(env: Env): string {
  return (env.ADMIN_EMAIL || "rl@relacon.at").trim().toLowerCase();
}

export function isAdminEmail(env: Env, email: string): boolean {
  return email.trim().toLowerCase() === getAdminEmail(env);
}

function isHttps(url: string): boolean {
  return url.startsWith("https://");
}

function cookieOptions(env: Env) {
  const https = isHttps(env.PUBLIC_APP_URL);
  return {
    httpOnly: true as const,
    secure: https,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  };
}

export async function loginAdmin(
  env: Env,
  email: string,
  password: string,
  ip: string
): Promise<{ ok: true; token: string } | { ok: false; error: string; status?: number }> {
  const rl = await checkRateLimit(env, `admin_login:${ip}`, 10, 900);
  if (!rl.ok) {
    return { ok: false, error: "Too many login attempts. Try again later.", status: 429 };
  }

  if (!env.ADMIN_PASSWORD) {
    return { ok: false, error: "Admin login isn't configured yet." };
  }
  const normalized = email.trim().toLowerCase();
  const emailOk = timingSafeEqual(normalized, getAdminEmail(env));
  const passOk = timingSafeEqual(password, env.ADMIN_PASSWORD);
  if (!emailOk || !passOk) {
    return { ok: false, error: "Invalid email or password." };
  }

  await env.CHASA_DB.prepare(`DELETE FROM admin_sessions WHERE email = ?`).bind(normalized).run();

  const token = generateOpaqueToken();
  const tokenHash = await hashOpaqueToken(token, env.TOKEN_SECRET, "admin-session");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ADMIN_SESSION_TTL_SECONDS * 1000);

  await env.CHASA_DB.prepare(
    `INSERT INTO admin_sessions (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)`
  )
    .bind(tokenHash, normalized, now.toISOString(), expiresAt.toISOString())
    .run();

  return { ok: true, token };
}

export async function resolveAdmin(env: Env, token: string): Promise<AdminContext | null> {
  const [primaryHash, legacyHash] = await hashOpaqueTokenLookup(token, env.TOKEN_SECRET, "admin-session");
  const now = new Date().toISOString();
  let row = await env.CHASA_DB.prepare(
    `SELECT email, token_hash FROM admin_sessions WHERE token_hash = ? AND expires_at > ?`
  )
    .bind(primaryHash, now)
    .first<{ email: string; token_hash: string }>();
  if (!row) {
    row = await env.CHASA_DB.prepare(
      `SELECT email, token_hash FROM admin_sessions WHERE token_hash = ? AND expires_at > ?`
    )
      .bind(legacyHash, now)
      .first<{ email: string; token_hash: string }>();
  }
  if (!row) return null;

  env.CHASA_DB.prepare(`UPDATE admin_sessions SET last_seen_at = ? WHERE token_hash = ?`)
    .bind(now, row.token_hash)
    .run()
    .catch(() => {});

  return { email: row.email };
}

/** Prefer dedicated admin cookie; otherwise allow the normal app session when the email is
 *  ADMIN_EMAIL — same pattern as Docracy so the dashboard Admin link doesn't ask again. */
export async function resolveAdminAccess(
  env: Env,
  adminToken: string | undefined,
  sessionToken: string | undefined
): Promise<AdminContext | null> {
  if (adminToken) {
    const fromAdminCookie = await resolveAdmin(env, adminToken);
    if (fromAdminCookie) return fromAdminCookie;
  }
  if (sessionToken) {
    const account = await resolveAccount(env, sessionToken);
    if (account && isAdminEmail(env, account.email)) {
      return { email: account.email.trim().toLowerCase() };
    }
  }
  return null;
}

export async function destroyAdminSession(env: Env, token: string): Promise<void> {
  const [primaryHash, legacyHash] = await hashOpaqueTokenLookup(token, env.TOKEN_SECRET, "admin-session");
  await env.CHASA_DB.prepare(`DELETE FROM admin_sessions WHERE token_hash IN (?, ?)`)
    .bind(primaryHash, legacyHash)
    .run();
}

export function setAdminCookie(c: Context, env: Env, token: string) {
  setCookie(c, ADMIN_COOKIE_NAME, token, cookieOptions(env));
}

export function clearAdminCookie(c: Context) {
  deleteCookie(c, ADMIN_COOKIE_NAME, { path: "/" });
}

type AdminVars = { admin: AdminContext | null };
export type AdminEnv = { Bindings: Env; Variables: AdminVars };

export const requireAdmin: MiddlewareHandler<AdminEnv> = async (c, next) => {
  const admin = await resolveAdminAccess(
    c.env,
    getCookie(c, ADMIN_COOKIE_NAME),
    getCookie(c, SESSION_COOKIE_NAME)
  );
  if (!admin) return c.json({ error: "Admin sign-in required" }, 401);
  c.set("admin", admin);
  await next();
};
