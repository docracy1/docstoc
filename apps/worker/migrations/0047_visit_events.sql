-- docstoc migration 0047 (13.11.2026): cookieless visitor count (src/lib/visits.ts), after firmenbuchdaten.at.
-- Idempotent. Apply with
--   npx wrangler d1 execute chasa-db --remote --file=apps/worker/migrations/0047_visit_events.sql
-- Creates one empty table and one index, writes no rows.
--
-- One row per page view ('view') or per leaving a page ('leave', its time is when the tab was hidden or closed).
-- No IP, no cookie, no ASN: day, time, path, kind of page, source host or utm_source, device class, country,
-- kind of network ('dc' data centre / 'isp' other / NULL unknown) and a visitor hash that changes every day
-- (SHA-256 of day, secret salt ANALYTICS_SALT, IP and user agent, 16 hex characters). Kept 180 days (daily cron).
-- Only one index besides the rowid: every index costs a billed D1 write per row.

CREATE TABLE IF NOT EXISTS visit_events (
  id INTEGER PRIMARY KEY,               -- rowid; grows with time, used for the daily cap and "online now"
  day TEXT NOT NULL,                    -- YYYY-MM-DD, UTC
  ts INTEGER NOT NULL,                  -- unix seconds
  ev TEXT NOT NULL DEFAULT 'view',      -- 'view' or 'leave'
  path TEXT NOT NULL,
  kind TEXT NOT NULL,                   -- home, template, category, blog, landing
  source TEXT,
  device TEXT,                          -- mobile, tablet, desktop
  country TEXT,                         -- two letters from Cloudflare
  net TEXT,                             -- 'dc', 'isp' or NULL
  visitor TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visit_events_day ON visit_events (day);
