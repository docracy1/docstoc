/**
 * Cookieless visitor count (owner 13.11.2026, carried over from firmenbuchdaten.at): one row per page view in
 * visit_events (migration 0047), so time on site, bounces and second pages can be measured per kind of page
 * without a consent banner.
 *
 * Stored per row, and only this: day, time, path, kind of page, source (host of the referrer or utm_source),
 * device class, country, kind of network ("dc"/"isp") and a visitor hash that is formed anew every day from day,
 * a secret salt (ANALYTICS_SALT), IP and user agent. No cookie, nothing in the browser, no IP, no ASN, no full
 * referrer URL. Without the salt nothing is counted. The privacy policy (public/privacy.html, site-lang.js) says
 * the same.
 *
 * A "leave" row is written when the tab is hidden or closed: its time is when the visitor left the page, so a
 * visit with a single page view still has a measurable length. Bounces count page views only.
 */

/** Days a row is kept; the daily clean-up deletes older rows and the privacy policy names the period. */
export const VISITS_KEEP_DAYS = 180;

/** At most this many rows per day (D1 writes are billed per row and per index). */
export const VISITS_DAILY_CAP = 5000;

/** Two rows of one hash with more than 30 minutes in between are two visits (as Plausible counts). */
export const VISIT_GAP_MINUTES = 30;

/** "Online now": visitors of the last minutes. */
export const LIVE_MINUTES = 5;

/** Visits shorter than this count as "short" on the admin page. */
export const SHORT_VISIT_SECONDS = 10;

export type PageKind = "home" | "template" | "category" | "blog" | "landing";
export const PAGE_KINDS: readonly PageKind[] = ["home", "template", "category", "blog", "landing"];

export type VisitEvent = "view" | "leave";

/**
 * The signed-in app, the admin and the API are not counted: the figures describe the public site, and customers'
 * daily work would drown the visitor numbers.
 */
export const UNTRACKED_PREFIXES = ["/app", "/admin", "/api", "/invoice", "/pay", "/go", "/verify", "/trust"] as const;

export function isUntracked(path: string): boolean {
  return UNTRACKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Path without query, anchor, trailing slash and ".html"; anything that is not a path becomes "". */
export function cleanPath(value: unknown): string {
  if (typeof value !== "string") return "";
  const path = value.split("#")[0]!.split("?")[0]!.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return "";
  let out = path.length > 1 ? path.replace(/\/+$/, "") || "/" : "/";
  out = out.replace(/\/index\.html$/, "") || "/";
  out = out.replace(/\.html$/, "");
  return out.slice(0, 200);
}

/** Kind of page from the path; the Spanish copy (/es/…) counts like the English page. */
export function pageKind(path: string): PageKind {
  const p = path === "/es" ? "/" : path.startsWith("/es/") ? path.slice(3) : path;
  if (p === "/" || p === "/index") return "home";
  if (p === "/blog" || p.startsWith("/blog/")) return "blog";
  if (p === "/document-templates" || p === "/free-templates" || p.startsWith("/document-templates/category")) return "category";
  if (p.startsWith("/document-templates/") || p.startsWith("/free-templates/")) return "template";
  return "landing";
}

/** Device class from the window width, else from the user agent. */
export function deviceOf(userAgent: string, width?: unknown): "mobile" | "tablet" | "desktop" {
  if (typeof width === "number" && Number.isFinite(width) && width > 0) {
    if (width < 640) return "mobile";
    if (width < 1024) return "tablet";
    return "desktop";
  }
  if (/iPad|Tablet|PlayBook|Silk/i.test(userAgent)) return "tablet";
  if (/Mobi|Android|iPhone|iPod/i.test(userAgent)) return "mobile";
  return "desktop";
}

/** Crawlers, tools and agents (Googlebot renders JavaScript, so it would reach this endpoint). */
const BOT =
  /bot|crawl|spider|slurp|scrape|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|python|curl|wget|httpclient|okhttp|axios|node-fetch|undici|go-http|java\/|libwww|phantomjs|puppeteer|playwright|selenium|mediapartners|adsbot|feedfetcher|monitor|uptime|pingdom|statuscake|semrush|ahrefs|mj12|bytespider|yandex|baidu|sogou|exabot|ia_archiver|archive\.org|google-inspectiontool|google-read-aloud|storebot|claude|anthropic|cursor|gptbot|chatgpt|perplexity/i;

export function isBot(userAgent: string): boolean {
  return !userAgent.trim() || BOT.test(userAgent);
}

const OWN_HOSTS = ["docstoc.io", "chasa.io", "pages.dev"];

/** Only the host of the referrer, lower case, without www; our own hosts and junk give "". */
export function referrerHost(referrer: unknown): string {
  if (typeof referrer !== "string" || !referrer) return "";
  try {
    const host = new URL(referrer.slice(0, 500)).hostname.toLowerCase().replace(/^www\./, "");
    if (!host || host === "localhost" || OWN_HOSTS.some((own) => host === own || host.endsWith(`.${own}`))) return "";
    return host.slice(0, 100);
  } catch {
    return "";
  }
}

function token(value: unknown, max = 64): string {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, max).replace(/[^a-z0-9._-]/g, "") : "";
}

/** utm_source wins (it says what triggered the visit), then the referrer host; X is one row. */
export function sourceOf(utmSource: unknown, referrer: unknown): string {
  const source = token(utmSource) || referrerHost(referrer);
  return ["t.co", "twitter.com", "mobile.twitter.com", "x"].includes(source) ? "x.com" : source;
}

export function countryCode(value: string | null | undefined): string {
  const code = (value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1" ? code : "";
}

/** 16 hex characters from day, salt, IP and user agent. A new day gives a new hash, so no visitor is followed longer. */
export async function visitorHash(day: string, salt: string, ip: string, userAgent: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${day}|${salt}|visits|${ip}|${userAgent}`));
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ---------- kind of network (as firmenbuchdaten src/lib/netKind.ts) ---------- */

/** Large cloud and hosting networks by ASN. */
const DATA_CENTRE_ASNS = new Set<number>([
  16509, 14618, 8987, // Amazon AWS
  15169, 396982, 19527, 36492, // Google Cloud
  8075, 8068, 8069, // Microsoft Azure
  14061, // DigitalOcean
  16276, // OVH
  24940, 213230, // Hetzner
  63949, // Akamai Linode
  20473, // Vultr / Choopa
  31898, // Oracle Cloud
  45102, 37963, // Alibaba Cloud
  132203, 45090, // Tencent Cloud
  136907, // Huawei Cloud
  51167, // Contabo
  60781, 28753, 16265, // Leaseweb
  9009, // M247
  212238, 60068, // Datacamp / CDN77
  62240, // Clouvider
  202425, // IP Volume
  9370, // Sakura
  12876, // Scaleway
  197540, // netcup
  8560, // IONOS
  46606, // Unified Layer
  36352, // ColoCrossing
  53667, // FranTech / BuyVM
  40021, // Contabo US / Nubes
  174, // Cogent (transit, mostly servers)
]);

const DATA_CENTRE_NAME =
  /\b(amazon|aws|google cloud|microsoft|azure|digitalocean|ovh|hetzner|linode|akamai|vultr|choopa|oracle|alibaba|tencent|huawei cloud|contabo|leaseweb|m247|datacamp|cdn77|clouvider|scaleway|netcup|ionos|hosting|hostinger|server|colo|datacenter|data center|vps|cloud)\b/i;

export type NetKind = "dc" | "isp" | "";

/**
 * "dc" = data centre or hosting network, "isp" = any other network, "" = unknown. Only this word is stored, never
 * the ASN. Cloudflare's own network (WARP, AS13335) counts as "isp": people use it from their devices.
 * Nothing is filtered by it; real people also come from the USA.
 */
export function netKind(asn: unknown, organisation: unknown): NetKind {
  const number = typeof asn === "number" ? asn : Number(asn);
  const name = typeof organisation === "string" ? organisation : "";
  if (!Number.isFinite(number) || number <= 0) return name ? (DATA_CENTRE_NAME.test(name) ? "dc" : "isp") : "";
  if (number === 13335) return "isp";
  if (DATA_CENTRE_ASNS.has(number)) return "dc";
  return DATA_CENTRE_NAME.test(name) ? "dc" : "isp";
}

/* ---------- D1 ---------- */

export interface VisitRow {
  day: string;
  ts: number;
  ev: VisitEvent;
  path: string;
  kind: PageKind;
  source: string;
  device: string;
  country: string;
  net: NetKind;
  visitor: string;
}

/**
 * Writes the row unless the day already has `cap` rows. The rowid grows with time and old days are only ever
 * deleted as a whole, so today's count is MAX(id) - MIN(id of today) + 1: two index seeks instead of counting.
 * Returns false when the cap stopped the row.
 */
export async function insertVisit(db: D1Database, row: VisitRow, cap = VISITS_DAILY_CAP): Promise<boolean> {
  const result = await db
    .prepare(
      "INSERT INTO visit_events (day, ts, ev, path, kind, source, device, country, net, visitor) " +
        "SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10 " +
        "WHERE COALESCE((SELECT MAX(id) FROM visit_events) - (SELECT MIN(id) FROM visit_events WHERE day = ?1) + 1, 0) < ?11"
    )
    .bind(
      row.day,
      row.ts,
      row.ev,
      row.path,
      row.kind,
      row.source || null,
      row.device || null,
      row.country || null,
      row.net || null,
      row.visitor,
      cap
    )
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/** Deletes rows older than VISITS_KEEP_DAYS (daily cron). Uses the day index. */
export async function pruneVisits(db: D1Database, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - VISITS_KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  const result = await db.prepare("DELETE FROM visit_events WHERE day < ?").bind(cutoff).run();
  return result.meta?.changes ?? 0;
}

export interface KindStats {
  kind: PageKind;
  /** Different daily hashes that viewed a page of this kind. */
  visitors: number;
  pageviews: number;
  /** Visits that started on a page of this kind. */
  visits: number;
  /** Of those, visits with exactly one page view. */
  bounces: number;
  /** Of those, visits with at least two rows (views or a leave), so their length is known. */
  measured: number;
  averageSeconds: number | null;
  /** Measured visits shorter than SHORT_VISIT_SECONDS. */
  short: number;
}

export interface CountryStats {
  country: string;
  visitors: number;
  pageviews: number;
  dcVisitors: number;
  ispVisitors: number;
  unknownVisitors: number;
}

export interface VisitsOverview {
  configured: boolean;
  days: number;
  first: string;
  today: string;
  live: { minutes: number; visitors: number };
  totals: { visitors: number; pageviews: number; visits: number; bounces: number; measured: number; averageSeconds: number | null; short: number };
  kinds: KindStats[];
  countries: CountryStats[];
  /** Visitors per kind of network over all countries. */
  net: { dc: number; isp: number; unknown: number };
}

/** First day of a window of `days` days that ends today (inclusive). */
export function firstDay(today: string, days: number): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
}

/** SQL texts, exported so the tests and EXPLAIN QUERY PLAN check exactly what runs. */
export const VISITS_SQL = {
  live: "SELECT COUNT(DISTINCT visitor) AS visitors FROM (SELECT visitor, ts FROM visit_events ORDER BY id DESC LIMIT 500) WHERE ts > ?1 AND ts <= ?2",
  kinds:
    "SELECT kind, COUNT(DISTINCT visitor) AS visitors, COUNT(*) AS pageviews FROM visit_events WHERE day >= ?1 AND ev = 'view' GROUP BY kind",
  /**
   * Visits: rows of one hash with more than ?2 seconds in between start a new visit (window functions, no join).
   * The entry kind is the kind of the visit's first row; length is last minus first row, including a leave row.
   */
  visits:
    "WITH v AS (SELECT visitor, ts, id, ev, kind, ts - LAG(ts) OVER (PARTITION BY visitor ORDER BY ts, id) AS gap FROM visit_events WHERE day >= ?1), " +
    "s AS (SELECT visitor, ts, id, ev, kind, SUM(CASE WHEN gap IS NULL OR gap > ?2 THEN 1 ELSE 0 END) OVER (PARTITION BY visitor ORDER BY ts, id ROWS UNBOUNDED PRECEDING) AS visit FROM v), " +
    "f AS (SELECT visitor, visit, ts, ev, FIRST_VALUE(kind) OVER (PARTITION BY visitor, visit ORDER BY ts, id) AS entry FROM s), " +
    "g AS (SELECT MIN(entry) AS entry, COUNT(*) AS n, SUM(ev = 'view') AS views, MAX(ts) - MIN(ts) AS length FROM f GROUP BY visitor, visit) " +
    "SELECT entry AS kind, COUNT(*) AS visits, SUM(views <= 1) AS bounces, SUM(n >= 2) AS measured, " +
    "COALESCE(SUM(CASE WHEN n >= 2 THEN length ELSE 0 END), 0) AS total, SUM(n >= 2 AND length < ?3) AS short " +
    "FROM g GROUP BY entry",
  countries:
    "SELECT COALESCE(country, '') AS country, COUNT(DISTINCT visitor) AS visitors, SUM(ev = 'view') AS pageviews, " +
    "COUNT(DISTINCT CASE WHEN net = 'dc' THEN visitor END) AS dcVisitors, COUNT(DISTINCT CASE WHEN net = 'isp' THEN visitor END) AS ispVisitors, " +
    "COUNT(DISTINCT CASE WHEN net IS NULL THEN visitor END) AS unknownVisitors " +
    "FROM visit_events WHERE day >= ?1 GROUP BY 1 ORDER BY visitors DESC, pageviews DESC, country LIMIT ?2",
  net:
    "SELECT COUNT(DISTINCT CASE WHEN net = 'dc' THEN visitor END) AS dc, COUNT(DISTINCT CASE WHEN net = 'isp' THEN visitor END) AS isp, " +
    "COUNT(DISTINCT CASE WHEN net IS NULL THEN visitor END) AS unknown, COUNT(DISTINCT visitor) AS visitors, SUM(ev = 'view') AS pageviews " +
    "FROM visit_events WHERE day >= ?1",
} as const;

interface VisitAggRow {
  kind: string;
  visits: number;
  bounces: number | null;
  measured: number | null;
  total: number | null;
  short: number | null;
}

/** Joins the two per-kind queries into one row per kind, in PAGE_KINDS order, every kind present. */
export function mergeKinds(
  views: { kind: string; visitors: number; pageviews: number }[],
  visits: VisitAggRow[]
): KindStats[] {
  return PAGE_KINDS.map((kind) => {
    const v = views.find((r) => r.kind === kind);
    const s = visits.find((r) => r.kind === kind);
    const measured = Number(s?.measured ?? 0);
    return {
      kind,
      visitors: Number(v?.visitors ?? 0),
      pageviews: Number(v?.pageviews ?? 0),
      visits: Number(s?.visits ?? 0),
      bounces: Number(s?.bounces ?? 0),
      measured,
      averageSeconds: measured > 0 ? Number(s?.total ?? 0) / measured : null,
      short: Number(s?.short ?? 0),
    };
  });
}

/** All figures for the admin card for the last `days` days (today included). Everything is summed in SQL. */
export async function visitsOverview(
  db: D1Database,
  options: { today: string; days: number; nowSec: number; configured: boolean }
): Promise<VisitsOverview> {
  const { today, days, nowSec, configured } = options;
  const first = firstDay(today, days);
  const [live, views, visits, countries, net] = await Promise.all([
    db.prepare(VISITS_SQL.live).bind(nowSec - LIVE_MINUTES * 60, nowSec + 60).first<{ visitors: number }>(),
    db.prepare(VISITS_SQL.kinds).bind(first).all<{ kind: string; visitors: number; pageviews: number }>(),
    db.prepare(VISITS_SQL.visits).bind(first, VISIT_GAP_MINUTES * 60, SHORT_VISIT_SECONDS).all<VisitAggRow>(),
    db.prepare(VISITS_SQL.countries).bind(first, 25).all<CountryStats>(),
    db.prepare(VISITS_SQL.net).bind(first).first<{ dc: number; isp: number; unknown: number; visitors: number; pageviews: number }>(),
  ]);
  const kinds = mergeKinds(views.results ?? [], visits.results ?? []);
  const sum = (key: "visits" | "bounces" | "measured" | "short") => kinds.reduce((n, k) => n + k[key], 0);
  const measured = sum("measured");
  const totalSeconds = kinds.reduce((n, k) => n + (k.averageSeconds ?? 0) * k.measured, 0);
  return {
    configured,
    days,
    first,
    today,
    live: { minutes: LIVE_MINUTES, visitors: Number(live?.visitors ?? 0) },
    totals: {
      visitors: Number(net?.visitors ?? 0),
      pageviews: Number(net?.pageviews ?? 0),
      visits: sum("visits"),
      bounces: sum("bounces"),
      measured,
      averageSeconds: measured > 0 ? totalSeconds / measured : null,
      short: sum("short"),
    },
    kinds,
    countries: (countries.results ?? []).map((r) => ({
      country: r.country,
      visitors: Number(r.visitors),
      pageviews: Number(r.pageviews ?? 0),
      dcVisitors: Number(r.dcVisitors),
      ispVisitors: Number(r.ispVisitors),
      unknownVisitors: Number(r.unknownVisitors),
    })),
    net: { dc: Number(net?.dc ?? 0), isp: Number(net?.isp ?? 0), unknown: Number(net?.unknown ?? 0) },
  };
}
