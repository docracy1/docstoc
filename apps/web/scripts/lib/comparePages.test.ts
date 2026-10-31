import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs build script without types
import { COMPETITORS } from "../data/compare-competitors.mjs";
// @ts-expect-error plain .mjs build script without types
import { comparePageSections, loadComparePages, publicSources } from "./compare-page.mjs";

type Page = {
  slug: string; name: string; titleTag: string; metaDescription: string; headline: string; sub: string; whatItIs: string;
  whereTheyAreStronger: string[]; whereDocstocFits: string[];
  comparison: { topic: string; competitor: string; docstoc: string }[];
  whenToChoose: { competitor: string; docstoc: string };
  faq: { q: string; a: string }[];
  sources: { url: string; supports: string }[];
};
const pages = [...(loadComparePages() as Map<string, Page>).values()];
const visible = (p: Page) =>
  [p.headline, p.sub, p.whatItIs, p.whenToChoose.competitor, p.whenToChoose.docstoc, ...p.whereTheyAreStronger, ...p.whereDocstocFits,
    ...p.comparison.flatMap((r) => [r.topic, r.competitor, r.docstoc]), ...p.faq.flatMap((f) => [f.q, f.a])].join(" ");
const same = (s: string) => s;

describe("comparison pages", () => {
  it("cover every generated competitor", () => {
    const slugs = new Set(pages.map((p) => p.slug));
    for (const c of COMPETITORS as { slug: string; customLanding?: boolean }[]) {
      if (c.slug !== "sox-reporting") expect(slugs.has(c.slug), c.slug).toBe(true);
    }
  });

  it.each(pages.map((p) => [p.slug, p] as const))("%s fits the limits and the style rules", (_slug, p) => {
    expect(p.titleTag.length).toBeLessThanOrEqual(60);
    expect(p.metaDescription.length).toBeLessThanOrEqual(155);
    expect(p.faq).toHaveLength(3);
    const text = visible(p);
    expect(text.split(/\s+/).length).toBeGreaterThanOrEqual(300);
    expect(text).not.toMatch(/—| – /);
    // Each renewal needs a fresh DNS value: docstoc reminds, it does not renew unattended.
    const ours = [...p.whereDocstocFits, ...p.comparison.map((r) => r.docstoc), p.whenToChoose.docstoc].join(" ");
    expect(ours).not.toMatch(/auto-?renew|renews automatically|automatic renewal/i);
  });

  it("never shows repo paths or docstoc's own pages as sources", () => {
    for (const p of pages) {
      for (const s of publicSources(p) as { url: string }[]) {
        expect(s.url).toMatch(/^https?:\/\//);
        expect(s.url).not.toMatch(/docstoc\.io/);
      }
    }
  });

  it("does not render internal research notes", () => {
    const p = { ...pages[0], existingClaimIssues: ["SECRET-NOTE"], gaps: ["SECRET-NOTE"] };
    expect(JSON.stringify(comparePageSections(p, same))).not.toContain("SECRET-NOTE");
  });

  it("escapes page text", () => {
    const p = { ...pages[0], whatItIs: "<b>x</b>" };
    const esc = (s: string) => s.replace(/</g, "&lt;");
    expect(JSON.stringify(comparePageSections(p, esc))).toContain("&lt;b>x");
  });
});
