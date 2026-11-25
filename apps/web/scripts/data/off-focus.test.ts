import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs data without types
import { isOffFocus } from "./off-focus.mjs";

describe("off-focus pages (template library, 15.11.2026)", () => {
  it("hides SSL, compliance, e-sign and competitor pages, also in Spanish", () => {
    for (const p of [
      "/digicert-alternative",
      "/es/workiva-alternative",
      "/docstoc-vs-vanta",
      "/import-from-letsencrypt",
      "/switch-from-sectigo",
      "/switch-to-docstoc",
      "/ssl",
      "/ssl/features/acme",
      "/tls",
      "/monitoringssl",
      "/compliance/",
      "/compliance/sox",
      "/es/accounts-receivable-sox",
      "/es/use-cases/sox-reporting",
      "/use-cases/flat-fee-esign",
      "/blog/types-of-ssl-certificates/",
      "/tools/file-hash-checker",
      "/solutions/evidence-automation",
      "/invoice-follow-up",
      "/chase-invoices",
      "/scan-document",
      "/es/invoice-follow-up",
      "/es/chase-invoices",
      "/guides/invoice-chasing/",
      "/guides/invoice-chasing",
      "/es/guides/invoice-chasing/",
    ]) {
      expect(isOffFocus(p), p).toBe(true);
    }
  });

  it("keeps the library, payment letters, tools for documents and the legal pages", () => {
    for (const p of [
      "/",
      "/document-templates/",
      "/document-templates/notice-of-annual-general-meeting-template",
      "/free-templates/agency-final-invoice-follow-up",
      "/business-kits/",
      "/payment-reminder",
      "/free-templates/",
      "/overdue-invoice",
      "/30-day-overdue-invoice-email",
      "/blog/how-to-follow-up-on-overdue-invoices/",
      "/tools/invoice-generator",
      "/tools/template-finder",
      "/tools/ai-document-generator",
      "/use-cases/freelance-contract-templates",
      "/about",
      "/privacy",
      "/es/",
      "/es/payment-reminder",
      "/security",
      "/docstoc-alternative",
      "/legalzoom-alternative",
      "/rocket-lawyer-alternative",
    ]) {
      expect(isOffFocus(p), p).toBe(false);
    }
  });
});
