-- Timestamped SOX auditor packs (exact HTML bytes + OpenTimestamps proof)

CREATE TABLE IF NOT EXISTS sox_auditor_packs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  from_date TEXT NOT NULL,
  to_date TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  html_content TEXT NOT NULL,
  invoice_count INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  created_by_email TEXT,
  ots_status TEXT NOT NULL DEFAULT 'none',
  ots_proof_base64 TEXT,
  ots_calendar_url TEXT,
  ots_submitted_at TEXT,
  ots_confirmed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sox_auditor_packs_account
  ON sox_auditor_packs(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sox_auditor_packs_pending
  ON sox_auditor_packs(ots_status) WHERE ots_status = 'pending';
