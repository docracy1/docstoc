import type { Env } from "../types";

/** Every table with an `account_id` (or `chase_id` two levels down) that should disappear when
 *  an account is deleted, ordered children-before-parents. D1 actually does enforce the `ON
 *  DELETE CASCADE`/`SET NULL` declared in migrations — `PRAGMA foreign_keys` reads 1 by default,
 *  confirmed against a real local D1 — so deleting `accounts` alone would cascade most of this
 *  anyway. Everything is still deleted explicitly rather than relied on, so a failure partway
 *  through (via `db.batch()`, one transaction, all-or-nothing) is obvious from which statement
 *  it was rather than an opaque cascade failure, and so this stays correct even if a future
 *  migration changes a cascade rule.
 *
 *  document_certificates is left completely untouched, not even to null its account_id —
 *  migration 0033's prevent_certificate_content_edit trigger makes account_id immutable the
 *  instant a certificate is created (part of its trust model: who created it is itself part of
 *  the permanent, independently-verifiable record), and prevent_certificate_delete blocks
 *  deleting it outright. A certificate issued by this account is meant to stay exactly as it
 *  was, forever, pointing at an account_id that no longer resolves.
 *
 *  generated_invoices has the same rule for any row that's been certified/sent
 *  (certificate_public_id set) — prevent_certified_invoice_delete refuses that delete outright.
 *
 *  **Both of those are actually undeletable-account bugs, not handled cases** — verified against
 *  a real local D1, not just read off the schema. document_certificates.account_id is declared
 *  `ON DELETE SET NULL`, but D1's own FK-driven SET NULL write during account deletion is still
 *  an UPDATE as far as the trigger is concerned, and prevent_certificate_content_edit blocks
 *  writes to account_id unconditionally — so an account with even one certified document can
 *  never be deleted, full stop, no matter what this function does; the cascade itself aborts the
 *  whole transaction. generated_invoices is declared CASCADE (not SET NULL) for account_id, so a
 *  certified/sent invoice hits prevent_certified_invoice_delete the same way once the cascade
 *  reaches it. Excluding these rows from this function's own DELETEs isn't enough — the account
 *  row itself still can't be deleted while they exist, so this function checks for them up front
 *  and refuses with a clear reason instead of failing on the final DELETE with a raw trigger
 *  error. Actually fixing this needs a schema change (at minimum, loosening
 *  prevent_certificate_content_edit to allow the specific NEW.account_id IS NULL transition) —
 *  out of scope here; flagged for a deliberate follow-up rather than patched as a drive-by.
 *
 *  marketplace_templates has no such trigger — account_id there really is just detached to NULL,
 *  matching its ON DELETE SET NULL migration comment (0021): the submission stays visible even
 *  after the submitting account is gone.
 *
 *  magic_links and marketing_leads aren't FK-linked to accounts at all (they're keyed by email,
 *  and predate/are independent of having an account), but are cleaned up by email anyway for a
 *  thorough deletion of everything tied to this person. */
export async function deleteAccountByEmail(
  env: Env,
  emailRaw: string
): Promise<{ ok: true; id: string; email: string } | { ok: false; error: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) return { ok: false, error: "email is required" };

  const account = await env.CHASA_DB.prepare(`SELECT id FROM accounts WHERE email = ?`)
    .bind(email)
    .first<{ id: string }>();
  if (!account) return { ok: false, error: "No account found for that email" };

  const id = account.id;
  const db = env.CHASA_DB;

  const blocked = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM document_certificates WHERE account_id = ?) AS certs,
         (SELECT COUNT(*) FROM generated_invoices WHERE account_id = ? AND certificate_public_id IS NOT NULL) AS certifiedInvoices`
    )
    .bind(id, id)
    .first<{ certs: number; certifiedInvoices: number }>();
  if (blocked && (blocked.certs > 0 || blocked.certifiedInvoices > 0)) {
    return {
      ok: false,
      error:
        `This account has ${blocked.certs} certified document(s) and ${blocked.certifiedInvoices} certified invoice(s) — ` +
        `permanent records that can never be deleted (see migration 0033), which means the account row itself can't be ` +
        `deleted either as long as they exist. This is a schema limitation, not something this button can work around.`,
    };
  }

  await db.batch([
    // Anonymous-use row this account happened to submit — keep it, just detach.
    db.prepare(`UPDATE marketplace_templates SET account_id = NULL WHERE account_id = ?`).bind(id),

    // Other accounts that reference this one — detach before it's gone.
    db.prepare(`UPDATE accounts SET workspace_owner_id = NULL WHERE workspace_owner_id = ?`).bind(id),
    db.prepare(`DELETE FROM workspace_members WHERE account_id = ? OR email = ?`).bind(id, email),

    // Grandchildren of chase_tracking before chase_tracking itself.
    db
      .prepare(
        `DELETE FROM chase_tracking_events WHERE chase_id IN (SELECT id FROM chase_tracking WHERE account_id = ?)`
      )
      .bind(id),
    db
      .prepare(
        `DELETE FROM chase_tracking_links WHERE chase_id IN (SELECT id FROM chase_tracking WHERE account_id = ?)`
      )
      .bind(id),
    db.prepare(`DELETE FROM chase_tracking WHERE account_id = ?`).bind(id),
    db.prepare(`DELETE FROM chase_reminders WHERE account_id = ?`).bind(id),
    db.prepare(`DELETE FROM chase_events WHERE account_id = ?`).bind(id),

    db.prepare(`DELETE FROM aging_invoices WHERE account_id = ?`).bind(id),
    // The pre-check above already guarantees there are none of these left for this account.
    db.prepare(`DELETE FROM generated_invoices WHERE account_id = ?`).bind(id),
    db.prepare(`DELETE FROM clients WHERE account_id = ?`).bind(id),

    db.prepare(`DELETE FROM sessions WHERE account_id = ?`).bind(id),
    db.prepare(`DELETE FROM webhooks WHERE account_id = ?`).bind(id),
    db.prepare(`DELETE FROM api_keys WHERE account_id = ?`).bind(id),
    db.prepare(`DELETE FROM cloud_connectors WHERE account_id = ?`).bind(id),
    db.prepare(`DELETE FROM accounting_connectors WHERE account_id = ?`).bind(id),
    db.prepare(`DELETE FROM customer_certificates WHERE account_id = ?`).bind(id),
    db.prepare(`DELETE FROM trust_profiles WHERE account_id = ?`).bind(id),
    db.prepare(`DELETE FROM audit_log_anchors WHERE account_id = ?`).bind(id),

    db.prepare(`DELETE FROM sox_control_tests WHERE account_id = ?`).bind(id),
    db.prepare(`DELETE FROM sox_controls WHERE account_id = ?`).bind(id),
    db.prepare(`DELETE FROM sox_send_approvals WHERE account_id = ?`).bind(id),
    db.prepare(`DELETE FROM sox_audit_events WHERE account_id = ?`).bind(id),
    db.prepare(`DELETE FROM sox_auditor_packs WHERE account_id = ?`).bind(id),
    db.prepare(`DELETE FROM sox_settings WHERE account_id = ?`).bind(id),

    // Not FK-linked, but tied to this person by email.
    db.prepare(`DELETE FROM magic_links WHERE email = ?`).bind(email),
    db.prepare(`DELETE FROM marketing_leads WHERE email = ?`).bind(email),

    db.prepare(`DELETE FROM accounts WHERE id = ?`).bind(id),
  ]);

  return { ok: true, id, email };
}
