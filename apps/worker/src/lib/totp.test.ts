import { describe, expect, it } from "vitest";
import { base32Decode, totpCode, verifyTotp } from "./totp";

// RFC 6238 appendix B, SHA-1 seed "12345678901234567890".
const SEED = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("totp", () => {
  it("decodes base32", () => {
    expect(new TextDecoder().decode(base32Decode(SEED))).toBe("12345678901234567890");
    expect(() => base32Decode("not*valid")).toThrow();
  });

  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ])("matches the RFC vector at %i", async (t, code) => {
    expect(await totpCode(base32Decode(SEED), t, 8)).toBe(code);
  });

  it("accepts the current code and one step of drift, nothing further", async () => {
    const t = 1_700_000_000;
    const code = await totpCode(base32Decode(SEED), t);
    expect(await verifyTotp(SEED, code, t * 1000)).toBe(true);
    expect(await verifyTotp(SEED, code, (t + 30) * 1000)).toBe(true);
    expect(await verifyTotp(SEED, code, (t + 90) * 1000)).toBe(false);
  });

  it("rejects missing and malformed codes", async () => {
    for (const bad of [undefined, "", "12345", "abcdef", "1234567"]) {
      expect(await verifyTotp(SEED, bad)).toBe(false);
    }
  });
});
