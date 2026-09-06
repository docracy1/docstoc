-- SOX reporting: attributable audit events, maker/checker send approvals, retention settings

ALTER TABLE chase_events ADD COLUMN actor_account_id TEXT;
ALTER TABLE chase_events ADD COLUMN actor_email TEXT;
ALTER TABLE chase_events ADD COLUMN actor_role TEXT;

CREATE TABLE IF NOT EXISTS sox_audit_events (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  actor_account_id TEXT,
  actor_email TEXT NOT NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  summary TEXT NOT NULL,
  metadata TEXT,
  ip TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sox_audit_events_account
  ON sox_audit_events(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sox_audit_events_action
  ON sox_audit_events(account_id, action, created_at DESC);

CREATE TABLE IF NOT EXISTS sox_send_approvals (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  aging_invoice_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  subject TEXT,
  body_preview TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by_account_id TEXT NOT NULL,
  requested_by_email TEXT NOT NULL,
  decided_by_account_id TEXT,
  decided_by_email TEXT,
  decision_note TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sox_send_approvals_account
  ON sox_send_approvals(account_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sox_send_approvals_invoice
  ON sox_send_approvals(aging_invoice_id, status);

CREATE TABLE IF NOT EXISTS sox_settings (
  account_id TEXT PRIMARY KEY,
  sod_required INTEGER NOT NULL DEFAULT 0,
  retention_days INTEGER NOT NULL DEFAULT 2555,
  updated_at TEXT NOT NULL,
  updated_by_email TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
