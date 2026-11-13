/**
 * POST /api/analytics/visit (routes/analytics.ts): one row of the cookieless visitor count (lib/visits.ts).
 *
 * Always answers 204: counting must never disturb a page, not even when the table or the salt is missing.
 * Not counted: Do Not Track and Global Privacy Control, bots and agents, POSTs from other sites, the signed-in
 * app, admins and the operator's devices (checked by the caller via `isExcluded`), anything above the daily cap,
 * and everything while ANALYTICS_SALT is unset. The IP only goes into a hash that contains the day and the salt.
 */
import {
  cleanPath,
  countryCode,
  deviceOf,
  insertVisit,
  isBot,
  isUntracked,
  netKind,
  pageKind,
  sourceOf,
  visitorHash,
  type NetKind,
  type VisitEvent,
} from "./visits";

export interface VisitDeps {
  db: D1Database | undefined;
  salt: string | undefined;
  now: Date;
  /** True for admins, the docstoc_notrack device cookie and excluded agents; asked only after the cheap checks. */
  isExcluded?: () => Promise<boolean>;
}

export type VisitOutcome = "counted" | "skipped" | "capped";

const MAX_BODY = 2000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_IP = 80;

/** Best effort per isolate: one IP gets at most 80 rows in ten minutes; a day that hit the cap is skipped here. */
const recent = new Map<string, number[]>();
let cappedDay = "";

function tooMany(ip: string, now: number): boolean {
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_IP) {
    recent.set(ip, hits);
    return true;
  }
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 5000) for (const [key, times] of recent) if (!times.some((t) => now - t < WINDOW_MS)) recent.delete(key);
  return false;
}

/** For tests: forget the in-memory limits. */
export function resetVisitMemory(): void {
  recent.clear();
  cappedDay = "";
}

const OWN_HOST = /(^|\.)(docstoc\.io|chasa\.io|pages\.dev)$|^(localhost|127\.0\.0\.1)$/;

/** A beacon from our own pages: Sec-Fetch-Site same-origin when the browser sends it, else an own Origin host. */
export function fromOwnSite(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = headers.get("origin");
  if (!origin) return !!site;
  try {
    return OWN_HOST.test(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Visitor IP, country and network. Called directly, the worker's own Cloudflare data is the visitor's. Through the
 * Pages proxy (functions/api/[[path]].ts) the worker sees Cloudflare's network (AS13335), so it takes the
 * X-Docstoc-Visit-* headers the proxy set from the visitor's request.
 */
export function visitorOrigin(
  headers: Headers,
  cf: { asn?: unknown; asOrganization?: unknown; country?: unknown } | undefined
): { ip: string; country: string; net: NetKind } {
  const ownAsn = Number(cf?.asn);
  const viaProxy = !Number.isFinite(ownAsn) || ownAsn <= 0 || ownAsn === 13335;
  if (viaProxy && headers.get("x-docstoc-visit-ip")) {
    return {
      ip: headers.get("x-docstoc-visit-ip") ?? "",
      country: countryCode(headers.get("x-docstoc-visit-country")),
      net: netKind(headers.get("x-docstoc-visit-asn"), headers.get("x-docstoc-visit-as-org")),
    };
  }
  return {
    ip: headers.get("cf-connecting-ip") ?? "local",
    country: countryCode(typeof cf?.country === "string" ? cf.country : headers.get("cf-ipcountry")),
    net: netKind(cf?.asn, cf?.asOrganization),
  };
}

export async function recordVisit(
  request: Request,
  cf: { asn?: unknown; asOrganization?: unknown; country?: unknown } | undefined,
  deps: VisitDeps
): Promise<VisitOutcome> {
  if (!deps.salt || !deps.db) return "skipped";
  const headers = request.headers;
  if (headers.get("dnt") === "1" || headers.get("sec-gpc") === "1") return "skipped";
  const userAgent = headers.get("user-agent") ?? "";
  if (isBot(userAgent) || !fromOwnSite(headers)) return "skipped";

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY) return "skipped";
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return "skipped";
    body = parsed as Record<string, unknown>;
  } catch {
    return "skipped";
  }
  const path = cleanPath(body.path);
  if (!path || isUntracked(path)) return "skipped";
  const ev: VisitEvent = body.ev === "leave" ? "leave" : "view";

  const day = deps.now.toISOString().slice(0, 10);
  if (cappedDay === day) return "capped";
  if (deps.isExcluded && (await deps.isExcluded().catch(() => false))) return "skipped";
  const origin = visitorOrigin(headers, cf);
  if (tooMany(origin.ip, deps.now.getTime())) return "skipped";

  try {
    const written = await insertVisit(deps.db, {
      day,
      ts: Math.floor(deps.now.getTime() / 1000),
      ev,
      path,
      kind: pageKind(path),
      source: ev === "view" ? sourceOf(body.utmSource, body.referrer) : "",
      device: deviceOf(userAgent, body.width),
      country: origin.country,
      net: origin.net,
      visitor: await visitorHash(day, deps.salt, origin.ip, userAgent),
    });
    if (!written) cappedDay = day;
    return written ? "counted" : "capped";
  } catch (e) {
    console.error("[visit]", e instanceof Error ? e.message : e);
    return "skipped";
  }
}
