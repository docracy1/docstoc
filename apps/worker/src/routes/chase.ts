import { Hono } from "hono";
import { requirePaidAccount, type AuthEnv } from "../lib/auth";
import { listChaseEvents, recordChaseEvent } from "../lib/chaseEvents";
import { consumeApprovedSend, getApprovedSendForInvoice, getSoxSettings } from "../lib/sox";
import { chaseEventSchema, parseJsonBody } from "../lib/schemas";

const chase = new Hono<AuthEnv>();

chase.get("/events", requirePaidAccount, async (c) => {
  const acc = c.get("account")!;
  const agingInvoiceId = c.req.query("invoiceId") ?? undefined;
  const clientName = c.req.query("clientName") ?? undefined;
  const limit = c.req.query("limit") ? Number(c.req.query("limit")) : 50;
  const events = await listChaseEvents(c.env, acc.workspaceId, {
    agingInvoiceId,
    clientName,
    limit: Number.isFinite(limit) ? limit : 50,
  });
  return c.json({ events });
});

chase.post("/events", requirePaidAccount, async (c) => {
  const acc = c.get("account")!;
  const parsed = await parseJsonBody(c.req, chaseEventSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const body = parsed.data;
  const settings = await getSoxSettings(c.env, acc.workspaceId);
  const sendLike =
    body.eventType === "sent" || body.eventType === "copied" || body.eventType === "mailto";
  if (settings.sodRequired && sendLike && body.agingInvoiceId) {
    const approved = await getApprovedSendForInvoice(c.env, acc.workspaceId, body.agingInvoiceId);
    if (!approved) {
      return c.json(
        {
          error:
            "Maker-checker is enabled: request and receive send approval before marking this chase as sent.",
          code: "sox_approval_required",
        },
        403
      );
    }
  }

  const event = await recordChaseEvent(c.env, acc.workspaceId, {
    agingInvoiceId: body.agingInvoiceId,
    clientName: body.clientName,
    eventType: body.eventType,
    channel: body.channel,
    subject: body.subject,
    body: body.body,
    metadata: body.metadata,
    actor: { accountId: acc.id, email: acc.email, role: acc.role },
  });

  if (settings.sodRequired && sendLike && body.agingInvoiceId) {
    await consumeApprovedSend(c.env, acc.workspaceId, body.agingInvoiceId, {
      accountId: acc.id,
      email: acc.email,
      role: acc.role,
    }).catch((err) => console.error("SOX approval consume failed:", err));
  }

  return c.json({ event });
});

export default chase;
