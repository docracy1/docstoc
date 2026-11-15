import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import type { Env } from "../types";
import { resetBillingColumnProbe } from "../lib/billingState";

const trackEvent = vi.fn(async () => {});
const sendPaymentFailedEmail = vi.fn(async () => {});

vi.mock("../lib/auth", () => ({
  requireAccount: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("account", { id: "acc-1", email: "owner@example.com", plan: "free" });
    await next();
  },
  requirePaidAccount: async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock("../lib/analytics", () => ({ trackEvent }));
vi.mock("../lib/email", () => ({ sendPaymentFailedEmail }));

// --- In-memory D1 over node:sqlite ---

type FakeD1 = { db: DatabaseSync; failOn?: RegExp };

function d1(fake: FakeD1) {
  return {
    prepare(sql: string) {
      const stmt = (params: unknown[] = []) => {
        const guard = () => {
          if (fake.failOn?.test(sql)) throw new Error("D1_ERROR: simulated outage");
        };
        return {
          bind: (...p: unknown[]) => stmt(p),
          first: async () => {
            guard();
            return (fake.db.prepare(sql).get(...(params as never[])) as unknown) ?? null;
          },
          run: async () => {
            guard();
            const r = fake.db.prepare(sql).run(...(params as never[]));
            return { meta: { changes: Number(r.changes) } };
          },
          all: async () => {
            guard();
            return { results: fake.db.prepare(sql).all(...(params as never[])) };
          },
        };
      };
      return stmt();
    },
  };
}

function makeDb(withPeriodColumns = true): FakeD1 {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE accounts (
    id TEXT PRIMARY KEY, email TEXT, created_at TEXT, is_paid INTEGER NOT NULL DEFAULT 0, plan TEXT,
    paid_at TEXT, stripe_customer_id TEXT, stripe_subscription_id TEXT, billing_status TEXT, locale TEXT
    ${withPeriodColumns ? ", current_period_end TEXT, past_due_since TEXT" : ""}
  );
  CREATE TABLE stripe_events (id TEXT PRIMARY KEY, processed_at TEXT NOT NULL);`);
  return { db };
}

type AccountRow = {
  plan: string;
  is_paid: number;
  paid_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_status: string | null;
  current_period_end?: string | null;
  past_due_since?: string | null;
};

function insertAccount(fake: FakeD1, values: Partial<AccountRow> = {}) {
  const row = {
    plan: "free",
    is_paid: 0,
    paid_at: null,
    stripe_customer_id: "cus_1",
    stripe_subscription_id: null,
    billing_status: null,
    ...values,
  };
  const cols = Object.keys(row);
  fake.db
    .prepare(
      `INSERT INTO accounts (id, email, created_at, ${cols.join(", ")}) VALUES ('acc-1', 'owner@example.com', '2026-01-01', ${cols.map(() => "?").join(", ")})`
    )
    .run(...(Object.values(row) as never[]));
}

function account(fake: FakeD1): AccountRow {
  return fake.db.prepare(`SELECT * FROM accounts WHERE id = 'acc-1'`).get() as unknown as AccountRow;
}

// --- Stripe fakes ---

const SECRET = "whsec_test";
const NOW = Math.floor(Date.now() / 1000);
const PERIOD_END = NOW + 30 * 86400;

function subscription(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    status,
    customer: "cus_1",
    items: { data: [{ price: { id: "price_pro" }, current_period_end: PERIOD_END }] },
    ...extra,
  };
}

type StripeStub = {
  subscriptions?: Record<string, { status: number; body?: unknown }>;
  list?: unknown[];
  session?: unknown;
  charges?: Record<string, unknown>;
};

function stubStripe(stub: StripeStub) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/v1/checkout/sessions/")) return new Response(JSON.stringify(stub.session));
    if (u.endsWith("/v1/checkout/sessions") && init?.method === "POST") {
      return new Response(JSON.stringify({ url: "https://checkout.stripe.test/cs" }));
    }
    if (u.includes("/v1/prices/")) return new Response(JSON.stringify({ id: "price_pro", type: "recurring" }));
    if (u.includes("/v1/subscriptions?")) return new Response(JSON.stringify({ data: stub.list ?? [] }));
    const sub = u.match(/\/v1\/subscriptions\/([^?]+)/);
    if (sub) {
      const entry = stub.subscriptions?.[decodeURIComponent(sub[1])];
      if (!entry) return new Response(JSON.stringify({ error: { code: "resource_missing" } }), { status: 404 });
      return new Response(JSON.stringify(entry.body ?? {}), { status: entry.status });
    }
    const charge = u.match(/\/v1\/charges\/([^?]+)/);
    if (charge) {
      const body = stub.charges?.[decodeURIComponent(charge[1])];
      return body ? new Response(JSON.stringify(body)) : new Response("{}", { status: 404 });
    }
    throw new Error(`unexpected fetch ${u}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function envFor(fake: FakeD1, extra: Partial<Env> = {}): Env {
  return {
    CHASA_DB: d1(fake),
    STRIPE_SECRET_KEY: "sk_test_x",
    STRIPE_WEBHOOK_SECRET: SECRET,
    STRIPE_PRICE_SOLO: "price_pro",
    STRIPE_PRICE_ENTERPRISE: "price_business",
    PUBLIC_APP_URL: "https://docstoc.io",
    ...extra,
  } as unknown as Env;
}

async function app() {
  const { default: billing } = await import("./billing");
  const a = new Hono<{ Bindings: Env }>();
  a.route("/billing", billing as never);
  return a;
}

let eventCounter = 0;
function event(type: string, object: Record<string, unknown>, id = `evt_${++eventCounter}`) {
  return JSON.stringify({ id, type, data: { object } });
}

function sign(body: string, timestamp = NOW, secret = SECRET) {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

async function webhook(env: Env, body: string, signature: string | null = sign(body)) {
  const headers: Record<string, string> = {};
  if (signature) headers["Stripe-Signature"] = signature;
  return (await app()).request("/billing/webhook", { method: "POST", body, headers }, env);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetBillingColumnProbe();
});
afterEach(() => vi.unstubAllGlobals());

// --- 2: signature handling ---

describe("POST /billing/webhook signature", () => {
  it("answers 400 for a bad signature, a missing signature, a missing secret and a stale timestamp", async () => {
    const fake = makeDb();
    insertAccount(fake);
    stubStripe({});
    const body = event("customer.subscription.updated", subscription("active"));
    expect((await webhook(envFor(fake), body, sign(body, NOW, "whsec_wrong"))).status).toBe(400);
    expect((await webhook(envFor(fake), body, null)).status).toBe(400);
    expect((await webhook(envFor(fake, { STRIPE_WEBHOOK_SECRET: undefined }), body)).status).toBe(400);
    expect((await webhook(envFor(fake), body, sign(body, NOW - 3600))).status).toBe(400);
    expect(account(fake).plan).toBe("free");
  });

  it("answers 200 for a verified event type we ignore", async () => {
    const fake = makeDb();
    stubStripe({});
    const res = await webhook(envFor(fake), event("customer.created", { id: "cus_1" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: true });
  });
});

// --- 3: idempotency only after success ---

describe("POST /billing/webhook idempotency", () => {
  it("returns 500 when the handler fails and processes the retry of the same event", async () => {
    const fake = makeDb();
    insertAccount(fake);
    const body = event("customer.subscription.updated", subscription("active"), "evt_retry");
    stubStripe({ subscriptions: { sub_1: { status: 500 } } });
    expect((await webhook(envFor(fake), body)).status).toBe(500);
    expect(account(fake).plan).toBe("free");

    stubStripe({ subscriptions: { sub_1: { status: 200, body: subscription("active") } } });
    const retry = await webhook(envFor(fake), body);
    expect(retry.status).toBe(200);
    expect(await retry.json()).not.toMatchObject({ duplicate: true });
    expect(account(fake).plan).toBe("pro");

    const again = await webhook(envFor(fake), body);
    expect(await again.json()).toMatchObject({ duplicate: true });
  });

  it("does not treat a D1 error in the dedupe lookup as a duplicate", async () => {
    const fake = makeDb();
    insertAccount(fake);
    fake.failOn = /stripe_events/;
    stubStripe({ subscriptions: { sub_1: { status: 200, body: subscription("active") } } });
    const res = await webhook(envFor(fake), event("customer.subscription.updated", subscription("active")));
    expect(res.status).toBe(200);
    expect(await res.json()).not.toMatchObject({ duplicate: true });
    expect(account(fake).plan).toBe("pro");
  });
});

// --- 4 + 5: live subscription state ---

describe("POST /billing/webhook applies the live subscription", () => {
  it("a late active snapshot after cancellation does not re-grant the plan", async () => {
    const fake = makeDb();
    insertAccount(fake, { plan: "free", billing_status: "canceled" });
    stubStripe({ subscriptions: { sub_1: { status: 200, body: subscription("canceled") } } });
    const res = await webhook(envFor(fake), event("customer.subscription.updated", subscription("active")));
    expect(res.status).toBe(200);
    expect(account(fake)).toMatchObject({ plan: "free", is_paid: 0, billing_status: "canceled", stripe_subscription_id: null });
  });

  it("a retried checkout.session.completed of a canceled subscription does not re-grant the plan", async () => {
    const fake = makeDb();
    insertAccount(fake, { plan: "free", billing_status: "canceled" });
    stubStripe({ subscriptions: { sub_1: { status: 200, body: subscription("canceled") } } });
    const body = event("checkout.session.completed", {
      mode: "subscription",
      client_reference_id: "acc-1",
      customer: "cus_1",
      subscription: "sub_1",
      payment_status: "paid",
      metadata: { plan: "pro" },
    });
    expect((await webhook(envFor(fake), body)).status).toBe(200);
    expect(account(fake).plan).toBe("free");
  });

  it("checkout of a live subscription grants the plan and stores the period end", async () => {
    const fake = makeDb();
    insertAccount(fake, { stripe_customer_id: null });
    stubStripe({ subscriptions: { sub_1: { status: 200, body: subscription("active") } } });
    const body = event("checkout.session.completed", {
      mode: "subscription",
      client_reference_id: "acc-1",
      customer: "cus_1",
      subscription: "sub_1",
      payment_status: "paid",
    });
    expect((await webhook(envFor(fake), body)).status).toBe(200);
    expect(account(fake)).toMatchObject({
      plan: "pro",
      is_paid: 1,
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      billing_status: "active",
      current_period_end: new Date(PERIOD_END * 1000).toISOString(),
    });
  });

  it("unpaid and incomplete subscriptions downgrade to free", async () => {
    for (const status of ["unpaid", "incomplete", "incomplete_expired", "paused"]) {
      const fake = makeDb();
      insertAccount(fake, { plan: "pro", is_paid: 1, stripe_subscription_id: "sub_1", billing_status: "active" });
      stubStripe({ subscriptions: { sub_1: { status: 200, body: subscription(status) } } });
      await webhook(envFor(fake), event("invoice.payment_failed", { customer: "cus_1", subscription: "sub_1" }));
      expect(account(fake).plan, status).toBe("free");
    }
  });

  it("past_due keeps the plan for 14 days from the first failure, then downgrades", async () => {
    const fake = makeDb();
    insertAccount(fake, { plan: "pro", is_paid: 1, stripe_subscription_id: "sub_1", billing_status: "active" });
    stubStripe({ subscriptions: { sub_1: { status: 200, body: subscription("past_due") } } });
    await webhook(envFor(fake), event("invoice.payment_failed", { customer: "cus_1", subscription: "sub_1" }));
    const first = account(fake);
    expect(first).toMatchObject({ plan: "pro", billing_status: "past_due" });
    expect(first.past_due_since).toBeTruthy();
    expect(sendPaymentFailedEmail).toHaveBeenCalledTimes(1);

    const fifteenDaysAgo = new Date(Date.now() - 15 * 86400_000).toISOString();
    fake.db.prepare(`UPDATE accounts SET past_due_since = ? WHERE id = 'acc-1'`).run(fifteenDaysAgo);
    await webhook(envFor(fake), event("invoice.payment_failed", { customer: "cus_1", subscription: "sub_1" }));
    expect(account(fake)).toMatchObject({ plan: "free", past_due_since: fifteenDaysAgo });
  });

  it("an active subscription after past_due clears the grace marker", async () => {
    const fake = makeDb();
    insertAccount(fake, {
      plan: "pro",
      is_paid: 1,
      stripe_subscription_id: "sub_1",
      billing_status: "past_due",
      past_due_since: new Date().toISOString(),
    });
    stubStripe({ subscriptions: { sub_1: { status: 200, body: subscription("active") } } });
    await webhook(
      envFor(fake),
      event("invoice.paid", { customer: "cus_1", parent: { subscription_details: { subscription: "sub_1" } } })
    );
    expect(account(fake)).toMatchObject({ plan: "pro", billing_status: "active", past_due_since: null });
  });

  it("does not reset paid_at when the plan stays the same", async () => {
    const fake = makeDb();
    insertAccount(fake, { plan: "pro", is_paid: 1, paid_at: "2026-01-01T00:00:00.000Z", stripe_subscription_id: "sub_1" });
    stubStripe({ subscriptions: { sub_1: { status: 200, body: subscription("active") } } });
    await webhook(envFor(fake), event("invoice.paid", { customer: "cus_1", subscription: "sub_1" }));
    expect(account(fake).paid_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("still works before migration 0048 (no period columns)", async () => {
    const fake = makeDb(false);
    insertAccount(fake);
    stubStripe({ subscriptions: { sub_1: { status: 200, body: subscription("active") } } });
    const res = await webhook(envFor(fake), event("customer.subscription.created", subscription("active")));
    expect(res.status).toBe(200);
    expect(account(fake)).toMatchObject({ plan: "pro", stripe_subscription_id: "sub_1", billing_status: "active" });
  });
});

// --- 6: which subscription ended ---

describe("POST /billing/webhook customer.subscription.deleted", () => {
  it("does not downgrade when an old subscription of the same customer ends", async () => {
    const fake = makeDb();
    insertAccount(fake, { plan: "business", is_paid: 1, stripe_subscription_id: "sub_new", billing_status: "active" });
    stubStripe({ subscriptions: { sub_old: { status: 200, body: subscription("canceled", { id: "sub_old" }) } } });
    await webhook(envFor(fake), event("customer.subscription.deleted", subscription("canceled", { id: "sub_old" })));
    expect(account(fake)).toMatchObject({ plan: "business", stripe_subscription_id: "sub_new" });
  });

  it("downgrades when the stored subscription ends", async () => {
    const fake = makeDb();
    insertAccount(fake, { plan: "pro", is_paid: 1, stripe_subscription_id: "sub_1", billing_status: "active" });
    stubStripe({ subscriptions: { sub_1: { status: 200, body: subscription("canceled") } } });
    await webhook(envFor(fake), event("customer.subscription.deleted", subscription("canceled")));
    expect(account(fake)).toMatchObject({ plan: "free", stripe_subscription_id: null, billing_status: "canceled" });
  });
});

// --- 7: one-time payments ---

describe("POST /billing/webhook one-time purchases", () => {
  const paymentSession = {
    mode: "payment",
    client_reference_id: "acc-1",
    customer: "cus_1",
    subscription: null,
    metadata: { plan: "business" },
  };

  it("an unpaid checkout (delayed payment method) grants nothing until async_payment_succeeded", async () => {
    const fake = makeDb();
    insertAccount(fake);
    stubStripe({});
    await webhook(envFor(fake), event("checkout.session.completed", { ...paymentSession, payment_status: "unpaid" }));
    expect(account(fake).plan).toBe("free");
    await webhook(
      envFor(fake),
      event("checkout.session.async_payment_succeeded", { ...paymentSession, payment_status: "paid" })
    );
    expect(account(fake)).toMatchObject({ plan: "business", billing_status: "one_time" });
  });

  it("a full refund revokes the one-time plan, a partial one does not", async () => {
    const fake = makeDb();
    insertAccount(fake, { plan: "business", is_paid: 1, billing_status: "one_time" });
    stubStripe({});
    await webhook(
      envFor(fake),
      event("charge.refunded", { customer: "cus_1", amount: 3999, amount_refunded: 1000, refunded: false })
    );
    expect(account(fake).plan).toBe("business");
    await webhook(
      envFor(fake),
      event("charge.refunded", { customer: "cus_1", amount: 3999, amount_refunded: 3999, refunded: true })
    );
    expect(account(fake)).toMatchObject({ plan: "free", billing_status: "refunded" });
  });

  it("a dispute revokes the one-time plan", async () => {
    const fake = makeDb();
    insertAccount(fake, { plan: "business", is_paid: 1, billing_status: "one_time" });
    stubStripe({ charges: { ch_1: { id: "ch_1", customer: "cus_1", invoice: null } } });
    await webhook(envFor(fake), event("charge.dispute.created", { charge: "ch_1" }));
    expect(account(fake)).toMatchObject({ plan: "free", billing_status: "disputed" });
  });

  it("a refund never touches a manual grant or a subscription account", async () => {
    const manual = makeDb();
    insertAccount(manual, { plan: "business", is_paid: 1, billing_status: null });
    const sub = makeDb();
    insertAccount(sub, { plan: "pro", is_paid: 1, stripe_subscription_id: "sub_1", billing_status: "active" });
    stubStripe({});
    const refund = { customer: "cus_1", amount: 1499, amount_refunded: 1499, refunded: true };
    await webhook(envFor(manual), event("charge.refunded", refund));
    await webhook(envFor(sub), event("charge.refunded", refund));
    expect(account(manual).plan).toBe("business");
    expect(account(sub).plan).toBe("pro");
  });
});

// --- 1: checkout guard ---

describe("POST /billing/checkout", () => {
  async function checkout(env: Env) {
    return (await app()).request(
      "/billing/checkout",
      { method: "POST", body: JSON.stringify({ plan: "pro" }), headers: { "Content-Type": "application/json" } },
      env
    );
  }

  it("blocks but does not grant the plan for an unpaid, past_due or incomplete subscription", async () => {
    for (const status of ["unpaid", "past_due", "incomplete"]) {
      const fake = makeDb();
      insertAccount(fake);
      stubStripe({ list: [subscription(status)] });
      const res = await checkout(envFor(fake));
      expect(res.status, status).toBe(409);
      expect(account(fake), status).toMatchObject({ plan: "free", is_paid: 0, billing_status: null });
    }
  });

  it("restores the plan for an active subscription and still answers 409", async () => {
    const fake = makeDb();
    insertAccount(fake);
    stubStripe({ list: [subscription("active")] });
    expect((await checkout(envFor(fake))).status).toBe(409);
    expect(account(fake)).toMatchObject({ plan: "pro", stripe_subscription_id: "sub_1", billing_status: "active" });
  });

  it("starts a checkout when the customer has no blocking subscription", async () => {
    const fake = makeDb();
    insertAccount(fake);
    stubStripe({ list: [subscription("canceled")] });
    const res = await checkout(envFor(fake));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ url: "https://checkout.stripe.test/cs" });
  });
});

// --- confirm-session (existing behaviour, now on the live state) ---

describe("GET /billing/confirm-session", () => {
  const paidSession = {
    id: "cs_1",
    status: "complete",
    payment_status: "paid",
    client_reference_id: "acc-1",
    customer: "cus_1",
    subscription: "sub_1",
    metadata: { plan: "pro" },
  };

  async function confirm(env: Env) {
    return (await app()).request("/billing/confirm-session?session_id=cs_1", {}, env);
  }

  it("grants the plan while the subscription is live", async () => {
    const fake = makeDb();
    insertAccount(fake);
    stubStripe({ session: paidSession, subscriptions: { sub_1: { status: 200, body: subscription("active") } } });
    expect(await (await confirm(envFor(fake))).json()).toMatchObject({ ok: true, status: "active", plan: "pro" });
    expect(account(fake)).toMatchObject({ plan: "pro", stripe_subscription_id: "sub_1" });
  });

  it("grants the plan during a trial", async () => {
    const fake = makeDb();
    insertAccount(fake);
    stubStripe({
      session: { ...paidSession, payment_status: "no_payment_required" },
      subscriptions: { sub_1: { status: 200, body: subscription("trialing") } },
    });
    expect(await (await confirm(envFor(fake))).json()).toMatchObject({ status: "active" });
  });

  it("does not restore the plan when an old session is replayed after canceling", async () => {
    const fake = makeDb();
    insertAccount(fake);
    stubStripe({ session: paidSession, subscriptions: { sub_1: { status: 200, body: subscription("canceled") } } });
    expect(await (await confirm(envFor(fake))).json()).toMatchObject({ status: "pending_payment" });
    expect(account(fake)).toMatchObject({ plan: "free", billing_status: null });
  });

  it("fails closed when Stripe cannot confirm the subscription", async () => {
    const fake = makeDb();
    insertAccount(fake);
    stubStripe({ session: paidSession, subscriptions: { sub_1: { status: 500 } } });
    expect((await confirm(envFor(fake))).status).toBe(502);
    expect(account(fake).plan).toBe("free");
  });

  it("still handles one-time purchases, which have no subscription", async () => {
    const fake = makeDb();
    insertAccount(fake);
    stubStripe({ session: { ...paidSession, subscription: null } });
    expect(await (await confirm(envFor(fake))).json()).toMatchObject({ status: "active" });
    expect(account(fake)).toMatchObject({ plan: "pro", billing_status: "one_time" });
  });
});
