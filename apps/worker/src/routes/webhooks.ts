import { Hono } from "hono";
import { requireAccount, requirePaidAccount, requireWorkspaceAdmin, type AuthEnv } from "../lib/auth";
import {
  createWebhook,
  deleteWebhook,
  dispatchWebhooks,
  isValidWebhookUrl,
  listWebhooks,
  webhookSigningHex,
} from "../lib/webhooks";
import { parseJsonBody, webhookCreateSchema, webhookNotifySchema } from "../lib/schemas";

const webhooks = new Hono<AuthEnv>();

webhooks.get("/", requirePaidAccount, async (c) => {
  const acc = c.get("account")!;
  const rows = await listWebhooks(c.env, acc.workspaceId);
  const isAdmin = acc.role === "admin";
  return c.json({
    webhooks: await Promise.all(
      rows.map(async (w) => ({
        id: w.id,
        url: w.url,
        createdAt: w.created_at,
        // Receivers need this to check X-Docstoc-Signature. Admins only, like adding a webhook.
        ...(isAdmin ? { signingSecret: await webhookSigningHex(c.env, w.id) } : {}),
      }))
    ),
  });
});

webhooks.post("/", requireWorkspaceAdmin, async (c) => {
  const acc = c.get("account")!;
  const parsed = await parseJsonBody(c.req, webhookCreateSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const url = parsed.data.url;
  if (!isValidWebhookUrl(url)) {
    return c.json({ error: "Enter a valid http(s) URL you control." }, 400);
  }
  const existing = await listWebhooks(c.env, acc.workspaceId);
  if (existing.length >= 10) {
    return c.json({ error: "Maximum 10 webhooks per account." }, 400);
  }
  const row = await createWebhook(c.env, acc.workspaceId, url);
  return c.json(
    { id: row.id, url: row.url, createdAt: row.created_at, signingSecret: await webhookSigningHex(c.env, row.id) },
    201
  );
});

webhooks.delete("/:id", requireWorkspaceAdmin, async (c) => {
  const acc = c.get("account")!;
  const ok = await deleteWebhook(c.env, acc.workspaceId, c.req.param("id"));
  if (!ok) return c.json({ error: "Webhook not found" }, 404);
  return c.json({ ok: true });
});

/** Client notifies server when a chase is copied/sent so webhooks fire. */
webhooks.post("/notify", requireAccount, async (c) => {
  const acc = c.get("account")!;
  if (!acc.isPaid) return c.json({ ok: true, skipped: true });

  const parsed = await parseJsonBody(c.req, webhookNotifySchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { event, data } = parsed.data;

  c.executionCtx.waitUntil(
    dispatchWebhooks(c.env, acc.workspaceId, event, data ?? {}).catch(() => {})
  );
  return c.json({ ok: true });
});

export default webhooks;
