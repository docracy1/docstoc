import { Hono } from "hono";
import type { Context } from "hono";
import { optionalAccount, requirePaidAccount, requireProAccount, type AuthEnv } from "../lib/auth";
import {
  classifyAndReplyEmail,
  generateChaseSequence,
  generateDemandLetterHtml,
  generateFollowUpEmail,
  generateReplyEmail,
  generateSmsWhatsAppDraft,
  generateThankYouEmail,
  rewriteFollowUpEmail,
  type RewriteAction,
} from "../lib/ai";
import { recordChaseEvent } from "../lib/chaseEvents";
import type { Env } from "../types";
import { dispatchWebhooks } from "../lib/webhooks";
import { replaceSequenceReminders } from "../lib/chaseReminders";
import { checkDraftQuota, incrementDraftUsage, usageScopeKey } from "../lib/usageQuota";
import { checkRateLimit, clientIpFromHeaders } from "../lib/rateLimit";
import { clampOptionalString, clampString } from "../lib/validate";
import { clientIp } from "../lib/turnstile";
import {
  createEmailDraftJob,
  getEmailDraftJob,
  runEmailDraftJob,
  type ChaseDraftInput,
} from "../lib/emailDraftJobs";
import type { z } from "zod";
import {
  generateEmailSchema,
  parseJsonBody,
  replyEmailSchema,
  replyClassifySchema,
  demandLetterSchema,
  rewriteEmailSchema,
  sequenceEmailSchema,
  smsEmailSchema,
  thankYouSchema,
} from "../lib/schemas";

const emails = new Hono<AuthEnv>();

async function enforceDraftAccess(
  c: Context<AuthEnv>,
  body: { visitorId?: unknown }
): Promise<Response | null> {
  const ip = clientIp(c) || clientIpFromHeaders({ get: (n) => c.req.header(n) ?? null });
  const rl = await checkRateLimit(c.env, `ai_draft:${ip}`, 60, 3600);
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: "Too many requests. Try again later." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const visitorId = typeof body.visitorId === "string" ? body.visitorId : undefined;
  const quota = await checkDraftQuota(c.env, c.get("account") ?? null, ip, visitorId);
  if (!quota.allowed) {
    return new Response(JSON.stringify({ error: quota.error, remaining: 0 }), {
      status: 402,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

async function loadLateFeeHint(env: Env, accountId: string | undefined): Promise<string | undefined> {
  if (!accountId) return undefined;
  const row = await env.CHASA_DB.prepare(
    `SELECT late_fee_enabled, late_fee_hint FROM accounts WHERE id = ?`
  )
    .bind(accountId)
    .first<{ late_fee_enabled: number; late_fee_hint: string | null }>();
  if (!row?.late_fee_enabled || !row.late_fee_hint?.trim()) return undefined;
  return row.late_fee_hint.trim().slice(0, 200);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// Free tier: server-enforced monthly cap. Paid accounts unlimited.
function parseChaseDraftInput(body: z.infer<typeof generateEmailSchema>):
  | { ok: true; input: ChaseDraftInput }
  | { ok: false; error: string } {
  const lineItems = body.invoices
    ? body.invoices
        .map((row) => {
          const amount = row.invoice_amount ?? row.amount;
          const daysOverdueVal = row.days_overdue;
          if (amount == null || !Number.isFinite(amount) || daysOverdueVal == null || !Number.isFinite(daysOverdueVal)) {
            return null;
          }
          return {
            clientName: clampOptionalString(row.client_name, 120),
            amount,
            daysOverdue: Math.max(0, Math.min(3650, daysOverdueVal)),
            dueDate: clampOptionalString(row.due_date, 20),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x != null)
    : [];

  const clientName =
    clampString(body.client_name, 120) ||
    (lineItems.length === 1 ? lineItems[0].clientName ?? "" : "") ||
    (lineItems.length > 1 ? "your team" : "");

  const invoiceAmount =
    lineItems.length > 0 ? lineItems.reduce((s, l) => s + l.amount, 0) : body.invoice_amount ?? NaN;
  const daysOverdue =
    lineItems.length > 0 ? Math.max(...lineItems.map((l) => l.daysOverdue)) : body.days_overdue ?? NaN;
  const paymentLink = clampOptionalString(body.payment_link, 500);

  if (!clientName || !Number.isFinite(invoiceAmount) || !Number.isFinite(daysOverdue)) {
    return {
      ok: false,
      error: "client_name, invoice_amount, and days_overdue are required (or a non-empty invoices array).",
    };
  }
  if (paymentLink && !/^https?:\/\//i.test(paymentLink)) {
    return { ok: false, error: "payment_link must be an http(s) URL." };
  }

  return {
    ok: true,
    input: {
      clientName,
      invoiceAmount,
      daysOverdue: Math.max(0, daysOverdue),
      paymentLink,
      lineItems,
      visitorId: typeof body.visitorId === "string" ? body.visitorId : undefined,
    },
  };
}

async function postChaseDraft(c: import("hono").Context<AuthEnv>) {
  const parsed = await parseJsonBody(c.req, generateEmailSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const body = parsed.data;

  const blocked = await enforceDraftAccess(c, body);
  if (blocked) return blocked;

  const draftInput = parseChaseDraftInput(body);
  if (!draftInput.ok) return c.json({ error: draftInput.error }, 400);

  try {
    const lateFeeHint = await loadLateFeeHint(c.env, c.get("account")?.workspaceId);
    const draft = await withTimeout(
      generateFollowUpEmail(c.env, {
        clientName: draftInput.input.clientName,
        invoiceAmount: draftInput.input.invoiceAmount,
        daysOverdue: draftInput.input.daysOverdue,
        invoices: draftInput.input.lineItems.length > 0 ? draftInput.input.lineItems : undefined,
        paymentLink: draftInput.input.paymentLink,
        lateFeeHint,
      }),
      45_000,
      "generateFollowUpEmail"
    );
    const acc = c.get("account");
    const ip = clientIp(c) || "unknown";
    const scope = usageScopeKey(acc ?? null, ip, body.visitorId);
    const remaining = await incrementDraftUsage(c.env, scope);
    if (acc?.isPaid) {
      c.executionCtx.waitUntil(
        dispatchWebhooks(c.env, acc.workspaceId, "chase.drafted", {
          client_name: draftInput.input.clientName,
          invoice_amount: draftInput.input.invoiceAmount,
          days_overdue: draftInput.input.daysOverdue,
          invoice_count: draftInput.input.lineItems.length || 1,
          subject: draft.subject,
        }).catch(() => {})
      );
    }
    return c.json({ ...draft, remaining: acc?.isPaid ? null : Math.max(0, 5 - remaining) });
  } catch (err) {
    console.error("generateFollowUpEmail failed", err);
    return c.json({ error: "Could not generate a draft right now. Please try again." }, 502);
  }
}

/** App UI: return job id immediately; browser polls GET /email-draft/:jobId (short requests). */
async function postChaseDraftJob(c: import("hono").Context<AuthEnv>) {
  const parsed = await parseJsonBody(c.req, generateEmailSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const body = parsed.data;

  const blocked = await enforceDraftAccess(c, body);
  if (blocked) return blocked;

  const draftInput = parseChaseDraftInput(body);
  if (!draftInput.ok) return c.json({ error: draftInput.error }, 400);

  try {
    const jobId = await createEmailDraftJob(c.env);
    const acc = c.get("account");
    const ip = clientIp(c) || "unknown";
    const lateFeeHint = await loadLateFeeHint(c.env, acc?.workspaceId);
    c.executionCtx.waitUntil(
      runEmailDraftJob(c.env, jobId, acc, { ...draftInput.input, lateFeeHint }, ip)
    );
    return c.json({ jobId }, 202);
  } catch (err) {
    console.error("postChaseDraftJob failed", err);
    return c.json({ error: "Could not start draft generation. Please try again." }, 502);
  }
}

async function getChaseDraftJob(c: import("hono").Context<AuthEnv>) {
  const jobId = c.req.param("jobId")?.trim();
  if (!jobId || jobId.length > 64) return c.json({ error: "Invalid job id" }, 400);
  try {
    const job = await getEmailDraftJob(c.env, jobId);
    if (!job) return c.json({ error: "Draft job not found or expired" }, 404);
    return c.json(job);
  } catch (err) {
    console.error("getChaseDraftJob failed", err);
    return c.json({ error: "Could not read draft status" }, 502);
  }
}

// Ad blockers often block URLs containing "generate" or "email"; keep legacy paths too.
emails.post("/generate-email", optionalAccount, postChaseDraft);
emails.post("/draft-chase", optionalAccount, postChaseDraft);
emails.post("/email-draft", optionalAccount, postChaseDraftJob);
emails.get("/email-draft/:jobId", optionalAccount, getChaseDraftJob);
emails.post("/ai/draft", optionalAccount, postChaseDraftJob);
emails.get("/ai/draft/:jobId", optionalAccount, getChaseDraftJob);

const REWRITE_ACTIONS = new Set<RewriteAction>(["softer", "firmer", "shorter"]);

emails.post("/rewrite-email", requirePaidAccount, async (c) => {
  const parsed = await parseJsonBody(c.req, rewriteEmailSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { subject, body: emailBody, action } = parsed.data;

  if (!REWRITE_ACTIONS.has(action)) {
    return c.json({ error: "subject, body, and action (softer|firmer|shorter) are required." }, 400);
  }

  try {
    const draft = await rewriteFollowUpEmail(c.env, { subject, body: emailBody, action });
    return c.json(draft);
  } catch (err) {
    console.error("rewriteFollowUpEmail failed", err);
    return c.json({ error: "Could not rewrite the draft right now. Please try again." }, 502);
  }
});

emails.post("/generate-thank-you", requirePaidAccount, async (c) => {
  const acc = c.get("account")!;
  const parsed = await parseJsonBody(c.req, thankYouSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { client_name: clientName, invoice_amount: invoiceAmount } = parsed.data;
  try {
    const draft = await generateThankYouEmail(c.env, { clientName, invoiceAmount });
    c.executionCtx.waitUntil(
      dispatchWebhooks(c.env, acc.workspaceId, "chase.thank_you", {
        client_name: clientName,
        invoice_amount: invoiceAmount,
        subject: draft.subject,
      }).catch(() => {})
    );
    return c.json(draft);
  } catch (err) {
    console.error("generateThankYouEmail failed", err);
    return c.json({ error: "Could not generate a thank-you draft right now." }, 502);
  }
});

emails.post("/generate-reply", requirePaidAccount, async (c) => {
  const acc = c.get("account")!;
  const parsed = await parseJsonBody(c.req, replyEmailSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const {
    client_name: clientName,
    invoice_amount: invoiceAmount,
    days_overdue: daysOverdue,
    client_message: clientMessage,
  } = parsed.data;
  try {
    const draft = await generateReplyEmail(c.env, {
      clientName,
      invoiceAmount,
      daysOverdue,
      clientMessage,
    });
    c.executionCtx.waitUntil(
      dispatchWebhooks(c.env, acc.workspaceId, "chase.reply_drafted", {
        client_name: clientName,
        invoice_amount: invoiceAmount,
        days_overdue: daysOverdue,
        subject: draft.subject,
      }).catch(() => {})
    );
    return c.json(draft);
  } catch (err) {
    console.error("generateReplyEmail failed", err);
    return c.json({ error: "Could not generate a reply draft right now." }, 502);
  }
});

emails.post("/generate-sequence", requirePaidAccount, async (c) => {
  const acc = c.get("account")!;
  const parsed = await parseJsonBody(c.req, sequenceEmailSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const {
    client_name: clientName,
    invoice_amount: invoiceAmount,
    days_overdue: daysOverdue,
    aging_invoice_id,
  } = parsed.data;
  try {
    const lateFeeHint = await loadLateFeeHint(c.env, acc.workspaceId);
    const sequence = await generateChaseSequence(c.env, { clientName, invoiceAmount, daysOverdue });
    const reminders = await replaceSequenceReminders(c.env, acc.workspaceId, {
      agingInvoiceId: aging_invoice_id ?? null,
      clientName,
      steps: sequence.steps,
    });
    c.executionCtx.waitUntil(
      dispatchWebhooks(c.env, acc.workspaceId, "chase.sequence_planned", {
        client_name: clientName,
        invoice_amount: invoiceAmount,
        days_overdue: daysOverdue,
        steps: sequence.steps.length,
      }).catch(() => {})
    );
    return c.json({ ...sequence, reminders, lateFeeHint: lateFeeHint ?? null });
  } catch (err) {
    console.error("generateChaseSequence failed", err);
    return c.json({ error: "Could not generate a chase sequence right now." }, 502);
  }
});

emails.post("/generate-sms", requirePaidAccount, async (c) => {
  const acc = c.get("account")!;
  const parsed = await parseJsonBody(c.req, smsEmailSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const {
    client_name: clientName,
    invoice_amount: invoiceAmount,
    days_overdue: daysOverdue,
    phone,
  } = parsed.data;
  try {
    const lateFeeHint = await loadLateFeeHint(c.env, acc.workspaceId);
    const draft = await generateSmsWhatsAppDraft(c.env, {
      clientName,
      invoiceAmount,
      daysOverdue: Math.max(0, daysOverdue),
      phone,
      lateFeeHint,
    });
    return c.json(draft);
  } catch (err) {
    console.error("generateSmsWhatsAppDraft failed", err);
    return c.json({ error: "Could not generate SMS / WhatsApp drafts right now." }, 502);
  }
});

emails.post("/generate-reply-smart", requireProAccount, async (c) => {
  const acc = c.get("account")!;
  const parsed = await parseJsonBody(c.req, replyClassifySchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const {
    client_name: clientName,
    invoice_amount: invoiceAmount,
    days_overdue: daysOverdue,
    client_message: clientMessageInput,
    client_email: clientEmail,
    fetch_from_gmail: fetchFromGmail,
    payment_link: paymentLink,
    aging_invoice_id: agingInvoiceId,
  } = parsed.data;
  let clientMessage = clientMessageInput?.trim() ?? "";
  if (!clientMessage && fetchFromGmail) {
    try {
      const { findLatestClientReply, isGoogleConnected } = await import("../lib/googleIntegrations");
      if (!(await isGoogleConnected(c.env, acc.workspaceId))) {
        return c.json(
          {
            error:
              "Google is not connected. Connect Google on Connectors first, or paste the client reply manually.",
          },
          400
        );
      }
      const found = await findLatestClientReply(c.env, acc.workspaceId, {
        clientEmail: clientEmail ?? null,
        clientName,
      });
      if (!found.found || !found.snippet?.trim()) {
        return c.json(
          { error: "No recent inbox reply found for this client. Paste their message instead." },
          404
        );
      }
      clientMessage = found.snippet.trim();
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Gmail lookup failed" }, 502);
    }
  }
  if (!clientMessage) {
    return c.json({ error: "Paste the client reply or use Smart reply from Gmail." }, 400);
  }
  try {
    const draft = await classifyAndReplyEmail(c.env, {
      clientName,
      invoiceAmount,
      daysOverdue,
      clientMessage,
      paymentLink,
    });
    c.executionCtx.waitUntil(
      recordChaseEvent(c.env, acc.workspaceId, {
        agingInvoiceId: agingInvoiceId ?? null,
        clientName,
        eventType: "reply_detected",
        channel: "email",
        subject: draft.subject,
        body: draft.body,
        metadata: {
          classification: draft.classification,
          summary: draft.summary,
          promisedPayDate: draft.promisedPayDate,
        },
        actor: { accountId: acc.id, email: acc.email, role: acc.role },
      }).catch(() => {})
    );
    c.executionCtx.waitUntil(
      dispatchWebhooks(c.env, acc.workspaceId, "chase.reply_drafted", {
        client_name: clientName,
        classification: draft.classification,
        subject: draft.subject,
        promised_pay_date: draft.promisedPayDate,
      }).catch(() => {})
    );
    return c.json(draft);
  } catch (err) {
    console.error("classifyAndReplyEmail failed", err);
    return c.json({ error: "Could not classify and draft a reply right now." }, 502);
  }
});

async function handleDemandLetter(c: Context<AuthEnv>) {
  const parsed = await parseJsonBody(c.req, demandLetterSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const body = parsed.data;
  try {
    const result = await generateDemandLetterHtml(c.env, {
      clientName: body.client_name,
      clientAddress: body.client_address,
      invoiceNumber: body.invoice_number,
      invoiceAmount: body.invoice_amount,
      dueDate: body.due_date,
      daysOverdue: body.days_overdue,
      letterLevel: body.letter_level ?? body.mahnung_level,
      senderName: body.sender_name,
      senderAddress: body.sender_address,
      paymentLink: body.payment_link,
    });
    return c.json(result);
  } catch (err) {
    console.error("generateDemandLetterHtml failed", err);
    return c.json({ error: "Could not generate demand letter right now." }, 502);
  }
}

emails.post("/generate-demand-letter", requireProAccount, handleDemandLetter);
/** @deprecated Use /generate-demand-letter */
emails.post("/generate-mahnung", requireProAccount, handleDemandLetter);

export default emails;
