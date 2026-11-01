import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import type { Env } from "../types";
import tracking from "./tracking";

const TARGET = "https://pay.example.com/invoice?a=1&b=2";

function makeEnv(allowed: boolean) {
  const run = vi.fn(async () => ({ meta: { changes: 1 } }));
  const first = vi.fn(async () => (allowed ? { hit: 1, id: "c1" } : null));
  const env = {
    CHASA_DB: { prepare: () => ({ bind: () => ({ first, run }) }) },
  } as unknown as Env;
  return { env, run };
}

async function call(path: string, env: Env) {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/api/t", tracking as never);
  return app.request(path, { method: "GET" }, env);
}

const notice = `/api/t/c/c1?u=${encodeURIComponent(TARGET)}`;

describe("tracked link notice", () => {
  it("shows the destination instead of redirecting, and records no click", async () => {
    const { env, run } = makeEnv(true);
    const res = await call(notice, env);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(html).toContain("pay.example.com");
    expect(html).toContain(`/api/t/c/c1/go?u=${encodeURIComponent(TARGET)}`);
    expect(run).not.toHaveBeenCalled();
  });

  it("redirects and records the click only on continue", async () => {
    const { env, run } = makeEnv(true);
    const res = await call(`/api/t/c/c1/go?u=${encodeURIComponent(TARGET)}`, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(TARGET);
    expect(run).toHaveBeenCalled();
  });

  it.each(["/api/t/c/c1", "/api/t/c/c1/go"])("refuses a link the email did not contain on %s", async (base) => {
    const { env, run } = makeEnv(false);
    const res = await call(`${base}?u=${encodeURIComponent(TARGET)}`, env);
    expect(res.status).toBe(404);
    expect(run).not.toHaveBeenCalled();
  });

  it.each(["/api/t/c/c1", "/api/t/c/c1/go"])("refuses non-web schemes on %s", async (base) => {
    const { env } = makeEnv(true);
    const res = await call(`${base}?u=${encodeURIComponent("javascript:alert(1)")}`, env);
    expect(res.status).toBe(400);
  });

  it("escapes markup in the destination", async () => {
    const { env } = makeEnv(true);
    const evil = `https://x.example.com/"><script>alert(1)</script>`;
    const html = await (await call(`/api/t/c/c1?u=${encodeURIComponent(evil)}`, env)).text();
    expect(html).not.toContain("<script>");
  });
});
