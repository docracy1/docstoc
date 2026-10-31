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
  setStripeSubscriptionId,
  subscriptionGrantsPlan,
} from "../lib/billing";
import { verifyAndExtract } from "../lib/billingProviders/stripe";
import { claimStripeEvent, parseStripeEventId } from "../lib/stripeEvents";
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

type StripeSubscriptionList = {
  data?: Array<{
    id?: string;
    status?: string;
    items?: {
      data?: Array<{
        price?: {
          id?: string;
        } | null;
      }>;
    } | null;
  }>;
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

async function fetchStripeSubscriptionStatus(
  secretKey: string,
  subscriptionId: string
): Promise<string | null> {
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) return null;
  const sub = (await res.json()) as { status?: string };
  return sub.status ?? null;
}

async function getBlockingStripeSubscriptionPlan(
  secretKey: string,
  customerId: string,
  env: Env
): Promise<"pro" | "business" | null> {
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
  const data = (await res.json()) as StripeSubscriptionList;
  for (const sub of data.data ?? []) {
    if (!["active", "trialing", "past_due", "unpaid", "incomplete"].includes(sub.status ?? "")) continue;
    const priceId = sub.items?.data?.[0]?.price?.id ?? null;
    const plan = planFromPriceId(env, priceId);
    if (plan && plan !== "free") return plan;
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
  const blockingPlan = existingCustomerId
    ? await getBlockingStripeSubscriptionPlan(c.env.STRIPE_SECRET_KEY, existingCustomerId, c.env)
    : null;
  if (blockingPlan) {
    await setAccountPlan(c.env, account.id, blockingPlan);
    await setAccountBillingStatus(c.env, account.id, "active");
    return c.json(
      { error: "A Stripe subscription is already active for this account. Refresh the page or use Manage billing." },
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
    // A checkout session stays "complete" and "paid" forever, also after the subscription it
    // created was canceled. Without this check, replaying an old session_id restores the plan.
    if (typeof session.subscription === "string" && session.subscription) {
      const status = await fetchStripeSubscriptionStatus(c.env.STRIPE_SECRET_KEY, session.subscription);
      if (status === null) {
        return c.json({ error: "Could not verify checkout yet. Please refresh." }, 502);
      }
      if (!subscriptionGrantsPlan(status)) {
        return c.json({ ok: true, status: "pending_payment", plan });
      }
    }
    await setAccountPlan(c.env, account.id, plan);
    await setAccountBillingStatus(c.env, account.id, "active");
    if (typeof session.customer === "string" && session.customer) {
      await setStripeCustomerId(c.env, account.id, session.customer);
    }
    if (typeof session.subscription === "string" && session.subscription) {
      await setStripeSubscriptionId(c.env, account.id, session.subscription);
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

// Not behind requireAccount/cookies — Stripe calls this server-to-server with no cookies or
// Origin header. The signature check below is the actual authentication.
billing.post("/webhook", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("Stripe-Signature") ?? null;
  const result = await verifyAndExtract(rawBody, signature, c.env);
  const eventId = parseStripeEventId(rawBody);

  if (result && eventId) {
    const isNew = await claimStripeEvent(c.env, eventId);
    if (!isNew) return c.json({ ok: true, duplicate: true });
  }

  if (result?.type === "checkout_completed") {
    await setAccountPlan(c.env, result.accountId, result.plan);
    if (result.customerId) await setStripeCustomerId(c.env, result.accountId, result.customerId);
    if (result.subscriptionId) await setStripeSubscriptionId(c.env, result.accountId, result.subscriptionId);
    await trackEvent(c.env, {
      name: "checkout_completed",
      accountId: result.accountId,
      properties: { plan: result.plan },
    });
  } else if (result?.type === "subscription_deleted") {
    const accountId = await findAccountIdByStripeCustomerId(c.env, result.customerId);
    if (accountId) {
      await setAccountPlan(c.env, accountId, "free");
      await setAccountBillingStatus(c.env, accountId, "canceled");
      await setStripeSubscriptionId(c.env, accountId, null);
    }
  } else if (result?.type === "subscription_updated") {
    const accountId = await findAccountIdByStripeCustomerId(c.env, result.customerId);
    if (accountId) {
      await setAccountBillingStatus(c.env, accountId, result.status);
      if (result.status === "canceled") {
        await setAccountPlan(c.env, accountId, "free");
      } else if ((result.status === "active" || result.status === "trialing") && result.plan) {
        // Covers plan changes made through Stripe's own customer portal — checkout.session.completed
        // only fires on the *first* subscription, not later upgrades/downgrades.
        await setAccountPlan(c.env, accountId, result.plan);
      }
      // past_due / unpaid / incomplete: leave the plan alone (grace period). billing_status above
      // is what surfaces the problem; invoice.payment_failed below is what emails the owner.
    }
  } else if (result?.type === "payment_failed") {
    const accountId = await findAccountIdByStripeCustomerId(c.env, result.customerId);
    if (accountId) {
      const account = await c.env.CHASA_DB.prepare(`SELECT email, locale FROM accounts WHERE id = ?`)
        .bind(accountId)
        .first<{ email: string; locale: string | null }>();
      if (account?.email) {
        await sendPaymentFailedEmail(c.env, account.email, normalizeLocale(account.locale)).catch((err) =>
          console.error("payment-failed email send failed:", err)
        );
      }
    }
  }

  // Always 200: Stripe retries (and eventually disables the endpoint) on non-2xx responses, and
  // "signature didn't verify" / "not an event type we act on" aren't retry-worthy conditions.
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
