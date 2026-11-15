import type { Env } from "../types";

/**
 * Stripe event idempotency. The event is recorded only after its handlers succeeded, so a handler
 * that throws leaves no record and Stripe's retry processes it again. A D1 error while checking
 * counts as "not seen yet": handlers are idempotent (they apply live Stripe state), a second run is
 * harmless, a lost event is not.
 */
export async function isStripeEventProcessed(env: Env, eventId: string): Promise<boolean> {
  if (!eventId.trim()) return false;
  try {
    const row = await env.CHASA_DB.prepare(`SELECT id FROM stripe_events WHERE id = ?`).bind(eventId).first<{ id: string }>();
    return Boolean(row);
  } catch (err) {
    console.error("stripe_events lookup failed, processing the event anyway:", err);
    return false;
  }
}

/** Records a processed event. Never throws: a failed write only means a retry runs the idempotent handlers again. */
export async function recordStripeEvent(env: Env, eventId: string): Promise<void> {
  if (!eventId.trim()) return;
  try {
    await env.CHASA_DB.prepare(`INSERT OR IGNORE INTO stripe_events (id, processed_at) VALUES (?, ?)`)
      .bind(eventId, new Date().toISOString())
      .run();
  } catch (err) {
    console.error("stripe_events insert failed:", err);
  }
}

export function parseStripeEventId(rawBody: string): string | null {
  try {
    const event = JSON.parse(rawBody) as { id?: unknown };
    return typeof event.id === "string" ? event.id : null;
  } catch {
    return null;
  }
}
