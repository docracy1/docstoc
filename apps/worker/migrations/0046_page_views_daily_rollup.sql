-- getTrafficStats' 5 GROUP BY queries against page_views scan almost the whole table on every
-- admin dashboard check (30-day default window ~= this product's whole lifetime so far), which
-- was 95% of a day's D1 rows_read budget. This rollup is updated by one cheap upsert per page
-- view instead, so the dashboard aggregates over dozens of rows per day instead of tens of
-- thousands.
CREATE TABLE page_views_daily (
  day TEXT NOT NULL,
  path TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '??',
  is_bot INTEGER NOT NULL DEFAULT 0,
  bot_name TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path, country, is_bot, bot_name)
);
CREATE INDEX idx_page_views_daily_day ON page_views_daily(day);

-- One-time backfill so existing history doesn't disappear from the dashboard.
INSERT INTO page_views_daily (day, path, country, is_bot, bot_name, count)
SELECT day, path, COALESCE(country, '??'), is_bot, COALESCE(bot_name, ''), COUNT(*)
FROM page_views
GROUP BY day, path, COALESCE(country, '??'), is_bot, COALESCE(bot_name, '');
