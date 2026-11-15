import type { Env } from "../types";
import { isPaidPlan, parseCheckoutPlan, planFromPriceId, setAccountPlan, type Plan } from "./billing";
import { normalizePlan } from "./plan";

/**
 * One rule for "is this Stripe subscription worth a paid plan right now", used by the webhook, the
 * checkout guard and the session/API-key readers.
 *
 * - active / trialing: paid, as long as now <= current_period_end + PERIOD_END_GRACE_DAYS.
 * - past_due: paid for PAST_DUE_GRACE_DAYS from the first time we saw it past_due
 *   (Stripe already moves current_period_end to the new period when a renewal fails, so the
 *   period end alone would hand out a full extra month).
 * - everything else (unpaid, canceled, incomplete, incomplete_expired, paused, unknown): free.
 *
 * The webhook always reads the subscription live from Stripe before applying it: event order is
 * not guaranteed and a late or retried "active" snapshot must never undo a cancellation.
 *
 * Accounts without a stripe_subscription_id (manual/enterprise grants, one-time purchases) are
 * never expired by these rules.
 */

export const PAST_DUE_GRACE_DAYS = 14;
export const PERIOD_END_GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Statuses that never entitle an account to a paid plan. */
const NON_GRANTING_STATUSES = new Set(["unpaid", "canceled", "incomplete", "incomplete_expired", "paused"]);
/** Terminal statuses: the subscription can never become active again, forget its id. */
const TERMINAL_STATUSES = new Set(["canceled", "incomplete_expired"]);

/** billing_status of a one-time (Checkout mode=payment) grant. A full refund or a dispute revokes it. */
export const ONE_TIME_BILLING_STATUS = "one_time";

export type StoredBilling = {
  plan: string | null;
  is_paid: number;
  stripe_subscription_id?: string | null;
  billing_status?: string | null;
  current_period_end?: string | null;
  past_due_since?: string | null;
};

/** The plan an account is entitled to right now, from its stored row (no Stripe call). */
export function effectivePlan(row: StoredBilling, now: Date = new Date()): Plan {
  const plan = normalizePlan(row.plan, row.is_paid === 1);
  if (plan === "free" || !row.stripe_subscription_id) return plan;
  const status = row.billing_status ?? null;
  if (status && NON_GRANTING_STATUSES.has(status)) return "free";
  if (status === "past_due" && row.past_due_since) {
    const since = Date.parse(row.past_due_since);
    if (Number.isFinite(since) && now.getTime() > since + PAST_DUE_GRACE_DAYS * DAY_MS) return "free";
  }
  if (row.current_period_end) {
    const end = Date.parse(row.current_period_end);
    if (Number.isFinite(end) && now.getTime() > end + PERIOD_END_GRACE_DAYS * DAY_MS) return "free";
  }
  return plan;
}

// --- Columns added by migration 0048. Code must keep working before the owner applies it. ---

let periodColumnsMissing = false;

function isMissingColumnError(err: unknown): boolean {
  return /no such column|has no column named/i.test(String((err as { message?: unknown })?.message ?? err));
}

/** Test hook: forget what we learned about the schema. */
export function resetBillingColumnProbe(): void {
  periodColumnsMissing = false;
}

/**
 * Selects the billing columns for the readers. `prefix` is the table alias ("a." or "").
 * Before migration 0048 the two new columns come back as NULL.
 */
export function billingColumns(prefix = ""): string {
  const base = `${prefix}stripe_subscription_id as stripe_subscription_id, ${prefix}billing_status as billing_status`;
  return periodColumnsMissing
    ? `${base}, NULL as current_period_end, NULL as past_due_since`
    : `${base}, ${prefix}current_period_end as current_period_end, ${prefix}past_due_since as past_due_since`;
}

/** Runs a query built with billingColumns(); retries once without the 0048 columns if they don't exist yet. */
export async function withBillingColumns<T>(run: (columns: (prefix?: string) => string) => Promise<T>): Promise<T> {
  try {
    return await run(billingColumns);
  } catch (err) {
    if (periodColumnsMissing || !isMissingColumnError(err)) throw err;
    periodColumnsMissing = true;
    console.warn("billing: accounts.current_period_end/past_due_since missing, apply migration 0048");
    return run(billingColumns);
  }
}

type BillingRow = StoredBilling & { id: string; stripe_customer_id: string | null };

export async function readBillingRow(env: Env, accountId: string): Promise<BillingRow | null> {
  return withBillingColumns((cols) =>
    env.CHASA_DB.prepare(`SELECT id, plan, is_paid, stripe_customer_id, ${cols()} FROM accounts WHERE id = ?`)
      .bind(accountId)
      .first<BillingRow>()
  );
}

async function writeSubscriptionColumns(
  env: Env,
  accountId: string,
  values: { billingStatus: string | null; subscriptionId: string | null; periodEnd: string | null; pastDueSince: string | null }
): Promise<void> {
  if (!periodColumnsMissing) {
    try {
      await env.CHASA_DB.prepare(
        `UPDATE accounts SET billing_status = ?, stripe_subscription_id = ?, current_period_end = ?, past_due_since = ? WHERE id = ?`
      )
        .bind(values.billingStatus, values.subscriptionId, values.periodEnd, values.pastDueSince, accountId)
        .run();
      return;
    } catch (err) {
      if (!isMissingColumnError(err)) throw err;
      periodColumnsMissing = true;
      console.warn("billing: accounts.current_period_end/past_due_since missing, apply migration 0048");
    }
  }
  await env.CHASA_DB.prepare(`UPDATE accounts SET billing_status = ?, stripe_subscription_id = ? WHERE id = ?`)
    .bind(values.billingStatus, values.subscriptionId, accountId)
    .run();
}

// --- Live subscription from Stripe ---

export type LiveSubscription = {
  id: string;
  status: string;
  customerId: string | null;
  priceId: string | null;
  metadataPlan: Plan | null;
  /** ISO timestamp, null if Stripe didn't send one. */
  currentPeriodEnd: string | null;
};

function unixToIso(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

/** Parses a Stripe Subscription object (from GET /v1/subscriptions/{id} or a list entry). */
export function parseLiveSubscription(raw: unknown): LiveSubscription | null {
  const sub = raw as {
    id?: unknown;
    status?: unknown;
    customer?: unknown;
    current_period_end?: unknown;
    metadata?: { plan?: unknown } | null;
    items?: { data?: Array<{ price?: { id?: unknown } | string | null; current_period_end?: unknown }> } | null;
  } | null;
  if (!sub || typeof sub.id !== "string" || typeof sub.status !== "string") return null;
  const items = sub.items?.data ?? [];
  const firstPrice = items[0]?.price;
  const priceId = typeof firstPrice === "string" ? firstPrice : typeof firstPrice?.id === "string" ? firstPrice.id : null;
  // API versions from 2025-03-31 moved current_period_end onto the items; older ones keep it on the subscription.
  let periodEnd: number | null = typeof sub.current_period_end === "number" ? sub.current_period_end : null;
  for (const item of items) {
    if (typeof item.current_period_end === "number" && (periodEnd === null || item.current_period_end > periodEnd)) {
      periodEnd = item.current_period_end;
    }
  }
  const customer = sub.customer as unknown;
  const customerId =
    typeof customer === "string" ? customer : typeof (customer as { id?: unknown })?.id === "string" ? (customer as { id: string }).id : null;
  return {
    id: sub.id,
    status: sub.status,
    customerId,
    priceId,
    metadataPlan: parseCheckoutPlan(sub.metadata?.plan),
    currentPeriodEnd: unixToIso(periodEnd),
  };
}

export type LiveSubscriptionLookup =
  | { ok: true; subscription: LiveSubscription }
  | { ok: false; missing: boolean; status: number };

export async function fetchLiveSubscription(secretKey: string, subscriptionId: string): Promise<LiveSubscriptionLookup> {
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) return { ok: false, missing: res.status === 404, status: res.status };
  const parsed = parseLiveSubscription(await res.json().catch(() => null));
  if (!parsed) return { ok: false, missing: false, status: 502 };
  return { ok: true, subscription: parsed };
}

// --- Applying a live subscription to an account ---

export type SubscriptionDecision = {
  plan: Plan;
  billingStatus: string;
  subscriptionId: string | null;
  periodEnd: string | null;
  pastDueSince: string | null;
};

/** Pure: what the account row should look like after seeing `live`. */
export function decideSubscriptionState(
  env: Env,
  live: LiveSubscription,
  stored: StoredBilling | null,
  now: Date = new Date()
): SubscriptionDecision {
  const storedPlan = stored ? normalizePlan(stored.plan, stored.is_paid === 1) : "free";
  const paidPlan: Plan =
    planFromPriceId(env, live.priceId) ?? live.metadataPlan ?? (isPaidPlan(storedPlan) ? storedPlan : "pro");
  const terminal = TERMINAL_STATUSES.has(live.status);
  const base = {
    billingStatus: live.status,
    subscriptionId: terminal ? null : live.id,
    periodEnd: terminal ? null : live.currentPeriodEnd,
  };

  if (live.status === "active" || live.status === "trialing") {
    return { ...base, plan: paidPlan, pastDueSince: null };
  }
  if (live.status === "past_due") {
    const keptSince =
      stored?.billing_status === "past_due" && stored.stripe_subscription_id === live.id ? stored.past_due_since ?? null : null;
    const since = keptSince ?? now.toISOString();
    const expired = now.getTime() > Date.parse(since) + PAST_DUE_GRACE_DAYS * DAY_MS;
    return { ...base, plan: expired ? "free" : paidPlan, pastDueSince: since };
  }
  return { ...base, plan: "free", pastDueSince: null };
}

export type ApplyOutcome =
  | { applied: true; plan: Plan; status: string }
  | { applied: false; reason: "no_account" | "other_subscription" };

/**
 * Writes the live state of `live` onto the account. A subscription that is not the one stored on
 * the account may only upgrade it (and then becomes the stored one), never downgrade it: a late
 * "deleted" for an old subscription must not end the new one.
 */
export async function applyLiveSubscription(
  env: Env,
  accountId: string,
  live: LiveSubscription,
  now: Date = new Date()
): Promise<ApplyOutcome> {
  const stored = await readBillingRow(env, accountId);
  if (!stored) return { applied: false, reason: "no_account" };

  const decision = decideSubscriptionState(env, live, stored, now);
  const storedSub = stored.stripe_subscription_id ?? null;
  if (storedSub && storedSub !== live.id && !isPaidPlan(decision.plan)) {
    return { applied: false, reason: "other_subscription" };
  }

  const currentPlan = normalizePlan(stored.plan, stored.is_paid === 1);
  // setAccountPlan resets paid_at, so only call it when the plan really changes.
  if (currentPlan !== decision.plan) await setAccountPlan(env, accountId, decision.plan);
  await writeSubscriptionColumns(env, accountId, decision);
  return { applied: true, plan: decision.plan, status: decision.billingStatus };
}
