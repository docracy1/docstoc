import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs build script without types
import { chrome } from "./chrome.mjs";

describe("site chrome (25.11.2026)", () => {
  const html: string = chrome({ title: "T", description: "D", canonical: "/x", mainHtml: "<p>x</p>" });

  it("links no sister sites, but keeps the operator line and the imprint", () => {
    expect(html).not.toMatch(/firmenbuchdaten|kryptofiskus|vorerfasst|swipesign|docracy\.|relacon\.at/i);
    expect(html).toContain("a product of RELACON GmbH");
    expect(html).toContain('href="/imprint"');
  });

  it("menus and footer lead with templates, not invoice chasing", () => {
    expect(html).not.toMatch(/href="\/(invoices|chase-invoices|invoice-follow-up|guides\/invoice-chasing\/|overdue-invoices-guide)"/);
    expect(html).not.toMatch(/AI (invoice )?chas|chase draft/i);
    expect(html).toContain('href="/payment-reminder"');
    expect(html).toContain('href="/document-templates/"');
  });
});
