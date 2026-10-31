import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types";

const resolveAccount = vi.fn();
const upsertConnectorFromCode = vi.fn(async () => {});
const upsertAccountingFromCode = vi.fn(async () => {});

vi.mock("../lib/auth", async (original) => ({
  ...(await original<typeof import("../lib/auth")>()),
  resolveAccount,
}));
vi.mock("../lib/cloudConnectors", async (original) => ({
  ...(await original<typeof import("../lib/cloudConnectors")>()),
  parseOAuthState: vi.fn(async () => ({ accountId: "attacker-ws" })),
  upsertConnectorFromCode,
}));
vi.mock("../lib/accountingConnectors", async (original) => ({
  ...(await original<typeof import("../lib/accountingConnectors")>()),
  upsertAccountingFromCode,
}));

const env = { PUBLIC_APP_URL: "https://docstoc.io", TOKEN_SECRET: "s" } as unknown as Env;

async function callback(provider: string, cookie?: string) {
  const { default: routes } = await import("./cloudConnectors");
  const app = new Hono<{ Bindings: Env }>();
  app.route("/c", routes as never);
  return app.request(`/c/${provider}/callback?code=abc&state=signed`, { headers: cookie ? { Cookie: cookie } : {} }, env);
}

describe("connector OAuth callback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("connects when the signed-in admin started the flow", async () => {
    resolveAccount.mockResolvedValue({ workspaceId: "attacker-ws", role: "admin" });
    const res = await callback("dropbox", "chasa_session=t");
    expect(res.headers.get("location")).toContain("connected=dropbox");
    expect(upsertConnectorFromCode).toHaveBeenCalled();
  });

  it("refuses a victim who opened an attacker's authorize link", async () => {
    resolveAccount.mockResolvedValue({ workspaceId: "victim-ws", role: "admin" });
    const res = await callback("google", "chasa_session=t");
    expect(res.headers.get("location")).toContain("invalid_state");
    expect(upsertConnectorFromCode).not.toHaveBeenCalled();
  });

  it("refuses a browser with no session", async () => {
    const res = await callback("dropbox");
    expect(res.headers.get("location")).toContain("invalid_state");
    expect(upsertConnectorFromCode).not.toHaveBeenCalled();
  });

  it("refuses a member of the workspace", async () => {
    resolveAccount.mockResolvedValue({ workspaceId: "attacker-ws", role: "member" });
    await callback("box", "chasa_session=t");
    expect(upsertConnectorFromCode).not.toHaveBeenCalled();
  });

  it("guards the accounting connectors the same way", async () => {
    resolveAccount.mockResolvedValue({ workspaceId: "victim-ws", role: "admin" });
    const res = await callback("xero", "chasa_session=t");
    expect(res.headers.get("location")).toContain("invalid_state");
    expect(upsertAccountingFromCode).not.toHaveBeenCalled();
  });
});
