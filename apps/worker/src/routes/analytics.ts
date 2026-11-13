import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import type { AuthEnv } from "../lib/auth";
import { SESSION_COOKIE_NAME, resolveAccount } from "../lib/auth";
import {
  isAllowedEvent,
  isExcludedAgent,
  NOTRACK_COOKIE_NAME,
  recordPageView,
  trackEvent,
} from "../lib/analytics";
import { isAdminEmail } from "../lib/adminAuth";
import { checkRateLimit, clientIpFromHeaders } from "../lib/rateLimit";
import { clientIp } from "../lib/turnstile";
import { recordVisit } from "../lib/visitTrack";
import {
  analyticsPageviewSchema,
  analyticsTrackSchema,
  parseJsonBody,
} from "../lib/schemas";

const analytics = new Hono<AuthEnv>();

async function shouldSkipAnalytics(c: Context<AuthEnv>): Promise<boolean> {
  if (getCookie(c, NOTRACK_COOKIE_NAME) === "1") return true;
  if (isExcludedAgent(c.req.header("User-Agent"))) return true;
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  if (!sessionToken) return false;
  const account = await resolveAccount(c.env, sessionToken);
  return !!account && isAdminEmail(c.env, account.email);
}

analytics.post("/track", async (c) => {
  const ip = clientIp(c) || clientIpFromHeaders({ get: (n) => c.req.header(n) ?? null });
  const rl = await checkRateLimit(c.env, `analytics_track:${ip}`, 120, 3600);
  if (!rl.ok) return c.json({ error: "Too many requests" }, 429);

  const parsed = await parseJsonBody(c.req, analyticsTrackSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  const { name, properties, visitorId, path, attribution } = parsed.data;
  if (!isAllowedEvent(name)) {
    return c.json({ error: "Unknown event" }, 400);
  }

  if (await shouldSkipAnalytics(c)) return c.json({ ok: true });

  let accountId: string | null = null;
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionToken) {
    const account = await resolveAccount(c.env, sessionToken);
    accountId = account?.id ?? null;
  }

  await trackEvent(c.env, {
    name,
    properties,
    visitorId: visitorId ?? null,
    accountId,
    path: path ?? null,
    userAgent: c.req.header("User-Agent")?.slice(0, 300) || null,
    attribution: attribution ?? null,
  });

  return c.json({ ok: true });
});

function attributionPropsFromQuery(query: string | undefined): Record<string, string> {
  if (!query) return {};
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const out: Record<string, string> = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "ref", "who"] as const) {
    const v = params.get(key)?.trim();
    if (v) out[key] = v.slice(0, 80);
  }
  return out;
}

/** Clients may send `path` as pathname only, or pathname+search; edge sends path + query separately. */
function splitPathAndQuery(
  rawPath: string | undefined,
  rawQuery: string | undefined
): { path: string; query: string } {
  const raw = (rawPath ?? "").trim() || "/";
  const qIdx = raw.indexOf("?");
  if (qIdx >= 0) {
    return {
      path: raw.slice(0, qIdx) || "/",
      query: rawQuery?.trim() || raw.slice(qIdx),
    };
  }
  return { path: raw, query: rawQuery?.trim() || "" };
}

/** Aggregate page view — no visitor id stored. Country from CF-IPCountry only.
 *  Edge hits (Pages middleware) also credit referral_source_detected from Referer /
 *  utm query so Google + SEO landings show in Admin without cookie consent (Docracy parity). */
analytics.post("/pageview", async (c) => {
  const ip = clientIp(c) || clientIpFromHeaders({ get: (n) => c.req.header(n) ?? null });
  const rl = await checkRateLimit(c.env, `analytics_pv:${ip}`, 200, 3600);
  if (!rl.ok) return c.json({ error: "Too many requests" }, 429);

  const parsed = await parseJsonBody(c.req, analyticsPageviewSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  if (await shouldSkipAnalytics(c)) return c.json({ ok: true });

  const { path, query } = splitPathAndQuery(
    parsed.data.path ?? parsed.data.route,
    parsed.data.query
  );
  const country = c.req.header("CF-IPCountry") || null;
  const userAgent = c.req.header("User-Agent")?.slice(0, 300) || null;
  const referrer = (c.req.header("x-referrer") || c.req.header("Referer") || "").slice(0, 500);
  const queryProps = attributionPropsFromQuery(query);

  await recordPageView(c.env, { path, country, userAgent });

  // Server-side discovery attribution (Google organic, LinkedIn, utm landings, …).
  let referrerHost = "";
  if (referrer) {
    try {
      referrerHost = new URL(referrer).hostname.toLowerCase();
    } catch {
      referrerHost = "";
    }
  }
  const requestHost = (() => {
    try {
      return new URL(c.req.url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const externalReferrer =
    !!referrerHost &&
    referrerHost !== requestHost &&
    !referrerHost.endsWith(".docstoc.io") &&
    referrerHost !== "docstoc.io" &&
    referrerHost !== "chasa.io" &&
    !referrerHost.endsWith(".chasa.io") &&
    referrerHost !== "pages.dev";

  const utmOrRef = queryProps.utm_source || queryProps.ref || queryProps.who || "";
  let source = "direct";
  if (utmOrRef) source = utmOrRef.toLowerCase().slice(0, 64);
  else if (externalReferrer) {
    const lower = referrerHost;
    if (lower.includes("google.")) source = "google";
    else if (lower.includes("linkedin.com")) source = "linkedin";
    else if (lower.includes("bing.com")) source = "bing";
    else source = referrerHost;
  }

  if (externalReferrer || utmOrRef) {
    await trackEvent(c.env, {
      name: "referral_source_detected",
      path,
      userAgent,
      properties: {
        source,
        ...(referrer ? { referrer: referrer.slice(0, 200) } : {}),
        ...queryProps,
        ...(parsed.data.edge ? { edge: true } : {}),
      },
    });
  }

  return c.json({ ok: true });
});

/** Cookieless visitor count (lib/visits.ts, lib/visitTrack.ts): one row per page view or leave, always 204.
 *  No cookie is read except the operator's opt-out and the admin session, which only exclude the request. */
analytics.post("/visit", async (c) => {
  try {
    await recordVisit(c.req.raw, c.req.raw.cf as { asn?: unknown; asOrganization?: unknown; country?: unknown } | undefined, {
      db: c.env.CHASA_DB,
      salt: c.env.ANALYTICS_SALT,
      now: new Date(),
      isExcluded: () => shouldSkipAnalytics(c),
    });
  } catch (e) {
    console.error("[visit]", e instanceof Error ? e.message : e);
  }
  return c.body(null, 204);
});

export default analytics;
