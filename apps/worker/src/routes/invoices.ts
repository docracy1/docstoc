import { Hono } from "hono";
import { checkRateLimit } from "../lib/rateLimit";
import type { AuthEnv } from "../lib/auth";
import { requireAccount } from "../lib/auth";
import {
  checkInvoiceCertificate,
  createInvoice,
  deleteInvoice,
  getInvoice,
  getInvoiceByPublicId,
  listInvoicesForAccount,
  setInvoiceStatus,
} from "../lib/invoices";
import { getBrandingRow } from "./account";
import { invoiceCreateSchema, invoiceStatusSchema, parseJsonBody } from "../lib/schemas";
import { recordTimestampFailed, recordTimestampSubmitted } from "../lib/certificates";
import { submitTimestamp } from "../lib/openTimestamps";

const invoices = new Hono<AuthEnv>();

invoices.get("/", requireAccount, async (c) => {
  const acc = c.get("account")!;
  const list = await listInvoicesForAccount(c.env, acc.workspaceId);
  return c.json({ invoices: list });
});

invoices.post("/", requireAccount, async (c) => {
  const acc = c.get("account")!;
  const parsed = await parseJsonBody(c.req, invoiceCreateSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const body = parsed.data;

  const invoice = await createInvoice(c.env, acc.workspaceId, {
    clientName: body.clientName,
    clientEmail: body.clientEmail || null,
    clientAddress: body.clientAddress || null,
    clientState: body.clientState || null,
    clientPostal: body.clientPostal || null,
    clientCountry: body.clientCountry || null,
    clientVat: body.clientVat || null,
    issuerName: body.issuerName || null,
    issuerAddress: body.issuerAddress || null,
    issuerState: body.issuerState || null,
    issuerPostal: body.issuerPostal || null,
    issuerCountry: body.issuerCountry || null,
    issuerVat: body.issuerVat || null,
    issueDate: body.issueDate,
    dueDate: body.dueDate,
    currency: body.currency,
    lineItems: body.lineItems,
    taxRate: body.taxRate,
    notes: body.notes || null,
  });
  return c.json({ ok: true, invoice });
});

invoices.get("/:id", requireAccount, async (c) => {
  const acc = c.get("account")!;
  const invoice = await getInvoice(c.env, acc.workspaceId, c.req.param("id"));
  if (!invoice) return c.json({ error: "Not found" }, 404);
  const certificateStatus = await checkInvoiceCertificate(c.env, invoice);
  return c.json({ invoice, certificateStatus });
});

invoices.patch("/:id/status", requireAccount, async (c) => {
  const acc = c.get("account")!;
  const parsed = await parseJsonBody(c.req, invoiceStatusSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const result = await setInvoiceStatus(c.env, acc.workspaceId, c.req.param("id"), parsed.data.status, acc.plan);
  if (!result) return c.json({ error: "Not found" }, 404);

  // Certification is synchronous (just a DB write); the Bitcoin anchor is a third-party network
  // call, so it runs in the background exactly like a certificate created via /verify/certificates.
  if (result.newCertificate) {
    const { id: certId, sha256Hash } = result.newCertificate;
    c.executionCtx.waitUntil(
      (async () => {
        const submitted = await submitTimestamp(sha256Hash);
        if (submitted.ok) {
          await recordTimestampSubmitted(c.env, certId, {
            calendarUrl: submitted.calendarUrl,
            proofBase64: submitted.proofBase64,
          });
        } else {
          await recordTimestampFailed(c.env, certId);
          console.error("Invoice certificate OpenTimestamps submission failed:", submitted.error);
        }
      })().catch((err) => console.error("Invoice certificate OpenTimestamps submission threw:", err))
    );
  }

  return c.json({ ok: true, invoice: result.invoice });
});

invoices.delete("/:id", requireAccount, async (c) => {
  const acc = c.get("account")!;
  const result = await deleteInvoice(c.env, acc.workspaceId, c.req.param("id"));
  if (!result.ok) return c.json({ error: result.error }, result.error === "Not found" ? 404 : 409);
  return c.json({ ok: true });
});

/** Public, no auth — backs the printable /invoice/:id page. Re-checks the invoice's CURRENT
 *  content against its certified hash on every load, rather than trusting a "certified at send
 *  time" flag that could silently go stale if the row was ever altered afterward. */
invoices.get("/public/:publicId", async (c) => {
  const ip = c.req.header("cf-connecting-ip") || "unknown";
  const rl = await checkRateLimit(c.env, `invoice_public:${ip}`, 60, 60);
  if (!rl.ok) return c.json({ error: "Too many requests. Try again later." }, 429);

  const invoice = await getInvoiceByPublicId(c.env, c.req.param("publicId"));
  if (!invoice) return c.json({ error: "Not found" }, 404);
  const branding = await getBrandingRow(c.env, invoice.accountId);
  const certificateStatus = await checkInvoiceCertificate(c.env, invoice);
  const publicInvoice: Partial<typeof invoice> = { ...invoice };
  delete publicInvoice.accountId;
  return c.json({
    invoice: publicInvoice,
    certificateStatus,
    from: {
      name: invoice.issuerName || branding?.workspace_name || "docstoc.io account",
      address: invoice.issuerAddress || branding?.business_address || null,
      state: invoice.issuerState || branding?.business_state || null,
      postal: invoice.issuerPostal || branding?.business_postal || null,
      country: invoice.issuerCountry || branding?.business_country || null,
      vat: invoice.issuerVat || branding?.business_vat || null,
      logoDataUrl: branding?.logo_data || null,
      paymentLink: branding?.payment_link || null,
    },
  });
});

export default invoices;
