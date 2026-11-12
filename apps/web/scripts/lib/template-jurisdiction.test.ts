import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GENERAL_LABEL,
  NOT_A_LEGAL_REFERENCE,
  UK_LABEL,
  UK_STYLE,
  formatUsDate,
  jurisdictionLabel,
  lastContentChange,
  legalStatusHtml,
  legalStatusJsonLd,
  templateContentHash,
  templateJurisdiction,
  // @ts-expect-error plain .mjs build helper without types
} from "./template-jurisdiction.mjs";

type Template = { slug: string; name: string; description: string; category: string; bodyMarkdown: string };
type Revisions = Record<string, { updated: string; hash: string }>;

const webDir = join(__dirname, "../..");
const templates = JSON.parse(readFileSync(join(webDir, "public/document-templates/templates.json"), "utf8")) as Template[];
const revisions = JSON.parse(readFileSync(join(webDir, "scripts/data/template-revisions.json"), "utf8")) as Revisions;
// Kept only as a 301 to its twin (see generate-free-templates.mjs), so it has no page of its own.
const pages = templates.filter((t) => t.slug !== "affidavit-death-of-joint-tenant-template");
const text = (t: Template) => `${t.name}\n${t.description}\n${t.bodyMarkdown}`;
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const US_STATES =
  /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/;

function articleOf(html: string) {
  const raw = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  expect(raw).toBeTruthy();
  const graph = JSON.parse(raw as string)["@graph"] as Array<Record<string, unknown>>;
  return graph.find((n) => n["@type"] === "Article") as Record<string, unknown>;
}

describe("template jurisdiction", () => {
  it("never assigns a template to a single state", () => {
    for (const t of templates) expect(jurisdictionLabel(templateJurisdiction(t)), t.slug).not.toMatch(US_STATES);
  });

  it("uses the general label wherever the text names no federal law and no UK format", () => {
    const general = templates.filter((t) => templateJurisdiction(t).kind === "general");
    expect(general.length).toBeGreaterThan(templates.length / 2);
    for (const t of general) expect(jurisdictionLabel(templateJurisdiction(t))).toBe(GENERAL_LABEL);
    expect(GENERAL_LABEL).toContain("Check it against your state's law before use");
  });

  it("labels UK style only where the template itself says so", () => {
    for (const [slug, evidence] of Object.entries(UK_STYLE as Record<string, string>)) {
      const t = templates.find((x) => x.slug === slug);
      expect(t, slug).toBeTruthy();
      expect(text(t as Template), slug).toContain(evidence);
      expect(jurisdictionLabel(templateJurisdiction(t))).toBe(UK_LABEL);
    }
  });

  it("names only laws that appear in the template's own text", () => {
    const federal = templates.filter((t) => templateJurisdiction(t).kind === "us-federal");
    expect(federal.length).toBeGreaterThan(50);
    for (const t of federal) {
      const { laws } = templateJurisdiction(t) as { laws: Array<{ label: string }> };
      expect(laws.length, t.slug).toBeGreaterThan(0);
      for (const l of laws) {
        // Citations are quoted as written; named laws are matched by their own pattern in FEDERAL_LAWS.
        if (/U\.S\.C\.|CFR/.test(l.label)) expect(text(t), t.slug).toContain(l.label);
      }
    }
    const hipaa = templates.find((t) => t.slug === "hipaa-authorization-form-template") as Template;
    expect(templateJurisdiction(hipaa).laws.map((l: { label: string }) => l.label)).toEqual(["HIPAA", "45 CFR 164.508"]);
  });

  it("skips a law that is only a keyword, such as a skill on a resume", () => {
    for (const slug of Object.keys(NOT_A_LEGAL_REFERENCE)) {
      const t = templates.find((x) => x.slug === slug) as Template;
      expect(text(t)).toContain("HIPAA");
      expect(templateJurisdiction(t).kind).toBe("general");
    }
  });
});

describe("template review date", () => {
  it("has a current snapshot entry for every template (run scripts/build-template-revisions.mjs)", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const t of templates) {
      const rev = revisions[t.slug];
      expect(rev, `${t.slug}: missing in template-revisions.json`).toBeTruthy();
      expect(rev.hash, `${t.slug}: text changed since the snapshot`).toBe(templateContentHash(t));
      expect(rev.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rev.updated <= today).toBe(true);
      expect(rev.updated >= "2026-08-01").toBe(true);
    }
  });

  it("drops the date when the text no longer matches the snapshot", () => {
    const t = templates[0];
    expect(lastContentChange(t, revisions)).toBe(revisions[t.slug].updated);
    const edited = { ...t, bodyMarkdown: `${t.bodyMarkdown}\nedited` };
    expect(lastContentChange(edited, revisions)).toBeNull();
    expect(legalStatusJsonLd(edited, revisions).dateModified).toBeUndefined();
    expect(legalStatusHtml(edited, revisions, escape)).toContain("No date on record.");
    expect(lastContentChange(t, {})).toBeNull();
  });

  it("formats dates the US way", () => {
    expect(formatUsDate("2026-08-23")).toBe("August 23, 2026");
    expect(formatUsDate("2026-11-09")).toBe("November 9, 2026");
  });
});

describe("template pages", () => {
  it("show the notice and carry the same facts in their structured data", () => {
    for (const t of pages) {
      const file = join(webDir, "public/document-templates", `${t.slug}.html`);
      expect(existsSync(file), t.slug).toBe(true);
      const html = readFileSync(file, "utf8");
      expect(html, t.slug).toContain(legalStatusHtml(t, revisions, escape));
      expect(html).toContain("<dt>Legal review</dt>");

      const article = articleOf(html);
      expect(article.dateModified, t.slug).toBe(revisions[t.slug].updated);
      const j = templateJurisdiction(t);
      if (j.kind === "us-federal") {
        expect(article.spatialCoverage, t.slug).toEqual({ "@type": "Country", name: "United States" });
      } else {
        expect(article.spatialCoverage, t.slug).toBeUndefined();
        expect(article.mentions, t.slug).toBeUndefined();
      }
    }
  });
});
