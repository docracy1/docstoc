import type { Env } from "../types";
import { listAuditAnchors } from "./auditLog";
import { trackingStatsForInvoices } from "./chaseTracking";
import { checkUpgrade, OTS_STALE_MS, submitTimestamp } from "./openTimestamps";

export type SoxActor = {
  accountId: string;
  email: string;
  role: "admin" | "member";
};

export type SoxAuditEvent = {
  id: string;
  actorAccountId: string | null;
  actorEmail: string;
  actorRole: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
};

export type SoxSendApproval = {
  id: string;
  agingInvoiceId: string;
  clientName: string;
  subject: string | null;
  bodyPreview: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requestedByEmail: string;
  decidedByEmail: string | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type SoxSettings = {
  sodRequired: boolean;
  retentionDays: number;
  legalHold: boolean;
  retentionEnforced: boolean;
  updatedAt: string | null;
  updatedByEmail: string | null;
};

export type SoxControl = {
  id: string;
  controlKey: string;
  title: string;
  description: string | null;
  frequency: string;
  ownerEmail: string | null;
  status: "active" | "retired";
  createdAt: string;
  lastTest: SoxControlTest | null;
};

export type SoxControlTest = {
  id: string;
  controlId: string;
  periodStart: string;
  periodEnd: string;
  result: "pass" | "fail" | "exception";
  notes: string | null;
  testedByEmail: string;
  evidencePackId: string | null;
  testedAt: string;
};

export type SoxRetentionStatus = {
  cutoffIso: string;
  chaseEventsPastRetention: number;
  auditEventsPastRetention: number;
  legalHold: boolean;
  retentionEnforced: boolean;
  retentionDays: number;
};

export type SoxControlStatus = {
  id: string;
  title: string;
  status: "ready" | "partial" | "missing";
  detail: string;
};

export type SoxOverview = {
  settings: SoxSettings;
  controls: SoxControlStatus[];
  pendingApprovals: number;
  recentAuditCount: number;
  anchorCount: number;
  confirmedAnchors: number;
  certificateCount: number;
  chaseEventCount30d: number;
  retention: SoxRetentionStatus;
  controlLibraryCount: number;
  controlTests30d: number;
};

type AuditRow = {
  id: string;
  actor_account_id: string | null;
  actor_email: string;
  actor_role: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  summary: string;
  metadata: string | null;
  ip: string | null;
  created_at: string;
};

type ApprovalRow = {
  id: string;
  aging_invoice_id: string;
  client_name: string;
  subject: string | null;
  body_preview: string | null;
  status: string;
  requested_by_email: string;
  decided_by_email: string | null;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
};

function mapAudit(row: AuditRow): SoxAuditEvent {
  let metadata: Record<string, unknown> | null = null;
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }
  return {
    id: row.id,
    actorAccountId: row.actor_account_id,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    summary: row.summary,
    metadata,
    ip: row.ip,
    createdAt: row.created_at,
  };
}

function mapApproval(row: ApprovalRow): SoxSendApproval {
  return {
    id: row.id,
    agingInvoiceId: row.aging_invoice_id,
    clientName: row.client_name,
    subject: row.subject,
    bodyPreview: row.body_preview,
    status: row.status as SoxSendApproval["status"],
    requestedByEmail: row.requested_by_email,
    decidedByEmail: row.decided_by_email,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

export async function recordSoxAuditEvent(
  env: Env,
  accountId: string,
  actor: SoxActor,
  input: {
    action: string;
    summary: string;
    resourceType?: string | null;
    resourceId?: string | null;
    metadata?: Record<string, unknown> | null;
    ip?: string | null;
  }
): Promise<SoxAuditEvent> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const metadata = input.metadata ? JSON.stringify(input.metadata) : null;
  await env.CHASA_DB.prepare(
    `INSERT INTO sox_audit_events
       (id, account_id, actor_account_id, actor_email, actor_role, action, resource_type, resource_id, summary, metadata, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      accountId,
      actor.accountId,
      actor.email.slice(0, 254),
      actor.role,
      input.action.slice(0, 80),
      input.resourceType?.slice(0, 80) ?? null,
      input.resourceId?.slice(0, 80) ?? null,
      input.summary.slice(0, 500),
      metadata,
      input.ip?.slice(0, 80) ?? null,
      now
    )
    .run();

  return {
    id,
    actorAccountId: actor.accountId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: input.action,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    summary: input.summary,
    metadata: input.metadata ?? null,
    ip: input.ip ?? null,
    createdAt: now,
  };
}

export async function listSoxAuditEvents(
  env: Env,
  accountId: string,
  opts: { limit?: number; action?: string } = {}
): Promise<SoxAuditEvent[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  let sql = `SELECT id, actor_account_id, actor_email, actor_role, action, resource_type, resource_id, summary, metadata, ip, created_at
             FROM sox_audit_events WHERE account_id = ?`;
  const binds: unknown[] = [accountId];
  if (opts.action) {
    sql += ` AND action = ?`;
    binds.push(opts.action);
  }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  binds.push(limit);
  const { results } = await env.CHASA_DB.prepare(sql).bind(...binds).all<AuditRow>();
  return (results ?? []).map(mapAudit);
}

export async function getSoxSettings(env: Env, accountId: string): Promise<SoxSettings> {
  const row = await env.CHASA_DB.prepare(
    `SELECT sod_required, retention_days, legal_hold, retention_enforced, updated_at, updated_by_email
     FROM sox_settings WHERE account_id = ?`
  )
    .bind(accountId)
    .first<{
      sod_required: number;
      retention_days: number;
      legal_hold: number | null;
      retention_enforced: number | null;
      updated_at: string;
      updated_by_email: string | null;
    }>();
  if (!row) {
    return {
      sodRequired: false,
      retentionDays: 2555,
      legalHold: false,
      retentionEnforced: false,
      updatedAt: null,
      updatedByEmail: null,
    };
  }
  return {
    sodRequired: row.sod_required === 1,
    retentionDays: row.retention_days,
    legalHold: row.legal_hold === 1,
    retentionEnforced: row.retention_enforced === 1,
    updatedAt: row.updated_at,
    updatedByEmail: row.updated_by_email,
  };
}

export async function updateSoxSettings(
  env: Env,
  accountId: string,
  actor: SoxActor,
  input: {
    sodRequired?: boolean;
    retentionDays?: number;
    legalHold?: boolean;
    retentionEnforced?: boolean;
  },
  ip?: string | null
): Promise<SoxSettings> {
  const current = await getSoxSettings(env, accountId);
  const sodRequired = input.sodRequired ?? current.sodRequired;
  const retentionDays = Math.min(Math.max(input.retentionDays ?? current.retentionDays, 90), 3650);
  const legalHold = input.legalHold ?? current.legalHold;
  const retentionEnforced = input.retentionEnforced ?? current.retentionEnforced;
  const now = new Date().toISOString();
  await env.CHASA_DB.prepare(
    `INSERT INTO sox_settings
       (account_id, sod_required, retention_days, legal_hold, retention_enforced, updated_at, updated_by_email)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(account_id) DO UPDATE SET
       sod_required = excluded.sod_required,
       retention_days = excluded.retention_days,
       legal_hold = excluded.legal_hold,
       retention_enforced = excluded.retention_enforced,
       updated_at = excluded.updated_at,
       updated_by_email = excluded.updated_by_email`
  )
    .bind(
      accountId,
      sodRequired ? 1 : 0,
      retentionDays,
      legalHold ? 1 : 0,
      retentionEnforced ? 1 : 0,
      now,
      actor.email
    )
    .run();

  await recordSoxAuditEvent(env, accountId, actor, {
    action: "sox.settings_updated",
    summary: `SOX settings updated (SoD ${sodRequired ? "on" : "off"}, retention ${retentionDays}d, hold ${
      legalHold ? "on" : "off"
    }, enforce ${retentionEnforced ? "on" : "off"})`,
    resourceType: "sox_settings",
    resourceId: accountId,
    metadata: { sodRequired, retentionDays, legalHold, retentionEnforced },
    ip,
  });

  return {
    sodRequired,
    retentionDays,
    legalHold,
    retentionEnforced,
    updatedAt: now,
    updatedByEmail: actor.email,
  };
}

export async function createSendApproval(
  env: Env,
  accountId: string,
  actor: SoxActor,
  input: {
    agingInvoiceId: string;
    clientName: string;
    subject?: string | null;
    body?: string | null;
  },
  ip?: string | null
): Promise<SoxSendApproval> {
  const inv = await env.CHASA_DB.prepare(
    `SELECT id, client_name FROM aging_invoices WHERE id = ? AND account_id = ?`
  )
    .bind(input.agingInvoiceId, accountId)
    .first<{ id: string; client_name: string }>();
  if (!inv) throw new Error("Invoice not found");

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const bodyPreview = input.body ? input.body.slice(0, 280) : null;
  await env.CHASA_DB.prepare(
    `INSERT INTO sox_send_approvals
       (id, account_id, aging_invoice_id, client_name, subject, body_preview, status,
        requested_by_account_id, requested_by_email, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
  )
    .bind(
      id,
      accountId,
      inv.id,
      inv.client_name.slice(0, 120),
      input.subject?.slice(0, 200) ?? null,
      bodyPreview,
      actor.accountId,
      actor.email,
      now
    )
    .run();

  await recordSoxAuditEvent(env, accountId, actor, {
    action: "sox.approval_requested",
    summary: `Send approval requested for ${inv.client_name}`,
    resourceType: "sox_send_approval",
    resourceId: id,
    metadata: { agingInvoiceId: inv.id },
    ip,
  });

  // Notify other workspace admins/members (maker-checker needs a second person).
  void notifySoxApprovalRequest(env, accountId, {
    approvalId: id,
    clientName: inv.client_name,
    requestedByEmail: actor.email,
    subject: input.subject?.slice(0, 200) ?? null,
  }).catch((err) => console.error("SOX approval notify failed:", err));

  return {
    id,
    agingInvoiceId: inv.id,
    clientName: inv.client_name,
    subject: input.subject?.slice(0, 200) ?? null,
    bodyPreview,
    status: "pending",
    requestedByEmail: actor.email,
    decidedByEmail: null,
    decisionNote: null,
    createdAt: now,
    decidedAt: null,
  };
}

async function notifySoxApprovalRequest(
  env: Env,
  accountId: string,
  input: {
    approvalId: string;
    clientName: string;
    requestedByEmail: string;
    subject: string | null;
  }
): Promise<void> {
  const { sendSoxApprovalRequestEmail } = await import("./email");
  const owner = await env.CHASA_DB.prepare(`SELECT email, locale FROM accounts WHERE id = ?`)
    .bind(accountId)
    .first<{ email: string; locale: string | null }>();
  const { results: members } = await env.CHASA_DB.prepare(
    `SELECT email FROM workspace_members WHERE account_id = ? AND status = 'active'`
  )
    .bind(accountId)
    .all<{ email: string }>();

  const recipients = new Set<string>();
  if (owner?.email) recipients.add(owner.email.toLowerCase());
  for (const m of members ?? []) recipients.add(m.email.toLowerCase());
  recipients.delete(input.requestedByEmail.toLowerCase());

  const locale = owner?.locale === "es" ? "es" : "en";
  for (const to of recipients) {
    await sendSoxApprovalRequestEmail(env, to, {
      clientName: input.clientName,
      requestedByEmail: input.requestedByEmail,
      subject: input.subject,
      locale,
    });
  }
}

export async function consumeApprovedSend(
  env: Env,
  accountId: string,
  invoiceId: string,
  actor: SoxActor
): Promise<void> {
  const approved = await getApprovedSendForInvoice(env, accountId, invoiceId);
  if (!approved) return;
  const now = new Date().toISOString();
  await env.CHASA_DB.prepare(
    `UPDATE sox_send_approvals
     SET status = 'cancelled',
         decision_note = CASE
           WHEN decision_note IS NULL OR decision_note = '' THEN 'Consumed on send'
           ELSE decision_note || ' · Consumed on send'
         END,
         decided_at = COALESCE(decided_at, ?)
     WHERE id = ? AND account_id = ? AND status = 'approved'`
  )
    .bind(now, approved.id, accountId)
    .run();

  await recordSoxAuditEvent(env, accountId, actor, {
    action: "sox.approval_consumed",
    summary: `Approved send consumed for ${approved.clientName}`,
    resourceType: "sox_send_approval",
    resourceId: approved.id,
    metadata: { agingInvoiceId: invoiceId },
  });
}

export async function listSendApprovals(
  env: Env,
  accountId: string,
  opts: { status?: string; limit?: number } = {}
): Promise<SoxSendApproval[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let sql = `SELECT id, aging_invoice_id, client_name, subject, body_preview, status,
                    requested_by_email, decided_by_email, decision_note, created_at, decided_at
             FROM sox_send_approvals WHERE account_id = ?`;
  const binds: unknown[] = [accountId];
  if (opts.status) {
    sql += ` AND status = ?`;
    binds.push(opts.status);
  }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  binds.push(limit);
  const { results } = await env.CHASA_DB.prepare(sql).bind(...binds).all<ApprovalRow>();
  return (results ?? []).map(mapApproval);
}

export async function decideSendApproval(
  env: Env,
  accountId: string,
  actor: SoxActor,
  approvalId: string,
  decision: "approved" | "rejected",
  note?: string | null,
  ip?: string | null
): Promise<SoxSendApproval> {
  const row = await env.CHASA_DB.prepare(
    `SELECT * FROM sox_send_approvals WHERE id = ? AND account_id = ?`
  )
    .bind(approvalId, accountId)
    .first<ApprovalRow & { requested_by_account_id: string; status: string }>();
  if (!row) throw new Error("Approval not found");
  if (row.status !== "pending") throw new Error("Approval is no longer pending");
  if (row.requested_by_account_id === actor.accountId) {
    throw new Error("Maker-checker: the requester cannot approve their own send");
  }

  const now = new Date().toISOString();
  await env.CHASA_DB.prepare(
    `UPDATE sox_send_approvals
     SET status = ?, decided_by_account_id = ?, decided_by_email = ?, decision_note = ?, decided_at = ?
     WHERE id = ? AND account_id = ?`
  )
    .bind(
      decision,
      actor.accountId,
      actor.email,
      note?.slice(0, 500) ?? null,
      now,
      approvalId,
      accountId
    )
    .run();

  await recordSoxAuditEvent(env, accountId, actor, {
    action: decision === "approved" ? "sox.approval_approved" : "sox.approval_rejected",
    summary: `Send ${decision} for ${row.client_name}`,
    resourceType: "sox_send_approval",
    resourceId: approvalId,
    metadata: { note: note ?? null },
    ip,
  });

  return {
    id: row.id,
    agingInvoiceId: row.aging_invoice_id,
    clientName: row.client_name,
    subject: row.subject,
    bodyPreview: row.body_preview,
    status: decision,
    requestedByEmail: row.requested_by_email,
    decidedByEmail: actor.email,
    decisionNote: note?.slice(0, 500) ?? null,
    createdAt: row.created_at,
    decidedAt: now,
  };
}

export async function getApprovedSendForInvoice(
  env: Env,
  accountId: string,
  invoiceId: string
): Promise<SoxSendApproval | null> {
  const row = await env.CHASA_DB.prepare(
    `SELECT id, aging_invoice_id, client_name, subject, body_preview, status,
            requested_by_email, decided_by_email, decision_note, created_at, decided_at
     FROM sox_send_approvals
     WHERE account_id = ? AND aging_invoice_id = ? AND status = 'approved'
     ORDER BY decided_at DESC LIMIT 1`
  )
    .bind(accountId, invoiceId)
    .first<ApprovalRow>();
  return row ? mapApproval(row) : null;
}

export async function getSoxOverview(env: Env, accountId: string): Promise<SoxOverview> {
  const settings = await getSoxSettings(env, accountId);
  const anchors = await listAuditAnchors(env, accountId);
  const confirmedAnchors = anchors.filter((a) => a.otsStatus === "confirmed").length;

  const pendingRow = await env.CHASA_DB.prepare(
    `SELECT COUNT(*) as c FROM sox_send_approvals WHERE account_id = ? AND status = 'pending'`
  )
    .bind(accountId)
    .first<{ c: number }>();

  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const auditRow = await env.CHASA_DB.prepare(
    `SELECT COUNT(*) as c FROM sox_audit_events WHERE account_id = ? AND created_at >= ?`
  )
    .bind(accountId, since30)
    .first<{ c: number }>();

  const chaseRow = await env.CHASA_DB.prepare(
    `SELECT COUNT(*) as c FROM chase_events WHERE account_id = ? AND created_at >= ?`
  )
    .bind(accountId, since30)
    .first<{ c: number }>();

  const certRow = await env.CHASA_DB.prepare(
    `SELECT COUNT(*) as c FROM document_certificates WHERE account_id = ?`
  )
    .bind(accountId)
    .first<{ c: number }>();

  const actorRow = await env.CHASA_DB.prepare(
    `SELECT COUNT(*) as c FROM chase_events WHERE account_id = ? AND actor_email IS NOT NULL AND created_at >= ?`
  )
    .bind(accountId, since30)
    .first<{ c: number }>();

  const memberRow = await env.CHASA_DB.prepare(
    `SELECT COUNT(*) as c FROM workspace_members WHERE account_id = ? AND status = 'active'`
  )
    .bind(accountId)
    .first<{ c: number }>();

  await ensureDefaultSoxControls(env, accountId);
  const retention = await getSoxRetentionStatus(env, accountId);

  const controlLibRow = await env.CHASA_DB.prepare(
    `SELECT COUNT(*) as c FROM sox_controls WHERE account_id = ? AND status = 'active'`
  )
    .bind(accountId)
    .first<{ c: number }>();

  const controlTestRow = await env.CHASA_DB.prepare(
    `SELECT COUNT(*) as c FROM sox_control_tests WHERE account_id = ? AND tested_at >= ?`
  )
    .bind(accountId, since30)
    .first<{ c: number }>();

  const certificateCount = certRow?.c ?? 0;
  const chaseEventCount30d = chaseRow?.c ?? 0;
  const recentAuditCount = auditRow?.c ?? 0;
  const pendingApprovals = pendingRow?.c ?? 0;
  const attributedChase = actorRow?.c ?? 0;
  const teamMembers = memberRow?.c ?? 0;
  const controlLibraryCount = controlLibRow?.c ?? 0;
  const controlTests30d = controlTestRow?.c ?? 0;

  const controls: SoxControlStatus[] = [
    {
      id: "tamper_evidence",
      title: "Tamper-evident document evidence",
      status: certificateCount > 0 ? "ready" : "partial",
      detail:
        certificateCount > 0
          ? `${certificateCount} document certificate(s) with hash / OTS verify links`
          : "Issue a document certificate to establish exportable evidence",
    },
    {
      id: "chase_trail",
      title: "AR chase activity trail",
      status: chaseEventCount30d > 0 ? (attributedChase > 0 ? "ready" : "partial") : "partial",
      detail:
        chaseEventCount30d > 0
          ? `${chaseEventCount30d} chase event(s) in 30d · ${attributedChase} with actor`
          : "Chase activity will appear here once you send reminders",
    },
    {
      id: "hash_anchors",
      title: "Daily Bitcoin hash anchors",
      status: confirmedAnchors > 0 ? "ready" : anchors.length > 0 ? "partial" : "missing",
      detail:
        anchors.length > 0
          ? `${anchors.length} day(s) anchored · ${confirmedAnchors} Bitcoin-confirmed`
          : "Anchors are created automatically after days with chase activity",
    },
    {
      id: "actor_log",
      title: "Attributable audit log",
      status: recentAuditCount > 0 || attributedChase > 0 ? "ready" : "partial",
      detail:
        recentAuditCount > 0
          ? `${recentAuditCount} SOX audit event(s) in 30d`
          : "Actor fields are recorded on new chase events and SOX actions",
    },
    {
      id: "sod",
      title: "Segregation of duties (maker/checker)",
      status: settings.sodRequired ? (teamMembers >= 1 ? "ready" : "partial") : "missing",
      detail: settings.sodRequired
        ? teamMembers >= 1
          ? "Maker-checker enabled · team can approve sends"
          : "SoD on — invite a second user so requests can be approved"
        : "Enable maker-checker in Retention & SoD settings",
    },
    {
      id: "period_export",
      title: "Period evidence export",
      status: "ready",
      detail: "Generate a date-range HTML evidence pack from the Evidence tab",
    },
    {
      id: "retention",
      title: "Retention policy",
      status:
        settings.legalHold
          ? "ready"
          : settings.retentionDays >= 365
            ? settings.retentionEnforced
              ? "ready"
              : "partial"
            : "partial",
      detail: settings.legalHold
        ? `Legal hold on · retention ${settings.retentionDays}d (purge blocked)`
        : `Retention ${settings.retentionDays}d · enforcement ${settings.retentionEnforced ? "on" : "off"}`,
    },
    {
      id: "control_library",
      title: "Control library & period tests",
      status: controlLibraryCount > 0 ? (controlTests30d > 0 ? "ready" : "partial") : "missing",
      detail:
        controlLibraryCount > 0
          ? `${controlLibraryCount} control(s) · ${controlTests30d} test(s) in 30d`
          : "Default AR controls are seeded when you open SOX reporting",
    },
  ];

  return {
    settings,
    controls,
    pendingApprovals,
    recentAuditCount,
    anchorCount: anchors.length,
    confirmedAnchors,
    certificateCount,
    chaseEventCount30d,
    retention,
    controlLibraryCount,
    controlTests30d,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatUsDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }) + " UTC";
  } catch {
    return iso;
  }
}

export async function generatePeriodEvidenceHtml(
  env: Env,
  accountId: string,
  fromDate: string,
  toDate: string,
  opts: { packId?: string; generatedAt?: string } = {}
): Promise<{
  html: string;
  fromDate: string;
  toDate: string;
  invoiceCount: number;
  eventCount: number;
}> {
  const fromIso = `${fromDate}T00:00:00.000Z`;
  const toIso = `${toDate}T23:59:59.999Z`;
  const generatedAt = opts.generatedAt ?? new Date().toISOString();
  const packId = opts.packId ?? null;

  const { results: eventRowsRaw } = await env.CHASA_DB.prepare(
    `SELECT id, aging_invoice_id, client_name, event_type, channel, subject, body_preview, metadata,
            actor_account_id, actor_email, actor_role, created_at
     FROM chase_events
     WHERE account_id = ? AND created_at >= ? AND created_at <= ?
     ORDER BY created_at ASC LIMIT 500`
  )
    .bind(accountId, fromIso, toIso)
    .all<{
      id: string;
      aging_invoice_id: string | null;
      client_name: string;
      event_type: string;
      channel: string;
      subject: string | null;
      body_preview: string | null;
      actor_email: string | null;
      created_at: string;
    }>();
  const inRange = eventRowsRaw ?? [];

  const { results: invoices } = await env.CHASA_DB.prepare(
    `SELECT id, client_name, amount, due_date, status, paid_at FROM aging_invoices
     WHERE account_id = ? AND (
       (updated_at >= ? AND updated_at <= ?) OR (created_at >= ? AND created_at <= ?)
     )
     ORDER BY due_date ASC LIMIT 200`
  )
    .bind(accountId, fromIso, toIso, fromIso, toIso)
    .all<{
      id: string;
      client_name: string;
      amount: number;
      due_date: string;
      status: string;
      paid_at: string | null;
    }>();

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  const tracking = invoiceIds.length
    ? await trackingStatsForInvoices(env, accountId, invoiceIds)
    : {};

  const auditEvents = await listSoxAuditEvents(env, accountId, { limit: 500 });
  const auditInRange = auditEvents.filter((e) => e.createdAt >= fromIso && e.createdAt <= toIso);

  const approvals = await listSendApprovals(env, accountId, { limit: 200 });
  const approvalsInRange = approvals.filter((a) => {
    const t = a.decidedAt ?? a.createdAt;
    return t >= fromIso && t <= toIso;
  });

  const anchors = (await listAuditAnchors(env, accountId)).filter(
    (a) => a.periodDate >= fromDate && a.periodDate <= toDate
  );

  const { results: controlTestRows } = await env.CHASA_DB.prepare(
    `SELECT t.id, t.period_start, t.period_end, t.result, t.notes, t.tested_by_email, t.evidence_pack_id, t.tested_at,
            c.control_key, c.title
     FROM sox_control_tests t
     JOIN sox_controls c ON c.id = t.control_id
     WHERE t.account_id = ? AND t.tested_at >= ? AND t.tested_at <= ?
     ORDER BY t.tested_at ASC LIMIT 200`
  )
    .bind(accountId, fromIso, toIso)
    .all<{
      id: string;
      period_start: string;
      period_end: string;
      result: string;
      notes: string | null;
      tested_by_email: string;
      evidence_pack_id: string | null;
      tested_at: string;
      control_key: string;
      title: string;
    }>();

  const settings = await getSoxSettings(env, accountId);
  const overview = await getSoxOverview(env, accountId);

  const eventRows = inRange
    .map(
      (ev) =>
        `<tr>
          <td>${escapeHtml(formatUsDateTime(ev.created_at))}</td>
          <td>${escapeHtml(ev.client_name)}</td>
          <td>${escapeHtml(ev.event_type)}</td>
          <td>${escapeHtml(ev.actor_email ?? "—")}</td>
          <td>${escapeHtml(ev.subject ?? "—")}</td>
        </tr>`
    )
    .join("\n");

  const invoiceRows = (invoices ?? [])
    .map((inv) => {
      const stats = tracking[inv.id];
      return `<tr>
        <td>${escapeHtml(inv.client_name)}</td>
        <td>$${Number(inv.amount).toFixed(2)}</td>
        <td>${escapeHtml(inv.due_date)}</td>
        <td>${escapeHtml(inv.status)}</td>
        <td>${stats ? `${stats.openCount} open / ${stats.clickCount} click` : "—"}</td>
      </tr>`;
    })
    .join("\n");

  const auditRows = auditInRange
    .map(
      (ev) =>
        `<tr>
          <td>${escapeHtml(formatUsDateTime(ev.createdAt))}</td>
          <td>${escapeHtml(ev.actorEmail)}</td>
          <td>${escapeHtml(ev.action)}</td>
          <td>${escapeHtml(ev.summary)}</td>
        </tr>`
    )
    .join("\n");

  const approvalRows = approvalsInRange
    .map(
      (a) =>
        `<tr>
          <td>${escapeHtml(formatUsDateTime(a.createdAt))}</td>
          <td>${escapeHtml(a.clientName)}</td>
          <td>${escapeHtml(a.status)}</td>
          <td>${escapeHtml(a.requestedByEmail)}</td>
          <td>${escapeHtml(a.decidedByEmail ?? "—")}</td>
        </tr>`
    )
    .join("\n");

  const anchorRows = anchors
    .map(
      (a) =>
        `<tr>
          <td>${escapeHtml(a.periodDate)}</td>
          <td>${a.eventCount}</td>
          <td><code>${escapeHtml(a.chainHash.slice(0, 24))}…</code></td>
          <td>${escapeHtml(a.otsStatus)}</td>
        </tr>`
    )
    .join("\n");

  const controlRows = overview.controls
    .map(
      (c) =>
        `<tr>
          <td>${escapeHtml(c.title)}</td>
          <td>${escapeHtml(c.status)}</td>
          <td>${escapeHtml(c.detail)}</td>
        </tr>`
    )
    .join("\n");

  const periodTestRows = (controlTestRows ?? [])
    .map(
      (t) =>
        `<tr>
          <td>${escapeHtml(formatUsDateTime(t.tested_at))}</td>
          <td>${escapeHtml(t.control_key)}</td>
          <td>${escapeHtml(t.title)}</td>
          <td>${escapeHtml(t.period_start)} → ${escapeHtml(t.period_end)}</td>
          <td>${escapeHtml(t.result)}</td>
          <td>${escapeHtml(t.tested_by_email)}</td>
          <td>${t.evidence_pack_id ? `<code>${escapeHtml(t.evidence_pack_id.slice(0, 12))}…</code>` : "—"}</td>
          <td>${escapeHtml(t.notes ?? "—")}</td>
        </tr>`
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en-US">
<head>
<meta charset="UTF-8">
<title>SOX auditor pack ${escapeHtml(fromDate)} – ${escapeHtml(toDate)}</title>
<style>
  body { font-family: Georgia, serif; max-width: 900px; margin: 40px auto; line-height: 1.55; color: #1B3155; font-size: 14px; }
  h1 { font-size: 22px; } h2 { font-size: 16px; margin-top: 28px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 7px; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; }
  .meta, .verify { margin: 16px 0; padding: 12px; background: #fafafa; border: 1px solid #ddd; }
  .verify { border-color: #c4b5a0; background: #fffaf3; }
  code { font-size: 11px; word-break: break-all; }
  @media print { body { margin: 16px; } }
</style>
</head>
<body>
<h1>SOX / ICFR auditor evidence pack</h1>
<div class="meta">
  ${packId ? `<p><strong>Pack ID:</strong> <code>${escapeHtml(packId)}</code></p>` : ""}
  <p><strong>Period:</strong> ${escapeHtml(fromDate)} → ${escapeHtml(toDate)} (UTC)</p>
  <p><strong>Generated:</strong> ${escapeHtml(formatUsDateTime(generatedAt))}</p>
  <p><strong>Maker-checker (SoD):</strong> ${settings.sodRequired ? "Enabled" : "Disabled"}</p>
  <p><strong>Retention policy:</strong> ${settings.retentionDays} days</p>
  <p><strong>Counts:</strong> ${(invoices ?? []).length} invoice(s) · ${inRange.length} chase event(s) · ${auditInRange.length} SOX action(s) · ${approvalsInRange.length} approval(s) · ${(controlTestRows ?? []).length} control test(s) · ${anchors.length} daily anchor(s)</p>
</div>

<div class="verify">
  <p><strong>Tamper-evidence (OpenTimestamps)</strong></p>
  <p>This HTML file is frozen at issue time. docstoc stores its exact bytes, computes SHA-256 over those bytes, and anchors that digest to Bitcoin via OpenTimestamps.</p>
  <p>To verify independently: (1) hash this downloaded file with SHA-256, (2) confirm it matches the digest shown in the SOX reporting UI / <code>.sha256</code> companion file, (3) verify the companion <code>.ots</code> proof with the OpenTimestamps client (<code>ots verify pack.ots</code>) or any compatible verifier. Confirmation on Bitcoin calendars can take hours.</p>
</div>

<h2>Control coverage (at generation)</h2>
<table>
  <thead><tr><th>Control</th><th>Status</th><th>Detail</th></tr></thead>
  <tbody>${controlRows}</tbody>
</table>

<h2>Period control tests</h2>
<table>
  <thead><tr><th>Tested</th><th>Key</th><th>Control</th><th>Period</th><th>Result</th><th>Tester</th><th>Evidence pack</th><th>Notes</th></tr></thead>
  <tbody>${periodTestRows || "<tr><td colspan='8'>No control tests recorded in this period</td></tr>"}</tbody>
</table>

<h2>Invoices in period</h2>
<table>
  <thead><tr><th>Client</th><th>Amount</th><th>Due</th><th>Status</th><th>Tracking</th></tr></thead>
  <tbody>${invoiceRows || "<tr><td colspan='5'>No invoices in range</td></tr>"}</tbody>
</table>

<h2>Chase timeline (with actor)</h2>
<table>
  <thead><tr><th>When</th><th>Client</th><th>Event</th><th>Actor</th><th>Subject</th></tr></thead>
  <tbody>${eventRows || "<tr><td colspan='5'>No chase events in range</td></tr>"}</tbody>
</table>

<h2>Maker-checker approvals in period</h2>
<table>
  <thead><tr><th>Requested</th><th>Client</th><th>Status</th><th>Maker</th><th>Checker</th></tr></thead>
  <tbody>${approvalRows || "<tr><td colspan='5'>No approvals in range</td></tr>"}</tbody>
</table>

<h2>Attributable SOX audit actions</h2>
<table>
  <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Summary</th></tr></thead>
  <tbody>${auditRows || "<tr><td colspan='4'>No SOX audit events in range</td></tr>"}</tbody>
</table>

<h2>Daily hash anchors (chase + tracking)</h2>
<table>
  <thead><tr><th>Date</th><th>Events</th><th>Chain hash</th><th>OTS</th></tr></thead>
  <tbody>${anchorRows || "<tr><td colspan='4'>No anchors in range</td></tr>"}</tbody>
</table>
</body>
</html>`;

  return {
    html,
    fromDate,
    toDate,
    invoiceCount: (invoices ?? []).length,
    eventCount: inRange.length,
  };
}

export type SoxAuditorPack = {
  id: string;
  fromDate: string;
  toDate: string;
  contentSha256: string;
  invoiceCount: number;
  eventCount: number;
  createdByEmail: string | null;
  otsStatus: "none" | "pending" | "confirmed" | "failed";
  otsConfirmedAt: string | null;
  createdAt: string;
};

type PackRow = {
  id: string;
  from_date: string;
  to_date: string;
  content_sha256: string;
  invoice_count: number;
  event_count: number;
  created_by_email: string | null;
  ots_status: string;
  ots_confirmed_at: string | null;
  created_at: string;
};

function mapPack(row: PackRow): SoxAuditorPack {
  return {
    id: row.id,
    fromDate: row.from_date,
    toDate: row.to_date,
    contentSha256: row.content_sha256,
    invoiceCount: row.invoice_count,
    eventCount: row.event_count,
    createdByEmail: row.created_by_email,
    otsStatus: row.ots_status as SoxAuditorPack["otsStatus"],
    otsConfirmedAt: row.ots_confirmed_at,
    createdAt: row.created_at,
  };
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Freeze a period pack: exact HTML bytes + SHA-256 + OpenTimestamps submission. */
export async function createAuditorPack(
  env: Env,
  accountId: string,
  actor: SoxActor,
  fromDate: string,
  toDate: string,
  ip?: string | null
): Promise<SoxAuditorPack> {
  if (fromDate > toDate) throw new Error("from must be on or before to");
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const built = await generatePeriodEvidenceHtml(env, accountId, fromDate, toDate, {
    packId: id,
    generatedAt: createdAt,
  });
  const contentSha256 = await sha256Hex(built.html);

  await env.CHASA_DB.prepare(
    `INSERT INTO sox_auditor_packs
       (id, account_id, from_date, to_date, content_sha256, html_content, invoice_count, event_count,
        created_by_email, ots_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', ?)`
  )
    .bind(
      id,
      accountId,
      fromDate,
      toDate,
      contentSha256,
      built.html,
      built.invoiceCount,
      built.eventCount,
      actor.email,
      createdAt
    )
    .run();

  const stamped = await submitTimestamp(contentSha256);
  if (stamped.ok) {
    await env.CHASA_DB.prepare(
      `UPDATE sox_auditor_packs
       SET ots_status = 'pending', ots_calendar_url = ?, ots_proof_base64 = ?, ots_submitted_at = ?
       WHERE id = ?`
    )
      .bind(stamped.calendarUrl, stamped.proofBase64, new Date().toISOString(), id)
      .run();
  } else {
    await env.CHASA_DB.prepare(`UPDATE sox_auditor_packs SET ots_status = 'failed' WHERE id = ?`)
      .bind(id)
      .run();
    console.error(`Auditor pack OTS submit failed for ${id}:`, stamped.error);
  }

  await recordSoxAuditEvent(env, accountId, actor, {
    action: "sox.auditor_pack_created",
    summary: `Auditor pack ${fromDate}→${toDate} (${contentSha256.slice(0, 12)}…)`,
    resourceType: "sox_auditor_pack",
    resourceId: id,
    metadata: { fromDate, toDate, contentSha256 },
    ip,
  });

  const row = await env.CHASA_DB.prepare(
    `SELECT id, from_date, to_date, content_sha256, invoice_count, event_count, created_by_email,
            ots_status, ots_confirmed_at, created_at
     FROM sox_auditor_packs WHERE id = ?`
  )
    .bind(id)
    .first<PackRow>();
  if (!row) throw new Error("Pack create failed");
  return mapPack(row);
}

export async function listAuditorPacks(env: Env, accountId: string, limit = 50): Promise<SoxAuditorPack[]> {
  const { results } = await env.CHASA_DB.prepare(
    `SELECT id, from_date, to_date, content_sha256, invoice_count, event_count, created_by_email,
            ots_status, ots_confirmed_at, created_at
     FROM sox_auditor_packs WHERE account_id = ?
     ORDER BY created_at DESC LIMIT ?`
  )
    .bind(accountId, Math.min(Math.max(limit, 1), 100))
    .all<PackRow>();
  return (results ?? []).map(mapPack);
}

export async function getAuditorPackHtml(
  env: Env,
  accountId: string,
  packId: string
): Promise<{ html: string; fromDate: string; toDate: string; contentSha256: string } | null> {
  const row = await env.CHASA_DB.prepare(
    `SELECT html_content, from_date, to_date, content_sha256 FROM sox_auditor_packs
     WHERE id = ? AND account_id = ?`
  )
    .bind(packId, accountId)
    .first<{ html_content: string; from_date: string; to_date: string; content_sha256: string }>();
  if (!row) return null;
  return {
    html: row.html_content,
    fromDate: row.from_date,
    toDate: row.to_date,
    contentSha256: row.content_sha256,
  };
}

export async function getAuditorPackProof(
  env: Env,
  accountId: string,
  packId: string
): Promise<{ proofBase64: string; contentSha256: string } | null> {
  const row = await env.CHASA_DB.prepare(
    `SELECT ots_proof_base64, content_sha256 FROM sox_auditor_packs WHERE id = ? AND account_id = ?`
  )
    .bind(packId, accountId)
    .first<{ ots_proof_base64: string | null; content_sha256: string }>();
  if (!row?.ots_proof_base64) return null;
  return { proofBase64: row.ots_proof_base64, contentSha256: row.content_sha256 };
}

const DEFAULT_SOX_CONTROLS: Array<{
  key: string;
  title: string;
  description: string;
  frequency: string;
}> = [
  {
    key: "AR-SOD-001",
    title: "Maker-checker on chase send",
    description: "Send / mark-sent requires a different approver when SoD is enabled.",
    frequency: "continuous",
  },
  {
    key: "AR-TRAIL-001",
    title: "Attributable chase timeline",
    description: "Chase events record actor email and role for ICFR evidence.",
    frequency: "continuous",
  },
  {
    key: "AR-ANCHOR-001",
    title: "Daily Bitcoin hash anchors",
    description: "Daily Merkle roots of chase activity are OpenTimestamped to Bitcoin.",
    frequency: "daily",
  },
  {
    key: "AR-EXPORT-001",
    title: "Period auditor evidence pack",
    description: "Frozen HTML + SHA-256 + .ots pack for a chosen period.",
    frequency: "monthly",
  },
  {
    key: "AR-RET-001",
    title: "Retention / legal hold",
    description: "Retention window with optional enforcement and legal hold.",
    frequency: "quarterly",
  },
  {
    key: "AR-CERT-001",
    title: "Document certificates",
    description: "Tamper-evident certificates for exported files and invoices.",
    frequency: "as_needed",
  },
];

type ControlRow = {
  id: string;
  control_key: string;
  title: string;
  description: string | null;
  frequency: string;
  owner_email: string | null;
  status: string;
  created_at: string;
};

type ControlTestRow = {
  id: string;
  control_id: string;
  period_start: string;
  period_end: string;
  result: string;
  notes: string | null;
  tested_by_email: string;
  evidence_pack_id: string | null;
  tested_at: string;
};

function mapControlTest(row: ControlTestRow): SoxControlTest {
  return {
    id: row.id,
    controlId: row.control_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    result: row.result as SoxControlTest["result"],
    notes: row.notes,
    testedByEmail: row.tested_by_email,
    evidencePackId: row.evidence_pack_id,
    testedAt: row.tested_at,
  };
}

function mapControl(row: ControlRow, lastTest: SoxControlTest | null): SoxControl {
  return {
    id: row.id,
    controlKey: row.control_key,
    title: row.title,
    description: row.description,
    frequency: row.frequency,
    ownerEmail: row.owner_email,
    status: row.status === "retired" ? "retired" : "active",
    createdAt: row.created_at,
    lastTest,
  };
}

export async function ensureDefaultSoxControls(env: Env, accountId: string): Promise<void> {
  const existing = await env.CHASA_DB.prepare(
    `SELECT COUNT(*) as c FROM sox_controls WHERE account_id = ?`
  )
    .bind(accountId)
    .first<{ c: number }>();
  if ((existing?.c ?? 0) > 0) return;
  const now = new Date().toISOString();
  for (const c of DEFAULT_SOX_CONTROLS) {
    await env.CHASA_DB.prepare(
      `INSERT OR IGNORE INTO sox_controls
         (id, account_id, control_key, title, description, frequency, owner_email, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, 'active', ?)`
    )
      .bind(crypto.randomUUID(), accountId, c.key, c.title, c.description, c.frequency, now)
      .run();
  }
}

export async function listSoxControls(env: Env, accountId: string): Promise<SoxControl[]> {
  await ensureDefaultSoxControls(env, accountId);
  const { results } = await env.CHASA_DB.prepare(
    `SELECT id, control_key, title, description, frequency, owner_email, status, created_at
     FROM sox_controls WHERE account_id = ? AND status = 'active'
     ORDER BY control_key ASC`
  )
    .bind(accountId)
    .all<ControlRow>();
  const controls: SoxControl[] = [];
  for (const row of results ?? []) {
    const last = await env.CHASA_DB.prepare(
      `SELECT id, control_id, period_start, period_end, result, notes, tested_by_email, evidence_pack_id, tested_at
       FROM sox_control_tests WHERE control_id = ? ORDER BY tested_at DESC LIMIT 1`
    )
      .bind(row.id)
      .first<ControlTestRow>();
    controls.push(mapControl(row, last ? mapControlTest(last) : null));
  }
  return controls;
}

export async function recordSoxControlTest(
  env: Env,
  accountId: string,
  actor: SoxActor,
  input: {
    controlId: string;
    periodStart: string;
    periodEnd: string;
    result: "pass" | "fail" | "exception";
    notes?: string | null;
    evidencePackId?: string | null;
  },
  ip?: string | null
): Promise<SoxControlTest> {
  const control = await env.CHASA_DB.prepare(
    `SELECT id, control_key, title FROM sox_controls WHERE id = ? AND account_id = ?`
  )
    .bind(input.controlId, accountId)
    .first<{ id: string; control_key: string; title: string }>();
  if (!control) throw new Error("Control not found");
  if (input.periodStart > input.periodEnd) throw new Error("periodStart must be on or before periodEnd");

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.CHASA_DB.prepare(
    `INSERT INTO sox_control_tests
       (id, account_id, control_id, period_start, period_end, result, notes, tested_by_email, evidence_pack_id, tested_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      accountId,
      control.id,
      input.periodStart,
      input.periodEnd,
      input.result,
      input.notes?.slice(0, 2000) ?? null,
      actor.email,
      input.evidencePackId?.slice(0, 80) ?? null,
      now
    )
    .run();

  await recordSoxAuditEvent(env, accountId, actor, {
    action: "sox.control_tested",
    summary: `${control.control_key} tested: ${input.result}`,
    resourceType: "sox_control_test",
    resourceId: id,
    metadata: {
      controlId: control.id,
      controlKey: control.control_key,
      result: input.result,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    },
    ip,
  });

  return {
    id,
    controlId: control.id,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    result: input.result,
    notes: input.notes ?? null,
    testedByEmail: actor.email,
    evidencePackId: input.evidencePackId ?? null,
    testedAt: now,
  };
}

export async function listSoxControlTests(
  env: Env,
  accountId: string,
  opts: { controlId?: string; limit?: number } = {}
): Promise<SoxControlTest[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let sql = `SELECT id, control_id, period_start, period_end, result, notes, tested_by_email, evidence_pack_id, tested_at
             FROM sox_control_tests WHERE account_id = ?`;
  const binds: unknown[] = [accountId];
  if (opts.controlId) {
    sql += ` AND control_id = ?`;
    binds.push(opts.controlId);
  }
  sql += ` ORDER BY tested_at DESC LIMIT ?`;
  binds.push(limit);
  const { results } = await env.CHASA_DB.prepare(sql).bind(...binds).all<ControlTestRow>();
  return (results ?? []).map(mapControlTest);
}

export async function getSoxRetentionStatus(env: Env, accountId: string): Promise<SoxRetentionStatus> {
  const settings = await getSoxSettings(env, accountId);
  const cutoff = new Date(Date.now() - settings.retentionDays * 86400000).toISOString();
  const chase = await env.CHASA_DB.prepare(
    `SELECT COUNT(*) as c FROM chase_events WHERE account_id = ? AND created_at < ?`
  )
    .bind(accountId, cutoff)
    .first<{ c: number }>();
  const audit = await env.CHASA_DB.prepare(
    `SELECT COUNT(*) as c FROM sox_audit_events WHERE account_id = ? AND created_at < ?`
  )
    .bind(accountId, cutoff)
    .first<{ c: number }>();
  return {
    cutoffIso: cutoff,
    chaseEventsPastRetention: chase?.c ?? 0,
    auditEventsPastRetention: audit?.c ?? 0,
    legalHold: settings.legalHold,
    retentionEnforced: settings.retentionEnforced,
    retentionDays: settings.retentionDays,
  };
}

export async function purgeSoxPastRetention(
  env: Env,
  accountId: string,
  actor: SoxActor,
  ip?: string | null
): Promise<{ deletedChase: number; deletedAudit: number; cutoffIso: string }> {
  const settings = await getSoxSettings(env, accountId);
  if (settings.legalHold) throw new Error("Legal hold is on — purge is blocked");
  if (!settings.retentionEnforced) throw new Error("Enable retention enforcement before purging");
  const cutoff = new Date(Date.now() - settings.retentionDays * 86400000).toISOString();

  const chaseRes = await env.CHASA_DB.prepare(
    `DELETE FROM chase_events WHERE account_id = ? AND created_at < ?`
  )
    .bind(accountId, cutoff)
    .run();
  const auditRes = await env.CHASA_DB.prepare(
    `DELETE FROM sox_audit_events WHERE account_id = ? AND created_at < ?`
  )
    .bind(accountId, cutoff)
    .run();

  const deletedChase = chaseRes.meta.changes ?? 0;
  const deletedAudit = auditRes.meta.changes ?? 0;

  await recordSoxAuditEvent(env, accountId, actor, {
    action: "sox.retention_purged",
    summary: `Purged ${deletedChase} chase + ${deletedAudit} audit events older than ${settings.retentionDays}d`,
    resourceType: "sox_settings",
    resourceId: accountId,
    metadata: { cutoff, deletedChase, deletedAudit },
    ip,
  });

  return { deletedChase, deletedAudit, cutoffIso: cutoff };
}

export async function sweepSoxRetention(env: Env): Promise<{ accounts: number; deletedChase: number; deletedAudit: number }> {
  const { results } = await env.CHASA_DB.prepare(
    `SELECT account_id, retention_days FROM sox_settings
     WHERE retention_enforced = 1 AND legal_hold = 0`
  ).all<{ account_id: string; retention_days: number }>();

  let accounts = 0;
  let deletedChase = 0;
  let deletedAudit = 0;
  for (const row of results ?? []) {
    const cutoff = new Date(Date.now() - row.retention_days * 86400000).toISOString();
    const chaseRes = await env.CHASA_DB.prepare(
      `DELETE FROM chase_events WHERE account_id = ? AND created_at < ?`
    )
      .bind(row.account_id, cutoff)
      .run();
    const auditRes = await env.CHASA_DB.prepare(
      `DELETE FROM sox_audit_events WHERE account_id = ? AND created_at < ?`
    )
      .bind(row.account_id, cutoff)
      .run();
    const dc = chaseRes.meta.changes ?? 0;
    const da = auditRes.meta.changes ?? 0;
    if (dc > 0 || da > 0) {
      accounts++;
      deletedChase += dc;
      deletedAudit += da;
    }
  }
  return { accounts, deletedChase, deletedAudit };
}

export async function sweepPendingAuditorPacks(env: Env): Promise<{
  checked: number;
  confirmed: number;
  resubmitted: number;
}> {
  const { results } = await env.CHASA_DB.prepare(
    `SELECT id, content_sha256, ots_calendar_url, ots_submitted_at FROM sox_auditor_packs
     WHERE ots_status = 'pending' AND ots_calendar_url IS NOT NULL
     ORDER BY ots_submitted_at ASC LIMIT 50`
  ).all<{
    id: string;
    content_sha256: string;
    ots_calendar_url: string;
    ots_submitted_at: string | null;
  }>();
  const pending = results ?? [];
  let confirmed = 0;
  let resubmitted = 0;
  const now = Date.now();

  for (const row of pending) {
    const result = await checkUpgrade(row.content_sha256, row.ots_calendar_url);
    if (result.ok && result.confirmed) {
      await env.CHASA_DB.prepare(
        `UPDATE sox_auditor_packs SET ots_status = 'confirmed', ots_proof_base64 = ?, ots_confirmed_at = ?, ots_calendar_url = ? WHERE id = ?`
      )
        .bind(result.proofBase64, new Date().toISOString(), result.calendarUrl, row.id)
        .run();
      confirmed++;
      continue;
    }
    if (!result.ok) continue;
    if (result.aggregated) {
      if (result.proofBase64 && result.calendarUrl) {
        await env.CHASA_DB.prepare(
          `UPDATE sox_auditor_packs SET ots_status = 'pending', ots_calendar_url = ?, ots_proof_base64 = ?, ots_submitted_at = ? WHERE id = ?`
        )
          .bind(result.calendarUrl, result.proofBase64, new Date().toISOString(), row.id)
          .run();
      }
      continue;
    }
    const submittedMs = row.ots_submitted_at ? Date.parse(row.ots_submitted_at) : 0;
    if (!submittedMs || now - submittedMs < OTS_STALE_MS) continue;
    const fresh = await submitTimestamp(row.content_sha256);
    if (fresh.ok) {
      await env.CHASA_DB.prepare(
        `UPDATE sox_auditor_packs SET ots_status = 'pending', ots_calendar_url = ?, ots_proof_base64 = ?, ots_submitted_at = ? WHERE id = ?`
      )
        .bind(fresh.calendarUrl, fresh.proofBase64, new Date().toISOString(), row.id)
        .run();
      resubmitted++;
    }
  }
  return { checked: pending.length, confirmed, resubmitted };
}
