-- AAA-12 / D05-1: durable channel effect journal.
--
-- Additive migration. It records the delivery identity of a channel operation
-- per (tenant_id, channel, operation_kind, idempotency_key) so concurrent
-- workers and restarts cannot send the same operation twice. No legacy table
-- is modified.

CREATE TABLE IF NOT EXISTS channel_effect_journal (
  tenant_id text NOT NULL,
  channel text NOT NULL,
  operation_kind text NOT NULL CHECK (operation_kind IN ('outbound_message')),
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  hash_version text NOT NULL DEFAULT 'legacy-local-v1',
  state text NOT NULL CHECK (state IN
    ('PENDING','SENDING','CONFIRMED','FAILED','UNCERTAIN','EXPIRED')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  lease_owner text,
  lease_expires_at timestamptz,
  result jsonb,
  error_code text,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, channel, operation_kind, idempotency_key)
);

-- Expired/orphaned SENDING rows must be recoverable without a second send;
-- the lease pair is only present while a worker owns the operation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'channel_effect_journal_lease_check'
  ) THEN
    ALTER TABLE channel_effect_journal
      ADD CONSTRAINT channel_effect_journal_lease_check
      CHECK (
        state <> 'SENDING'
        OR (lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'channel_effect_journal_terminal_check'
  ) THEN
    ALTER TABLE channel_effect_journal
      ADD CONSTRAINT channel_effect_journal_terminal_check
      CHECK (
        state <> 'CONFIRMED'
        OR (result IS NOT NULL AND lease_owner IS NULL AND lease_expires_at IS NULL)
      ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_channel_effect_journal_lease
  ON channel_effect_journal (tenant_id, state, lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_channel_effect_journal_updated
  ON channel_effect_journal (tenant_id, updated_at DESC);

ALTER TABLE channel_effect_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_effect_journal FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_effect_journal_tenant_isolation
  ON channel_effect_journal;
CREATE POLICY channel_effect_journal_tenant_isolation
  ON channel_effect_journal
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));

REVOKE ALL ON channel_effect_journal FROM PUBLIC;

COMMENT ON TABLE channel_effect_journal IS
  'Durable per-(tenant, channel, operation_kind, key) delivery journal. The gateway sends only after an atomic reservation; CONFIRMED/FAILED are terminal.';
COMMENT ON COLUMN channel_effect_journal.hash_version IS
  'Canonicalization version of payload_hash; legacy-local-v1 is the additive default, records with unknown versions fail closed (hash_algorithm_mismatch).';
COMMENT ON COLUMN channel_effect_journal.lease_owner IS
  'Fencing token of the worker that owns the attempt; transitions with a stale token return lease_lost and never overwrite another worker result.';
