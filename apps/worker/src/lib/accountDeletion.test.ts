import { describe, expect, it } from "vitest";
import { deleteAccountByEmail } from "./accountDeletion";
import type { Env } from "../types";

type Query = { sql: string; args: unknown[] };

/** Keys responses by a substring of the SQL so the same mock can answer the account lookup and
 *  the certified-content precheck differently, without needing call-order assumptions. */
function mockEnv(opts: {
  account: { id: string } | null;
  precheck?: { certs: number; certifiedInvoices: number };
}): { env: Env; queries: Query[]; batches: Query[][] } {
  const queries: Query[] = [];
  const batches: Query[][] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind: (...args: unknown[]) => ({
          sql,
          args,
          first: async () => {
            queries.push({ sql, args });
            if (sql.includes("SELECT id FROM accounts WHERE email")) return opts.account;
            if (sql.includes("AS certifiedInvoices")) {
              return opts.precheck ?? { certs: 0, certifiedInvoices: 0 };
            }
            return null;
          },
          run: async () => ({ meta: { changes: 1 } }),
        }),
      };
    },
    batch: async (stmts: { sql: string; args: unknown[] }[]) => {
      batches.push(stmts.map((s) => ({ sql: s.sql, args: s.args })));
      return stmts.map(() => ({ success: true }));
    },
  };
  return { env: { CHASA_DB: db } as unknown as Env, queries, batches };
}

describe("deleteAccountByEmail", () => {
  it("returns not-found for an unknown email without touching anything else", async () => {
    const { env, queries, batches } = mockEnv({ account: null });
    const result = await deleteAccountByEmail(env, "nobody@example.com");
    expect(result).toEqual({ ok: false, error: "No account found for that email" });
    expect(batches.length).toBe(0);
    expect(queries.length).toBe(1); // just the account lookup, precheck never ran
  });

  it("refuses to delete an account with a certified document, without attempting any writes", async () => {
    const { env, batches } = mockEnv({
      account: { id: "acct1" },
      precheck: { certs: 2, certifiedInvoices: 0 },
    });
    const result = await deleteAccountByEmail(env, "certified@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/2 certified document/);
    expect(batches.length).toBe(0);
  });

  it("refuses to delete an account with a certified/sent invoice", async () => {
    const { env, batches } = mockEnv({
      account: { id: "acct1" },
      precheck: { certs: 0, certifiedInvoices: 1 },
    });
    const result = await deleteAccountByEmail(env, "certified-invoice@example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/1 certified invoice/);
    expect(batches.length).toBe(0);
  });

  it("deletes a clean account in one batch, normalizing the email", async () => {
    const { env, batches } = mockEnv({ account: { id: "acct1" } });
    const result = await deleteAccountByEmail(env, "  Clean@Example.com  ");
    expect(result).toEqual({ ok: true, id: "acct1", email: "clean@example.com" });
    expect(batches.length).toBe(1);
    const stmts = batches[0];
    // The account row itself must be the very last statement — everything else has to run first.
    expect(stmts[stmts.length - 1].sql).toMatch(/DELETE FROM accounts WHERE id/);
    // document_certificates must never be written to at all (immutable — see accountDeletion.ts).
    expect(stmts.some((s) => s.sql.includes("document_certificates"))).toBe(false);
    // Grandchildren before their parent.
    const eventsIdx = stmts.findIndex((s) => s.sql.includes("chase_tracking_events"));
    const trackingIdx = stmts.findIndex((s) => s.sql.startsWith("DELETE FROM chase_tracking WHERE"));
    expect(eventsIdx).toBeGreaterThanOrEqual(0);
    expect(eventsIdx).toBeLessThan(trackingIdx);
  });
});
