-- SPEC 0317 G1: the durable author of an execution and of the approval it asks for.
--
-- Additive: older rows take kind 'unknown' from the default and keep it, because neither the agent
-- id nor a partial log proves who asked. Unknown never authorizes an approval; such a pending
-- approval is rejected and recreated, or handed off. No backfill invents an identity, and no
-- UPDATE may change these columns afterwards: not the store, not the runtime role, not a person
-- with a direct connection. requester_binding is versioned and only ever computed for new records.

ALTER TABLE operational_executions
  ADD COLUMN IF NOT EXISTS submitted_by_kind text NOT NULL DEFAULT 'unknown';

ALTER TABLE operational_executions
  ADD COLUMN IF NOT EXISTS submitted_by_id text;

ALTER TABLE operational_executions
  ADD COLUMN IF NOT EXISTS submitted_by_tenant_id text;

ALTER TABLE runtime_approvals
  ADD COLUMN IF NOT EXISTS requested_by_kind text NOT NULL DEFAULT 'unknown';

ALTER TABLE runtime_approvals
  ADD COLUMN IF NOT EXISTS requested_by_id text;

ALTER TABLE runtime_approvals
  ADD COLUMN IF NOT EXISTS requested_by_tenant_id text;

ALTER TABLE runtime_approvals
  ADD COLUMN IF NOT EXISTS requester_binding text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'operational_executions_submitted_by_check'
       AND conrelid = 'operational_executions'::regclass
  ) THEN
    ALTER TABLE operational_executions
      ADD CONSTRAINT operational_executions_submitted_by_check CHECK (
        (
          submitted_by_kind = 'unknown'
          AND submitted_by_id IS NULL
          AND submitted_by_tenant_id IS NULL
        )
        OR (
          submitted_by_kind IN ('human', 'system')
          AND submitted_by_id IS NOT NULL
          AND char_length(submitted_by_id) BETWEEN 1 AND 120
          AND submitted_by_tenant_id IS NOT NULL
          AND submitted_by_tenant_id = tenant_id
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'runtime_approvals_requested_by_check'
       AND conrelid = 'runtime_approvals'::regclass
  ) THEN
    ALTER TABLE runtime_approvals
      ADD CONSTRAINT runtime_approvals_requested_by_check CHECK (
        (
          requested_by_kind = 'unknown'
          AND requested_by_id IS NULL
          AND requested_by_tenant_id IS NULL
          AND requester_binding IS NULL
        )
        OR (
          requested_by_kind IN ('human', 'system')
          AND requested_by_id IS NOT NULL
          AND char_length(requested_by_id) BETWEEN 1 AND 120
          AND requested_by_tenant_id IS NOT NULL
          AND requested_by_tenant_id = tenant_id
          AND requester_binding IS NOT NULL
          AND requester_binding ~ '^v[0-9]+:[0-9a-f]{64}$'
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION cvg_operational_executions_submitted_by_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.submitted_by_kind IS DISTINCT FROM OLD.submitted_by_kind
     OR NEW.submitted_by_id IS DISTINCT FROM OLD.submitted_by_id
     OR NEW.submitted_by_tenant_id IS DISTINCT FROM OLD.submitted_by_tenant_id THEN
    RAISE EXCEPTION 'operational_executions submitted_by is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS operational_executions_submitted_by_immutable ON operational_executions;
CREATE TRIGGER operational_executions_submitted_by_immutable
  BEFORE UPDATE ON operational_executions
  FOR EACH ROW EXECUTE FUNCTION cvg_operational_executions_submitted_by_immutable();

CREATE OR REPLACE FUNCTION cvg_runtime_approvals_requested_by_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.requested_by_kind IS DISTINCT FROM OLD.requested_by_kind
     OR NEW.requested_by_id IS DISTINCT FROM OLD.requested_by_id
     OR NEW.requested_by_tenant_id IS DISTINCT FROM OLD.requested_by_tenant_id
     OR NEW.requester_binding IS DISTINCT FROM OLD.requester_binding THEN
    RAISE EXCEPTION 'runtime_approvals requested_by is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS runtime_approvals_requested_by_immutable ON runtime_approvals;
CREATE TRIGGER runtime_approvals_requested_by_immutable
  BEFORE UPDATE ON runtime_approvals
  FOR EACH ROW EXECUTE FUNCTION cvg_runtime_approvals_requested_by_immutable();

COMMENT ON COLUMN operational_executions.submitted_by_kind IS
  'SPEC 0317 G1: human, system or unknown. unknown marks records older than the SPEC and never authorizes an approval. Immutable.';
COMMENT ON COLUMN runtime_approvals.requested_by_kind IS
  'SPEC 0317 G1: the execution author, compared with operational_executions.submitted_by_* at the decision. Immutable.';
COMMENT ON COLUMN runtime_approvals.requester_binding IS
  'SPEC 0317 G1: versioned hash of the execution, proposal revision and requester. Immutable.';
