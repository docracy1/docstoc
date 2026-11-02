import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs data without types
import { RELATED_PAGE_LINKS, SEARCH_SNIPPETS } from "./search-snippets.mjs";
// @ts-expect-error plain .mjs build script without types
import { applyRelatedLinks, applySearchSnippet, linkLabelFromHtml } from "../lib/seo-postprocess.mjs";

const publicDir = join(__dirname, "../../public");
const fileFor = (p: string) =>
  [p.endsWith("/") ? `${p}index.html` : `${p}.html`, `${p}/index.html`].map((c) => join(publicDir, c)).find(existsSync);

type Snippet = { title: string; description: string };
const entries = Object.entries(SEARCH_SNIPPETS as Record<string, Snippet>);

describe("search snippets", () => {
  it.each(entries)("%s fits the limits and the house style", (_path, s) => {
    expect(s.title.length).toBeLessThanOrEqual(60);
    expect(s.description.length).toBeGreaterThanOrEqual(60);
    expect(s.description.length).toBeLessThanOrEqual(158);
    for (const text of [s.title, s.description]) {
      expect(text).not.toMatch(/ [—–-] /);
      expect(text).not.toMatch(/\b(best|ultimate|powerful|seamless|world-class)\b/i);
    }
  });

  it.each(entries)("%s belongs to a page that exists", (path) => {
    expect(fileFor(path)).toBeTruthy();
  });

  it.each(entries.filter(([p]) => p.startsWith("/document-templates/") && p.endsWith("-template")))(
    "%s promises only what the page offers",
    (path, s) => {
      const html = readFileSync(fileFor(path)!, "utf8");
      if (/PDF/.test(s.title + s.description)) expect(html).toContain('class="btn-download-pdf"');
      if (/no account/i.test(s.description)) expect(html).toMatch(/no account/i);
      const fields = s.description.match(/(\d+) fields/)?.[1];
      if (fields) expect(html).toContain(`${fields} fields to fill`);
      expect(s.title + s.description).not.toMatch(/\bWord\b|\bsample\b/i);
    }
  );
});

describe("related page links", () => {
  it.each(Object.entries(RELATED_PAGE_LINKS as Record<string, string[]>))("%s and its targets exist", (source, targets) => {
    expect(fileFor(source)).toBeTruthy();
    for (const t of targets) expect(fileFor(t), t).toBeTruthy();
    expect(new Set(targets).size).toBe(targets.length);
  });
});

describe("applySearchSnippet", () => {
  const page = `<title>Old | docstoc</title>
<meta name="description" content="Old text">
<meta property="og:title" content="Old | docstoc">
<meta property="og:description" content="Old text">
<meta name="twitter:title" content="Old | docstoc">
<meta name="twitter:description" content="Old text">`;
  it("replaces title, description and their social copies, escaping ampersands", () => {
    const out = applySearchSnippet(page, { title: "A & B", description: "New text" });
    expect(out).not.toContain("Old");
    expect(out.match(/A &amp; B/g)).toHaveLength(3);
    expect(out.match(/New text/g)).toHaveLength(3);
  });
  it("leaves a page without a snippet alone", () => {
    expect(applySearchSnippet(page, undefined)).toBe(page);
  });
});

describe("applyRelatedLinks", () => {
  const page = "<main><h1>X</h1></main>";
  it("adds one list before </main> and replaces it on a rebuild", () => {
    const once = applyRelatedLinks(page, [{ href: "/a", label: "A" }]);
    const twice = applyRelatedLinks(once, [{ href: "/b", label: "B" }]);
    expect(once).toContain('<li><a href="/a">A</a></li>');
    expect(twice).not.toContain('href="/a"');
    expect(twice.match(/related-links -->/g)).toHaveLength(2);
    expect(twice.endsWith("</main>")).toBe(true);
  });
  it("takes link text from the title without the brand", () => {
    expect(linkLabelFromHtml("<title>Xero alternative | docstoc</title>")).toBe("Xero alternative");
  });
});
