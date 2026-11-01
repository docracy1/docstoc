import type { Env } from "../types";
import { trackEvent } from "./analytics";

export type TrackingSummary = {
  id: string;
  agingInvoiceId: string | null;
  clientName: string | null;
  subject: string | null;
  createdAt: string;
  openCount: number;
  clickCount: number;
  lastOpenAt: string | null;
  lastClickAt: string | null;
};

const TRANSPARENT_GIF = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0)
);

export function trackingPixelBytes(): Uint8Array {
  return TRANSPARENT_GIF;
}

export function trackingBaseUrl(env: Env): string {
  return env.PUBLIC_WORKER_URL.replace(/\/$/, "");
}

export async function createTrackedChase(
  env: Env,
  accountId: string,
  input: {
    agingInvoiceId?: string | null;
    clientName?: string | null;
    subject?: string | null;
    body: string;
    wrapLinks?: boolean;
  }
): Promise<{
  chaseId: string;
  html: string;
  plainBody: string;
  pixelUrl: string;
  note: string;
}> {
  const chaseId = crypto.randomUUID().replace(/-/g, "").slice(0, 22);
  const now = new Date().toISOString();
  await env.CHASA_DB.prepare(
    `INSERT INTO chase_tracking
       (id, account_id, aging_invoice_id, client_name, subject, created_at, open_count, click_count)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0)`
  )
    .bind(
      chaseId,
      accountId,
      input.agingInvoiceId ?? null,
      input.clientName ?? null,
      input.subject ?? null,
      now
    )
    .run();

  const base = trackingBaseUrl(env);
  const pixelUrl = `${base}/api/t/o/${chaseId}.gif`;
  let bodyHtml = escapeHtml(input.body).replace(/\n/g, "<br>\n");
  let wrappedUrls: string[] = [];

  if (input.wrapLinks !== false) {
    const wrapped = wrapHttpLinks(bodyHtml, base, chaseId);
    bodyHtml = wrapped.html;
    wrappedUrls = wrapped.urls;
  }

  await storeTrackingLinks(env, chaseId, wrappedUrls);

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">
${bodyHtml}
<p style="margin-top:24px;font-size:11px;color:#999">Sent via your inbox · tracked open pixel (docstoc)</p>
<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />
</body></html>`;

  return {
    chaseId,
    html,
    plainBody: input.body,
    pixelUrl,
    note: "Open tracking only works if the recipient’s email client loads images and you paste this HTML (or send via a client that supports HTML). Plain mailto text will not track opens.",
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapHttpLinks(html: string, base: string, chaseId: string): { html: string; urls: string[] } {
  const urls: string[] = [];
  const out = html.replace(/https?:\/\/[^\s<]+/gi, (url) => {
    const clean = url.replace(/[.,;:!?)]+$/, "");
    const trailing = url.slice(clean.length);
    urls.push(clean);
    const wrapped = `${base}/api/t/c/${chaseId}?u=${encodeURIComponent(clean)}`;
    return `<a href="${wrapped}">${clean}</a>${trailing}`;
  });
  return { html: out, urls };
}

async function storeTrackingLinks(env: Env, chaseId: string, urls: string[]): Promise<void> {
  const now = new Date().toISOString();
  const unique = [...new Set(urls.map((u) => u.slice(0, 2000)))].slice(0, 50);
  for (const url of unique) {
    await env.CHASA_DB.prepare(
      `INSERT INTO chase_tracking_links (id, chase_id, url, created_at) VALUES (?, ?, ?, ?)`
    )
      .bind(crypto.randomUUID(), chaseId, url, now)
      .run();
  }
}

export async function isAllowedTrackingUrl(env: Env, chaseId: string, url: string): Promise<boolean> {
  const row = await env.CHASA_DB.prepare(
    `SELECT 1 as hit FROM chase_tracking_links WHERE chase_id = ? AND url = ? LIMIT 1`
  )
    .bind(chaseId, url.slice(0, 2000))
    .first<{ hit: number }>();
  return !!row;
}

/** Page shown before a tracked link leaves docstoc, with the destination host in plain sight. */
export function clickNoticeHtml(target: string, continueHref: string): string {
  const host = escapeHtml(new URL(target).hostname);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>You are leaving docstoc</title>
<style>
body{margin:0;background:#f6f7f9;color:#1a1d21;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:480px;margin:12vh auto 0;padding:32px 24px;background:#fff;border:1px solid #e3e6ea;border-radius:12px}
h1{margin:0 0 12px;font-size:22px}
p{margin:0 0 16px}
.host{font-size:20px;font-weight:600;overflow-wrap:anywhere}
.url{font-size:13px;color:#5b636d;overflow-wrap:anywhere}
a.go{display:inline-block;padding:10px 18px;background:#1a1d21;color:#fff;border-radius:8px;text-decoration:none}
@media (max-width:540px){main{margin:16px;padding:24px 16px}}
</style>
</head>
<body>
<main>
<h1>You are leaving docstoc</h1>
<p>This link goes to:</p>
<p class="host">${host}</p>
<p class="url">${escapeHtml(target)}</p>
<p>The sender of your email added this link. docstoc does not check where it leads, so continue only if you trust the sender and the site.</p>
<a class="go" href="${escapeHtml(continueHref)}" rel="noreferrer">Continue to ${host}</a>
</main>
</body>
</html>`;
}

export async function recordOpen(env: Env, chaseId: string): Promise<boolean> {
  // Read the pre-update open_count so we can tell a first open (funnel-worthy) from a re-open
  // (recipient re-loading the same email, e.g. scrolling back to it) without a second round trip.
  const existing = await env.CHASA_DB.prepare(
    `SELECT account_id, open_count FROM chase_tracking WHERE id = ?`
  )
    .bind(chaseId)
    .first<{ account_id: string; open_count: number }>();
  if (!existing) return false;

  const now = new Date().toISOString();
  await env.CHASA_DB.prepare(
    `UPDATE chase_tracking SET open_count = open_count + 1, last_open_at = ? WHERE id = ?`
  )
    .bind(now, chaseId)
    .run();
  await env.CHASA_DB.prepare(
    `INSERT INTO chase_tracking_events (id, chase_id, event_type, meta, created_at) VALUES (?, ?, 'open', NULL, ?)`
  )
    .bind(crypto.randomUUID(), chaseId, now)
    .run();

  if (existing.open_count === 0) {
    await trackEvent(env, {
      name: "chase_opened",
      accountId: existing.account_id,
      path: "/api/t/o",
    }).catch(() => {});
  }
  return true;
}

export async function recordClick(env: Env, chaseId: string, url: string): Promise<string | null> {
  const row = await env.CHASA_DB.prepare(`SELECT id FROM chase_tracking WHERE id = ?`)
    .bind(chaseId)
    .first<{ id: string }>();
  if (!row) return null;
  const now = new Date().toISOString();
  await env.CHASA_DB.prepare(
    `UPDATE chase_tracking SET click_count = click_count + 1, last_click_at = ? WHERE id = ?`
  )
    .bind(now, chaseId)
    .run();
  await env.CHASA_DB.prepare(
    `INSERT INTO chase_tracking_events (id, chase_id, event_type, meta, created_at) VALUES (?, ?, 'click', ?, ?)`
  )
    .bind(crypto.randomUUID(), chaseId, url.slice(0, 500), now)
    .run();
  return url;
}

export async function listTrackingForAccount(
  env: Env,
  accountId: string,
  limit = 50
): Promise<TrackingSummary[]> {
  const { results } = await env.CHASA_DB.prepare(
    `SELECT id, aging_invoice_id, client_name, subject, created_at, open_count, click_count, last_open_at, last_click_at
     FROM chase_tracking WHERE account_id = ?
     ORDER BY created_at DESC LIMIT ?`
  )
    .bind(accountId, Math.min(100, Math.max(1, limit)))
    .all<{
      id: string;
      aging_invoice_id: string | null;
      client_name: string | null;
      subject: string | null;
      created_at: string;
      open_count: number;
      click_count: number;
      last_open_at: string | null;
      last_click_at: string | null;
    }>();

  return (results ?? []).map((r) => ({
    id: r.id,
    agingInvoiceId: r.aging_invoice_id,
    clientName: r.client_name,
    subject: r.subject,
    createdAt: r.created_at,
    openCount: r.open_count,
    clickCount: r.click_count,
    lastOpenAt: r.last_open_at,
    lastClickAt: r.last_click_at,
  }));
}

export async function trackingStatsForInvoices(
  env: Env,
  accountId: string,
  invoiceIds: string[]
): Promise<Record<string, { openCount: number; clickCount: number; lastOpenAt: string | null }>> {
  const out: Record<string, { openCount: number; clickCount: number; lastOpenAt: string | null }> = {};
  if (invoiceIds.length === 0) return out;
  // D1 has no great IN binder for dynamic lists — query recent and filter.
  const { results } = await env.CHASA_DB.prepare(
    `SELECT aging_invoice_id, open_count, click_count, last_open_at
     FROM chase_tracking WHERE account_id = ? AND aging_invoice_id IS NOT NULL
     ORDER BY created_at DESC LIMIT 200`
  )
    .bind(accountId)
    .all<{
      aging_invoice_id: string;
      open_count: number;
      click_count: number;
      last_open_at: string | null;
    }>();

  const want = new Set(invoiceIds);
  for (const r of results ?? []) {
    if (!want.has(r.aging_invoice_id) || out[r.aging_invoice_id]) continue;
    out[r.aging_invoice_id] = {
      openCount: r.open_count,
      clickCount: r.click_count,
      lastOpenAt: r.last_open_at,
    };
  }
  return out;
}
