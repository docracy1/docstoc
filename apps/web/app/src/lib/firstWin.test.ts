import { describe, expect, it } from "vitest";
import { hasLocalChaseWin, resolveFirstWinPath } from "./firstWin";
import type { Invoice } from "../pages/tool/types";

describe("resolveFirstWinPath", () => {
  it("defaults to chase", () => {
    expect(resolveFirstWinPath(null)).toBe("chase");
    expect(resolveFirstWinPath("google")).toBe("chase");
    expect(resolveFirstWinPath("seo-invoice-reminder")).toBe("chase");
  });

  it("routes ssl landings to ssl", () => {
    expect(resolveFirstWinPath("ssl")).toBe("ssl");
    expect(resolveFirstWinPath("managed-ssl")).toBe("ssl");
    expect(resolveFirstWinPath("seo/ssl-certificate")).toBe("ssl");
  });

  it("routes document-cert landings to cert", () => {
    expect(resolveFirstWinPath("document-certificate")).toBe("cert");
    expect(resolveFirstWinPath("sha256-verify")).toBe("cert");
  });
});

describe("hasLocalChaseWin", () => {
  it("detects mailto/copy statuses", () => {
    const base = {
      id: "1",
      clientName: "A",
      amount: 1,
      dueDate: "2026-01-01",
      generating: false,
      rewriting: null,
    } satisfies Invoice;
    expect(hasLocalChaseWin([{ ...base, lastChaseStatus: "drafted" }])).toBe(false);
    expect(hasLocalChaseWin([{ ...base, lastChaseStatus: "mailto" }])).toBe(true);
    expect(hasLocalChaseWin([{ ...base, lastChaseStatus: "copied" }])).toBe(true);
  });
});
