import { describe, expect, it } from "vitest";
import { subscriptionGrantsPlan } from "./billing";

describe("subscriptionGrantsPlan", () => {
  it("grants the plan for a live subscription", () => {
    expect(subscriptionGrantsPlan("active")).toBe(true);
    expect(subscriptionGrantsPlan("trialing")).toBe(true);
  });

  it("refuses a canceled or unpaid one, so an old checkout session cannot restore the plan", () => {
    for (const status of ["canceled", "unpaid", "past_due", "incomplete", "incomplete_expired", "paused", undefined]) {
      expect(subscriptionGrantsPlan(status)).toBe(false);
    }
  });
});
