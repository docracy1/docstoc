import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs data without types
import { FILLED_EXAMPLES } from "./filled-examples.mjs";

const publicDir = join(__dirname, "../../public");
const docDir = join(publicDir, "document-templates");
type Example = { summary: string; markdown: string };
const entries = Object.entries(FILLED_EXAMPLES as Record<string, Example>);

describe("filled-in examples and Word downloads (25.11.2026)", () => {
  it("covers the ten strongest templates", () => {
    expect(entries.map(([slug]) => slug).sort()).toEqual(
      [
        "software-requirements-specification-template",
        "payment-request-template",
        "notice-of-annual-general-meeting-template",
        "request-for-quotation-template",
        "expression-of-interest-letter-template",
        "simple-promissory-note-template",
        "unemployment-benefits-appeal-letter-template",
        "insurance-cancellation-letter-template",
        "sustainability-report-template",
        "due-diligence-checklist-template",
      ].sort()
    );
  });

  it.each(entries)("%s reads like a real document", (_slug, ex) => {
    const text = ex.markdown.replace(/\[( |x)\]/g, "");
    expect(text).not.toMatch(/\[[^\]]+\]/);
    expect(text).not.toMatch(/lorem|ipsum|\bTBD\b|John Doe|Jane Doe|Acme/i);
    expect(ex.markdown.length).toBeGreaterThan(900);
    expect(ex.summary.length).toBeGreaterThan(60);
  });

  it.each(entries)("%s page offers Word, PDF and the example; the data carries it", (slug, ex) => {
    const html = readFileSync(join(docDir, `${slug}.html`), "utf8");
    expect(html).toContain(`href="/document-templates/downloads/${slug}.docx" download>Download Word (.docx)</a>`);
    expect(html).toContain('class="btn-download-pdf">Download PDF</button>');
    expect(html).toContain('<h2 id="filled-in-example-title">Filled-in example</h2>');
    expect(existsSync(join(docDir, "downloads", `${slug}.docx`))).toBe(true);
    expect(existsSync(join(docDir, "downloads", `${slug}-example.docx`))).toBe(true);
    const data = JSON.parse(readFileSync(join(docDir, "templates.json"), "utf8"));
    expect(data.find((t: { slug: string }) => t.slug === slug).exampleMarkdown).toBe(ex.markdown);
  });
});

describe("template pages carry no cross-promotion (25.11.2026)", () => {
  const pages = readdirSync(docDir).filter((f) => f.endsWith("-template.html"));
  it("has no products strip and no certificate call to action, but keeps related templates", () => {
    expect(pages.length).toBeGreaterThan(1000);
    for (const f of pages) {
      const html = readFileSync(join(docDir, f), "utf8");
      expect(html, f).not.toContain("seo-products-strip");
      expect(html, f).not.toContain("/app/certificates");
      expect(html, f).toContain("<h2>Related document templates</h2>");
    }
  });
});
