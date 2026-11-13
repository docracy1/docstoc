import { describe, expect, it } from "vitest";
import { duration, flag, percent } from "./visitsFormat";

describe("visitsFormat", () => {
  it("formats shares", () => {
    expect(percent(1, 4)).toBe("25%");
    expect(percent(2, 3)).toBe("67%");
    expect(percent(0, 0)).toBe("–");
  });
  it("formats durations", () => {
    expect(duration(null)).toBe("–");
    expect(duration(4.4)).toBe("4 s");
    expect(duration(125)).toBe("2 min 05 s");
    expect(duration(3780)).toBe("1 h 03 min");
  });
  it("turns country codes into flags", () => {
    expect(flag("DE")).toBe("🇩🇪");
    expect(flag("")).toBe("");
  });
});
