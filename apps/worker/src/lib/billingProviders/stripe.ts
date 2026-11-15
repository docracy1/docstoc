import { hmacKey } from "../token";
import type { Env } from "../../types";
import { parseCheckoutPlan, planFromPriceId, type Plan } from "../billing";

export type StripeWebhookResult =
  /** checkout.session.completed / async_payment_succeeded in subscription mode: apply the live subscription. */
  | { type: "checkout_subscription"; accountId: string; customerId: string | null; subscriptionId: string }
  /** Same events in payment mode (one-time plan). `paid` = payment_status paid / no_payment_required. */
  | { type: "checkout_payment"; accountId: string; plan: Plan; customerId: string | null; paid: boolean }
  /** customer.subscription.created/updated/deleted/paused/resumed: apply the live subscription. */
  | { type: "subscription_changed"; customerId: string; subscriptionId: string }
  /** invoice.paid / payment_succeeded / payment_failed. */
  | { type: "invoice"; customerId: string; subscriptionId: string | null; failed: boolean }
  /** charge.refunded: only a full refund of a one-time purchase revokes its plan. */
  | { type: "charge_refunded"; customerId: string | null; fullyRefunded: boolean; invoiceId: string | null }
  /** charge.dispute.created: the charge's customer is read live. */
  | { type: "dispute_created"; chargeId: string };

export type StripeSignatureCheck =
  | { ok: true; event: StripeEvent }
  | { ok: false; reason: "no_secret" | "no_signature" | "malformed" | "stale" | "invalid" | "bad_json" };

export type StripeEvent = { id?: string; type?: string; data?: { object?: Record<string, unknown> } };

const REPLAY_TOLERANCE_SECONDS = 300; // matches Stripe's own default tolerance

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Stripe's Stripe-Signature header looks like "t=1614556800,v1=<hex>,v1=<hex-for-rotated-secret>".
function parseSignatureHeader(header: string): { timestamp: string; signatures: string[] } | null {
  const parts = new Map<string, string[]>();
  for (const entry of header.split(",")) {
    const [key, value] = entry.split("=");
    if (!key || !value) continue;
    parts.set(key, [...(parts.get(key) ?? []), value]);
  }
  const timestamp = parts.get("t")?.[0];
  const signatures = parts.get("v1");
  if (!timestamp || !signatures?.length) return null;
  return { timestamp, signatures };
}

/**
 * Verifies a Stripe webhook's signature (HMAC-SHA256 over "{timestamp}.{rawBody}"). Anything that
 * does not verify (no secret configured, missing/malformed/invalid signature, stale timestamp) is
 * reported as such, and the route answers 400, so a misconfigured secret shows up as failed
 * deliveries in Stripe (which retries them) instead of silently dropped events.
 */
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  env: Env,
  nowSeconds: number = Date.now() / 1000
): Promise<StripeSignatureCheck> {
  if (!env.STRIPE_WEBHOOK_SECRET) return { ok: false, reason: "no_secret" };
  if (!signatureHeader) return { ok: false, reason: "no_signature" };

  const parsed = parseSignatureHeader(signatureHeader);
  if (!parsed) return { ok: false, reason: "malformed" };

  const eventAgeSeconds = Math.abs(nowSeconds - Number(parsed.timestamp));
  if (!Number.isFinite(eventAgeSeconds) || eventAgeSeconds > REPLAY_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale" };
  }

  const key = await hmacKey(env.STRIPE_WEBHOOK_SECRET);
  const signedPayload = new TextEncoder().encode(`${parsed.timestamp}.${rawBody}`);
  const anyValid = await Promise.all(
    parsed.signatures.map((sig) =>
      crypto.subtle.verify("HMAC", key, hexToBytes(sig), signedPayload).catch(() => false)
    )
  );
  if (!anyValid.some(Boolean)) return { ok: false, reason: "invalid" };

  try {
    return { ok: true, event: JSON.parse(rawBody) as StripeEvent };
  } catch {
    return { ok: false, reason: "bad_json" };
  }
}

function idOf(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  const id = (value as { id?: unknown } | null)?.id;
  return typeof id === "string" && id ? id : null;
}

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

const INVOICE_EVENTS = new Set(["invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed"]);

/**
 * Maps a verified event to what the route acts on, or null for an event type we ignore. None of
 * the subscription results carry a status or price: the route reads the subscription live from
 * Stripe, because event order is not guaranteed and a retried old snapshot must not win.
 */
export function extractStripeEvent(event: StripeEvent, env: Env): StripeWebhookResult | null {
  const obj = event.data?.object;
  if (!obj) return null;

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const accountId = obj.client_reference_id;
    if (typeof accountId !== "string" || !accountId) return null;
    const customerId = idOf(obj.customer);
    const subscriptionId = idOf(obj.subscription);
    if (obj.mode === "subscription" || subscriptionId) {
      if (!subscriptionId) return null;
      return { type: "checkout_subscription", accountId, customerId, subscriptionId };
    }
    const metadata = obj.metadata as { plan?: unknown } | undefined;
    // Prefer session metadata (set at Checkout Session create). Fall back to line-item price id
    // when Stripe expands line_items, then legacy obj.price, then Pro.
    const lineItems = (obj.line_items as { data?: Array<{ price?: string | { id?: string } }> } | undefined)?.data;
    const firstPrice = lineItems?.[0]?.price;
    const lineItemPriceId =
      typeof firstPrice === "string" ? firstPrice : typeof firstPrice?.id === "string" ? firstPrice.id : null;
    const plan =
      parseCheckoutPlan(metadata?.plan) ??
      planFromPriceId(env, lineItemPriceId) ??
      planFromPriceId(env, typeof obj.price === "string" ? obj.price : null) ??
      "pro";
    const paid = obj.payment_status === "paid" || obj.payment_status === "no_payment_required";
    return { type: "checkout_payment", accountId, plan, customerId, paid };
  }

  if (event.type && SUBSCRIPTION_EVENTS.has(event.type)) {
    const customerId = idOf(obj.customer);
    const subscriptionId = idOf(obj.id);
    if (!customerId || !subscriptionId) return null;
    return { type: "subscription_changed", customerId, subscriptionId };
  }

  if (event.type && INVOICE_EVENTS.has(event.type)) {
    const customerId = idOf(obj.customer);
    if (!customerId) return null;
    // API versions from 2025-03-31 moved the subscription to parent.subscription_details.
    const parent = obj.parent as { subscription_details?: { subscription?: unknown } } | undefined;
    const subscriptionId = idOf(obj.subscription) ?? idOf(parent?.subscription_details?.subscription);
    return { type: "invoice", customerId, subscriptionId, failed: event.type === "invoice.payment_failed" };
  }

  if (event.type === "charge.refunded") {
    const amount = typeof obj.amount === "number" ? obj.amount : null;
    const refunded = typeof obj.amount_refunded === "number" ? obj.amount_refunded : 0;
    const fullyRefunded = obj.refunded === true || (amount !== null && amount > 0 && refunded >= amount);
    return { type: "charge_refunded", customerId: idOf(obj.customer), fullyRefunded, invoiceId: idOf(obj.invoice) };
  }

  if (event.type === "charge.dispute.created") {
    const chargeId = idOf(obj.charge);
    if (!chargeId) return null;
    return { type: "dispute_created", chargeId };
  }

  return null;
}
