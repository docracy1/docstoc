import { describe, expect, it } from "vitest";
import { mayBeHtml, newNonce, withScriptNonce } from "./csp";

describe("newNonce", () => {
  it("is base64 of 16 bytes and differs per call", () => {
    const a = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(newNonce()).not.toBe(a);
  });
});

describe("withScriptNonce", () => {
  it("puts the nonce right after script-src", () => {
    const policy = "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'";
    expect(withScriptNonce(policy, "abc=")).toBe(
      "default-src 'self'; script-src 'nonce-abc=' 'self' https://challenges.cloudflare.com; style-src 'self'"
    );
  });
  it("leaves a policy without script-src alone", () => {
    expect(withScriptNonce("default-src 'none'", "abc=")).toBe("default-src 'none'");
  });
  it("does not touch script-src-elem or a host that contains the word", () => {
    const policy = "script-src-elem 'self'; img-src https://script-src.example";
    expect(withScriptNonce(policy, "abc=")).toBe(policy);
  });
});

describe("mayBeHtml", () => {
  it.each(["/", "/about", "/blog/", "/app/login", "/404.html"])("%s may be HTML", (p) => {
    expect(mayBeHtml(p)).toBe(true);
  });
  it.each(["/site.css", "/assets/app-1.js", "/fonts/inter-400.woff2", "/sitemap.xml"])("%s is not", (p) => {
    expect(mayBeHtml(p)).toBe(false);
  });
});
