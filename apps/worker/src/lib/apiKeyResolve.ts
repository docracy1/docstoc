import type { Env } from "../types";
import { hashOpaqueTokenLookup } from "./token";
import { isPaidPlan } from "./billing";
import { effectivePlan, withBillingColumns, type StoredBilling } from "./billingState";
import type { AccountContext } from "./auth";

async function resolveRoleForEmail(
  env: Env,
  workspaceId: string,
  email: string
): Promise<"admin" | "member"> {
  if (email.trim().toLowerCase() === "") return "member";
  const owner = await env.CHASA_DB.prepare(`SELECT email FROM accounts WHERE id = ?`)
    .bind(workspaceId)
    .first<{ email: string }>();
  if (owner && owner.email.toLowerCase() === email.trim().toLowerCase()) return "admin";

  const membership = await env.CHASA_DB.prepare(
    `SELECT role FROM workspace_members WHERE account_id = ? AND email = ? AND status = 'active'`
  )
    .bind(workspaceId, email.trim().toLowerCase())
    .first<{ role: string }>();

  if (membership?.role === "admin") return "admin";
  return "member";
}

async function accountFromApiKeyRow(
  env: Env,
  row: StoredBilling & {
    key_id: string;
    id: string;
    email: string;
    workspace_owner_id: string | null;
  }
): Promise<AccountContext> {
  await env.CHASA_DB.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), row.key_id)
    .run();

  let workspaceId = row.id;
  let plan = effectivePlan(row);
  let role: "admin" | "member" = "admin";

  if (row.workspace_owner_id) {
    const ownerId = row.workspace_owner_id;
    const owner = await withBillingColumns((cols) =>
      env.CHASA_DB.prepare(`SELECT id, is_paid, plan, ${cols()} FROM accounts WHERE id = ?`)
        .bind(ownerId)
        .first<{ id: string } & StoredBilling>()
    );
    if (owner) {
      workspaceId = owner.id;
      plan = effectivePlan(owner);
      role = await resolveRoleForEmail(env, owner.id, row.email);
    }
  }

  return {
    id: row.id,
    email: row.email,
    plan,
    isPaid: isPaidPlan(plan),
    workspaceId,
    role,
  };
}

export async function resolveAccountFromApiKeyBearer(
  env: Env,
  bearer: string
): Promise<AccountContext | null> {
  if (!bearer.startsWith("docstoc_")) return null;
  const [primaryHash, legacyHash] = await hashOpaqueTokenLookup(bearer, env.TOKEN_SECRET, "api-key");
  type Row = StoredBilling & {
    key_id: string;
    id: string;
    email: string;
    workspace_owner_id: string | null;
  };
  const row = await withBillingColumns(async (cols) => {
    const sql = `SELECT k.id as key_id, a.id as id, a.email as email, a.is_paid as is_paid, a.plan as plan,
              a.workspace_owner_id as workspace_owner_id, ${cols("a.")}
       FROM api_keys k
       JOIN accounts a ON a.id = k.account_id
       WHERE k.token_hash = ?`;
    return (
      (await env.CHASA_DB.prepare(sql).bind(primaryHash).first<Row>()) ??
      (await env.CHASA_DB.prepare(sql).bind(legacyHash).first<Row>())
    );
  });
  if (!row) return null;
  return accountFromApiKeyRow(env, row);
}
