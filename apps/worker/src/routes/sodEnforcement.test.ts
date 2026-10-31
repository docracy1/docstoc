import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types";

const getApprovedSendForInvoice = vi.fn();
const recordChaseEvent = vi.fn(async () => ({ id: "e" }));

vi.mock("../lib/auth", async (original) => ({
  ...(await original<typeof import("../lib/auth")>()),
  requirePaidAccount: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("account", { id: "a", email: "a@x.io", role: "admin", workspaceId: "w", isPaid: true });
    await next();
  },
}));
vi.mock("../lib/sox", async (original) => ({
  ...(await original<typeof import("../lib/sox")>()),
  getSoxSettings: vi.fn(async () => ({ sodRequired: true })),
  getApprovedSendForInvoice,
  consumeApprovedSend: vi.fn(async () => {}),
}));
vi.mock("../lib/chaseEvents", async (original) => ({
  ...(await original<typeof import("../lib/chaseEvents")>()),
  recordChaseEvent,
}));

const run = vi.fn(async () => ({ meta: { changes: 1 } }));
const env = {
  PUBLIC_APP_URL: "https://docstoc.io",
  CHASA_DB: { prepare: () => ({ bind: () => ({ first: async () => ({ client_name: "C" }), run }) }) },
} as unknown as Env;

const json = (method: string, body: object) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

async function request(path: string, init: RequestInit) {
  const { default: chase } = await import("./chase");
  const { default: aging } = await import("./aging");
  const app = new Hono<{ Bindings: Env }>();
  app.route("/chase", chase as never);
  app.route("/aging", aging as never);
  return app.request(path, init, env);
}

describe("maker-checker enforcement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses a send event that omits the invoice id", async () => {
    const res = await request("/chase/events", json("POST", { clientName: "C", eventType: "sent" }));
    expect(res.status).toBe(403);
    expect(recordChaseEvent).not.toHaveBeenCalled();
  });

  it.each(["copied", "mailto", "tracked_copy"])("refuses PATCH status %s without approval", async (status) => {
    getApprovedSendForInvoice.mockResolvedValue(null);
    const res = await request("/aging/i1/chase", json("PATCH", { status }));
    expect(res.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  it("allows PATCH copied once approved", async () => {
    getApprovedSendForInvoice.mockResolvedValue({ id: "ap" });
    expect((await request("/aging/i1/chase", json("PATCH", { status: "copied" }))).status).toBe(200);
  });

  it("does not gate drafts", async () => {
    getApprovedSendForInvoice.mockResolvedValue(null);
    expect((await request("/aging/i1/chase", json("PATCH", { status: "drafted" }))).status).toBe(200);
  });
});
