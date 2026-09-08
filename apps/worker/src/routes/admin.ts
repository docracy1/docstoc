import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import {
  ADMIN_COOKIE_NAME,
  clearAdminCookie,
  destroyAdminSession,
  loginAdmin,
  requireAdmin,
  resolveAdminAccess,
  setAdminCookie,
  type AdminEnv,
} from "../lib/adminAuth";
import { SESSION_COOKIE_NAME } from "../lib/auth";
import { getFunnelStats, getOutreachStats, getTrafficSources, getTrafficStats, getD1DailyCounts, NOTRACK_COOKIE_NAME, noTrackCookieOptions } from "../lib/analytics";
import { queryAeDailyCounts, buildParityRows } from "../lib/analyticsQuery";
import { createRoadmapFeature, deleteRoadmapFeature, listRoadmapFeatures } from "../lib/roadmap";
import { deleteAccountByEmail } from "../lib/accountDeletion";
import { getCachedClaritySnapshot, refreshClaritySnapshot } from "../lib/clarityApi";
import { getCloudflareTrafficStats } from "../lib/cloudflareAnalytics";
import { listPending, reviewSubmission } from "../lib/marketplaceTemplates";
import { addItemToKit, createKit, listKits } from "../lib/templateKits";
import { createPost, deletePost, listPosts, updatePost } from "../lib/blog";
import { runWeeklyBlogPublish } from "../lib/blogWeekly";
import { sendMarketingEmail } from "../lib/email";
import { normalizeLocale } from "../lib/locale";
import { clientIp, verifyTurnstile } from "../lib/turnstile";
import {
  adminBlogPatchSchema,
  adminBlogPostSchema,
  adminBroadcastSchema,
  adminDeleteAccountSchema,
  adminGrantBusinessSchema,
  adminLoginSchema,
  parseJsonBody,
} from "../lib/schemas";

const admin = new Hono<AdminEnv>();

admin.post("/login", async (c) => {
  const parsed = await parseJsonBody(c.req, adminLoginSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { email, password, turnstileToken } = parsed.data;
  const check = await verifyTurnstile(c.env, turnstileToken, clientIp(c));
  if (!check.ok) return c.json({ error: check.error }, 400);
  const result = await loginAdmin(c.env, email, password, clientIp(c) || "unknown");
  if (!result.ok) return c.json({ error: result.error }, (result.status ?? 401) as 401 | 429);
  setAdminCookie(c, c.env, result.token);
  return c.json({ ok: true, email: email.trim().toLowerCase() });
});

admin.post("/logout", async (c) => {
  const token = getCookie(c, ADMIN_COOKIE_NAME);
  if (token) await destroyAdminSession(c.env, token);
  clearAdminCookie(c);
  return c.json({ ok: true });
});

admin.get("/me", async (c) => {
  const adminUser = await resolveAdminAccess(
    c.env,
    getCookie(c, ADMIN_COOKIE_NAME),
    getCookie(c, SESSION_COOKIE_NAME)
  );
  if (!adminUser) return c.json({ error: "Admin sign-in required" }, 401);
  return c.json({ email: adminUser.email });
});

admin.get("/funnels", requireAdmin, async (c) => {
  const daysRaw = Number(c.req.query("days") || "30");
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 90) : 30;
  // Only the event funnels take this filter — /traffic reads page_views, which is where the
  // dashboard gets its human-vs-bot breakdown from and so has to stay unfiltered.
  const humansOnly = c.req.query("humansOnly") === "1";
  const stats = await getFunnelStats(c.env, days, humansOnly);
  return c.json(stats);
});

admin.get("/traffic", requireAdmin, async (c) => {
  const daysRaw = Number(c.req.query("days") || "30");
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 90) : 30;
  const day = c.req.query("day") || null;
  const stats = await getTrafficStats(c.env, days, day);
  return c.json(stats);
});

admin.get("/traffic-cloudflare", requireAdmin, async (c) => {
  const daysRaw = Number(c.req.query("days") || "30");
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 90) : 30;
  const day = c.req.query("day") || null;
  const stats = await getCloudflareTrafficStats(c.env, days, day);
  return c.json(stats);
});

admin.get("/traffic-sources", requireAdmin, async (c) => {
  const daysRaw = Number(c.req.query("days") || "30");
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 90) : 30;
  const humansOnly = c.req.query("humansOnly") === "1";
  const stats = await getTrafficSources(c.env, days, humansOnly);
  return c.json(stats);
});

admin.get("/outreach", requireAdmin, async (c) => {
  const daysRaw = Number(c.req.query("days") || "30");
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 90) : 30;
  const stats = await getOutreachStats(c.env, days);
  return c.json(stats);
});

admin.get("/clarity", requireAdmin, async (c) => {
  const configured = !!c.env.CLARITY_API_TOKEN;
  const snapshot = await getCachedClaritySnapshot(c.env);
  return c.json({ configured, snapshot });
});

admin.post("/clarity/refresh", requireAdmin, async (c) => {
  if (!c.env.CLARITY_API_TOKEN) return c.json({ error: "not_configured" }, 400);
  const result = await refreshClaritySnapshot(c.env);
  if (!result.ok) {
    const status = result.error === "too_soon" || result.error === "daily_quota_reached" ? 429 : 502;
    return c.json({ error: result.error }, status);
  }
  return c.json({ snapshot: result.snapshot });
});

admin.get("/marketplace/pending", requireAdmin, async (c) => {
  const rows = await listPending(c.env);
  return c.json({ templates: rows });
});

admin.post("/marketplace/:id/approve", requireAdmin, async (c) => {
  const admin = c.get("admin");
  const body = await c.req.json().catch(() => ({}));
  const featured = body.featured === true;
  const verifiedExpert = body.verifiedExpert === true;
  const expertCredential =
    verifiedExpert && typeof body.expertCredential === "string" ? body.expertCredential.trim().slice(0, 200) : null;
  const result = await reviewSubmission(c.env, c.req.param("id"), "approved", admin!.email, {
    featured,
    verifiedExpert,
    expertCredential,
  });
  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

admin.get("/marketplace/kits", requireAdmin, async (c) => {
  const kits = await listKits(c.env);
  return c.json({ kits });
});

/** Staff-curated only — kits are not community-submitted. */
admin.post("/marketplace/kits", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name) return c.json({ error: "name is required" }, 400);
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 400) : "";
  const category = typeof body.category === "string" ? body.category.trim().slice(0, 60) : "";
  const kit = await createKit(c.env, { name, description, category });
  return c.json({ kit });
});

admin.post("/marketplace/kits/:id/items", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const templateId = typeof body.templateId === "string" ? body.templateId : "";
  if (!templateId) return c.json({ error: "templateId is required" }, 400);
  const position = typeof body.position === "number" ? body.position : 0;
  await addItemToKit(c.env, c.req.param("id"), templateId, position);
  return c.json({ ok: true });
});

admin.post("/marketplace/:id/reject", requireAdmin, async (c) => {
  const admin = c.get("admin");
  const body = await c.req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 400) : null;
  const result = await reviewSubmission(c.env, c.req.param("id"), "rejected", admin!.email, {
    rejectionReason: reason,
  });
  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.json({ ok: true });
});

admin.get("/signups", requireAdmin, async (c) => {
  const limitRaw = Number(c.req.query("limit") || "100");
  const offsetRaw = Number(c.req.query("offset") || "0");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;
  const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

  const rows = await c.env.CHASA_DB.prepare(
    `SELECT email, plan, created_at, is_paid FROM accounts ORDER BY created_at DESC LIMIT ? OFFSET ?`
  )
    .bind(limit, offset)
    .all<{ email: string; plan: string | null; created_at: string; is_paid: number }>();

  const totalRow = await c.env.CHASA_DB.prepare(`SELECT COUNT(*) as n FROM accounts`).first<{ n: number }>();

  const accounts = (rows.results ?? []).map((r) => ({
    email: r.email,
    plan: r.plan || (r.is_paid ? "pro" : "free"),
    createdAt: r.created_at,
  }));

  const free = accounts.filter((a) => a.plan === "free");
  const paid = accounts.filter((a) => a.plan !== "free");
  const business = accounts.filter((a) => a.plan === "business");

  return c.json({
    total: totalRow?.n ?? accounts.length,
    limit,
    offset,
    free,
    paid,
    business,
  });
});

admin.post("/grant-business", requireAdmin, async (c) => {
  const parsed = await parseJsonBody(c.req, adminGrantBusinessSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const email = parsed.data.email.trim().toLowerCase();

  const existing = await c.env.CHASA_DB.prepare(`SELECT id FROM accounts WHERE email = ?`)
    .bind(email)
    .first<{ id: string }>();

  const now = new Date().toISOString();
  if (existing) {
    await c.env.CHASA_DB.prepare(
      `UPDATE accounts SET plan = 'business', is_paid = 1, paid_at = COALESCE(paid_at, ?) WHERE id = ?`
    )
      .bind(now, existing.id)
      .run();
  } else {
    await c.env.CHASA_DB.prepare(
      `INSERT INTO accounts (id, email, created_at, is_paid, plan, paid_at) VALUES (?, ?, ?, 1, 'business', ?)`
    )
      .bind(crypto.randomUUID(), email, now, now)
      .run();
  }

  return c.json({ ok: true, email, plan: "business" });
});

/** Permanently deletes an account and every row tied to it (documents, certificates, invoices,
 *  SSL domains, sessions — see deleteAccountByEmail for the full, deliberately-explicit list).
 *  No undo. `confirmEmail` must match `email` exactly — a lightweight guard against a stray
 *  click, not a security boundary (requireAdmin already gates this route). */
admin.post("/delete-account", requireAdmin, async (c) => {
  const parsed = await parseJsonBody(c.req, adminDeleteAccountSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { email, confirmEmail } = parsed.data;
  if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
    return c.json({ error: "Email confirmation did not match" }, 400);
  }
  const result = await deleteAccountByEmail(c.env, email);
  if (!result.ok) return c.json({ error: result.error }, 404);
  return c.json({ ok: true, email: result.email });
});

admin.get("/blog", requireAdmin, async (c) => {
  const posts = await listPosts(c.env);
  return c.json({ posts });
});

admin.post("/blog", requireAdmin, async (c) => {
  const parsed = await parseJsonBody(c.req, adminBlogPostSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const body = parsed.data;
  const result = await createPost(c.env, {
    title: body.title,
    slug: body.slug,
    description: body.description,
    body: body.body,
    published: Boolean(body.published),
  });
  if ("error" in result) return c.json({ error: result.error }, 400);
  return c.json({ post: result });
});

admin.patch("/blog/:id", requireAdmin, async (c) => {
  const parsed = await parseJsonBody(c.req, adminBlogPatchSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const result = await updatePost(c.env, c.req.param("id"), parsed.data);
  if ("error" in result) return c.json({ error: result.error }, 400);
  return c.json({ post: result });
});

admin.delete("/blog/:id", requireAdmin, async (c) => {
  await deletePost(c.env, c.req.param("id"));
  return c.json({ ok: true });
});

/** Manually run the weekly-cron publish step on demand — same function the Monday cron calls, so
 *  the admin can catch up, test, or publish an already-drafted post right away instead of waiting. */
admin.post("/blog/publish-next", requireAdmin, async (c) => {
  const before = await listPosts(c.env);
  await runWeeklyBlogPublish(c.env);
  const after = await listPosts(c.env);
  // Either a brand-new post (topic-queue path) or an existing draft that just got published
  // (publish-oldest-draft path) — both are "what just happened" from this call's point of view.
  const beforeById = new Map(before.map((p) => [p.id, p]));
  const changed = after.find((p) => {
    const prior = beforeById.get(p.id);
    return !prior || (!prior.published && p.published);
  });
  if (!changed) return c.json({ error: "Nothing to publish — queue is empty and no draft is waiting." }, 400);
  return c.json({ post: changed });
});

/** Product news/update broadcast — only to accounts.marketing_opt_in accounts. dryRun just
 *  returns the recipient count so the admin UI can show "send to N people" before confirming. */
admin.post("/broadcast", requireAdmin, async (c) => {
  const parsed = await parseJsonBody(c.req, adminBroadcastSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { subject, bodyHtml, dryRun } = parsed.data;

  const { results } = await c.env.CHASA_DB.prepare(
    `SELECT id, email, locale, marketing_unsub_token FROM accounts WHERE marketing_opt_in = 1`
  ).all<{ id: string; email: string; locale: string | null; marketing_unsub_token: string | null }>();
  const recipients = results ?? [];

  if (dryRun) {
    return c.json({ recipientCount: recipients.length });
  }

  const workerBase = (c.env.PUBLIC_WORKER_URL || "https://api.docstoc.io").replace(/\/$/, "");
  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    let token = r.marketing_unsub_token;
    if (!token) {
      token = crypto.randomUUID();
      await c.env.CHASA_DB.prepare(`UPDATE accounts SET marketing_unsub_token = ? WHERE id = ?`)
        .bind(token, r.id)
        .run();
    }
    const unsubUrl = `${workerBase}/api/account/marketing-unsubscribe?token=${encodeURIComponent(token)}`;
    const result = await sendMarketingEmail(
      c.env,
      r.email,
      { subject, bodyHtml, unsubUrl },
      normalizeLocale(r.locale)
    );
    if (result.ok) sent++;
    else failed++;
  }

  return c.json({ recipientCount: recipients.length, sent, failed });
});

/** Always-on for admins: founder QA traffic must never re-enter the charts (Docracy parity). */
admin.post("/analytics/notrack", requireAdmin, async (c) => {
  setCookie(c, NOTRACK_COOKIE_NAME, "1", noTrackCookieOptions(c.env));
  return c.json({ ok: true, enabled: true });
});

// Roadmap admin CRUD (Docracy parity) — public voting lives at /api/roadmap, unauthenticated.
// Analytics Engine dual-write parity check (see lib/analyticsQuery.ts) — compares D1's existing
// counts against what's landed in Analytics Engine so far, day by day. Purely diagnostic: nothing
// on the dashboard reads from Analytics Engine yet.
admin.get("/analytics/ae-parity", requireAdmin, async (c) => {
  const daysRaw = Number(c.req.query("days") || "7");
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 30) : 7;

  const d1Counts = await getD1DailyCounts(c.env, days);
  const aeResult = await queryAeDailyCounts(c.env, days);

  if (!aeResult.ok) {
    return c.json({ configured: false, failure: aeResult.failure, d1Counts }, 200);
  }

  return c.json({ configured: true, rows: buildParityRows(d1Counts, aeResult.data) });
});

admin.get("/roadmap", requireAdmin, async (c) => {
  const features = await listRoadmapFeatures(c.env);
  return c.json({ features });
});

admin.post("/roadmap", requireAdmin, async (c) => {
  let body: { title?: string; description?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request body" }, 400);
  }
  const result = await createRoadmapFeature(c.env, body.title ?? "", body.description ?? "");
  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.json({ ok: true, id: result.id });
});

admin.delete("/roadmap/:id", requireAdmin, async (c) => {
  await deleteRoadmapFeature(c.env, c.req.param("id"));
  return c.json({ ok: true });
});

export default admin;
