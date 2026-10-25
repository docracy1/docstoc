import type { Env } from "../types";

export type AnalyticsQueryFailure =
  | { kind: "not_configured" }
  | { kind: "api_error"; status: number; detail: string };

export type AnalyticsQueryResult<T> = { ok: true; data: T } | { ok: false; failure: AnalyticsQueryFailure };

function missingConfig(env: Env): AnalyticsQueryFailure | null {
  if (!env.CF_ANALYTICS_ENGINE_TOKEN || !env.CF_ACCOUNT_ID) return { kind: "not_configured" };
  return null;
}

/** Analytics Engine's binding (env.ANALYTICS) is write-only from inside the Worker — reading
 *  aggregates back requires this separate HTTP API with a scoped API token (Account
 *  Analytics:Read), which isn't something this code can provision for itself. Returns a
 *  structured failure (not a thrown error) when the token/account id aren't configured yet or
 *  the SQL API rejects the query. */
export async function runAnalyticsSql<T>(env: Env, sql: string): Promise<AnalyticsQueryResult<T>> {
  const config = missingConfig(env);
  if (config) return { ok: false, failure: config };

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CF_ANALYTICS_ENGINE_TOKEN}`, "Content-Type": "text/plain" },
      body: sql,
    }
  );

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    return { ok: false, failure: { kind: "api_error", status: response.status, detail } };
  }

  const payload = (await response.json()) as { data?: T };
  return { ok: true, data: payload.data ?? ([] as T) };
}

export type AeDailyCount = { day: string; event: string; traffic_type: string; count: number };

/** Per-day, per-event, human/bot-split counts from Analytics Engine — the same shape needed to
 *  line up against the equivalent D1 `analytics_events` COUNT(*) GROUP BY query in
 *  getFunnelStats/getTrafficSources, so the two can be diffed day-by-day. Analytics Engine data
 *  can lag by a few minutes and is subject to sampling at high volume — expect small (not exact)
 *  differences even once the two sources agree. */
export async function queryAeDailyCounts(
  env: Env,
  days: number
): Promise<AnalyticsQueryResult<AeDailyCount[]>> {
  const sql = `
    SELECT
      toDate(timestamp) AS day,
      blob1 AS event,
      blob3 AS traffic_type,
      SUM(double1) AS count
    FROM docstoc_funnel
    WHERE timestamp > NOW() - INTERVAL '${Math.min(Math.max(days, 1), 90)}' DAY
    GROUP BY day, event, traffic_type
    ORDER BY day DESC, count DESC
  `;
  return runAnalyticsSql<AeDailyCount[]>(env, sql);
}

export type ParityRow = {
  day: string;
  event: string;
  d1Count: number;
  aeHumanCount: number;
  aeBotCount: number;
};

/** Lines up D1's existing per-day event counts against Analytics Engine's, so the founder can
 *  eyeball whether the two sources agree before any dashboard read is switched over. `d1Counts`
 *  is computed by the caller (from the existing analytics_events table — see admin.ts) so this
 *  function has no D1 dependency of its own; it only shapes the AE side and merges the two. */
export function buildParityRows(
  d1Counts: { day: string; event: string; count: number }[],
  aeCounts: AeDailyCount[]
): ParityRow[] {
  const byKey = new Map<string, ParityRow>();

  for (const row of d1Counts) {
    const key = `${row.day}:${row.event}`;
    byKey.set(key, { day: row.day, event: row.event, d1Count: row.count, aeHumanCount: 0, aeBotCount: 0 });
  }

  for (const row of aeCounts) {
    const key = `${row.day}:${row.event}`;
    const existing = byKey.get(key) ?? { day: row.day, event: row.event, d1Count: 0, aeHumanCount: 0, aeBotCount: 0 };
    if (row.traffic_type === "bot") existing.aeBotCount += row.count;
    else existing.aeHumanCount += row.count;
    byKey.set(key, existing);
  }

  return [...byKey.values()].sort((a, b) => b.day.localeCompare(a.day) || a.event.localeCompare(b.event));
}
