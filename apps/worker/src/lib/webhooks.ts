import type { Env } from "../types";
import { hashOpaqueToken } from "./token";
import { isBlockedWebhookHost } from "./validate";

export type WebhookEvent =
  | "chase.drafted"
  | "chase.sent"
  | "chase.thank_you"
  | "chase.reply_drafted"
  | "chase.sequence_planned"
  | "chase.downloaded";

export type WebhookRow = {
  id: string;
  account_id: string;
  url: string;
  created_at: string;
};

export async function listWebhooks(env: Env, accountId: string): Promise<WebhookRow[]> {
  const res = await env.CHASA_DB.prepare(
    `SELECT id, account_id, url, created_at FROM webhooks WHERE account_id = ? ORDER BY created_at DESC`
  )
    .bind(accountId)
    .all<WebhookRow>();
  return res.results ?? [];
}

export async function createWebhook(env: Env, accountId: string, url: string): Promise<WebhookRow> {
  const id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  await env.CHASA_DB.prepare(
    `INSERT INTO webhooks (id, account_id, url, created_at) VALUES (?, ?, ?, ?)`
  )
    .bind(id, accountId, url, created_at)
    .run();
  return { id, account_id: accountId, url, created_at };
}

export async function deleteWebhook(env: Env, accountId: string, id: string): Promise<boolean> {
  const res = await env.CHASA_DB.prepare(`DELETE FROM webhooks WHERE id = ? AND account_id = ?`)
    .bind(id, accountId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function webhookSigningHex(env: Env, webhookId: string): Promise<string> {
  return hashOpaqueToken(`webhook:${webhookId}`, env.TOKEN_SECRET, "webhook-signing");
}

export async function signWebhookPayload(
  env: Env,
  webhookId: string,
  payload: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(await webhookSigningHex(env, webhookId)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function dispatchWebhooks(
  env: Env,
  accountId: string,
  event: WebhookEvent,
  data: Record<string, unknown> = {}
): Promise<void> {
  const hooks = await listWebhooks(env, accountId);
  if (hooks.length === 0) return;

  const payload = JSON.stringify({
    event,
    created_at: new Date().toISOString(),
    data,
  });

  await Promise.allSettled(
    hooks.map(async (hook) => {
      const signature = await signWebhookPayload(env, hook.id, payload);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        await fetch(hook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Docstoc-Webhooks/1.0",
            "X-Docstoc-Event": event,
            "X-Docstoc-Signature": `sha256=${signature}`,
          },
          body: payload,
          signal: controller.signal,
          // A redirect could lead to a host isBlockedWebhookHost would have refused.
          redirect: "manual",
        });
      } finally {
        clearTimeout(timer);
      }
    })
  );
}

export function isValidWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    return !isBlockedWebhookHost(u.hostname);
  } catch {
    return false;
  }
}
