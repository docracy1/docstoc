import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { getAdminEmail } from "../lib/adminAuth";
import type { AuthEnv } from "../lib/auth";
import {
  adminPasswordLogin,
  consumeMagicLink,
  requestMagicLink,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
  getGoogleLoginAuthorizeUrl,
  handleGoogleLoginCallback,
  SESSION_COOKIE_NAME,
} from "../lib/auth";
import { trackEvent, NOTRACK_COOKIE_NAME, noTrackCookieOptions } from "../lib/analytics";
import { clientIp, turnstileSiteKey, verifyTurnstile } from "../lib/turnstile";
import { adminLoginSchema, magicLinkRequestSchema, parseJsonBody } from "../lib/schemas";
import { requestAppOrigin } from "../lib/appUrl";

const auth = new Hono<AuthEnv>();

/** Public config for the login UI (site key is not secret). */
auth.get("/config", (c) => {
  return c.json({
    turnstileSiteKey: turnstileSiteKey(c.env),
    turnstileRequired: Boolean(c.env.TURNSTILE_SECRET_KEY?.trim()),
    googleLoginEnabled: Boolean(
      c.env.GOOGLE_LOGIN_CLIENT_ID?.trim() && c.env.GOOGLE_LOGIN_CLIENT_SECRET?.trim()
    ),
    /** Non-secret — login UI shows a password field when the typed email matches. */
    adminEmail: getAdminEmail(c.env),
    adminTotpRequired: !!c.env.ADMIN_TOTP_SECRET,
  });
});

auth.post("/request", async (c) => {
  const parsed = await parseJsonBody(c.req, magicLinkRequestSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  const check = await verifyTurnstile(c.env, parsed.data.turnstileToken, clientIp(c));
  if (!check.ok) return c.json({ error: check.error }, 400);

  const result = await requestMagicLink(
    c.env,
    parsed.data.email,
    requestAppOrigin(c),
    c.req.header("Accept-Language")
  );
  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

/** Founder password sign-in — creates a normal app session (not the /app/admin cookie). */
auth.post("/admin-login", async (c) => {
  const parsed = await parseJsonBody(c.req, adminLoginSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  const check = await verifyTurnstile(c.env, parsed.data.turnstileToken, clientIp(c));
  if (!check.ok) return c.json({ error: check.error }, 400);

  const result = await adminPasswordLogin(
    c.env,
    parsed.data.email,
    parsed.data.password,
    clientIp(c) || "unknown",
    parsed.data.totpCode
  );
  if (!result.ok) return c.json({ error: result.error }, (result.status ?? 401) as 401 | 429);

  const existing = getCookie(c, SESSION_COOKIE_NAME);
  if (existing) await destroySession(c.env, existing);

  setSessionCookie(c, c.env, result.sessionToken);
  setCookie(c, NOTRACK_COOKIE_NAME, "1", noTrackCookieOptions(c.env));
  if (result.isNew) {
    c.executionCtx.waitUntil(
      trackEvent(c.env, {
        name: "signup_completed",
        accountId: result.accountId,
        path: "/api/auth/admin-login",
        userAgent: c.req.header("User-Agent")?.slice(0, 300) || null,
      }).catch(() => {})
    );
  }
  return c.json({ ok: true });
});

// The link the user clicks from their inbox. Verifies, sets the session cookie, and redirects
// straight into the app rather than round-tripping through a frontend callback page.
auth.get("/verify", async (c) => {
  const appOrigin = requestAppOrigin(c);
  const token = c.req.query("token");
  if (!token) return c.redirect(`${appOrigin}/app/login?error=missing_token`);

  const result = await consumeMagicLink(c.env, token, c.req.header("Accept-Language"));
  if (!result.ok) {
    return c.redirect(`${appOrigin}/app/login?error=invalid_token`);
  }

  const existing = getCookie(c, SESSION_COOKIE_NAME);
  if (existing) await destroySession(c.env, existing);

  setSessionCookie(c, c.env, result.sessionToken);
  if (result.isNew) {
    c.executionCtx.waitUntil(
      trackEvent(c.env, {
        name: "signup_completed",
        accountId: result.accountId,
        path: "/api/auth/verify",
        // Mail-scanning bots prefetch magic links, so this signup is not automatically a human one.
        userAgent: c.req.header("User-Agent")?.slice(0, 300) || null,
      }).catch(() => {})
    );
  }
  return c.redirect(`${appOrigin}/app/account`);
});

auth.post("/logout", async (c) => {
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionToken) await destroySession(c.env, sessionToken);
  clearSessionCookie(c, c.env);
  return c.json({ ok: true });
});

auth.get("/google", async (c) => {
  const appOrigin = requestAppOrigin(c);
  const result = await getGoogleLoginAuthorizeUrl(c.env);
  if (!result.ok) return c.redirect(`${appOrigin}/app/login?error=google_unavailable`);
  return c.redirect(result.url);
});

auth.get("/google/callback", async (c) => {
  const appOrigin = requestAppOrigin(c);
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.redirect(`${appOrigin}/app/login?error=google_auth`);
  const result = await handleGoogleLoginCallback(c.env, code, state, c.req.header("Accept-Language"));
  if (!result.ok) return c.redirect(`${appOrigin}/app/login?error=google_auth`);
  setSessionCookie(c, c.env, result.sessionToken);
  if (result.isNew) {
    c.executionCtx.waitUntil(
      trackEvent(c.env, {
        name: "signup_completed",
        accountId: result.accountId,
        path: "/api/auth/google/callback",
        userAgent: c.req.header("User-Agent")?.slice(0, 300) || null,
      }).catch(() => {})
    );
  }
  return c.redirect(`${appOrigin}/app/account`);
});

export default auth;
