import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types";

const handleGoogleLoginCallback = vi.fn(async () => ({ ok: true, sessionToken: "s", accountId: "a", isNew: false }));

vi.mock("../lib/auth", async (original) => ({
  ...(await original<typeof import("../lib/auth")>()),
  handleGoogleLoginCallback,
  getGoogleLoginAuthorizeUrl: vi.fn(async () => ({ ok: true, url: "https://accounts.google.com/x", state: "signed-state" })),
}));

const env = { PUBLIC_APP_URL: "https://docstoc.io", ADMIN_EMAIL: "boss@x.io" } as unknown as Env;

async function request(path: string, headers: Record<string, string> = {}) {
  const { default: auth } = await import("./auth");
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/auth", auth as never);
  return app.request(path, { headers }, env);
}

describe("Google sign-in state", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets the state cookie for docstoc.io and the auth path when the flow starts", async () => {
    const res = await request("/api/auth/google");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(res.status).toBe(302);
    expect(cookie).toContain("chasa_google_state=signed-state");
    expect(cookie).toContain("Domain=.docstoc.io");
    expect(cookie).toContain("Path=/api/auth/google");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("HttpOnly");
  });

  it("refuses a callback from a browser that did not start the flow", async () => {
    const res = await request("/api/auth/google/callback?code=c&state=signed-state");
    expect(res.headers.get("location")).toContain("error=google_auth");
    expect(handleGoogleLoginCallback).not.toHaveBeenCalled();
  });

  it("refuses a mismatching state", async () => {
    await request("/api/auth/google/callback?code=c&state=signed-state", { Cookie: "chasa_google_state=other" });
    expect(handleGoogleLoginCallback).not.toHaveBeenCalled();
  });

  it("continues when cookie and state match", async () => {
    await request("/api/auth/google/callback?code=c&state=signed-state", { Cookie: "chasa_google_state=signed-state" });
    expect(handleGoogleLoginCallback).toHaveBeenCalled();
  });
});

describe("auth config", () => {
  it("publishes a hash, never the admin address", async () => {
    const body = await (await request("/api/auth/config")).text();
    expect(body).not.toContain("boss@x.io");
    expect(JSON.parse(body).adminEmailHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
