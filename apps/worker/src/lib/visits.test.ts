import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  cleanPath,
  deviceOf,
  firstDay,
  insertVisit,
  isBot,
  isUntracked,
  netKind,
  pageKind,
  pruneVisits,
  sourceOf,
  visitorHash,
  visitsOverview,
  VISITS_SQL,
  type VisitRow,
} from "./visits";
import { fromOwnSite, recordVisit, resetVisitMemory, visitorOrigin } from "./visitTrack";

const MIGRATION = readFileSync(new URL("../../migrations/0047_visit_events.sql", import.meta.url), "utf8");

/** The part of D1Database these functions use, on node:sqlite with the real migration. */
function fakeD1(): { d1: D1Database; raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  raw.exec(MIGRATION);
  raw.exec(MIGRATION); // idempotent
  const d1 = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...values: unknown[]) {
          args = values;
          return stmt;
        },
        async run() {
          const r = raw.prepare(sql).run(...(args as never[]));
          return { meta: { changes: Number(r.changes) } };
        },
        async first<T>() {
          return (raw.prepare(sql).get(...(args as never[])) ?? null) as T | null;
        },
        async all<T>() {
          return { results: raw.prepare(sql).all(...(args as never[])) as T[] };
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { d1, raw };
}

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function visitRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://api.docstoc.io/api/analytics/visit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": CHROME,
      "sec-fetch-site": "same-origin",
      origin: "https://docstoc.io",
      "x-docstoc-visit-ip": "198.51.100.7",
      "x-docstoc-visit-asn": "3320",
      "x-docstoc-visit-as-org": "Deutsche Telekom AG",
      "x-docstoc-visit-country": "DE",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const PROXY_CF = { asn: 13335, asOrganization: "Cloudflare", country: "US" };

describe("visit helpers", () => {
  it("cleans paths and classifies kinds of page", () => {
    expect(cleanPath("/document-templates/nda-template.html?x=1#a")).toBe("/document-templates/nda-template");
    expect(cleanPath("/blog/")).toBe("/blog");
    expect(cleanPath("/index.html")).toBe("/");
    expect(cleanPath("//evil.com")).toBe("");
    expect(cleanPath(42)).toBe("");
    expect(pageKind("/")).toBe("home");
    expect(pageKind("/es")).toBe("home");
    expect(pageKind("/document-templates/nda-template")).toBe("template");
    expect(pageKind("/es/free-templates/30-day-overdue-invoice-email")).toBe("template");
    expect(pageKind("/document-templates")).toBe("category");
    expect(pageKind("/document-templates/category/hr")).toBe("category");
    expect(pageKind("/free-templates")).toBe("category");
    expect(pageKind("/blog")).toBe("blog");
    expect(pageKind("/blog/acme-protocol-certificate-automation")).toBe("blog");
    expect(pageKind("/pricing")).toBe("landing");
    expect(pageKind("/docstoc-vs-chaser")).toBe("landing");
  });

  it("leaves the app, admin and API out", () => {
    expect(isUntracked("/app")).toBe(true);
    expect(isUntracked("/app/login")).toBe(true);
    expect(isUntracked("/admin/analytics")).toBe(true);
    expect(isUntracked("/api/x")).toBe(true);
    expect(isUntracked("/apple")).toBe(false);
    expect(isUntracked("/")).toBe(false);
  });

  it("recognises bots and agents, not browsers", () => {
    expect(isBot(CHROME)).toBe(false);
    expect(isBot("")).toBe(true);
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBot("Mozilla/5.0 HeadlessChrome/130.0")).toBe(true);
    expect(isBot("Claude-User/1.0")).toBe(true);
  });

  it("keeps only the referrer host or utm_source", () => {
    expect(sourceOf("", "https://www.google.com/search?q=nda+template")).toBe("google.com");
    expect(sourceOf("Newsletter", "https://www.google.com/")).toBe("newsletter");
    expect(sourceOf("", "https://docstoc.io/blog")).toBe("");
    expect(sourceOf("", "https://t.co/abc")).toBe("x.com");
    expect(sourceOf("", "not a url")).toBe("");
  });

  it("classifies devices by width, else by user agent", () => {
    expect(deviceOf(CHROME, 390)).toBe("mobile");
    expect(deviceOf(CHROME, 800)).toBe("tablet");
    expect(deviceOf(CHROME, 1440)).toBe("desktop");
    expect(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Mobile", null)).toBe("mobile");
  });

  it("tells data centres from other networks", () => {
    expect(netKind(16509, "AMAZON-02")).toBe("dc");
    expect(netKind(3320, "Deutsche Telekom AG")).toBe("isp");
    expect(netKind(13335, "Cloudflare")).toBe("isp");
    expect(netKind(99999, "Some VPS Hosting Ltd")).toBe("dc");
    expect(netKind("", "")).toBe("");
  });

  it("forms a 16-character hash that changes with the day", async () => {
    const a = await visitorHash("2026-11-13", "salt", "198.51.100.7", CHROME);
    const b = await visitorHash("2026-11-14", "salt", "198.51.100.7", CHROME);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
    expect(await visitorHash("2026-11-13", "other", "198.51.100.7", CHROME)).not.toBe(a);
  });

  it("accepts beacons from own pages only", () => {
    expect(fromOwnSite(new Headers({ "sec-fetch-site": "same-origin", origin: "https://docstoc.io" }))).toBe(true);
    expect(fromOwnSite(new Headers({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }))).toBe(false);
    expect(fromOwnSite(new Headers({ origin: "https://evil.example" }))).toBe(false);
    expect(fromOwnSite(new Headers({ origin: "https://chasa-71s.pages.dev" }))).toBe(true);
    expect(fromOwnSite(new Headers())).toBe(false);
  });

  it("takes the visitor from the proxy headers only behind Cloudflare's own network", () => {
    const headers = new Headers({ "x-docstoc-visit-ip": "198.51.100.7", "x-docstoc-visit-asn": "16509", "x-docstoc-visit-country": "us", "cf-connecting-ip": "203.0.113.9" });
    expect(visitorOrigin(headers, PROXY_CF)).toEqual({ ip: "198.51.100.7", country: "US", net: "dc" });
    // Called directly from a home line: spoofed headers are ignored.
    expect(visitorOrigin(headers, { asn: 3320, asOrganization: "Deutsche Telekom AG", country: "DE" })).toEqual({ ip: "203.0.113.9", country: "DE", net: "isp" });
  });

  it("names the first day of a window", () => {
    expect(firstDay("2026-11-13", 7)).toBe("2026-11-07");
    expect(firstDay("2026-11-13", 1)).toBe("2026-11-13");
  });
});

describe("recordVisit", () => {
  beforeEach(() => resetVisitMemory());
  const now = new Date("2026-11-13T10:00:00Z");

  it("writes one row without IP, ASN or full referrer", async () => {
    const { d1, raw } = fakeD1();
    const outcome = await recordVisit(
      visitRequest({ ev: "view", path: "/document-templates/nda-template.html", referrer: "https://www.google.com/search?q=secret", width: 390 }),
      PROXY_CF,
      { db: d1, salt: "s", now }
    );
    expect(outcome).toBe("counted");
    const rows = raw.prepare("SELECT * FROM visit_events").all() as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row).toMatchObject({ day: "2026-11-13", ev: "view", path: "/document-templates/nda-template", kind: "template", source: "google.com", device: "mobile", country: "DE", net: "isp" });
    expect(String(row.visitor)).toMatch(/^[0-9a-f]{16}$/);
    const stored = JSON.stringify(rows);
    expect(stored).not.toContain("198.51.100.7");
    expect(stored).not.toContain("3320");
    expect(stored).not.toContain("secret");
  });

  it("counts nothing without salt, with DNT/GPC, for bots, other sites, the app and excluded visitors", async () => {
    const { d1, raw } = fakeD1();
    const body = { ev: "view", path: "/" };
    expect(await recordVisit(visitRequest(body), PROXY_CF, { db: d1, salt: undefined, now })).toBe("skipped");
    expect(await recordVisit(visitRequest(body, { dnt: "1" }), PROXY_CF, { db: d1, salt: "s", now })).toBe("skipped");
    expect(await recordVisit(visitRequest(body, { "sec-gpc": "1" }), PROXY_CF, { db: d1, salt: "s", now })).toBe("skipped");
    expect(await recordVisit(visitRequest(body, { "user-agent": "Googlebot/2.1" }), PROXY_CF, { db: d1, salt: "s", now })).toBe("skipped");
    expect(await recordVisit(visitRequest(body, { "sec-fetch-site": "cross-site", origin: "https://evil.example" }), PROXY_CF, { db: d1, salt: "s", now })).toBe("skipped");
    expect(await recordVisit(visitRequest({ path: "/app/login" }), PROXY_CF, { db: d1, salt: "s", now })).toBe("skipped");
    expect(await recordVisit(visitRequest("not json"), PROXY_CF, { db: d1, salt: "s", now })).toBe("skipped");
    expect(await recordVisit(visitRequest(body), PROXY_CF, { db: d1, salt: "s", now, isExcluded: async () => true })).toBe("skipped");
    expect((raw.prepare("SELECT COUNT(*) AS n FROM visit_events").get() as { n: number }).n).toBe(0);
  });

  it("stops at the daily cap", async () => {
    const { d1 } = fakeD1();
    const row: VisitRow = { day: "2026-11-13", ts: 1, ev: "view", path: "/", kind: "home", source: "", device: "desktop", country: "", net: "", visitor: "a" };
    expect(await insertVisit(d1, row, 2)).toBe(true);
    expect(await insertVisit(d1, row, 2)).toBe(true);
    expect(await insertVisit(d1, row, 2)).toBe(false);
    expect(await insertVisit(d1, { ...row, day: "2026-11-14" }, 2)).toBe(true);
  });
});

describe("visitsOverview", () => {
  const T0 = Math.floor(Date.parse("2026-11-13T09:00:00Z") / 1000);
  function add(raw: DatabaseSync, visitor: string, offset: number, path: string, ev = "view", net: string | null = "isp", country = "DE") {
    raw
      .prepare("INSERT INTO visit_events (day, ts, ev, path, kind, source, device, country, net, visitor) VALUES (?, ?, ?, ?, ?, NULL, 'desktop', ?, ?, ?)")
      .run("2026-11-13", T0 + offset, ev, path, pageKind(path), country, net, visitor);
  }

  it("counts visits, bounces, time on site per entry kind, countries and networks", async () => {
    const { d1, raw } = fakeD1();
    // a: template, then a second page after 40 s, leaves after 100 s → one visit, 100 s, no bounce.
    add(raw, "a", 0, "/document-templates/nda-template");
    add(raw, "a", 40, "/pricing");
    add(raw, "a", 100, "/pricing", "leave");
    // b: template, leaves after 5 s → bounce, measured, short.
    add(raw, "b", 0, "/document-templates/lease-template", "view", "dc", "US");
    add(raw, "b", 5, "/document-templates/lease-template", "leave", "dc", "US");
    // c: home, no leave row → bounce, not measured. Back after 2 hours on a blog post → second visit.
    add(raw, "c", 0, "/", "view", null, "US");
    add(raw, "c", 7200, "/blog/how-to-chase", "view", null, "US");

    const o = await visitsOverview(d1, { today: "2026-11-13", days: 7, nowSec: T0 + 7230, configured: true });
    const template = o.kinds.find((k) => k.kind === "template")!;
    expect(template).toMatchObject({ visitors: 2, pageviews: 2, visits: 2, bounces: 1, measured: 2, short: 1 });
    expect(template.averageSeconds).toBe(52.5);
    expect(o.kinds.find((k) => k.kind === "home")).toMatchObject({ visits: 1, bounces: 1, measured: 0, averageSeconds: null });
    expect(o.kinds.find((k) => k.kind === "blog")).toMatchObject({ visits: 1, bounces: 1 });
    expect(o.kinds.find((k) => k.kind === "landing")).toMatchObject({ visitors: 1, pageviews: 1, visits: 0 });
    expect(o.kinds.map((k) => k.kind)).toEqual(["home", "template", "category", "blog", "landing"]);
    expect(o.totals).toMatchObject({ visitors: 3, pageviews: 5, visits: 4, bounces: 3, measured: 2 });
    expect(o.live.visitors).toBe(1);
    expect(o.net).toEqual({ dc: 1, isp: 1, unknown: 1 });
    const us = o.countries.find((c) => c.country === "US")!;
    expect(us).toMatchObject({ visitors: 2, pageviews: 3, dcVisitors: 1, ispVisitors: 0, unknownVisitors: 1 });
  });

  it("deletes rows older than 180 days", async () => {
    const { d1, raw } = fakeD1();
    raw.prepare("INSERT INTO visit_events (day, ts, ev, path, kind, visitor) VALUES ('2026-01-01', 1, 'view', '/', 'home', 'x'), ('2026-11-13', 2, 'view', '/', 'home', 'y')").run();
    expect(await pruneVisits(d1, new Date("2026-11-13T08:00:00Z"))).toBe(1);
  });

  it("reads through the day index", () => {
    const raw = new DatabaseSync(":memory:");
    raw.exec(MIGRATION);
    for (const key of ["kinds", "countries", "net"] as const) {
      const plan = raw.prepare(`EXPLAIN QUERY PLAN ${VISITS_SQL[key]}`).all() as { detail: string }[];
      expect(plan.map((p) => p.detail).join("\n"), key).toContain("USING INDEX idx_visit_events_day");
      expect(plan.map((p) => p.detail).join("\n"), key).not.toMatch(/SCAN visit_events/);
    }
  });
});
