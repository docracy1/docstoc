import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { csrfProtection, isTrustedWrite } from "./csrf";
import type { Env } from "../types";

const env = { PUBLIC_APP_URL: "https://docstoc.io" } as unknown as Env;

function app() {
  const a = new Hono<{ Bindings: Env }>();
  a.use("/api/*", csrfProtection);
  a.all("/api/x", (c) => c.json({ ok: true }));
  return a;
}

function post(headers: Record<string, string>, method = "POST") {
  return app().request("/api/x", { method, headers }, env);
}

describe("isTrustedWrite", () => {
  it("trusts only allowed origins when Origin is present", () => {
    expect(isTrustedWrite("https://docstoc.io", undefined, env)).toBe(true);
    expect(isTrustedWrite("https://evil.example", "same-site", env)).toBe(false);
    expect(isTrustedWrite("https://docstoc-evil.pages.dev", undefined, env)).toBe(false);
    expect(isTrustedWrite("null", undefined, env)).toBe(false);
  });

  it("without Origin, only rejects what the browser marks cross-site", () => {
    expect(isTrustedWrite(undefined, undefined, env)).toBe(true);
    expect(isTrustedWrite(undefined, "same-origin", env)).toBe(true);
    expect(isTrustedWrite(undefined, "cross-site", env)).toBe(false);
  });
});

describe("csrfProtection", () => {
  it("blocks a cross-site form post carrying the session cookie", async () => {
    const res = await post({ Cookie: "chasa_session=t", Origin: "https://evil.example", "Content-Type": "text/plain" });
    expect(res.status).toBe(403);
  });

  it("blocks the same post carrying the admin cookie", async () => {
    expect((await post({ Cookie: "chasa_admin=t", Origin: "https://evil.example" })).status).toBe(403);
  });

  it("allows the app's own origin", async () => {
    expect((await post({ Cookie: "chasa_session=t", Origin: "https://docstoc.io" })).status).toBe(200);
  });

  it("leaves cookie-less callers alone (API keys, Stripe webhook)", async () => {
    expect((await post({ Authorization: "Bearer k", Origin: "https://evil.example" })).status).toBe(200);
    expect((await post({})).status).toBe(200);
  });

  it("does not gate safe methods", async () => {
    expect((await post({ Cookie: "chasa_session=t", Origin: "https://evil.example" }, "GET")).status).toBe(200);
  });

  it("ignores unrelated cookies such as the anonymous analytics id", async () => {
    expect((await post({ Cookie: "chasa_visitor=v", Origin: "https://evil.example" })).status).toBe(200);
  });
});
