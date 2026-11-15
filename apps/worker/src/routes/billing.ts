import { Hono } from "hono";
import { requireAccount, requirePaidAccount, type AuthEnv } from "../lib/auth";
import type { Env } from "../types";
import {
  findAccountIdByStripeCustomerId,
  getStripeCustomerId,
  parseCheckoutPlan,
  planFromPriceId,
  priceIdForPlan,
  setAccountBillingStatus,
  setAccountPlan,
  setStripeCustomerId,
  subscriptionGrantsPlan,
} from "../lib/billing";
import { extractStripeEvent, verifyStripeSignature, type StripeWebhookResult } from "../lib/billingProviders/stripe";
import { isStripeEventProcessed, parseStripeEventId, recordStripeEvent } from "../lib/stripeEvents";
import {
  ONE_TIME_BILLING_STATUS,
  applyLiveSubscription,
  fetchLiveSubscription,
  parseLiveSubscription,
  readBillingRow,
  type LiveSubscription,
} from "../lib/billingState";
import { sendPaymentFailedEmail } from "../lib/email";
import { normalizeLocale } from "../lib/locale";
import { billingCheckoutSchema, parseJsonBody } from "../lib/schemas";
import { requestAppOrigin } from "../lib/appUrl";
import { trackEvent } from "../lib/analytics";

const billing = new Hono<AuthEnv>();

type StripeErrorBody = {
  error?: {
    type?: string;
    code?: string;
    message?: string;
    param?: string;
  };
};

type StripePrice = {
  id?: string;
  type?: "one_time" | "recurring";
  active?: boolean;
  error?: { message?: string };
};

type StripeCheckoutSession = {
  id?: string;
  status?: string;
  payment_status?: string;
  customer?: string | null;
  subscription?: string | null;
  client_reference_id?: string | null;
  metadata?: { plan?: unknown } | null;
  line_items?: { data?: Array<{ price?: string | { id?: string } }> } | null;
};

function stripeClientMessage(status: number, body: StripeErrorBody, fallback: string): string {
  const msg = body.error?.message?.trim();
  const code = body.error?.code;
  if (status === 401 || code === "api_key_expired" || /invalid api key/i.test(msg ?? "")) {
    return "Stripe API key is invalid or was rotated. Re-set STRIPE_SECRET_KEY on the Worker.";
  }
  if (code === "resource_missing" || /no such price/i.test(msg ?? "")) {
    return msg
      ? `Stripe price not found (${msg}). Check STRIPE_PRICE_* in wrangler.toml matches live mode.`
      : "Stripe price not found. Check STRIPE_PRICE_* IDs match your live Stripe account.";
  }
  if (/one_time.*subscription|subscription.*one_time|recurring price in `subscription`/i.test(msg ?? "")) {
    return "That Stripe price is one-time, but checkout was started in subscription mode.";
  }
  if (msg) return `Stripe: ${msg}`;
  return fallback;
}

async function fetchStripePrice(
  secretKey: string,
  priceId: string
): Promise<{ ok: true; price: StripePrice } | { ok: false; status: number; body: StripeErrorBody; raw: string }> {
  const res = await fetch(`https://api.stripe.com/v1/prices/${priceId}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const raw = await res.text();
  let parsed: StripePrice & StripeErrorBody = {};
  try {
    parsed = JSON.parse(raw) as StripePrice & StripeErrorBody;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return { ok: false, status: res.status, body: parsed, raw };
  }
  return { ok: true, price: parsed };
}

async function fetchStripeCheckoutSession(
  secretKey: string,
  sessionId: string
): Promise<
  | { ok: true; session: StripeCheckoutSession }
  | { ok: false; status: number; body: StripeErrorBody; raw: string }
> {
  const params = new URLSearchParams({
    "expand[]": "line_items.data.price",
  });
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const raw = await res.text();
  let parsed: StripeCheckoutSession & StripeErrorBody = {};
  try {
    parsed = JSON.parse(raw) as StripeCheckoutSession & StripeErrorBody;
  } catch {
    /* ignore */
  }
  if (!res.ok) return { ok: false, status: res.status, body: parsed, raw };
  return { ok: true, session: parsed };
}

/**
 * The customer's subscription that should stop a second checkout: any subscription in a state that
 * still has (or can get back) a paid plan. Only an active/trialing one restores the plan here; a
 * past_due/unpaid/incomplete one blocks the checkout without granting anything.
 */
async function getBlockingStripeSubscription(
  secretKey: string,
  customerId: string,
  env: Env
): Promise<LiveSubscription | null> {
  const params = new URLSearchParams({
    customer: customerId,
    status: "all",
    "expand[]": "data.items.data.price",
    limit: "10",
  });
  const res = await fetch(`https://api.stripe.com/v1/subscriptions?${params.toString()}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: unknown[] };
  for (const raw of data.data ?? []) {
    const sub = parseLiveSubscription(raw);
    if (!sub) continue;
    if (!["active", "trialing", "past_due", "unpaid", "incomplete"].includes(sub.status)) continue;
    const plan = planFromPriceId(env, sub.priceId);
    if (plan && plan !== "free") return sub;
  }
  return null;
}

billing.post("/checkout", requireAccount, async (c) => {
  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json({ error: "Billing isn't set up on this deployment yet." }, 501);
  }

  const parsed = await parseJsonBody(c.req, billingCheckoutSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const plan = parsed.data.plan;

  const priceId = priceIdForPlan(c.env, plan);
  if (!priceId) {
    return c.json({ error: `That plan isn't configured yet (${plan}).` }, 501);
  }

  if (!c.env.PUBLIC_APP_URL) {
    return c.json({ error: "PUBLIC_APP_URL is not configured on the Worker." }, 501);
  }

  const priceLookup = await fetchStripePrice(c.env.STRIPE_SECRET_KEY, priceId);
  if (!priceLookup.ok) {
    console.error(`Stripe price lookup failed (${priceLookup.status}) price=${priceId}: ${priceLookup.raw}`);
    return c.json(
      {
        error: stripeClientMessage(
          priceLookup.status,
          priceLookup.body,
          "Could not load that Stripe price. Please try again."
        ),
        plan,
        priceId,
      },
      502
    );
  }

  // Pro is a recurring subscription. Business's Stripe price (STRIPE_PRICE_ENTERPRISE, being
  // converted from a one-time price to a $39.99/mo recurring one) is detected dynamically here —
  // whichever it currently is in Stripe decides the checkout mode, no code change needed either way.
  const mode = priceLookup.price.type === "recurring" ? "subscription" : "payment";

  const account = c.get("account")!;
  if (account.plan !== "free") {
    return c.json({ error: "Your paid plan is already active. Use Manage billing instead." }, 409);
  }

  const existingCustomerId = await getStripeCustomerId(c.env, account.id);
  const blocking = existingCustomerId
    ? await getBlockingStripeSubscription(c.env.STRIPE_SECRET_KEY, existingCustomerId, c.env)
    : null;
  if (blocking) {
    if (subscriptionGrantsPlan(blocking.status)) {
      await applyLiveSubscription(c.env, account.id, blocking);
      return c.json(
        { error: "A Stripe subscription is already active for this account. Refresh the page or use Manage billing." },
        409
      );
    }
    // past_due / unpaid / incomplete: a second subscription would double-bill, but the open one
    // has not been paid, so it must not hand out the plan either.
    return c.json(
      {
        error:
          "This account has a Stripe subscription with an open payment. Pay the open invoice from Stripe's email, or contact support.",
        billingStatus: blocking.status,
      },
      409
    );
  }

  const params = new URLSearchParams({
    mode,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${requestAppOrigin(c)}/app/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${requestAppOrigin(c)}/app/account?checkout=cancelled`,
    client_reference_id: account.id,
    "metadata[plan]": plan,
  });

  if (mode === "subscription") {
    params.set("subscription_data[metadata][plan]", plan);
  }

  // Prefer existing Stripe customer so upgrades don't fail when email already has a customer.
  if (existingCustomerId) {
    params.set("customer", existingCustomerId);
  } else {
    params.set("customer_email", account.email);
    // Payment mode only creates a Customer on request. Without one, a later refund or dispute of
    // the one-time purchase could not be matched back to the account.
    if (mode === "payment") params.set("customer_creation", "always");
  }

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const raw = await res.text();
    let parsed: StripeErrorBody = {};
    try {
      parsed = JSON.parse(raw) as StripeErrorBody;
    } catch {
      /* ignore */
    }
    console.error(
      `Stripe checkout session creation failed (${res.status}) plan=${plan} price=${priceId} mode=${mode} app=${c.env.PUBLIC_APP_URL}: ${raw}`
    );
    return c.json(
      {
        error: stripeClientMessage(res.status, parsed, "Could not start checkout. Please try again."),
        plan,
        priceId,
        mode,
      },
      502
    );
  }

  const session = (await res.json()) as { url: string | null };
  if (!session.url) {
    return c.json({ error: "Stripe returned a checkout session without a URL." }, 502);
  }
  await trackEvent(c.env, {
    name: "checkout_started",
    accountId: account.id,
    properties: { plan, mode },
    userAgent: c.req.header("user-agent"),
  });
  return c.json({ url: session.url });
});

billing.get("/confirm-session", requireAccount, async (c) => {
  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json({ error: "Billing isn't set up on this deployment yet." }, 501);
  }
  const sessionId = (c.req.query("session_id") || "").trim();
  if (!sessionId) return c.json({ error: "Missing session_id." }, 400);

  const lookup = await fetchStripeCheckoutSession(c.env.STRIPE_SECRET_KEY, sessionId);
  if (!lookup.ok) {
    console.error(`Stripe checkout session lookup failed (${lookup.status}) session=${sessionId}: ${lookup.raw}`);
    return c.json(
      { error: stripeClientMessage(lookup.status, lookup.body, "Could not verify checkout yet. Please refresh.") },
      502
    );
  }

  const session = lookup.session;
  const account = c.get("account")!;
  if (session.client_reference_id !== account.id) {
    return c.json({ error: "That checkout session belongs to a different account." }, 403);
  }

  const firstPrice = session.line_items?.data?.[0]?.price;
  const lineItemPriceId =
    typeof firstPrice === "string" ? firstPrice : typeof firstPrice?.id === "string" ? firstPrice.id : null;
  const plan =
    parseCheckoutPlan(session.metadata?.plan) ??
    planFromPriceId(c.env, lineItemPriceId) ??
    "pro";

  const complete = session.status === "complete";
  const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
  if (complete && paid) {
    if (typeof session.customer === "string" && session.customer) {
      await setStripeCustomerId(c.env, account.id, session.customer);
    }
    // A checkout session stays "complete" and "paid" forever, also after the subscription it
    // created was canceled. The live subscription decides, never the session.
    if (typeof session.subscription === "string" && session.subscription) {
      const live = await fetchLiveSubscription(c.env.STRIPE_SECRET_KEY, session.subscription);
      if (!live.ok) {
        return c.json({ error: "Could not verify checkout yet. Please refresh." }, 502);
      }
      if (!subscriptionGrantsPlan(live.subscription.status)) {
        return c.json({ ok: true, status: "pending_payment", plan });
      }
      const outcome = await applyLiveSubscription(c.env, account.id, live.subscription);
      if (!outcome.applied) return c.json({ ok: true, status: "pending_payment", plan });
    } else {
      await setAccountPlan(c.env, account.id, plan);
      await setAccountBillingStatus(c.env, account.id, ONE_TIME_BILLING_STATUS);
    }
    await trackEvent(c.env, {
      name: "checkout_completed",
      accountId: account.id,
      properties: { plan, source: "confirm_session" },
      userAgent: c.req.header("user-agent"),
    }).catch(() => {});
    return c.json({ ok: true, status: "active", plan });
  }

  return c.json({
    ok: true,
    status: complete ? "pending_payment" : "pending",
    plan,
  });
});

class StripeLiveLookupError extends Error {}

async function liveSubscriptionOrThrow(env: Env, subscriptionId: string): Promise<LiveSubscription | null> {
  if (!env.STRIPE_SECRET_KEY) throw new StripeLiveLookupError("STRIPE_SECRET_KEY missing, cannot read the subscription");
  const live = await fetchLiveSubscription(env.STRIPE_SECRET_KEY, subscriptionId);
  if (live.ok) return live.subscription;
  // 404: not a subscription of this Stripe account/mode. Retrying would never change that.
  if (live.missing) {
    console.warn(`stripe webhook: subscription ${subscriptionId} not found, event ignored`);
    return null;
  }
  throw new StripeLiveLookupError(`Stripe subscription lookup failed (${live.status})`);
}

/** Revokes a one-time grant (full refund or dispute). Subscription accounts are left to their live state. */
async function revokeOneTimeGrant(env: Env, customerId: string, reason: "refunded" | "disputed"): Promise<void> {
  const accountId = await findAccountIdByStripeCustomerId(env, customerId);
  if (!accountId) return;
  const row = await readBillingRow(env, accountId);
  if (!row || row.stripe_subscription_id) return;
  // "active" covers one-time purchases confirmed before ONE_TIME_BILLING_STATUS existed. Manual and
  // enterprise grants have no billing_status and are never touched.
  if (row.billing_status !== ONE_TIME_BILLING_STATUS && row.billing_status !== "active") return;
  await setAccountPlan(env, accountId, "free");
  await setAccountBillingStatus(env, accountId, reason);
}

async function handleStripeEvent(env: Env, result: StripeWebhookResult): Promise<void> {
  switch (result.type) {
    case "checkout_subscription": {
      if (result.customerId) await setStripeCustomerId(env, result.accountId, result.customerId);
      const live = await liveSubscriptionOrThrow(env, result.subscriptionId);
      if (!live) return;
      const outcome = await applyLiveSubscription(env, result.accountId, live);
      if (outcome.applied && outcome.plan !== "free") {
        await trackEvent(env, { name: "checkout_completed", accountId: result.accountId, properties: { plan: outcome.plan } });
      }
      return;
    }
    case "checkout_payment": {
      if (result.customerId) await setStripeCustomerId(env, result.accountId, result.customerId);
      // Delayed payment methods complete the session unpaid; checkout.session.async_payment_succeeded grants later.
      if (!result.paid) return;
      await setAccountPlan(env, result.accountId, result.plan);
      await setAccountBillingStatus(env, result.accountId, ONE_TIME_BILLING_STATUS);
      await trackEvent(env, { name: "checkout_completed", accountId: result.accountId, properties: { plan: result.plan } });
      return;
    }
    case "subscription_changed":
    case "invoice": {
      const accountId = await findAccountIdByStripeCustomerId(env, result.customerId);
      if (!accountId) return;
      if (result.subscriptionId) {
        const live = await liveSubscriptionOrThrow(env, result.subscriptionId);
        if (live) await applyLiveSubscription(env, accountId, live);
      }
      if (result.type === "invoice" && result.failed) {
        const account = await env.CHASA_DB.prepare(`SELECT email, locale FROM accounts WHERE id = ?`)
          .bind(accountId)
          .first<{ email: string; locale: string | null }>();
        if (account?.email) {
          await sendPaymentFailedEmail(env, account.email, normalizeLocale(account.locale)).catch((err) =>
            console.error("payment-failed email send failed:", err)
          );
        }
      }
      return;
    }
    case "charge_refunded": {
      // Subscription invoices: the subscription's own state decides (Stripe cancels it if wanted).
      if (!result.fullyRefunded || !result.customerId || result.invoiceId) return;
      await revokeOneTimeGrant(env, result.customerId, "refunded");
      return;
    }
    case "dispute_created": {
      if (!env.STRIPE_SECRET_KEY) throw new StripeLiveLookupError("STRIPE_SECRET_KEY missing, cannot read the charge");
      const res = await fetch(`https://api.stripe.com/v1/charges/${encodeURIComponent(result.chargeId)}`, {
        headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
      });
      if (res.status === 404) return;
      if (!res.ok) throw new StripeLiveLookupError(`Stripe charge lookup failed (${res.status})`);
      const charge = (await res.json()) as { customer?: unknown; invoice?: unknown };
      const customerId = typeof charge.customer === "string" ? charge.customer : null;
      if (!customerId || charge.invoice) return;
      await revokeOneTimeGrant(env, customerId, "disputed");
      return;
    }
  }
}

// Not behind requireAccount/cookies — Stripe calls this server-to-server with no cookies or
// Origin header. The signature check below is the actual authentication.
//
// Responses: 400 when the signature does not verify (Stripe shows the failure and retries, so a
// wrong or missing STRIPE_WEBHOOK_SECRET loses nothing), 200 for verified events we handled or
// ignore, 500 when a handler failed (Stripe retries; the event is only recorded after success).
billing.post("/webhook", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("Stripe-Signature") ?? null;
  const verified = await verifyStripeSignature(rawBody, signature, c.env);
  if (!verified.ok) {
    console.warn(`stripe webhook rejected: ${verified.reason}`);
    return c.json({ error: "Invalid Stripe signature.", reason: verified.reason }, 400);
  }

  const eventId = parseStripeEventId(rawBody);
  if (eventId && (await isStripeEventProcessed(c.env, eventId))) {
    return c.json({ ok: true, duplicate: true });
  }

  const result = extractStripeEvent(verified.event, c.env);
  if (!result) return c.json({ ok: true, ignored: true });

  try {
    await handleStripeEvent(c.env, result);
  } catch (err) {
    console.error(`stripe webhook ${verified.event.type ?? "?"} ${eventId ?? "?"} failed:`, err);
    return c.json({ error: "Webhook handler failed, Stripe will retry." }, 500);
  }

  if (eventId) await recordStripeEvent(c.env, eventId);
  return c.json({ ok: true });
});

// Redirects a paid account to Stripe's hosted Customer Portal to cancel or manage billing — no
// bespoke cancel-subscription UI to build or keep in sync with Stripe's proration/dunning rules.
billing.post("/portal", requirePaidAccount, async (c) => {
  if (!c.env.STRIPE_SECRET_KEY) {
    return c.json({ error: "Billing isn't set up on this deployment yet." }, 501);
  }
  const account = c.get("account")!;
  const customerId = await getStripeCustomerId(c.env, account.id);
  if (!customerId) {
    return c.json({ error: "No billing account on file yet." }, 404);
  }

  const params = new URLSearchParams({
    customer: customerId,
    return_url: `${requestAppOrigin(c)}/app/account`,
  });

  const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const raw = await res.text();
    let parsed: StripeErrorBody = {};
    try {
      parsed = JSON.parse(raw) as StripeErrorBody;
    } catch {
      /* ignore */
    }
    console.error(`Stripe portal session creation failed (${res.status}): ${raw}`);
    return c.json(
      {
        error: stripeClientMessage(res.status, parsed, "Could not open the billing portal. Please try again."),
      },
      502
    );
  }

  const session = (await res.json()) as { url: string | null };
  if (!session.url) {
    return c.json({ error: "Stripe returned a portal session without a URL." }, 502);
  }
  return c.json({ url: session.url });
});

/** Signed-in diagnostic — confirms price IDs resolve in the Stripe account behind STRIPE_SECRET_KEY. */
billing.get("/status", requireAccount, async (c) => {
  const key = c.env.STRIPE_SECRET_KEY;
  if (!key) {
    return c.json({ ok: false, error: "STRIPE_SECRET_KEY missing" }, 501);
  }

  const plans = ["pro", "business"] as const;
  const prices: Record<string, unknown> = {};
  for (const plan of plans) {
    const priceId = priceIdForPlan(c.env, plan);
    if (!priceId) {
      prices[plan] = { configured: false };
      continue;
    }
    const res = await fetch(`https://api.stripe.com/v1/prices/${priceId}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = (await res.json()) as {
      id?: string;
      active?: boolean;
      type?: string;
      unit_amount?: number;
      currency?: string;
      recurring?: { interval?: string } | null;
      error?: { message?: string; type?: string };
    };
    prices[plan] = {
      configured: true,
      priceId,
      httpStatus: res.status,
      active: data.active ?? null,
      type: data.type ?? null,
      unitAmount: data.unit_amount ?? null,
      currency: data.currency ?? null,
      interval: data.recurring?.interval ?? null,
      checkoutMode: data.type === "recurring" ? "subscription" : "payment",
      error: data.error?.message ?? null,
    };
  }

  return c.json({
    ok: true,
    publicAppUrl: c.env.PUBLIC_APP_URL,
    prices,
  });
});

export default billing;
