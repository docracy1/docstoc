import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types";

const setAccountPlan = vi.fn(async () => {});
const setAccountBillingStatus = vi.fn(async () => {});

vi.mock("../lib/auth", () => ({
  requireAccount: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("account", { id: "acc-1" });
    await next();
  },
  requirePaidAccount: async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock("../lib/analytics", () => ({ trackEvent: vi.fn(async () => {}) }));
vi.mock("../lib/billing", async (original) => ({
  ...(await original<typeof import("../lib/billing")>()),
  setAccountPlan,
  setAccountBillingStatus,
  setStripeCustomerId: vi.fn(async () => {}),
  setStripeSubscriptionId: vi.fn(async () => {}),
}));

const env = { STRIPE_SECRET_KEY: "sk_test_x", PUBLIC_APP_URL: "https://docstoc.io" } as unknown as Env;

const paidSession = {
  id: "cs_1",
  status: "complete",
  payment_status: "paid",
  client_reference_id: "acc-1",
  customer: "cus_1",
  subscription: "sub_1",
  metadata: { plan: "pro" },
};

function stubStripe(subscription: { ok: boolean; status?: string }, session: object = paidSession) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/v1/checkout/sessions/")) return new Response(JSON.stringify(session));
      if (url.includes("/v1/subscriptions/")) {
        return new Response(JSON.stringify({ status: subscription.status }), { status: subscription.ok ? 200 : 500 });
      }
      throw new Error(`unexpected fetch ${url}`);
    })
  );
}

async function confirm() {
  const { default: billing } = await import("./billing");
  const app = new Hono<{ Bindings: Env }>();
  app.route("/billing", billing as never);
  return app.request("/billing/confirm-session?session_id=cs_1", {}, env);
}

describe("GET /billing/confirm-session", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("grants the plan while the subscription is live", async () => {
    stubStripe({ ok: true, status: "active" });
    const res = await confirm();
    expect(await res.json()).toMatchObject({ ok: true, status: "active", plan: "pro" });
    expect(setAccountPlan).toHaveBeenCalledWith(env, "acc-1", "pro");
  });

  it("grants the plan during a trial", async () => {
    stubStripe({ ok: true, status: "trialing" }, { ...paidSession, payment_status: "no_payment_required" });
    expect(await (await confirm()).json()).toMatchObject({ status: "active" });
  });

  it("does not restore the plan when an old session is replayed after canceling", async () => {
    stubStripe({ ok: true, status: "canceled" });
    const res = await confirm();
    expect(await res.json()).toMatchObject({ status: "pending_payment" });
    expect(setAccountPlan).not.toHaveBeenCalled();
    expect(setAccountBillingStatus).not.toHaveBeenCalled();
  });

  it("fails closed when Stripe cannot confirm the subscription", async () => {
    stubStripe({ ok: false });
    expect((await confirm()).status).toBe(502);
    expect(setAccountPlan).not.toHaveBeenCalled();
  });

  it("still handles one-time purchases, which have no subscription", async () => {
    stubStripe({ ok: true }, { ...paidSession, subscription: null });
    expect(await (await confirm()).json()).toMatchObject({ status: "active" });
    expect(setAccountPlan).toHaveBeenCalled();
  });
});
