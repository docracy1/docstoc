import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  agingPaymentLinkSchema,
  agingSyncSchema,
  certificateCreateSchema,
  chaseEventSchema,
  clientCreateSchema,
  customHostnameCreateSchema,
  parseJsonBody,
  replyClassifySchema,
  webhookNotifySchema,
} from "./schemas";

describe("schemas", () => {
  it("parses aging sync batch", async () => {
    const result = await parseJsonBody(
      {
        json: async () => ({
          replace: true,
          invoices: [
            { clientName: "Acme", amount: 1200, dueDate: "2026-01-15" },
          ],
        }),
      },
      agingSyncSchema
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.invoices).toHaveLength(1);
      expect(result.data.replace).toBe(true);
    }
  });

  it("rejects invalid aging due date", async () => {
    const result = await parseJsonBody(
      {
        json: async () => ({
          invoices: [{ clientName: "Acme", amount: 100, dueDate: "bad" }],
        }),
      },
      agingSyncSchema
    );
    expect(result.ok).toBe(false);
  });

  it("caps analytics properties size", () => {
    const big = { properties: { x: "y".repeat(3000) } };
    const schema = z.object({
      properties: z
        .record(z.string(), z.unknown())
        .refine((obj) => JSON.stringify(obj).length <= 2048, "properties too large")
        .optional(),
    });
    expect(schema.safeParse(big).success).toBe(false);
  });

  it("parses client create schema", async () => {
    const result = await parseJsonBody(
      { json: async () => ({ name: "Acme Corp", email: "a@acme.io" }) },
      clientCreateSchema
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe("Acme Corp");
      expect(result.data.email).toBe("a@acme.io");
    }
  });

  it("rejects client create without name", async () => {
    const result = await parseJsonBody({ json: async () => ({ email: "a@acme.io" }) }, clientCreateSchema);
    expect(result.ok).toBe(false);
  });

  it("parses webhook notify event", async () => {
    const result = await parseJsonBody(
      { json: async () => ({ event: "chase.sent", data: { client: "Acme" } }) },
      webhookNotifySchema
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.event).toBe("chase.sent");
    }
  });

  it("rejects invalid webhook event", async () => {
    const result = await parseJsonBody(
      { json: async () => ({ event: "invalid.event" }) },
      webhookNotifySchema
    );
    expect(result.ok).toBe(false);
  });

  it("parses chase event for mark sent", async () => {
    const result = await parseJsonBody(
      {
        json: async () => ({
          clientName: "Acme",
          eventType: "sent",
          channel: "email",
          subject: "Invoice follow-up",
        }),
      },
      chaseEventSchema
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.eventType).toBe("sent");
  });

  it("parses reply classify payload", async () => {
    const result = await parseJsonBody(
      {
        json: async () => ({
          client_name: "Acme",
          invoice_amount: 500,
          days_overdue: 14,
          client_message: "We will pay next week.",
        }),
      },
      replyClassifySchema
    );
    expect(result.ok).toBe(true);
  });

  it("parses a valid certificate create payload", async () => {
    const result = await parseJsonBody(
      { json: async () => ({ sha256Hash: "a".repeat(64), originalFilename: "invoice.pdf" }) },
      certificateCreateSchema
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.sha256Hash).toBe("a".repeat(64));
  });

  it("rejects a certificate create payload with a malformed hash", async () => {
    const result = await parseJsonBody(
      { json: async () => ({ sha256Hash: "not-a-hash" }) },
      certificateCreateSchema
    );
    expect(result.ok).toBe(false);
  });

  it("parses a valid custom hostname", async () => {
    const result = await parseJsonBody(
      { json: async () => ({ hostname: "Invoices.Example.COM" }) },
      customHostnameCreateSchema
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.hostname).toBe("invoices.example.com");
  });

  it("rejects a custom hostname without a dot", async () => {
    const result = await parseJsonBody(
      { json: async () => ({ hostname: "localhost" }) },
      customHostnameCreateSchema
    );
    expect(result.ok).toBe(false);
  });

  it("parses multi-SAN hostnames", async () => {
    const result = await parseJsonBody(
      {
        json: async () => ({
          hostnames: ["Example.COM", "www.example.com"],
        }),
      },
      customHostnameCreateSchema
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hostname).toBe("example.com");
      expect(result.data.hostnames).toEqual(["example.com", "www.example.com"]);
    }
  });

  it("parses a wildcard hostname", async () => {
    const result = await parseJsonBody(
      { json: async () => ({ hostname: "*.Example.COM" }) },
      customHostnameCreateSchema
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.hostname).toBe("*.example.com");
  });
});

describe("agingPaymentLinkSchema", () => {
  it("accepts http(s) links", () => {
    expect(agingPaymentLinkSchema.safeParse({ url: "https://pay.example/x" }).success).toBe(true);
    expect(agingPaymentLinkSchema.safeParse({ url: "http://pay.example/x" }).success).toBe(true);
  });
  it("rejects schemes that would run on docstoc.io/pay", () => {
    for (const url of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "vbscript:x"]) {
      expect(agingPaymentLinkSchema.safeParse({ url }).success).toBe(false);
    }
  });
});
