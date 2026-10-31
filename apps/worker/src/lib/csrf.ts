import { getCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import type { Env } from "../types";
import { ADMIN_COOKIE_NAME } from "./adminAuth";
import { isAllowedAppOrigin } from "./appUrl";
import { SESSION_COOKIE_NAME } from "./auth";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Whether a cookie-authenticated request may change state. SameSite=Lax covers new logins, but
 * sessions issued before it keep their SameSite=None cookie until they expire, so writes are
 * checked here as well. Browsers always send Origin on a cross-site POST; a request without it
 * comes from a non-browser client, unless Sec-Fetch-Site says otherwise.
 */
export function isTrustedWrite(
  origin: string | undefined,
  secFetchSite: string | undefined,
  env: Env
): boolean {
  if (origin) return isAllowedAppOrigin(origin, env);
  return secFetchSite !== "cross-site";
}

/** API keys, Stripe and other server-to-server callers send no session cookie and pass through. */
export async function csrfProtection(c: Context<{ Bindings: Env }>, next: Next) {
  if (SAFE_METHODS.has(c.req.method)) return next();
  if (!getCookie(c, SESSION_COOKIE_NAME) && !getCookie(c, ADMIN_COOKIE_NAME)) return next();
  if (isTrustedWrite(c.req.header("Origin"), c.req.header("Sec-Fetch-Site"), c.env)) return next();
  return c.json({ error: "This request came from another site and was blocked." }, 403);
}
