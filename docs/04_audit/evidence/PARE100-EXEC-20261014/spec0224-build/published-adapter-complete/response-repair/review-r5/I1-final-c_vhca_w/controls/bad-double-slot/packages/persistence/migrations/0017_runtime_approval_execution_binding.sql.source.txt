-- AAA-21-R1: one durable approval per tenant/execution/operation binding.
--
-- operation_key remains non-unique globally because the effect journal owns the
-- effect identity. The neutral execution lane nevertheless must not create
-- two approvals for the same execution and operation during a retry race.

ALTER TABLE operational_execution_events
  ADD COLUMN IF NOT EXISTS approval_id text;

CREATE INDEX IF NOT EXISTS idx_operational_execution_events_approval
  ON operational_execution_events (tenant_id, approval_id, sequence)
  WHERE approval_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM operational_executions e
     WHERE e.approval_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM runtime_approvals a
          WHERE a.tenant_id = e.tenant_id
            AND a.approval_id = e.approval_id
       )
  ) THEN
    RAISE EXCEPTION
      'operational_executions contains an approval binding absent from runtime_approvals';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'operational_executions_approval_binding'
       AND conrelid = 'operational_executions'::regclass
  ) THEN
    ALTER TABLE operational_executions
      ADD CONSTRAINT operational_executions_approval_binding
      FOREIGN KEY (tenant_id, approval_id)
      REFERENCES runtime_approvals (tenant_id, approval_id);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM operational_executions
     WHERE state = 'WAITING_APPROVAL'
       AND approval_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'operational_executions contains WAITING_APPROVAL rows without approval_id';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'operational_executions_waiting_approval_id'
       AND conrelid = 'operational_executions'::regclass
  ) THEN
    ALTER TABLE operational_executions
      ADD CONSTRAINT operational_executions_waiting_approval_id
      CHECK (state <> 'WAITING_APPROVAL' OR approval_id IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT tenant_id, operation_key, execution_ref
      FROM runtime_approvals
     WHERE operation_key IS NOT NULL
       AND execution_ref IS NOT NULL
     GROUP BY tenant_id, operation_key, execution_ref
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'runtime_approvals contains duplicate execution approval bindings';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_runtime_approvals_execution_binding
  ON runtime_approvals (tenant_id, operation_key, execution_ref)
  WHERE operation_key IS NOT NULL AND execution_ref IS NOT NULL;

COMMENT ON INDEX uq_runtime_approvals_execution_binding IS
  'AAA-21-R1: prevents concurrent duplicate approvals for one execution operation binding.';
