import { describe, expect, it } from "vitest";
import { applySecurityHeaders } from "./securityHeaders";

describe("applySecurityHeaders", () => {
  it("sets the full set on a JSON answer", () => {
    const h = new Headers({ "content-type": "application/json" });
    applySecurityHeaders(h, "/api/account/me");
    expect(h.get("Strict-Transport-Security")).toContain("max-age=31536000");
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.get("X-Frame-Options")).toBe("DENY");
    expect(h.get("Content-Security-Policy")).toBe("default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    expect(h.get("Cache-Control")).toBe("no-store");
  });
  it("gives an HTML page a policy that allows its inline styles", () => {
    const h = new Headers({ "content-type": "text/html; charset=utf-8" });
    applySecurityHeaders(h, "/api/leads/confirm");
    expect(h.get("Content-Security-Policy")).toContain("style-src 'unsafe-inline' https://docstoc.io");
    expect(h.get("Content-Security-Policy")).toContain("font-src https://docstoc.io");
  });
  it("keeps values a route set itself", () => {
    const h = new Headers({
      "content-type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'",
      "Cache-Control": "public, max-age=60",
      "Referrer-Policy": "no-referrer",
    });
    applySecurityHeaders(h, "/api/t/c/1");
    expect(h.get("Content-Security-Policy")).toBe("default-src 'none'");
    expect(h.get("Cache-Control")).toBe("public, max-age=60");
    expect(h.get("Referrer-Policy")).toBe("no-referrer");
  });
  it("does not force no-store outside /api", () => {
    const h = new Headers({ "content-type": "text/plain" });
    applySecurityHeaders(h, "/");
    expect(h.has("Cache-Control")).toBe(false);
  });
});
