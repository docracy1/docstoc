import type { Env } from "../types";
import { seatLimitForPlan, type Plan } from "./billing";
import { generateOpaqueToken, hashOpaqueToken, hashOpaqueTokenLookup } from "./token";

export type MemberRole = "admin" | "member";

export const INVITE_TTL_DAYS = 14;

export function isInviteExpired(invitedAt: string | null, now = Date.now()): boolean {
  if (!invitedAt) return false;
  const sent = Date.parse(invitedAt);
  return Number.isFinite(sent) && now - sent > INVITE_TTL_DAYS * 86_400_000;
}
export type MemberStatus = "pending" | "active";

export type WorkspaceMember = {
  id: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  invitedAt: string;
  joinedAt: string | null;
};

export async function countSeatsUsed(env: Env, workspaceId: string): Promise<number> {
  // Owner counts as 1; plus pending/active invites.
  const row = await env.CHASA_DB.prepare(
    `SELECT COUNT(*) as n FROM workspace_members WHERE account_id = ?`
  )
    .bind(workspaceId)
    .first<{ n: number }>();
  return 1 + (row?.n ?? 0);
}

export function seatsRemaining(plan: Plan, used: number): number {
  return Math.max(0, seatLimitForPlan(plan) - used);
}

export async function listMembers(env: Env, workspaceId: string): Promise<WorkspaceMember[]> {
  const { results } = await env.CHASA_DB.prepare(
    `SELECT id, email, role, status, invited_at, joined_at
     FROM workspace_members WHERE account_id = ? ORDER BY invited_at ASC`
  )
    .bind(workspaceId)
    .all<{
      id: string;
      email: string;
      role: string;
      status: string;
      invited_at: string;
      joined_at: string | null;
    }>();

  return (results ?? []).map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role === "admin" ? "admin" : "member",
    status: r.status === "active" ? "active" : "pending",
    invitedAt: r.invited_at,
    joinedAt: r.joined_at,
  }));
}

export async function inviteMember(
  env: Env,
  workspaceId: string,
  email: string,
  role: MemberRole,
  plan: Plan
): Promise<{ member: WorkspaceMember; inviteToken: string } | { error: string; status: number }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return { error: "Enter a valid email.", status: 400 };

  const owner = await env.CHASA_DB.prepare(`SELECT email FROM accounts WHERE id = ?`)
    .bind(workspaceId)
    .first<{ email: string }>();
  if (owner && owner.email.toLowerCase() === normalized) {
    return { error: "That email is already the workspace owner.", status: 400 };
  }

  const existing = await env.CHASA_DB.prepare(
    `SELECT id FROM workspace_members WHERE account_id = ? AND email = ?`
  )
    .bind(workspaceId, normalized)
    .first<{ id: string }>();
  if (existing) return { error: "That email is already invited.", status: 409 };

  const seatCap = seatLimitForPlan(plan);
  const maxMemberRows = Math.max(0, seatCap - 1);

  const inviteToken = generateOpaqueToken();
  const inviteTokenHash = await hashOpaqueToken(inviteToken, env.TOKEN_SECRET, "invite");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const inserted = await env.CHASA_DB.prepare(
    `INSERT INTO workspace_members
       (id, account_id, email, role, status, invite_token_hash, invited_at, joined_at)
     SELECT ?, ?, ?, ?, 'pending', ?, ?, NULL
     WHERE (SELECT COUNT(*) FROM workspace_members WHERE account_id = ?) < ?`
  )
    .bind(id, workspaceId, normalized, role, inviteTokenHash, now, workspaceId, maxMemberRows)
    .run();

  if (!inserted.meta.changes) {
    return {
      error: `Seat limit reached for this plan (${seatCap} seats). Upgrade for more.`,
      status: 402,
    };
  }

  return {
    member: {
      id,
      email: normalized,
      role,
      status: "pending",
      invitedAt: now,
      joinedAt: null,
    },
    inviteToken,
  };
}

export async function acceptInvite(
  env: Env,
  inviteToken: string,
  signedInEmail: string,
  signedInAccountId: string
): Promise<{ ok: true; workspaceId: string } | { error: string; status: number }> {
  const [primaryHash, legacyHash] = await hashOpaqueTokenLookup(inviteToken, env.TOKEN_SECRET, "invite");
  let row = await env.CHASA_DB.prepare(
    `SELECT id, account_id, email, status, invited_at FROM workspace_members WHERE invite_token_hash = ?`
  )
    .bind(primaryHash)
    .first<{ id: string; account_id: string; email: string; status: string; invited_at: string | null }>();
  if (!row) {
    row = await env.CHASA_DB.prepare(
      `SELECT id, account_id, email, status, invited_at FROM workspace_members WHERE invite_token_hash = ?`
    )
      .bind(legacyHash)
      .first<{ id: string; account_id: string; email: string; status: string; invited_at: string | null }>();
  }

  if (!row) return { error: "Invite is invalid or expired.", status: 404 };
  if (isInviteExpired(row.invited_at)) return { error: "Invite is invalid or expired.", status: 404 };
  if (row.email.toLowerCase() !== signedInEmail.trim().toLowerCase()) {
    return { error: "Sign in with the invited email address to accept.", status: 403 };
  }

  const now = new Date().toISOString();
  await env.CHASA_DB.prepare(
    `UPDATE workspace_members SET status = 'active', joined_at = ?, invite_token_hash = NULL WHERE id = ?`
  )
    .bind(now, row.id)
    .run();

  await env.CHASA_DB.prepare(`UPDATE accounts SET workspace_owner_id = ? WHERE id = ?`)
    .bind(row.account_id, signedInAccountId)
    .run();

  return { ok: true, workspaceId: row.account_id };
}

export async function removeMember(
  env: Env,
  workspaceId: string,
  memberId: string
): Promise<boolean> {
  const row = await env.CHASA_DB.prepare(
    `SELECT email FROM workspace_members WHERE id = ? AND account_id = ?`
  )
    .bind(memberId, workspaceId)
    .first<{ email: string }>();
  if (!row) return false;

  await env.CHASA_DB.prepare(`DELETE FROM workspace_members WHERE id = ? AND account_id = ?`)
    .bind(memberId, workspaceId)
    .run();

  await env.CHASA_DB.prepare(
    `UPDATE accounts SET workspace_owner_id = NULL WHERE email = ? AND workspace_owner_id = ?`
  )
    .bind(row.email, workspaceId)
    .run();

  return true;
}

export async function updateMemberRole(
  env: Env,
  workspaceId: string,
  memberId: string,
  role: MemberRole
): Promise<boolean> {
  const result = await env.CHASA_DB.prepare(
    `UPDATE workspace_members SET role = ? WHERE id = ? AND account_id = ?`
  )
    .bind(role, memberId, workspaceId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function sendInviteEmail(
  env: Env,
  to: string,
  inviteUrl: string,
  inviterEmail: string,
  inviterAccountId: string
): Promise<void> {
  const { sendTeamInviteEmail } = await import("./email");
  const { getAccountLocale } = await import("./locale");
  // The invitee hasn't signed up yet, so there's no preference of their own to read — the
  // inviter's own locale is the best available guess for what language to send this in.
  const locale = await getAccountLocale(env, inviterAccountId);
  await sendTeamInviteEmail(env, to, inviterEmail, inviteUrl, locale);
}
