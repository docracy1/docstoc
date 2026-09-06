import type { Env } from "../types";
import { checkUpgrade, OTS_STALE_MS, submitTimestamp } from "./openTimestamps";
import { listCertificatesForAccount } from "./customerCertificates";
import { getBrandingRow } from "../routes/account";

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type TrustProfile = {
  accountId: string;
  firstVerifiedAt: string;
  otsStatus: "none" | "pending" | "confirmed" | "failed";
  otsConfirmedAt: string | null;
};

type Row = {
  account_id: string;
  first_verified_at: string;
  ots_status: string;
  ots_confirmed_at: string | null;
};

function rowToProfile(row: Row): TrustProfile {
  return {
    accountId: row.account_id,
    firstVerifiedAt: row.first_verified_at,
    otsStatus: row.ots_status as TrustProfile["otsStatus"],
    otsConfirmedAt: row.ots_confirmed_at,
  };
}

/** Creates the account's trust profile the first time it qualifies (an SSL certificate just went
 *  active — proof of real DNS control of a real domain). A no-op if one already exists: "verified
 *  since" is a one-time fact, not something that resets on every renewal or new domain. Returns
 *  the profile hash to anchor if this call created a new row, or null if one already existed. */
export async function ensureTrustProfile(env: Env, accountId: string): Promise<{ id: string; hash: string } | null> {
  const existing = await env.CHASA_DB.prepare(`SELECT account_id FROM trust_profiles WHERE account_id = ?`)
    .bind(accountId)
    .first();
  if (existing) return null;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  // Deliberately domain-agnostic — the claim is "this account was verified as of this date," not
  // tied to any one domain, so switching domains later doesn't invalidate it.
  const hash = await sha256Hex(`docstoc-trust-profile-v1|${accountId}|${now}`);
  await env.CHASA_DB.prepare(
    `INSERT INTO trust_profiles (id, account_id, first_verified_at, profile_hash, created_at) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(id, accountId, now, hash, now)
    .run();
  return { id, hash };
}

export async function recordTrustTimestampSubmitted(
  env: Env,
  accountId: string,
  opts: { calendarUrl: string; proofBase64: string }
): Promise<void> {
  await env.CHASA_DB.prepare(
    `UPDATE trust_profiles SET ots_status = 'pending', ots_calendar_url = ?, ots_proof_base64 = ?, ots_submitted_at = ? WHERE account_id = ?`
  )
    .bind(opts.calendarUrl, opts.proofBase64, new Date().toISOString(), accountId)
    .run();
}

export async function recordTrustTimestampFailed(env: Env, accountId: string): Promise<void> {
  await env.CHASA_DB.prepare(`UPDATE trust_profiles SET ots_status = 'failed' WHERE account_id = ? AND ots_status = 'none'`)
    .bind(accountId)
    .run();
}

export async function getTrustProfile(env: Env, accountId: string): Promise<TrustProfile | null> {
  const row = await env.CHASA_DB.prepare(`SELECT * FROM trust_profiles WHERE account_id = ?`)
    .bind(accountId)
    .first<Row>();
  return row ? rowToProfile(row) : null;
}

export type PublicTrustProfile = {
  workspaceName: string;
  domain: string | null;
  domainStatus: "active" | "expiring" | "expired" | "none";
  verifiedSince: string;
  otsStatus: TrustProfile["otsStatus"];
  otsConfirmedAt: string | null;
};

/** The account's best currently-live domain — prefers 'issued', falls back to 'expiring' (still
 *  technically valid, just due for renewal) over 'expired' or pending ones. Always a live lookup,
 *  never frozen into the anchored profile — an SSL cert lapsing should show up immediately. */
export async function getPublicTrustProfile(env: Env, accountId: string): Promise<PublicTrustProfile | null> {
  const profile = await getTrustProfile(env, accountId);
  if (!profile) return null;

  const certs = await listCertificatesForAccount(env, accountId);
  const best =
    certs.find((c) => c.status === "issued") ?? certs.find((c) => c.status === "expiring") ?? null;
  const domainStatus: PublicTrustProfile["domainStatus"] = best
    ? best.status === "issued"
      ? "active"
      : "expiring"
    : certs.some((c) => c.status === "expired")
    ? "expired"
    : "none";

  const branding = await getBrandingRow(env, accountId);

  return {
    workspaceName: branding?.workspace_name || "docstoc.io account",
    domain: best?.domain ?? null,
    domainStatus,
    verifiedSince: profile.firstVerifiedAt,
    otsStatus: profile.otsStatus,
    otsConfirmedAt: profile.otsConfirmedAt,
  };
}

export async function getTrustProfileProof(env: Env, accountId: string): Promise<{ proofBase64: string } | null> {
  const row = await env.CHASA_DB.prepare(`SELECT ots_proof_base64 FROM trust_profiles WHERE account_id = ?`)
    .bind(accountId)
    .first<{ ots_proof_base64: string | null }>();
  if (!row || !row.ots_proof_base64) return null;
  return { proofBase64: row.ots_proof_base64 };
}

/** Called once, right after a trust profile is first created, to anchor its "verified since"
 *  claim to Bitcoin. Safe to call from a route handler's waitUntil — errors are logged, not
 *  thrown, since a failed submission shouldn't fail the SSL issuance request it rode in on. */
export async function submitTrustProfileTimestamp(env: Env, accountId: string, hash: string): Promise<void> {
  const result = await submitTimestamp(hash);
  if (result.ok) {
    await recordTrustTimestampSubmitted(env, accountId, { calendarUrl: result.calendarUrl, proofBase64: result.proofBase64 });
  } else {
    await recordTrustTimestampFailed(env, accountId);
    console.error("Trust profile OpenTimestamps submission failed:", result.error);
  }
}

/** Idempotent backfill: any account with an issued/expiring domain that doesn't have a trust
 *  profile yet gets one — covers domains issued before this feature existed, and is safe to run
 *  every day forever since ensureTrustProfile is a no-op once a profile exists. */
export async function backfillTrustProfiles(env: Env): Promise<{ created: number }> {
  const { results } = await env.CHASA_DB.prepare(
    `SELECT DISTINCT cc.account_id FROM customer_certificates cc
     LEFT JOIN trust_profiles tp ON tp.account_id = cc.account_id
     WHERE cc.status IN ('issued', 'expiring') AND tp.account_id IS NULL`
  ).all<{ account_id: string }>();

  let created = 0;
  for (const row of results ?? []) {
    const newProfile = await ensureTrustProfile(env, row.account_id);
    if (newProfile) {
      await submitTrustProfileTimestamp(env, row.account_id, newProfile.hash);
      created++;
    }
  }
  return { created };
}

export async function sweepPendingTrustProfiles(env: Env): Promise<{
  checked: number;
  confirmed: number;
  resubmitted: number;
}> {
  const { results } = await env.CHASA_DB.prepare(
    `SELECT account_id, profile_hash, ots_calendar_url, ots_submitted_at FROM trust_profiles
     WHERE ots_status = 'pending' AND ots_calendar_url IS NOT NULL
     ORDER BY ots_submitted_at ASC LIMIT 100`
  ).all<{ account_id: string; profile_hash: string; ots_calendar_url: string; ots_submitted_at: string | null }>();
  const pending = results ?? [];

  let confirmed = 0;
  let resubmitted = 0;
  const now = Date.now();

  for (const row of pending) {
    const result = await checkUpgrade(row.profile_hash, row.ots_calendar_url);
    if (result.ok && result.confirmed) {
      await env.CHASA_DB.prepare(
        `UPDATE trust_profiles SET ots_status = 'confirmed', ots_proof_base64 = ?, ots_confirmed_at = ?, ots_calendar_url = ? WHERE account_id = ?`
      )
        .bind(result.proofBase64, new Date().toISOString(), result.calendarUrl, row.account_id)
        .run();
      confirmed++;
      continue;
    }
    if (!result.ok) {
      console.error(`OpenTimestamps upgrade check failed for trust profile ${row.account_id}:`, result.error);
      continue;
    }

    // Intermediate Merkle proof published — keep waiting for Bitcoin attestation (do not resubmit).
    if (result.aggregated) {
      if (result.proofBase64 && result.calendarUrl) {
        await recordTrustTimestampSubmitted(env, row.account_id, {
          calendarUrl: result.calendarUrl,
          proofBase64: result.proofBase64,
        });
      }
      continue;
    }

    // Calendar still 404 everywhere. Public calendars drop pending digests — resubmit after stale.
    const submittedMs = row.ots_submitted_at ? Date.parse(row.ots_submitted_at) : 0;
    if (!submittedMs || now - submittedMs < OTS_STALE_MS) continue;

    const fresh = await submitTimestamp(row.profile_hash);
    if (fresh.ok) {
      await recordTrustTimestampSubmitted(env, row.account_id, {
        calendarUrl: fresh.calendarUrl,
        proofBase64: fresh.proofBase64,
      });
      resubmitted++;
    } else {
      console.error(`OpenTimestamps resubmit failed for trust profile ${row.account_id}:`, fresh.error);
    }
  }
  return { checked: pending.length, confirmed, resubmitted };
}
