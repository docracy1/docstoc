import { describe, expect, it } from "vitest";
import { APP_ORIGIN_HEADER, configuredAppOrigin, isAllowedAppOrigin, requestAppOrigin } from "./appUrl";
import type { Env } from "../types";

function mockEnv(publicAppUrl: string): Env {
  return { PUBLIC_APP_URL: publicAppUrl } as unknown as Env;
}

function mockRequest(env: Env, headers: Record<string, string>) {
  const lookup = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { env, req: { header: (name: string) => lookup.get(name.toLowerCase()) } };
}

const prod = mockEnv("https://docstoc.io");

describe("configuredAppOrigin", () => {
  it("normalises away a trailing slash", () => {
    expect(configuredAppOrigin(mockEnv("https://docstoc.io/"))).toBe("https://docstoc.io");
  });

  it("returns empty string when unset or unparseable", () => {
    expect(configuredAppOrigin(mockEnv(""))).toBe("");
    expect(configuredAppOrigin(mockEnv("not-a-url"))).toBe("");
  });
});

describe("isAllowedAppOrigin", () => {
  it("allows the configured origin and Pages hosts", () => {
    expect(isAllowedAppOrigin("https://docstoc.io", prod)).toBe(true);
    expect(isAllowedAppOrigin("https://chasa-71s.pages.dev", prod)).toBe(true);
    expect(isAllowedAppOrigin("https://abc123.chasa-71s.pages.dev", prod)).toBe(true);
  });

  it("rejects other pages.dev projects, which anyone can register", () => {
    expect(isAllowedAppOrigin("https://docstoc-evil.pages.dev", prod)).toBe(false);
    expect(isAllowedAppOrigin("https://chasa-evil.pages.dev", prod)).toBe(false);
    expect(isAllowedAppOrigin("https://abc.docstoc-evil.pages.dev", prod)).toBe(false);
    expect(isAllowedAppOrigin("https://docstoc.pages.dev", prod)).toBe(false);
  });

  it("allows localhost only on a local deployment", () => {
    expect(isAllowedAppOrigin("http://localhost:5173", prod)).toBe(false);
    expect(isAllowedAppOrigin("http://127.0.0.1:8788", prod)).toBe(false);
    const local = mockEnv("http://localhost:5173");
    expect(isAllowedAppOrigin("http://localhost:5174", local)).toBe(true);
    expect(isAllowedAppOrigin("http://127.0.0.1:8788", local)).toBe(true);
  });

  it("rejects lookalike and unrelated origins", () => {
    expect(isAllowedAppOrigin("https://chasa.io.evil.com", prod)).toBe(false);
    expect(isAllowedAppOrigin("https://evil.com", prod)).toBe(false);
    expect(isAllowedAppOrigin("https://evil-docstoc.pages.dev", prod)).toBe(false);
    expect(isAllowedAppOrigin("https://docstoc.pages.dev.evil.com", prod)).toBe(false);
    expect(isAllowedAppOrigin("", prod)).toBe(false);
  });

  it("trusts the brand domain in both cutover directions", () => {
    const preview = mockEnv("https://chasa-71s.pages.dev");
    expect(isAllowedAppOrigin("https://docstoc.io", preview)).toBe(true);
    expect(isAllowedAppOrigin("https://www.docstoc.io", preview)).toBe(true);
    expect(isAllowedAppOrigin("https://chasa.io", preview)).toBe(true);
    expect(isAllowedAppOrigin("https://www.chasa.io", preview)).toBe(true);
    expect(isAllowedAppOrigin("https://chasa-71s.pages.dev", prod)).toBe(true);
  });
});

describe("requestAppOrigin", () => {
  it("prefers the origin forwarded by the Pages proxy", () => {
    const c = mockRequest(prod, { [APP_ORIGIN_HEADER]: "https://chasa-71s.pages.dev" });
    expect(requestAppOrigin(c)).toBe("https://chasa-71s.pages.dev");
  });

  it("falls back to a trusted Origin header, then to PUBLIC_APP_URL", () => {
    expect(requestAppOrigin(mockRequest(prod, { Origin: "https://chasa-71s.pages.dev" }))).toBe("https://chasa-71s.pages.dev");
    expect(requestAppOrigin(mockRequest(prod, {}))).toBe("https://docstoc.io");
  });

  it("does not send magic links to an attacker's pages.dev project", () => {
    const c = mockRequest(prod, { [APP_ORIGIN_HEADER]: "https://docstoc-evil.pages.dev" });
    expect(requestAppOrigin(c)).toBe("https://docstoc.io");
  });

  it("ignores a spoofed forwarded origin", () => {
    const c = mockRequest(prod, { [APP_ORIGIN_HEADER]: "https://evil.com" });
    expect(requestAppOrigin(c)).toBe("https://docstoc.io");
  });

  it("strips any path from a forwarded origin", () => {
    const c = mockRequest(prod, { [APP_ORIGIN_HEADER]: "https://chasa-71s.pages.dev/app/login" });
    expect(requestAppOrigin(c)).toBe("https://chasa-71s.pages.dev");
  });
});
