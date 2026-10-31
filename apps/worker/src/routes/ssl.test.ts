import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types";

let account: { id: string; workspaceId: string; role: string; plan: string; isPaid: boolean; email: string };

vi.mock("../lib/auth", async (original) => ({
  ...(await original<typeof import("../lib/auth")>()),
  requireAccount: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("account", account);
    await next();
  },
}));

const env = { PUBLIC_APP_URL: "https://docstoc.io", TOKEN_SECRET: "s" } as unknown as Env;

async function call(path: string, method: string) {
  const { default: ssl } = await import("./ssl");
  const app = new Hono<{ Bindings: Env }>();
  app.route("/ssl", ssl as never);
  return app.request(path, { method }, env);
}

const noRow = { CHASA_DB: { prepare: () => ({ bind: () => ({ first: async () => null, run: async () => ({ meta: { changes: 0 } }) }) }) } };

describe("certificate routes for members", () => {
  const routes: Array<[string, string]> = [
    ["/ssl/domains/c1/download", "GET"],
    ["/ssl/domains/c1/renew", "POST"],
    ["/ssl/domains/c1", "DELETE"],
  ];

  it.each(routes)("blocks %s %s", async (path, method) => {
    account = { id: "m", workspaceId: "w", role: "member", plan: "free", isPaid: false, email: "m@x.io" };
    expect((await call(path, method)).status).toBe(403);
  });

  it.each(routes)("lets a free-plan admin through %s %s", async (path, method) => {
    account = { id: "o", workspaceId: "o", role: "admin", plan: "free", isPaid: false, email: "o@x.io" };
    const { default: ssl } = await import("./ssl");
    const app = new Hono<{ Bindings: Env }>();
    app.route("/ssl", ssl as never);
    const res = await app.request(path, { method }, { ...env, ...noRow } as unknown as Env);
    expect(res.status).toBe(404);
  });
});
