-- Deeper SOX: control library, period tests, retention enforcement / legal hold

ALTER TABLE sox_settings ADD COLUMN legal_hold INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sox_settings ADD COLUMN retention_enforced INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sox_controls (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  control_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  owner_email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  UNIQUE (account_id, control_key),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sox_controls_account
  ON sox_controls(account_id, status);

CREATE TABLE IF NOT EXISTS sox_control_tests (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  control_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  result TEXT NOT NULL,
  notes TEXT,
  tested_by_email TEXT NOT NULL,
  evidence_pack_id TEXT,
  tested_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (control_id) REFERENCES sox_controls(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sox_control_tests_account
  ON sox_control_tests(account_id, tested_at DESC);
CREATE INDEX IF NOT EXISTS idx_sox_control_tests_control
  ON sox_control_tests(control_id, tested_at DESC);
