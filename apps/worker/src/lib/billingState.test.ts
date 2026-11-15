import { beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { Env } from "../types";
import { applyLiveSubscription, decideSubscriptionState, effectivePlan, parseLiveSubscription, resetBillingColumnProbe } from "./billingState";
import { resolveAccount } from "./auth";
import { hashOpaqueTokenLookup } from "./token";

const DAY = 86400_000;
const now = new Date("2026-11-15T12:00:00Z");
const iso = (offsetDays: number) => new Date(now.getTime() + offsetDays * DAY).toISOString();

describe("effectivePlan", () => {
  const paid = { plan: "pro", is_paid: 1, stripe_subscription_id: "sub_1", billing_status: "active" };

  it("keeps a live subscription paid until 3 days after the period end", () => {
    expect(effectivePlan({ ...paid, current_period_end: iso(10) }, now)).toBe("pro");
    expect(effectivePlan({ ...paid, current_period_end: iso(-2) }, now)).toBe("pro");
    expect(effectivePlan({ ...paid, current_period_end: iso(-4) }, now)).toBe("free");
  });

  it("treats unpaid, canceled and incomplete subscriptions as free", () => {
    for (const billing_status of ["unpaid", "canceled", "incomplete", "incomplete_expired", "paused"]) {
      expect(effectivePlan({ ...paid, billing_status, current_period_end: iso(10) }, now), billing_status).toBe("free");
    }
  });

  it("gives past_due 14 days from the first failure", () => {
    const pastDue = { ...paid, billing_status: "past_due", current_period_end: iso(25) };
    expect(effectivePlan({ ...pastDue, past_due_since: iso(-13) }, now)).toBe("pro");
    expect(effectivePlan({ ...pastDue, past_due_since: iso(-15) }, now)).toBe("free");
  });

  it("never expires manual or enterprise grants without a Stripe subscription", () => {
    const manual = { plan: "business", is_paid: 1, stripe_subscription_id: null, billing_status: "unpaid", current_period_end: iso(-100) };
    expect(effectivePlan(manual, now)).toBe("business");
  });

  it("keeps the old behaviour before migration 0048 (no period columns)", () => {
    expect(effectivePlan({ plan: "pro", is_paid: 1, stripe_subscription_id: "sub_1", billing_status: "active" }, now)).toBe("pro");
  });
});

describe("decideSubscriptionState", () => {
  const env = { STRIPE_PRICE_SOLO: "price_pro", STRIPE_PRICE_ENTERPRISE: "price_business" } as unknown as Env;
  const live = (status: string) =>
    parseLiveSubscription({ id: "sub_1", status, customer: "cus_1", current_period_end: 1795000000, items: { data: [{ price: { id: "price_business" } }] } })!;

  it("maps the price to the plan and reads the legacy period end field", () => {
    const d = decideSubscriptionState(env, live("active"), null, now);
    expect(d).toMatchObject({ plan: "business", subscriptionId: "sub_1", periodEnd: new Date(1795000000 * 1000).toISOString() });
  });

  it("keeps the first past_due timestamp across repeated failures", () => {
    const since = iso(-3);
    const stored = { plan: "business", is_paid: 1, stripe_subscription_id: "sub_1", billing_status: "past_due", past_due_since: since };
    expect(decideSubscriptionState(env, live("past_due"), stored, now)).toMatchObject({ plan: "business", pastDueSince: since });
  });

  it("forgets the subscription id once it is canceled", () => {
    expect(decideSubscriptionState(env, live("canceled"), null, now)).toMatchObject({ plan: "free", subscriptionId: null });
  });
});

// --- Session reader against an in-memory D1 ---

function d1(db: DatabaseSync) {
  return {
    prepare(sql: string) {
      const stmt = (params: unknown[] = []) => ({
        bind: (...p: unknown[]) => stmt(p),
        first: async () => (db.prepare(sql).get(...(params as never[])) as unknown) ?? null,
        run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(params as never[])).changes) } }),
        all: async () => ({ results: db.prepare(sql).all(...(params as never[])) }),
      });
      return stmt();
    },
  };
}

async function sessionDb(withPeriodColumns: boolean, account: Record<string, unknown>) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE accounts (
    id TEXT PRIMARY KEY, email TEXT, is_paid INTEGER NOT NULL DEFAULT 0, plan TEXT, workspace_owner_id TEXT,
    stripe_subscription_id TEXT, billing_status TEXT
    ${withPeriodColumns ? ", current_period_end TEXT, past_due_since TEXT" : ""}
  );
  CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, account_id TEXT, expires_at TEXT, last_seen_at TEXT);`);
  const cols = Object.keys(account);
  db.prepare(`INSERT INTO accounts (id, email, ${cols.join(", ")}) VALUES ('acc-1', 'a@example.com', ${cols.map(() => "?").join(", ")})`).run(
    ...(Object.values(account) as never[])
  );
  const [hash] = await hashOpaqueTokenLookup("session-token", "test-secret", "session");
  db.prepare(`INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, 'acc-1', '2999-01-01')`).run(hash);
  return { CHASA_DB: d1(db), TOKEN_SECRET: "test-secret" } as unknown as Env;
}

describe("resolveAccount applies the expiry", () => {
  beforeEach(() => resetBillingColumnProbe());

  it("reads a lapsed subscription as free", async () => {
    const env = await sessionDb(true, {
      plan: "pro",
      is_paid: 1,
      stripe_subscription_id: "sub_1",
      billing_status: "active",
      current_period_end: new Date(Date.now() - 5 * DAY).toISOString(),
    });
    expect(await resolveAccount(env, "session-token")).toMatchObject({ plan: "free", isPaid: false });
  });

  it("reads an unpaid subscription as free", async () => {
    const env = await sessionDb(true, { plan: "pro", is_paid: 1, stripe_subscription_id: "sub_1", billing_status: "unpaid" });
    expect(await resolveAccount(env, "session-token")).toMatchObject({ plan: "free", isPaid: false });
  });

  it("keeps working before migration 0048", async () => {
    const env = await sessionDb(false, { plan: "business", is_paid: 1, stripe_subscription_id: "sub_1", billing_status: "active" });
    expect(await resolveAccount(env, "session-token")).toMatchObject({ plan: "business", isPaid: true });
  });
});

describe("applyLiveSubscription", () => {
  beforeEach(() => resetBillingColumnProbe());

  async function grantDb(account: Record<string, unknown>) {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE accounts (
      id TEXT PRIMARY KEY, email TEXT, is_paid INTEGER NOT NULL DEFAULT 0, plan TEXT, paid_at TEXT, stripe_customer_id TEXT,
      stripe_subscription_id TEXT, billing_status TEXT, current_period_end TEXT, past_due_since TEXT
    );`);
    const cols = Object.keys(account);
    db.prepare(`INSERT INTO accounts (id, email, ${cols.join(", ")}) VALUES ('acc-1', 'a@example.com', ${cols.map(() => "?").join(", ")})`).run(
      ...(Object.values(account) as never[])
    );
    return { db, env: { CHASA_DB: d1(db) } as unknown as Env };
  }
  const old = (status: string) => parseLiveSubscription({ id: "sub_old", status, customer: "cus_1", items: { data: [] } })!;

  it("does not take a one-time or manual grant away for a late event of an old subscription", async () => {
    for (const billing_status of ["one_time", "active", null]) {
      const { db, env } = await grantDb({ plan: "business", is_paid: 1, stripe_subscription_id: null, billing_status });
      expect(await applyLiveSubscription(env, "acc-1", old("canceled"), now)).toEqual({ applied: false, reason: "other_subscription" });
      expect(db.prepare(`SELECT plan, is_paid, billing_status FROM accounts`).get()).toEqual({ plan: "business", is_paid: 1, billing_status });
    }
  });

  it("still records a new, unpaid subscription on a free account", async () => {
    const { db, env } = await grantDb({ plan: "free", is_paid: 0 });
    expect(await applyLiveSubscription(env, "acc-1", old("incomplete"), now)).toEqual({ applied: true, plan: "free", status: "incomplete" });
    expect(db.prepare(`SELECT billing_status, stripe_subscription_id FROM accounts`).get()).toEqual({ billing_status: "incomplete", stripe_subscription_id: "sub_old" });
  });
});
