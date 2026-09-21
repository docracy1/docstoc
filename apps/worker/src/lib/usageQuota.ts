import type { Env } from "../types";
import type { AccountContext } from "./auth";

export const FREE_MONTHLY_DRAFTS = 5;

export function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function usageScopeKey(account: AccountContext | null, ip: string, visitorId?: string | null): string {
  if (account?.isPaid) return `paid:${account.workspaceId}`;
  if (account) return `account:${account.id}`;
  const vid = visitorId?.trim().slice(0, 80) || "none";
  const safeIp = ip.slice(0, 45);
  return `anon:${safeIp}:${vid}`;
}

export async function getDraftUsageCount(env: Env, scopeKey: string): Promise<number> {
  const row = await env.CHASA_DB.prepare(
    `SELECT count FROM ai_usage WHERE scope_key = ? AND month_key = ?`
  )
    .bind(scopeKey, monthKey())
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function incrementDraftUsage(env: Env, scopeKey: string): Promise<number> {
  const mk = monthKey();
  await env.CHASA_DB.prepare(
    `INSERT INTO ai_usage (scope_key, month_key, count) VALUES (?, ?, 1)
     ON CONFLICT(scope_key, month_key) DO UPDATE SET count = count + 1`
  )
    .bind(scopeKey, mk)
    .run();
  return getDraftUsageCount(env, scopeKey);
}

// Public AI Document Generator — separate free-tier cap from the in-app chase-email drafting
// above. Deliberately its own scope-key namespace ("docgen:" vs "anon:"/"account:"/"paid:") even
// though it shares the same ai_usage table: trying the public tool shouldn't eat into a signed-in
// user's in-app draft quota, and vice versa — they're unrelated features with unrelated value.
export const FREE_MONTHLY_DOCGEN_GENERATIONS = 3;

export function docgenScopeKey(ip: string, visitorId?: string | null): string {
  const vid = visitorId?.trim().slice(0, 80) || "none";
  const safeIp = ip.slice(0, 45);
  return `docgen:${safeIp}:${vid}`;
}

export async function checkDocgenQuota(
  env: Env,
  ip: string,
  visitorId?: string | null
): Promise<{ allowed: true; remaining: number } | { allowed: false; remaining: 0; error: string }> {
  const scope = docgenScopeKey(ip, visitorId);
  const used = await getDraftUsageCount(env, scope);
  if (used >= FREE_MONTHLY_DOCGEN_GENERATIONS) {
    return {
      allowed: false,
      remaining: 0,
      error: `You've used your ${FREE_MONTHLY_DOCGEN_GENERATIONS} free AI documents this month. Sign up for docstoc to keep generating.`,
    };
  }
  return { allowed: true, remaining: FREE_MONTHLY_DOCGEN_GENERATIONS - used };
}

export async function checkDraftQuota(
  env: Env,
  account: AccountContext | null,
  ip: string,
  visitorId?: string | null
): Promise<{ allowed: true; remaining: number } | { allowed: false; remaining: 0; error: string }> {
  const scope = usageScopeKey(account, ip, visitorId);
  if (scope.startsWith("paid:")) {
    return { allowed: true, remaining: 999 };
  }
  const used = await getDraftUsageCount(env, scope);
  if (used >= FREE_MONTHLY_DRAFTS) {
    return {
      allowed: false,
      remaining: 0,
      error: `Free limit reached (${FREE_MONTHLY_DRAFTS} AI drafts per month). Sign in and upgrade to Pro for unlimited drafts.`,
    };
  }
  return { allowed: true, remaining: FREE_MONTHLY_DRAFTS - used };
}
