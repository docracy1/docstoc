import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs data without types
import { SEARCH_SNIPPETS } from "./search-snippets.mjs";
// @ts-expect-error plain .mjs build script without types
import { applyNoindex } from "../lib/seo-postprocess.mjs";

const list = JSON.parse(readFileSync(join(__dirname, "noindex-templates.json"), "utf8")) as { paths: string[] };
const extras = JSON.parse(readFileSync(join(__dirname, "page-extras.json"), "utf8")) as Record<string, unknown>;
const publicDir = join(__dirname, "../../public");

describe("noindex templates", () => {
  it("lists only existing template pages, each once", () => {
    expect(new Set(list.paths).size).toBe(list.paths.length);
    for (const p of list.paths) {
      expect(p.startsWith("/document-templates/")).toBe(true);
      expect(existsSync(join(publicDir, `${p}.html`)), p).toBe(true);
    }
  });

  it("never hides a page we optimise on purpose", () => {
    for (const p of list.paths) {
      expect(SEARCH_SNIPPETS[p], p).toBeUndefined();
      expect(extras[p], p).toBeUndefined();
    }
  });

  it("adds or replaces the robots meta and stays the same on a second run", () => {
    const once = applyNoindex("<head><title>X</title></head>");
    expect(once).toContain('<meta name="robots" content="noindex, follow">');
    expect(applyNoindex(once)).toBe(once);
    expect(applyNoindex('<head><meta name="robots" content="index, follow"></head>')).toBe('<head><meta name="robots" content="noindex, follow"></head>');
  });
});
