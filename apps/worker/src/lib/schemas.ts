import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const magicLinkRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  turnstileToken: z.string().optional(),
});

export const templatesPackLeadSchema = z.object({
  email: z.string().trim().email().max(254),
  firstName: z.string().trim().max(80).optional(),
  role: z.string().trim().max(80).optional(),
  invoiceTool: z.string().trim().max(80).optional(),
  turnstileToken: z.string().optional(),
  /** Site language the form was submitted in (docstoc_locale) — more reliable than Accept-Language
   *  for picking the welcome email's language, since it reflects an explicit user choice. */
  lang: z.enum(["en", "es"]).optional(),
});

export const contactLeadSchema = z.object({
  email: z.string().trim().email().max(254),
  message: z.string().trim().min(1).max(4000),
});

export const analyticsTrackSchema = z.object({
  name: z.string().min(1).max(80),
  properties: z
    .record(z.string(), z.unknown())
    .refine((obj) => JSON.stringify(obj).length <= 2048, "properties too large")
    .optional(),
  visitorId: z.string().max(80).optional(),
  path: z.string().max(300).optional(),
  /** Persistent first-touch marketing channel (survives across sessions via localStorage),
   *  e.g. "linkedin" or "seo-invoice-template/aug-batch" — distinct from `properties.referrer`,
   *  which is only the current navigation's Referer. */
  attribution: z.string().max(80).optional(),
});

export const analyticsPageviewSchema = z.object({
  path: z.string().max(300).optional(),
  /** Alias used by some callers (Docracy parity). */
  route: z.string().max(300).optional(),
  /** Landing query string — utm_source / ref for campaign attribution. */
  query: z.string().max(500).optional(),
  /** Pages middleware edge hit (vs browser beacon). */
  edge: z.boolean().optional(),
});

export const agingSyncItemSchema = z.object({
  id: z.string().max(64).optional(),
  clientName: z.string().trim().min(1).max(120),
  amount: z.coerce.number().finite().min(0).max(999_999_999),
  dueDate: isoDate,
  status: z.enum(["open", "paid"]).optional(),
  paidAt: z.string().trim().max(40).nullable().optional(),
  lastChaseStatus: z.string().trim().max(40).nullable().optional(),
  lastChaseAt: z.string().trim().max(40).nullable().optional(),
});

export const agingSyncSchema = z.object({
  invoices: z.array(agingSyncItemSchema).max(500),
  replace: z.boolean().optional(),
});

export const agingChaseSchema = z.object({
  status: z.string().trim().max(40).optional(),
});

export const chaseEventSchema = z.object({
  agingInvoiceId: z.string().max(64).optional(),
  clientName: z.string().trim().min(1).max(120),
  eventType: z.enum(["drafted", "sent", "copied", "mailto", "marked_paid", "reply_detected", "note"]),
  channel: z.enum(["email", "sms", "whatsapp", "system"]).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().max(8000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const agingMarkPaidSchema = z.object({
  note: z.string().max(500).optional(),
});

export const digestSettingsSchema = z.object({
  digestEnabled: z.boolean(),
});

const HOSTNAME_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;
/** Wildcard LE identifier — single label star, then a normal FQDN (e.g. *.example.com). */
const WILDCARD_HOSTNAME_RE = /^\*\.(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

function normalizeHostnameList(raw: string | string[] | undefined): string[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return [...new Set(list.map((h) => h.trim().toLowerCase()).filter(Boolean))];
}

export const customHostnameCreateSchema = z
  .object({
    hostname: z.string().trim().toLowerCase().max(253).optional(),
    hostnames: z.array(z.string().trim().toLowerCase().max(253)).max(100).optional(),
  })
  .superRefine((data, ctx) => {
    const names = normalizeHostnameList(data.hostnames?.length ? data.hostnames : data.hostname ? [data.hostname] : []);
    if (names.length === 0) {
      ctx.addIssue({ code: "custom", message: "Enter a valid domain, e.g. invoices.yourcompany.com", path: ["hostname"] });
      return;
    }
    for (const name of names) {
      const ok = HOSTNAME_RE.test(name) || WILDCARD_HOSTNAME_RE.test(name);
      if (!ok) {
        ctx.addIssue({
          code: "custom",
          message: `Invalid hostname: ${name}`,
          path: names.length > 1 ? ["hostnames"] : ["hostname"],
        });
      }
    }
  })
  .transform((data) => {
    const hostnames = normalizeHostnameList(data.hostnames?.length ? data.hostnames : data.hostname ? [data.hostname] : []);
    return { hostname: hostnames[0]!, hostnames };
  });

export const certificateCreateSchema = z.object({
  sha256Hash: z.string().regex(/^[0-9a-f]{64}$/i, "Expected a SHA-256 hex digest"),
  originalFilename: z.string().trim().max(200).optional(),
  fileSizeBytes: z.coerce.number().int().min(0).max(5_000_000_000).optional(),
  /** Anonymous-only display name ("Your name or business") — signed-in accounts always show
   *  their live workspace name/branding instead, so this is ignored when a session is present. */
  issuerName: z.string().trim().max(120).optional(),
  turnstileToken: z.string().optional(),
});

const invoiceLineItemSchema = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.coerce.number().min(0.01).max(1_000_000),
  unitPrice: z.coerce.number().min(0).max(10_000_000),
});

export const invoiceCreateSchema = z.object({
  clientName: z.string().trim().min(1).max(200),
  clientEmail: z.string().trim().email().max(254).optional().or(z.literal("")),
  clientAddress: z.string().trim().max(300).optional().or(z.literal("")),
  clientState: z.string().trim().max(120).optional().or(z.literal("")),
  clientPostal: z.string().trim().max(32).optional().or(z.literal("")),
  clientCountry: z.string().trim().max(120).optional().or(z.literal("")),
  clientVat: z.string().trim().max(64).optional().or(z.literal("")),
  issuerName: z.string().trim().max(200).optional().or(z.literal("")),
  issuerAddress: z.string().trim().max(300).optional().or(z.literal("")),
  issuerState: z.string().trim().max(120).optional().or(z.literal("")),
  issuerPostal: z.string().trim().max(32).optional().or(z.literal("")),
  issuerCountry: z.string().trim().max(120).optional().or(z.literal("")),
  issuerVat: z.string().trim().max(64).optional().or(z.literal("")),
  issueDate: isoDate,
  dueDate: isoDate,
  currency: z.string().trim().length(3).default("USD"),
  lineItems: z.array(invoiceLineItemSchema).min(1).max(100),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  notes: z.string().trim().max(2000).optional(),
});

export const invoiceStatusSchema = z.object({
  status: z.enum(["draft", "sent", "paid"]),
});

export const marketingOptInSchema = z.object({
  marketingOptIn: z.boolean(),
});

export const adminBroadcastSchema = z.object({
  subject: z.string().trim().min(1).max(150),
  bodyHtml: z.string().trim().min(1).max(20_000),
  dryRun: z.boolean().optional(),
});

export const replyClassifySchema = z.object({
  client_name: z.string().trim().min(1).max(120),
  invoice_amount: z.coerce.number().finite().min(0).max(999_999_999),
  days_overdue: z.coerce.number().finite().min(0).max(3650),
  client_message: z.string().trim().max(4000).optional(),
  client_email: z.string().trim().max(200).optional(),
  fetch_from_gmail: z.boolean().optional(),
  payment_link: z.string().max(500).optional(),
  aging_invoice_id: z.string().max(64).optional(),
});

export const demandLetterSchema = z.object({
  client_name: z.string().trim().min(1).max(120),
  client_address: z.string().trim().max(500).optional(),
  invoice_number: z.string().trim().max(80).optional(),
  invoice_amount: z.coerce.number().finite().min(0).max(999_999_999),
  due_date: isoDate,
  days_overdue: z.coerce.number().finite().min(1).max(3650),
  letter_level: z.coerce.number().int().min(1).max(3).optional(),
  /** @deprecated use letter_level */
  mahnung_level: z.coerce.number().int().min(1).max(3).optional(),
  sender_name: z.string().trim().max(120).optional(),
  sender_address: z.string().trim().max(500).optional(),
  payment_link: z.string().max(500).optional(),
});

/** @deprecated Use demandLetterSchema */
export const mahnungSchema = demandLetterSchema;

export const marketplaceSubmitSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(400).optional(),
    stage: z.string().trim().max(60).optional(),
    tone: z.string().trim().max(40).optional(),
    category: z.string().trim().max(60).optional(),
    templateType: z.enum(["email", "document"]).optional(),
    // Required for email templates, empty/unused for document templates (validated below).
    subject: z.string().trim().max(200).optional(),
    body: z.string().trim().max(4000).optional(),
    // Required for document templates instead of subject/body.
    bodyMarkdown: z.string().trim().max(20_000).optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
    submitterName: z.string().trim().max(80).optional(),
    // z.url() accepts any syntactically valid URL, including javascript: — this is rendered as a
    // clickable href on a public page, so restrict to http(s) explicitly rather than relying on
    // client-side escaping alone.
    submitterUrl: z
      .string()
      .trim()
      .url()
      .max(300)
      .refine((url) => /^https?:\/\//i.test(url), "Must be an http:// or https:// URL")
      .optional(),
    submitterEmail: z.string().trim().email().max(254).optional(),
    turnstileToken: z.string().optional(),
  })
  .refine(
    (data) =>
      data.templateType === "document"
        ? Boolean(data.bodyMarkdown && data.bodyMarkdown.length > 0)
        : Boolean(data.subject && data.subject.length > 0 && data.body && data.body.length > 0),
    { message: "Email templates need a subject and body; document templates need content." }
  );

export const demoDraftSchema = z.object({
  client_name: z.string().max(80).optional(),
  invoice_amount: z.coerce.number().finite().min(1).max(999_999).optional(),
  days_overdue: z.coerce.number().finite().min(0).max(120),
});

export const generateEmailSchema = z.object({
  client_name: z.string().max(120).optional(),
  invoice_amount: z.coerce.number().finite().min(0).max(999_999_999).optional(),
  days_overdue: z.coerce.number().finite().min(0).max(3650).optional(),
  payment_link: z.string().max(500).optional(),
  visitorId: z.string().max(80).optional(),
  invoices: z
    .array(
      z.object({
        client_name: z.string().max(120).optional(),
        invoice_amount: z.coerce.number().finite().optional(),
        amount: z.coerce.number().finite().optional(),
        days_overdue: z.coerce.number().finite().min(0).max(3650).optional(),
        due_date: z.string().max(20).optional(),
      })
    )
    .max(50)
    .optional(),
});

export const rewriteEmailSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(8000),
  action: z.enum(["softer", "firmer", "shorter"]),
});

export const thankYouSchema = z.object({
  client_name: z.string().trim().min(1).max(120),
  invoice_amount: z.coerce.number().finite().min(0).max(999_999_999),
});

export const replyEmailSchema = z.object({
  client_name: z.string().trim().min(1).max(120),
  invoice_amount: z.coerce.number().finite().min(0).max(999_999_999),
  days_overdue: z.coerce.number().finite().min(0).max(3650),
  client_message: z.string().trim().min(1).max(4000),
});

export const sequenceEmailSchema = z.object({
  client_name: z.string().trim().min(1).max(120),
  invoice_amount: z.coerce.number().finite().min(0).max(999_999_999),
  days_overdue: z.coerce.number().finite().min(0).max(3650),
  aging_invoice_id: z.string().max(64).optional(),
});

export const smsEmailSchema = z.object({
  client_name: z.string().trim().min(1).max(120),
  invoice_amount: z.coerce.number().finite().min(0).max(999_999_999),
  days_overdue: z.coerce.number().finite().min(0).max(3650),
  phone: z.string().max(40).optional(),
});

export const v1ChaseDraftSchema = z.object({
  client_name: z.string().max(120).optional(),
  customer: z.string().max(120).optional(),
  invoice_amount: z.coerce.number().finite().optional(),
  amount: z.coerce.number().finite().optional(),
  days_overdue: z.coerce.number().finite().min(0).max(3650).optional(),
  due_date: z.string().max(20).optional(),
  dueDate: z.string().max(20).optional(),
});

export const clientCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  address: z.string().trim().max(300).optional(),
  state: z.string().trim().max(120).optional(),
  postal: z.string().trim().max(32).optional(),
  country: z.string().trim().max(120).optional(),
  vat: z.string().trim().max(64).optional(),
});

export const clientUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  address: z.string().trim().max(300).optional(),
  state: z.string().trim().max(120).optional(),
  postal: z.string().trim().max(32).optional(),
  country: z.string().trim().max(120).optional(),
  vat: z.string().trim().max(64).optional(),
  lastContactNote: z.string().max(500).optional(),
  clearLastContact: z.boolean().optional(),
});

export const teamInviteSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(["admin", "member"]).optional(),
});

export const teamAcceptSchema = z.object({
  token: z.string().trim().min(1).max(200),
});

export const teamRoleSchema = z.object({
  role: z.enum(["admin", "member"]),
});

export const webhookCreateSchema = z.object({
  url: z.string().trim().min(1).max(500),
});

const webhookEventEnum = z.enum([
  "chase.sent",
  "chase.downloaded",
  "chase.drafted",
  "chase.thank_you",
  "chase.reply_drafted",
  "chase.sequence_planned",
]);

export const webhookNotifySchema = z.object({
  event: webhookEventEnum,
  data: z.record(z.string(), z.unknown()).optional(),
});

export const trackingCreateSchema = z.object({
  subject: z.string().max(200).optional(),
  body: z.string().trim().min(1).max(8000),
  clientName: z.string().max(120).optional(),
  agingInvoiceId: z.string().max(64).optional(),
  wrapLinks: z.boolean().optional(),
});

export const trackingStatsSchema = z.object({
  invoiceIds: z.array(z.string().max(64)).max(100).optional(),
});

export const reminderSequenceStepSchema = z.object({
  step: z.coerce.number().optional(),
  daysFromNow: z.coerce.number().optional(),
  label: z.string().max(80).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().max(4000).optional(),
});

export const reminderSequenceSchema = z.object({
  agingInvoiceId: z.string().max(64).optional(),
  clientName: z.string().trim().min(1).max(120),
  steps: z.array(reminderSequenceStepSchema).min(1).max(20),
});

export const reminderStatusSchema = z.object({
  status: z.enum(["planned", "done", "skipped"]),
});

export const snoozeReminderSchema = z.object({
  days: z.coerce.number().int().min(1).max(90),
});

export const followUpReminderSchema = z.object({
  agingInvoiceId: z.string().max(64).optional(),
  clientName: z.string().trim().min(1).max(120),
  daysFromNow: z.coerce.number().int().min(0).max(365),
  label: z.string().trim().max(80).optional(),
  subject: z.string().trim().max(200),
  body: z.string().trim().max(4000),
});

export const connectorKeySchema = z.object({
  name: z.string().trim().max(40).optional(),
});

const workspaceNameRe = /^[a-zA-Z0-9][a-zA-Z0-9 _-]{1,28}[a-zA-Z0-9]$|^[a-zA-Z0-9]{3,30}$/;

export const brandingUpdateSchema = z.object({
  workspaceName: z.string().trim().optional(),
  logoDataUrl: z.string().optional(),
  paymentLink: z.string().optional(),
  lateFeeEnabled: z.boolean().optional(),
  lateFeeHint: z.string().max(200).optional(),
  businessAddress: z.string().trim().max(300).optional(),
  businessState: z.string().trim().max(120).optional(),
  businessPostal: z.string().trim().max(32).optional(),
  businessCountry: z.string().trim().max(120).optional(),
  businessVat: z.string().trim().max(64).optional(),
  removeLogo: z.boolean().optional(),
  removeName: z.boolean().optional(),
  removePaymentLink: z.boolean().optional(),
});

export function validateWorkspaceName(name: string): boolean {
  if (name.length === 0) return true;
  return name.length >= 3 && name.length <= 30 && workspaceNameRe.test(name);
}

export const billingCheckoutSchema = z.object({
  plan: z.enum(["pro", "business"]),
});

export const adminLoginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
  turnstileToken: z.string().optional(),
});

export const adminGrantBusinessSchema = z.object({
  email: z.string().trim().email().max(254),
});

export const adminDeleteAccountSchema = z.object({
  email: z.string().trim().email().max(254),
  // Must exactly match the account's email — a lightweight "type to confirm" guard against a
  // stray click on an irreversible, cascading delete.
  confirmEmail: z.string().trim().email().max(254),
});

export const adminBlogPostSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(100).optional(),
  description: z.string().max(500).optional(),
  body: z.string().max(100_000),
  published: z.boolean().optional(),
});

export const adminBlogPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  slug: z.string().trim().max(100).optional(),
  description: z.string().max(500).optional(),
  body: z.string().max(100_000).optional(),
  published: z.boolean().optional(),
});

export const mcpDraftSchema = z.object({
  client_name: z.string().trim().min(1).max(120),
  invoice_amount: z.coerce.number().finite().min(0).max(999_999_999),
  days_overdue: z.coerce.number().finite().min(0).max(3650),
});

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function parseJsonBody<T>(
  req: { json: () => Promise<unknown> },
  schema: z.ZodType<T>
): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const msg = result.error.issues.map((i) => i.message).join("; ") || "Invalid request body";
    return { ok: false, error: msg };
  }
  return { ok: true, data: result.data };
}
