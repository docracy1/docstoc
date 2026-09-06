import { Hono } from "hono";
import { requirePaidAccount, requireProAccount, type AuthEnv } from "../lib/auth";
import { recordChaseEvent, listChaseEvents } from "../lib/chaseEvents";
import { recordClientPaymentOutcome } from "../lib/clientRisk";
import { generateEvidencePackHtml } from "../lib/evidencePack";
import { trackEvent } from "../lib/analytics";
import {
  agingChaseSchema,
  agingMarkPaidSchema,
  agingSyncSchema,
  parseJsonBody,
} from "../lib/schemas";

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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
                    last_chase_status, last_chase_at, created_at, updated_at
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

  const row = await c.env.CHASA_DB.prepare(
    `SELECT client_id, client_name, due_date FROM aging_invoices WHERE id = ? AND account_id = ?`
  )
    .bind(id, acc.workspaceId)
    .first<{ client_id: string | null; client_name: string; due_date: string }>();

  if (!row) return c.json({ error: "Invoice not found" }, 404);

  const now = new Date().toISOString();
  const daysLate = daysBetweenDueAndToday(row.due_date);

  await c.env.CHASA_DB.prepare(
    `UPDATE aging_invoices SET status = 'paid', paid_at = ?, updated_at = ?, last_chase_status = 'paid'
     WHERE id = ? AND account_id = ?`
  )
    .bind(now, now, id, acc.workspaceId)
    .run();

  await recordChaseEvent(c.env, acc.workspaceId, {
    agingInvoiceId: id,
    clientName: row.client_name,
    eventType: "marked_paid",
    channel: "system",
    metadata: { note: parsed.data.note ?? null, daysLate },
    actor: { accountId: acc.id, email: acc.email, role: acc.role },
  });

  c.executionCtx.waitUntil(
    trackEvent(c.env, {
      name: "chase_completed",
      accountId: acc.workspaceId,
      path: "/api/aging/mark-paid",
    }).catch(() => {})
  );

  if (row.client_id) {
    await recordClientPaymentOutcome(c.env, acc.workspaceId, row.client_id, {
      daysLate,
      markedPaid: true,
    });
  }

  // Skip remaining planned reminders for this invoice
  await c.env.CHASA_DB.prepare(
    `UPDATE chase_reminders SET status = 'skipped', updated_at = ?
     WHERE account_id = ? AND aging_invoice_id = ? AND status = 'planned'`
  )
    .bind(now, acc.workspaceId, id)
    .run();

  return c.json({ ok: true, paidAt: now, daysLate });
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
