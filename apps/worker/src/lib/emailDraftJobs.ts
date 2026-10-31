import type { AccountContext } from "./auth";
import { generateFollowUpEmail } from "./ai";
import { dispatchWebhooks } from "./webhooks";
import { anonIpCapScope, incrementDraftUsage, usageScopeKey } from "./usageQuota";
import type { Env } from "../types";

export type ChaseDraftInput = {
  clientName: string;
  invoiceAmount: number;
  daysOverdue: number;
  paymentLink?: string;
  lateFeeHint?: string;
  lineItems: Array<{
    clientName?: string;
    amount: number;
    daysOverdue: number;
    dueDate?: string;
  }>;
  visitorId?: string;
};

type JobRow = {
  id: string;
  status: string;
  result_json: string | null;
  error: string | null;
};

const JOB_TTL_MS = 10 * 60 * 1000;

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

export async function createEmailDraftJob(env: Env): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + JOB_TTL_MS).toISOString();
  await env.CHASA_DB.prepare(
    `INSERT INTO email_draft_jobs (id, status, created_at, expires_at) VALUES (?, 'pending', ?, ?)`
  )
    .bind(id, now.toISOString(), expiresAt)
    .run();
  return id;
}

export async function getEmailDraftJob(env: Env, jobId: string) {
  const row = await env.CHASA_DB.prepare(
    `SELECT id, status, result_json, error FROM email_draft_jobs WHERE id = ? AND expires_at > ?`
  )
    .bind(jobId, new Date().toISOString())
    .first<JobRow>();
  if (!row) return null;
  if (row.status === "done" && row.result_json) {
    try {
      return { status: "done" as const, ...(JSON.parse(row.result_json) as Record<string, unknown>) };
    } catch {
      return { status: "error" as const, error: "Draft result corrupted — try again." };
    }
  }
  if (row.status === "error") {
    return { status: "error" as const, error: row.error || "Could not generate a draft right now." };
  }
  return { status: "pending" as const };
}

async function markJobDone(env: Env, jobId: string, payload: Record<string, unknown>) {
  await env.CHASA_DB.prepare(
    `UPDATE email_draft_jobs SET status = 'done', result_json = ?, error = NULL WHERE id = ?`
  )
    .bind(JSON.stringify(payload), jobId)
    .run();
}

async function markJobError(env: Env, jobId: string, message: string) {
  await env.CHASA_DB.prepare(`UPDATE email_draft_jobs SET status = 'error', error = ? WHERE id = ?`)
    .bind(message.slice(0, 500), jobId)
    .run();
}

export async function runEmailDraftJob(
  env: Env,
  jobId: string,
  account: AccountContext | null,
  input: ChaseDraftInput,
  ip: string
): Promise<void> {
  try {
    const draft = await withTimeout(
      generateFollowUpEmail(env, {
        clientName: input.clientName,
        invoiceAmount: input.invoiceAmount,
        daysOverdue: input.daysOverdue,
        invoices: input.lineItems.length > 0 ? input.lineItems : undefined,
        paymentLink: input.paymentLink,
        lateFeeHint: input.lateFeeHint,
      }),
      45_000,
      "generateFollowUpEmail"
    );
    const scope = usageScopeKey(account, ip, input.visitorId);
    const remaining = await incrementDraftUsage(env, scope);
    if (!account) await incrementDraftUsage(env, anonIpCapScope("draft", ip));
    if (account?.isPaid) {
      await dispatchWebhooks(env, account.workspaceId, "chase.drafted", {
        client_name: input.clientName,
        invoice_amount: input.invoiceAmount,
        days_overdue: input.daysOverdue,
        invoice_count: input.lineItems.length || 1,
        subject: draft.subject,
      }).catch(() => {});
    }
    await markJobDone(env, jobId, {
      subject: draft.subject,
      body: draft.body,
      remaining: account?.isPaid ? null : Math.max(0, 5 - remaining),
    });
  } catch (err) {
    console.error("runEmailDraftJob failed", jobId, err);
    await markJobError(env, jobId, "Could not generate a draft right now. Please try again.");
  }
}

export async function purgeExpiredEmailDraftJobs(env: Env): Promise<void> {
  await env.CHASA_DB.prepare(`DELETE FROM email_draft_jobs WHERE expires_at <= ?`)
    .bind(new Date().toISOString())
    .run();
}
