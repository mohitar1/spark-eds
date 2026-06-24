CREATE TABLE IF NOT EXISTS audit_events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           TEXT    NOT NULL,  -- Entra sub (stable pseudonymous)
  user_email        TEXT    NOT NULL,
  user_country      TEXT,              -- null if claim not yet available from Entra
  user_type         TEXT,              -- internal | agency | external; null if unavailable
  user_organisation TEXT,             -- agency/org name; null for internal users
  action            TEXT    NOT NULL,  -- view | download | share-link-copy | dm-url-copy | collection-add
  asset_id          TEXT    NOT NULL,
  occurred_at       TEXT    NOT NULL   -- ISO 8601 UTC
);

CREATE INDEX IF NOT EXISTS idx_ae_user    ON audit_events(user_email);
CREATE INDEX IF NOT EXISTS idx_ae_org     ON audit_events(user_organisation);
CREATE INDEX IF NOT EXISTS idx_ae_asset   ON audit_events(asset_id);
CREATE INDEX IF NOT EXISTS idx_ae_action  ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_ae_ts      ON audit_events(occurred_at);
