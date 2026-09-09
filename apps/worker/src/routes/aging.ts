import { Hono } from "hono";
import { requirePaidAccount, requireProAccount, type AuthEnv } from "../lib/auth";
import { recordChaseEvent, listChaseEvents, type ChaseActor } from "../lib/chaseEvents";
import { recordClientPaymentOutcome } from "../lib/clientRisk";
import { generateEvidencePackHtml } from "../lib/evidencePack";
import { trackEvent } from "../lib/analytics";
import { requestAppOrigin } from "../lib/appUrl";
import { createInvoice, isSuccessfulPaymentStatus, verifyIpn } from "../lib/billingProviders/nowpayments";
import {
  agingChaseSchema,
  agingMarkPaidSchema,
  agingSyncSchema,
  parseJsonBody,
} from "../lib/schemas";
import type { Env } from "../types";

const aging = new Hono<AuthEnv>();

type AgingRow = {
  id: string;
  client_id: string | null;
  client_name: string;
  amount: number;
  due_date: string;
  status: string;
  paid_at: string | null;
  last_chase_status: string | null;
  last_chase_at: string | null;
  payment_method: string | null;
  payment_url: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: AgingRow) {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.client_name,
    amount: row.amount,
    dueDate: row.due_date,
    status: row.status ?? "open",
    paidAt: row.paid_at,
    lastChaseStatus: row.last_chase_status,
    lastChaseAt: row.last_chase_at,
    paymentMethod: row.payment_method,
    paymentUrl: row.payment_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Shared "this invoice is now paid" side effects — used by both the manual mark-paid route
 * (sender clicks a button) and the NOWPayments IPN webhook (payer's crypto payment confirms).
 * Records the chase event, tracks analytics, updates client risk, and skips remaining reminders.
 * Returns null if the invoice doesn't exist or is already paid (idempotent — a webhook can retry).
 */
async function markAgingInvoicePaid(
  env: Env,
  ctx: { waitUntil(promise: Promise<unknown>): void },
  accountId: string,
  id: string,
  opts: { note?: string | null; actor?: ChaseActor | null } = {}
): Promise<{ paidAt: string; daysLate: number } | null> {
  const row = await env.CHASA_DB.prepare(
    `SELECT client_id, client_name, due_date, status FROM aging_invoices WHERE id = ? AND account_id = ?`
  )
    .bind(id, accountId)
    .first<{ client_id: string | null; client_name: string; due_date: string; status: string }>();

  if (!row || row.status === "paid") return null;

  const now = new Date().toISOString();
  const daysLate = daysBetweenDueAndToday(row.due_date);

  await env.CHASA_DB.prepare(
    `UPDATE aging_invoices SET status = 'paid', paid_at = ?, updated_at = ?, last_chase_status = 'paid'
     WHERE id = ? AND account_id = ?`
  )
    .bind(now, now, id, accountId)
    .run();

  await recordChaseEvent(env, accountId, {
    agingInvoiceId: id,
    clientName: row.client_name,
    eventType: "marked_paid",
    channel: "system",
    metadata: { note: opts.note ?? null, daysLate },
    actor: opts.actor ?? null,
  });

  ctx.waitUntil(
    trackEvent(env, {
      name: "chase_completed",
      accountId,
      path: "/api/aging/mark-paid",
    }).catch(() => {})
  );

  if (row.client_id) {
    await recordClientPaymentOutcome(env, accountId, row.client_id, {
      daysLate,
      markedPaid: true,
    });
  }

  // Skip remaining planned reminders for this invoice
  await env.CHASA_DB.prepare(
    `UPDATE chase_reminders SET status = 'skipped', updated_at = ?
     WHERE account_id = ? AND aging_invoice_id = ? AND status = 'planned'`
  )
    .bind(now, accountId, id)
    .run();

  return { paidAt: now, daysLate };
}

async function resolveClientIds(
  db: D1Database,
  accountId: string,
  names: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  const map = new Map<string, string>();

  const { results } = await db
    .prepare(`SELECT id, name FROM clients WHERE account_id = ?`)
    .bind(accountId)
    .all<{ id: string; name: string }>();

  for (const row of results ?? []) {
    map.set(row.name.toLowerCase(), row.id);
  }

  const now = new Date().toISOString();
  const inserts: D1PreparedStatement[] = [];
  for (const name of unique) {
    const key = name.toLowerCase();
    if (map.has(key)) continue;
    const id = crypto.randomUUID();
    map.set(key, id);
    inserts.push(
      db.prepare(
        `INSERT INTO clients (id, account_id, name, email, notes, created_at, updated_at)
         VALUES (?, ?, ?, NULL, NULL, ?, ?)`
      ).bind(id, accountId, name, now, now)
    );
  }

  if (inserts.length > 0) {
    await db.batch(inserts);
  }

  return map;
}

function daysBetweenDueAndToday(dueDate: string): number {
  const due = new Date(`${dueDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - due.getTime()) / 86400000));
}

aging.get("/", requirePaidAccount, async (c) => {
  const acc = c.get("account")!;
  const status = c.req.query("status");
  let sql = `SELECT id, client_id, client_name, amount, due_date, status, paid_at,
                    last_chase_status, last_chase_at, payment_method, payment_url,
                    created_at, updated_at
             FROM aging_invoices WHERE account_id = ?`;
  const binds: unknown[] = [acc.workspaceId];
  if (status === "open" || status === "paid") {
    sql += ` AND status = ?`;
    binds.push(status);
  }
  sql += ` ORDER BY due_date ASC`;

  const { results } = await c.env.CHASA_DB.prepare(sql).bind(...binds).all<AgingRow>();
  return c.json({ invoices: (results ?? []).map(mapRow) });
});

aging.put("/sync", requirePaidAccount, async (c) => {
  const acc = c.get("account")!;
  const parsed = await parseJsonBody(c.req, agingSyncSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  const { invoices: items, replace } = parsed.data;
  const now = new Date().toISOString();
  const clientMap = await resolveClientIds(
    c.env.CHASA_DB,
    acc.workspaceId,
    items.map((i) => i.clientName)
  );

  const stmts: D1PreparedStatement[] = [];
  if (replace === true) {
    stmts.push(
      c.env.CHASA_DB.prepare(`DELETE FROM aging_invoices WHERE account_id = ?`).bind(acc.workspaceId)
    );
  }

  const saved: ReturnType<typeof mapRow>[] = [];

  for (const item of items) {
    const clientId = clientMap.get(item.clientName.toLowerCase())!;
    const id = item.id?.trim() ? item.id.trim() : crypto.randomUUID();
    const chaseStatus = item.lastChaseStatus?.trim() ? item.lastChaseStatus.trim().slice(0, 40) : null;
    const chaseAt = item.lastChaseAt?.trim() ? item.lastChaseAt.trim() : null;
    const invStatus = item.status === "paid" ? "paid" : "open";
    const paidAt = invStatus === "paid" ? item.paidAt?.trim() || now : null;

    stmts.push(
      c.env.CHASA_DB.prepare(
        `INSERT INTO aging_invoices
           (id, account_id, client_id, client_name, amount, due_date, status, paid_at,
            last_chase_status, last_chase_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           client_id = excluded.client_id,
           client_name = excluded.client_name,
           amount = excluded.amount,
           due_date = excluded.due_date,
           status = COALESCE(excluded.status, aging_invoices.status),
           paid_at = COALESCE(excluded.paid_at, aging_invoices.paid_at),
           last_chase_status = COALESCE(excluded.last_chase_status, aging_invoices.last_chase_status),
           last_chase_at = COALESCE(excluded.last_chase_at, aging_invoices.last_chase_at),
           updated_at = excluded.updated_at
         WHERE aging_invoices.account_id = excluded.account_id`
      ).bind(
        id,
        acc.workspaceId,
        clientId,
        item.clientName,
        item.amount,
        item.dueDate,
        invStatus,
        paidAt,
        chaseStatus,
        chaseAt,
        now,
        now
      )
    );

    saved.push(
      mapRow({
        id,
        client_id: clientId,
        client_name: item.clientName,
        amount: item.amount,
        due_date: item.dueDate,
        status: invStatus,
        paid_at: paidAt,
        last_chase_status: chaseStatus,
        last_chase_at: chaseAt,
        // Sync never touches these — the DB's ON CONFLICT clause leaves them alone too — so an
        // existing row's crypto invoice (if any) is momentarily not reflected in this response;
        // it's correct again on the next list fetch.
        payment_method: null,
        payment_url: null,
        created_at: now,
        updated_at: now,
      })
    );
  }

  if (stmts.length > 0) {
    await c.env.CHASA_DB.batch(stmts);
  }

  return c.json({ invoices: saved, synced: saved.length });
});

aging.patch("/:id/chase", requirePaidAccount, async (c) => {
  const acc = c.get("account")!;
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c.req, agingChaseSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  const status = parsed.data.status?.trim() ? parsed.data.status.trim().slice(0, 40) : "drafted";
  const now = new Date().toISOString();

  const row = await c.env.CHASA_DB.prepare(
    `SELECT client_name FROM aging_invoices WHERE id = ? AND account_id = ?`
  )
    .bind(id, acc.workspaceId)
    .first<{ client_name: string }>();

  if (!row) return c.json({ error: "Invoice not found" }, 404);

  if (status === "sent") {
    const { consumeApprovedSend, getApprovedSendForInvoice, getSoxSettings } = await import("../lib/sox");
    const settings = await getSoxSettings(c.env, acc.workspaceId);
    if (settings.sodRequired) {
      const approved = await getApprovedSendForInvoice(c.env, acc.workspaceId, id);
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

    await c.env.CHASA_DB.prepare(
      `UPDATE aging_invoices SET last_chase_status = ?, last_chase_at = ?, updated_at = ?
       WHERE id = ? AND account_id = ?`
    )
      .bind(status, now, now, id, acc.workspaceId)
      .run();

    await recordChaseEvent(c.env, acc.workspaceId, {
      agingInvoiceId: id,
      clientName: row.client_name,
      eventType: "sent",
      channel: "email",
      metadata: { lastChaseStatus: status },
      actor: { accountId: acc.id, email: acc.email, role: acc.role },
    });

    if (settings.sodRequired) {
      await consumeApprovedSend(c.env, acc.workspaceId, id, {
        accountId: acc.id,
        email: acc.email,
        role: acc.role,
      }).catch((err) => console.error("SOX approval consume failed:", err));
    }

    return c.json({ ok: true, lastChaseStatus: status, lastChaseAt: now });
  }

  await c.env.CHASA_DB.prepare(
    `UPDATE aging_invoices SET last_chase_status = ?, last_chase_at = ?, updated_at = ?
     WHERE id = ? AND account_id = ?`
  )
    .bind(status, now, now, id, acc.workspaceId)
    .run();

  await recordChaseEvent(c.env, acc.workspaceId, {
    agingInvoiceId: id,
    clientName: row.client_name,
    eventType: "drafted",
    channel: "email",
    metadata: { lastChaseStatus: status },
    actor: { accountId: acc.id, email: acc.email, role: acc.role },
  });

  return c.json({ ok: true, lastChaseStatus: status, lastChaseAt: now });
});

aging.post("/:id/mark-paid", requirePaidAccount, async (c) => {
  const acc = c.get("account")!;
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c.req, agingMarkPaidSchema);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  const result = await markAgingInvoicePaid(c.env, c.executionCtx, acc.workspaceId, id, {
    note: parsed.data.note ?? null,
    actor: { accountId: acc.id, email: acc.email, role: acc.role },
  });
  if (!result) return c.json({ error: "Invoice not found" }, 404);

  return c.json({ ok: true, ...result });
});

aging.post("/:id/crypto-invoice", requirePaidAccount, async (c) => {
  const acc = c.get("account")!;
  const id = c.req.param("id");

  const row = await c.env.CHASA_DB.prepare(
    `SELECT client_name, amount, status, payment_url FROM aging_invoices WHERE id = ? AND account_id = ?`
  )
    .bind(id, acc.workspaceId)
    .first<{ client_name: string; amount: number; status: string; payment_url: string | null }>();

  if (!row) return c.json({ error: "Invoice not found" }, 404);
  if (row.status === "paid") return c.json({ error: "Invoice is already marked paid" }, 400);
  // Re-serve the existing invoice rather than minting a new one on every click — NOWPayments
  // invoices don't expire on a useful timescale for this flow, and the amount/order id are fixed
  // to this row anyway.
  if (row.payment_url) return c.json({ url: row.payment_url });

  const appOrigin = requestAppOrigin(c);
  const invoice = await createInvoice({
    env: c.env,
    orderId: id,
    priceAmount: row.amount,
    description: `Invoice for ${row.client_name}`,
    successUrl: `${appOrigin}/app?crypto=success`,
    cancelUrl: `${appOrigin}/app?crypto=cancelled`,
    ipnCallbackUrl: `${c.env.PUBLIC_WORKER_URL}/api/aging/${id}/nowpayments-webhook`,
  });
  if ("error" in invoice) {
    return c.json({ error: "Couldn't set up crypto payment for this invoice. Please try again." }, 502);
  }

  await c.env.CHASA_DB.prepare(
    `UPDATE aging_invoices SET payment_method = 'crypto', payment_url = ?, updated_at = ?
     WHERE id = ? AND account_id = ?`
  )
    .bind(invoice.invoiceUrl, new Date().toISOString(), id, acc.workspaceId)
    .run();

  return c.json({ url: invoice.invoiceUrl });
});

// NOWPayments IPN callback — the invoice/order id (= this aging_invoices row's id) is embedded in
// the per-invoice callback URL set above, so no separate correlation lookup is needed. No auth:
// the signature check IS the auth, and this always returns 200 so NOWPayments doesn't retry
// forever over an event we don't act on (e.g. "waiting"/"confirming", not yet a terminal status).
aging.post("/:id/nowpayments-webhook", async (c) => {
  const id = c.req.param("id");
  const rawBody = await c.req.text();
  const signature = c.req.header("x-nowpayments-sig");
  const event = await verifyIpn(rawBody, signature ?? null, c.env);
  if (event && isSuccessfulPaymentStatus(event.payment_status)) {
    const row = await c.env.CHASA_DB.prepare(`SELECT account_id FROM aging_invoices WHERE id = ?`)
      .bind(id)
      .first<{ account_id: string }>();
    if (row) {
      await markAgingInvoicePaid(c.env, c.executionCtx, row.account_id, id, { note: "Paid via NOWPayments crypto invoice" });
    }
  }
  return c.json({ ok: true });
});

aging.get("/:id/timeline", requirePaidAccount, async (c) => {
  const acc = c.get("account")!;
  const events = await listChaseEvents(c.env, acc.workspaceId, {
    agingInvoiceId: c.req.param("id"),
    limit: 100,
  });
  return c.json({ events });
});

aging.get("/:id/evidence-pack", requireProAccount, async (c) => {
  const acc = c.get("account")!;
  const result = await generateEvidencePackHtml(c.env, acc.workspaceId, c.req.param("id"));
  if (!result) return c.json({ error: "Invoice not found" }, 404);
  return c.json({ html: result.html, clientName: result.clientName });
});

aging.delete("/:id", requirePaidAccount, async (c) => {
  const acc = c.get("account")!;
  const result = await c.env.CHASA_DB.prepare(
    `DELETE FROM aging_invoices WHERE id = ? AND account_id = ?`
  )
    .bind(c.req.param("id"), acc.workspaceId)
    .run();
  if (!result.meta.changes) return c.json({ error: "Invoice not found" }, 404);
  return c.json({ ok: true });
});

export default aging;
