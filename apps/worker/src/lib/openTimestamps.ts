import type { Env } from "../types";
import {
  listPendingTimestamps,
  recordTimestampConfirmed,
  recordTimestampSubmitted,
} from "./certificates";

/**
 * Minimal OpenTimestamps client — anchors a document's SHA-256 hash to the Bitcoin blockchain
 * via public calendar servers (https://opentimestamps.org). We never parse the .ots binary
 * format ourselves; we treat both the initial "pending" proof and the later "upgraded" proof as
 * opaque bytes, store them, and re-serve them for independent verification with the `ots` CLI or
 * any OpenTimestamps-compatible verifier. That's a deliberate scope choice: reimplementing the
 * Merkle-proof + Bitcoin-header verification logic ourselves would add real complexity for zero
 * trust benefit — the point of anchoring to Bitcoin is that verification doesn't have to trust us.
 *
 * Protocol (confirmed against the live calendar servers + official ots client headers):
 *   POST {calendar}/digest        body = raw 32-byte SHA-256 digest → pending proof bytes
 *   GET  {calendar}/timestamp/{hex digest} → 200 + proof bytes once the digest is in a published
 *                                            Merkle tree (may still lack a Bitcoin attestation),
 *                                            404 while the calendar has not yet published it.
 *
 * Public calendars (alice/bob/finney) have repeatedly accepted digests with HTTP 200 and then
 * dropped them before anchoring — see opentimestamps-server#116. We therefore submit to several
 * independent calendars, probe all of them on upgrade, and only resubmit when every calendar
 * still returns 404 (digest lost). A 200 without a Bitcoin attestation means "keep waiting" —
 * resubmitting then would throw away an intermediate Merkle path that is about to confirm.
 */

const CALENDAR_URLS = [
  "https://alice.btc.calendar.opentimestamps.org",
  "https://bob.btc.calendar.opentimestamps.org",
  "https://finney.calendar.eternitywall.com",
  "https://btc.calendar.catallaxy.com",
] as const;

const OTS_ACCEPT = "application/vnd.opentimestamps.v1";
const OTS_USER_AGENT = "docstoc-ots/1.0 (+https://docstoc.io; founder@docstoc.io)";

const REQUEST_TIMEOUT_MS = 10_000;
/** Resubmit only when every calendar still 404s after this long — digests were likely dropped. */
export const OTS_STALE_MS = 4 * 60 * 60 * 1000;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export type SubmitResult =
  | { ok: true; proofBase64: string; calendarUrl: string }
  | { ok: false; error: string };

/** Submit a SHA-256 hex digest to every known calendar. Returns the first successful pending
 *  proof (Alice preferred via list order). Multi-submit raises the odds that at least one
 *  calendar keeps the digest long enough to anchor. */
export async function submitTimestamp(sha256HexDigest: string): Promise<SubmitResult> {
  const digest = hexToBytes(sha256HexDigest);
  const errors: string[] = [];
  let firstOk: { proofBase64: string; calendarUrl: string } | null = null;

  for (const calendarUrl of CALENDAR_URLS) {
    const res = await fetchWithTimeout(`${calendarUrl}/digest`, {
      method: "POST",
      headers: {
        Accept: OTS_ACCEPT,
        // Official ots client sends raw octets; some calendars are picky about Content-Type.
        "Content-Type": "application/octet-stream",
        "User-Agent": OTS_USER_AGENT,
      },
      body: digest,
    });
    if (!res || !res.ok) {
      errors.push(`${calendarUrl}: ${res ? `HTTP ${res.status}` : "unreachable"}`);
      continue;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!firstOk) {
      firstOk = { proofBase64: bytesToBase64(bytes), calendarUrl };
    }
  }

  if (firstOk) return { ok: true, ...firstOk };
  return { ok: false, error: errors.join("; ") || "All calendars unreachable" };
}

export type UpgradeResult =
  | { ok: true; confirmed: true; proofBase64: string; calendarUrl: string }
  | {
      ok: true;
      confirmed: false;
      /** Digest is in a published Merkle tree but not yet Bitcoin-attested — do not resubmit. */
      aggregated: boolean;
      proofBase64?: string;
      calendarUrl?: string;
    }
  | { ok: false; error: string };

// The OpenTimestamps "BitcoinBlockHeaderAttestation" tag — its presence in the proof bytes is
// what actually distinguishes a Bitcoin-confirmed timestamp from one still sitting in the
// calendar's pending Merkle tree. A 200 response alone doesn't guarantee that: the calendar can
// return an upgraded-but-still-calendar-pending proof, so we check for the real marker rather
// than trusting the HTTP status code.
const BITCOIN_ATTESTATION_TAG = new Uint8Array([0x05, 0x88, 0x96, 0x0d, 0x73, 0xd7, 0x19, 0x01]);

function containsSubsequence(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function calendarsToProbe(preferred?: string | null): string[] {
  const ordered: string[] = [];
  if (preferred) ordered.push(preferred.replace(/\/$/, ""));
  for (const url of CALENDAR_URLS) {
    if (!ordered.includes(url)) ordered.push(url);
  }
  return ordered;
}

/** Check whether a previously-submitted digest now has a Bitcoin-confirmed proof available.
 *  Tries the stored calendar first, then the other known calendars (we multi-submit).
 *  404 everywhere means "not yet / dropped" — normal while pending, and the cue to resubmit
 *  after OTS_STALE_MS. A 200 without the Bitcoin attestation tag means the calendar has
 *  published the digest into a Merkle tree and we must keep waiting (do not resubmit). */
export async function checkUpgrade(sha256HexDigest: string, calendarUrl: string): Promise<UpgradeResult> {
  let sawReachable = false;
  let lastError: string | null = null;

  for (const url of calendarsToProbe(calendarUrl)) {
    const res = await fetchWithTimeout(`${url}/timestamp/${sha256HexDigest}`, {
      method: "GET",
      headers: { Accept: OTS_ACCEPT, "User-Agent": OTS_USER_AGENT },
    });
    if (!res) {
      lastError = `${url}: unreachable`;
      continue;
    }
    sawReachable = true;
    if (res.status === 404) continue;
    if (!res.ok) {
      lastError = `${url}: HTTP ${res.status}`;
      continue;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const proofBase64 = bytesToBase64(bytes);
    if (!containsSubsequence(bytes, BITCOIN_ATTESTATION_TAG)) {
      // Aggregated into a Merkle tree, but that tree's root isn't in a confirmed Bitcoin block yet.
      return { ok: true, confirmed: false, aggregated: true, proofBase64, calendarUrl: url };
    }
    return { ok: true, confirmed: true, proofBase64, calendarUrl: url };
  }

  if (sawReachable) return { ok: true, confirmed: false, aggregated: false };
  return { ok: false, error: lastError || "All calendars unreachable" };
}

export { base64ToBytes };

export async function sweepPendingTimestamps(env: Env): Promise<{
  checked: number;
  confirmed: number;
  resubmitted: number;
}> {
  const pending = await listPendingTimestamps(env, 100);
  let confirmed = 0;
  let resubmitted = 0;
  const now = Date.now();

  for (const row of pending) {
    const result = await checkUpgrade(row.sha256_hash, row.ots_calendar_url);
    if (result.ok && result.confirmed) {
      await recordTimestampConfirmed(env, row.id, result.proofBase64);
      confirmed++;
      continue;
    }
    if (!result.ok) {
      console.error(`OpenTimestamps upgrade check failed for cert ${row.id}:`, result.error);
      continue;
    }

    // Calendar published an intermediate Merkle proof — keep it, wait for Bitcoin attestation.
    if (result.aggregated) {
      if (result.proofBase64 && result.calendarUrl) {
        await recordTimestampSubmitted(env, row.id, {
          calendarUrl: result.calendarUrl,
          proofBase64: result.proofBase64,
        });
      }
      continue;
    }

    // 404 everywhere: public calendars drop digests (opentimestamps-server#116). Resubmit.
    const submittedMs = row.ots_submitted_at ? Date.parse(row.ots_submitted_at) : 0;
    if (!submittedMs || now - submittedMs < OTS_STALE_MS) continue;

    const fresh = await submitTimestamp(row.sha256_hash);
    if (fresh.ok) {
      await recordTimestampSubmitted(env, row.id, {
        calendarUrl: fresh.calendarUrl,
        proofBase64: fresh.proofBase64,
      });
      resubmitted++;
    } else {
      console.error(`OpenTimestamps resubmit failed for cert ${row.id}:`, fresh.error);
    }
  }
  return { checked: pending.length, confirmed, resubmitted };
}
