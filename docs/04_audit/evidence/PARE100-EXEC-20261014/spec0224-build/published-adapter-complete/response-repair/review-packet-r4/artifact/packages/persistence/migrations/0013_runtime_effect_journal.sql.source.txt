-- AAA-10 / D05-1: durable runtime effect journal (EffectJournalPort).
--
-- Additive migration. It records the governed operation identity per
-- (tenant_id, operation_key) so a retry, a concurrent attempt or a restart
-- can never execute the same effect twice. No legacy table is modified.

CREATE TABLE IF NOT EXISTS effect_journal (
  tenant_id text NOT NULL,
  operation_key text NOT NULL,
  proposal_hash text NOT NULL,
  state text NOT NULL CHECK (state IN
    ('RESERVED','EFFECT_STARTED','CONFIRMED','EFFECT_FAILED','UNCERTAIN','ABANDONED')),
  attempt_id text NOT NULL,
  execution_ref text,
  result_digest text,
  error_code text,
  reason text,
  expires_at timestamptz NOT NULL,
  reconciled_by text,
  reconciliation_evidence_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (tenant_id, operation_key)
);

-- Terminal and reconciliation invariants. They are NOT VALID so the additive
-- migration never rewrites existing rows; new writes are enforced immediately.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'effect_journal_confirmed_check'
  ) THEN
    ALTER TABLE effect_journal
      ADD CONSTRAINT effect_journal_confirmed_check
      CHECK (
        state <> 'CONFIRMED'
        OR execution_ref IS NOT NULL
        OR reconciled_by IS NOT NULL
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'effect_journal_reconciliation_check'
  ) THEN
    ALTER TABLE effect_journal
      ADD CONSTRAINT effect_journal_reconciliation_check
      CHECK (
        reconciled_by IS NULL
        OR reconciliation_evidence_ref IS NOT NULL
      ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_effect_journal_state_expires
  ON effect_journal (tenant_id, state, expires_at);
CREATE INDEX IF NOT EXISTS idx_effect_journal_updated
  ON effect_journal (tenant_id, updated_at DESC);

ALTER TABLE effect_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE effect_journal FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS effect_journal_tenant_isolation ON effect_journal;
CREATE POLICY effect_journal_tenant_isolation
  ON effect_journal
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));

REVOKE ALL ON effect_journal FROM PUBLIC;

COMMENT ON TABLE effect_journal IS
  'Durable runtime effect intent per (tenant_id, operation_key). RESERVED/EFFECT_STARTED gate the tool; CONFIRMED and EFFECT_FAILED are immutable; UNCERTAIN requires explicit reconciliation.';
COMMENT ON COLUMN effect_journal.attempt_id IS
  'Fencing token of the attempt that owns the record; transitions with a mismatched attempt_id fail closed with attempt_mismatch.';
COMMENT ON COLUMN effect_journal.result_digest IS
  'Canonical digest of the confirmed result for replay without reexecution; sensitive payloads are never duplicated in the journal.';
COMMENT ON COLUMN effect_journal.expires_at IS
  'Reservation deadline evaluated by releaseExpired; expiry never executes an effect (RESERVED becomes ABANDONED, EFFECT_STARTED becomes UNCERTAIN).';
