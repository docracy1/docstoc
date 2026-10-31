import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs build script without types
import { fitDescription, fitTitle, parseGitLastmods, rewriteCanonicalLinks } from "./seo-postprocess.mjs";

const title = (t: string) => `<title>${t}</title>`;
const desc = (d: string) => `<meta name="description" content="${d}">`;
const content = (html: string) => /content="([^"]*)"/.exec(html)![1];

describe("fitTitle", () => {
  it("leaves short titles alone", () => {
    expect(fitTitle(title("Short | docstoc"))).toBe(title("Short | docstoc"));
  });
  it("drops the brand from long titles", () => {
    const long = "Free Authorization for Temporary Guardianship of Minor Template";
    expect(fitTitle(title(`${long} | docstoc`))).toBe(title(long));
    expect(fitTitle(title(`${long} — docstoc`))).toBe(title(long));
    expect(fitTitle(title(`${long} | docstoc Blog`))).toBe(title(long));
  });
});

describe("fitDescription", () => {
  it("leaves short descriptions alone", () => {
    expect(fitDescription(desc("Fine."))).toBe(desc("Fine."));
  });
  it("cuts at a sentence end when one fits", () => {
    const first = "A".repeat(100) + ".";
    const out = content(fitDescription(desc(`${first} ${"word ".repeat(30)}`)));
    expect(out).toBe(first);
  });
  it("otherwise cuts at a word and stays within the limit", () => {
    const out = content(fitDescription(desc("word, ".repeat(60))));
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith("word")).toBe(true);
  });
});

describe("rewriteCanonicalLinks", () => {
  const map = new Map([["/docstoc-vs-wave", "/wave-alternative"]]);
  it("rewrites relative and absolute links", () => {
    expect(rewriteCanonicalLinks('<a href="/docstoc-vs-wave">', map)).toBe('<a href="/wave-alternative">');
    expect(rewriteCanonicalLinks('<a href="https://docstoc.io/docstoc-vs-wave">', map)).toBe('<a href="/wave-alternative">');
  });
  it("leaves other links and the canonical tag's external form alone", () => {
    expect(rewriteCanonicalLinks('<a href="/pricing">', map)).toBe('<a href="/pricing">');
    expect(rewriteCanonicalLinks('<a href="https://other.io/docstoc-vs-wave">', map)).toBe('<a href="https://other.io/docstoc-vs-wave">');
  });
});

describe("parseGitLastmods", () => {
  it("keeps the newest date per file", () => {
    const m = parseGitLastmods("@2026-10-27\n\na.html\nb.html\n@2026-09-01\n\na.html\nc.html\n");
    expect(m.get("a.html")).toBe("2026-10-27");
    expect(m.get("c.html")).toBe("2026-09-01");
  });
});
