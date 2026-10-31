/** Chase statuses that claim the reminder went out, which maker-checker reserves for approved sends. */
const SEND_LIKE_STATUSES = new Set(["sent", "copied", "mailto", "tracked_copy"]);

export function isSendLikeChaseStatus(status: string | null | undefined): boolean {
  return !!status && SEND_LIKE_STATUSES.has(status.trim().toLowerCase());
}

export type ChaseFields = { status: string | null; at: string | null };

/**
 * What a bulk sync may store under maker-checker. A send-like status can only come through the
 * approval check on PATCH /aging/:id/chase or POST /chase/events, so here the stored value wins.
 * It is written back explicitly because a replace sync deletes the row before re-inserting it.
 */
export function sodSafeChaseFields(incoming: ChaseFields, stored: ChaseFields | undefined): ChaseFields {
  if (isSendLikeChaseStatus(incoming.status)) return stored ?? { status: null, at: null };
  // An unrelated status must not hide that a send already happened.
  if (isSendLikeChaseStatus(stored?.status)) return stored!;
  return incoming;
}

/** A replace sync is how the chase tool removes invoices, also for members, so a few are normal. */
export const MEMBER_REPLACE_DELETE_LIMIT = 5;

/**
 * Whether this replace sync may delete. Admins always may. For a member, a sync that would drop
 * more rows than the limit only updates: it is either a stale browser tab or an attempt to wipe
 * the workspace, and either way the data should survive.
 */
export function replaceMayDelete(
  role: "admin" | "member",
  storedIds: Iterable<string>,
  incomingIds: Iterable<string>
): boolean {
  if (role === "admin") return true;
  const keep = new Set(incomingIds);
  let removed = 0;
  for (const id of storedIds) {
    if (!keep.has(id)) removed += 1;
  }
  return removed <= MEMBER_REPLACE_DELETE_LIMIT;
}
