import { describe, expect, it } from "vitest";
import { cutoffIsoDaysAgo, WIN_EVENT_NAMES } from "./onboardingNudge";

describe("cutoffIsoDaysAgo", () => {
  it("subtracts whole days from a fixed date", () => {
    const now = new Date("2026-09-03T12:00:00.000Z");
    expect(cutoffIsoDaysAgo(2, now)).toBe("2026-09-01T12:00:00.000Z");
  });
});

describe("WIN_EVENT_NAMES", () => {
  it("requires a real send/complete win, not draft-only browsing", () => {
    expect(WIN_EVENT_NAMES).toContain("chase_sent");
    expect(WIN_EVENT_NAMES).toContain("first_win_completed");
    expect(WIN_EVENT_NAMES).not.toContain("template_opened");
    expect(WIN_EVENT_NAMES).not.toContain("chase_drafted");
    expect(WIN_EVENT_NAMES).not.toContain("fields_added");
  });
});
