import { describe, expect, it } from "vitest";
import { isBlockedWebhookHost } from "./validate";
import { isInviteExpired, INVITE_TTL_DAYS } from "./team";
import { anonIpCapScope } from "./usageQuota";

describe("isBlockedWebhookHost", () => {
  it.each([
    "localhost", "foo.localhost", "db.internal", "printer.local", "metadata.google.internal",
    "127.0.0.1", "127.0.0.2", "0.0.0.0", "10.1.2.3", "192.168.0.1", "172.16.0.1", "172.31.255.255",
    "169.254.169.254", "169.254.1.1", "100.64.0.1", "100.127.255.255",
    "[::1]", "[::]", "[fc00::1]", "[fd12:3456::1]", "[fe80::1]", "[::ffff:7f00:1]",
  ])("blocks %s", (host) => {
    expect(isBlockedWebhookHost(host)).toBe(true);
  });

  it.each(["hooks.example.com", "8.8.8.8", "172.32.0.1", "100.128.0.1", "1.1.1.1", "[2606:4700::1111]"])(
    "allows %s",
    (host) => {
      expect(isBlockedWebhookHost(host)).toBe(false);
    }
  );

  it("sees through alternative IP spellings once URL has normalised them", () => {
    expect(isBlockedWebhookHost(new URL("http://2130706433/").hostname)).toBe(true);
    expect(isBlockedWebhookHost(new URL("http://0x7f.1/").hostname)).toBe(true);
  });
});

describe("isInviteExpired", () => {
  const now = Date.parse("2026-10-31T00:00:00Z");
  it("keeps a recent invite valid", () => {
    expect(isInviteExpired("2026-10-20T00:00:00Z", now)).toBe(false);
  });
  it("expires after the TTL", () => {
    const old = new Date(now - (INVITE_TTL_DAYS + 1) * 86_400_000).toISOString();
    expect(isInviteExpired(old, now)).toBe(true);
  });
  it("does not lock out rows without a date", () => {
    expect(isInviteExpired(null, now)).toBe(false);
  });
});

describe("anonIpCapScope", () => {
  it("separates drafts from documents and ignores the visitor id", () => {
    expect(anonIpCapScope("draft", "1.2.3.4")).toBe("ipcap:draft:1.2.3.4");
    expect(anonIpCapScope("docgen", "1.2.3.4")).toBe("ipcap:docgen:1.2.3.4");
  });
});
