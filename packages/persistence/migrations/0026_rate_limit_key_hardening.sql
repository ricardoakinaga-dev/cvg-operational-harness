-- REM21-007 — HMAC/versioned rate-limit keys and active-budget safety.
--
-- `rate_limit_buckets` contains ephemeral budget state. The pre-0026 `key`
-- column could contain an operational key such as an IP address. Clear the
-- ephemeral rows before dropping it, then retain only HMAC projections.
-- Changing the stable budget namespace is a separate migration decision; a
-- normal signing-key rotation does not change `budget_key`.
BEGIN;

TRUNCATE TABLE rate_limit_buckets;

ALTER TABLE rate_limit_buckets
  DROP CONSTRAINT IF EXISTS rate_limit_buckets_pkey,
  DROP COLUMN IF EXISTS key,
  ADD COLUMN IF NOT EXISTS budget_key text,
  ADD COLUMN IF NOT EXISTS key_version text,
  ADD COLUMN IF NOT EXISTS key_digest text;

ALTER TABLE rate_limit_buckets
  ALTER COLUMN budget_key SET NOT NULL,
  ALTER COLUMN key_version SET NOT NULL,
  ALTER COLUMN key_digest SET NOT NULL;

ALTER TABLE rate_limit_buckets
  ADD CONSTRAINT rate_limit_buckets_pkey PRIMARY KEY (budget_key),
  ADD CONSTRAINT rate_limit_buckets_key_version_check
    CHECK (key_version ~ '^[A-Za-z0-9._:-]{3,80}$'),
  ADD CONSTRAINT rate_limit_buckets_key_digest_check
    CHECK (key_digest ~ '^[0-9a-f]{64}$');

DROP INDEX IF EXISTS idx_rate_limit_buckets_reset_at;
CREATE INDEX idx_rate_limit_buckets_reset_at
  ON rate_limit_buckets (reset_at);

REVOKE ALL ON rate_limit_buckets FROM PUBLIC;

COMMIT;
