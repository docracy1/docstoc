-- docstoc migration 0048 (15.11.2026): Stripe subscription expiry and past_due grace
-- (src/lib/billingState.ts). Apply once with
--   npx wrangler d1 execute chasa-db --remote --file=apps/worker/migrations/0048_billing_period_end.sql
-- (or `wrangler d1 migrations apply chasa-db --remote`). Not idempotent: SQLite has no
-- ADD COLUMN IF NOT EXISTS, a second run fails with "duplicate column name" and changes nothing.
--
-- current_period_end: end of the paid period of the account's Stripe subscription, as read live from
--   Stripe on every subscription webhook. An account with a stripe_subscription_id counts as free
--   once now > current_period_end + 3 days, so a missed renewal webhook can no longer leave a paid
--   plan running forever.
-- past_due_since: first time the subscription was seen past_due. A past_due subscription keeps the
--   paid plan for 14 days from then, after that the account counts as free until Stripe reports it
--   active again (which clears the column).
--
-- Both nullable: free accounts, manual/enterprise grants (no stripe_subscription_id) and every row
-- before the first webhook after this migration have no value. The code runs before and after this
-- migration: without the columns it skips the expiry and the past_due grace and keeps everything else.
ALTER TABLE accounts ADD COLUMN current_period_end TEXT;
ALTER TABLE accounts ADD COLUMN past_due_since TEXT;
