import type { Env } from "../types";

// Renamed from the original 4-tier scheme (free/solo/pro/enterprise) to a 3-tier one
// (free/pro/business): old "solo" is now called "pro" ($14.99/mo), and old "pro" + "enterprise"
// are merged into "business" ($39.99/mo) — the enterprise Stripe price (previously a one-time
// custom/yearly price) is being converted to that same $39.99/mo recurring price, so new "business"
// checkouts point at STRIPE_PRICE_ENTERPRISE, not STRIPE_PRICE_PRO. STRIPE_PRICE_PRO is kept only
// so existing subscribers still on that price continue to resolve correctly (see
// planFromPriceId) — no new checkout ever points at it.
export type Plan = "free" | "pro" | "business";

export function isPaidPlan(plan: Plan): boolean {
  return plan !== "free";
}

/** Team seat caps (owner counts as 1). Pro+ can invite; Free has no team. */
export function seatLimitForPlan(plan: Plan): number {
  switch (plan) {
    case "pro":
      return 5;
    case "business":
      return 20;
    default:
      return 1;
  }
}

export function planFromPriceId(env: Env, priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  if (priceId === env.STRIPE_PRICE_SOLO) return "pro";
  if (priceId === env.STRIPE_PRICE_PRO) return "business";
  if (priceId === env.STRIPE_PRICE_ENTERPRISE) return "business";
  return null;
}

export function priceIdForPlan(env: Env, plan: Plan): string | null {
  if (plan === "pro") return env.STRIPE_PRICE_SOLO ?? null;
  if (plan === "business") return env.STRIPE_PRICE_ENTERPRISE ?? null;
  return null;
}

export function parseCheckoutPlan(raw: unknown): Plan | null {
  if (raw === "pro" || raw === "business") return raw;
  return null;
}

export async function setAccountPlan(env: Env, accountId: string, plan: Plan): Promise<void> {
  const paid = isPaidPlan(plan);
  await env.CHASA_DB.prepare(`UPDATE accounts SET plan = ?, is_paid = ?, paid_at = ? WHERE id = ?`)
    .bind(plan, paid ? 1 : 0, paid ? new Date().toISOString() : null, accountId)
    .run();
}

/** @deprecated Prefer setAccountPlan — kept for call sites that only flip paid/free. */
export async function markAccountPaid(env: Env, accountId: string, paid: boolean): Promise<void> {
  await setAccountPlan(env, accountId, paid ? "pro" : "free");
}

// Set-once: a customer shouldn't get reassigned to a different Stripe customer id later.
export async function setStripeCustomerId(env: Env, accountId: string, customerId: string): Promise<void> {
  await env.CHASA_DB.prepare(
    `UPDATE accounts SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL`
  )
    .bind(customerId, accountId)
    .run();
}

/** Stripe subscription states that entitle an account to its paid plan right now. */
export function subscriptionGrantsPlan(status: string | undefined): boolean {
  return status === "active" || status === "trialing";
}

export async function setStripeSubscriptionId(env: Env, accountId: string, subscriptionId: string | null): Promise<void> {
  await env.CHASA_DB.prepare(`UPDATE accounts SET stripe_subscription_id = ? WHERE id = ?`)
    .bind(subscriptionId, accountId)
    .run();
}

/** Last-known Stripe subscription status (active/trialing/past_due/unpaid/canceled/…) — recorded
 *  on every customer.subscription.updated regardless of whether it changes the plan, so a payment
 *  problem is visible before the subscription is actually deleted. */
export async function setAccountBillingStatus(env: Env, accountId: string, status: string | null): Promise<void> {
  await env.CHASA_DB.prepare(`UPDATE accounts SET billing_status = ? WHERE id = ?`)
    .bind(status, accountId)
    .run();
}

export async function findAccountIdByStripeCustomerId(env: Env, customerId: string): Promise<string | null> {
  const row = await env.CHASA_DB.prepare(`SELECT id FROM accounts WHERE stripe_customer_id = ?`)
    .bind(customerId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

export async function getStripeCustomerId(env: Env, accountId: string): Promise<string | null> {
  const row = await env.CHASA_DB.prepare(`SELECT stripe_customer_id FROM accounts WHERE id = ?`)
    .bind(accountId)
    .first<{ stripe_customer_id: string | null }>();
  return row?.stripe_customer_id ?? null;
}
