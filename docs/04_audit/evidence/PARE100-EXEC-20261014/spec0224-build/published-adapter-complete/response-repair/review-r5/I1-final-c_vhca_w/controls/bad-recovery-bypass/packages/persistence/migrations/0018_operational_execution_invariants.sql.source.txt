-- AAA-21-R2: application/database parity for execution state invariants.
--
-- This migration intentionally fails closed if an earlier operational row is
-- impossible. It does not rewrite or quarantine an unknown execution result.

ALTER TABLE operational_executions
  ADD CONSTRAINT operational_executions_success_payload
  CHECK (
    state <> 'SUCCEEDED'
    OR (result IS NOT NULL AND failure IS NULL)
  );

ALTER TABLE operational_executions
  ADD CONSTRAINT operational_executions_failure_payload
  CHECK (
    state NOT IN ('FAILED_RETRYABLE', 'FAILED_TERMINAL', 'CANCELLED')
    OR failure IS NOT NULL
  );

ALTER TABLE operational_executions
  ADD CONSTRAINT operational_executions_retry_failure_kind
  CHECK (
    state <> 'FAILED_RETRYABLE'
    OR failure ->> 'kind' = 'TECHNICAL_RETRYABLE'
  );

ALTER TABLE operational_executions
  ADD CONSTRAINT operational_executions_cancel_failure_kind
  CHECK (
    state <> 'CANCELLED'
    OR failure ->> 'kind' = 'CANCELLED'
  );

ALTER TABLE operational_executions
  ADD CONSTRAINT operational_executions_inactive_lease_clear
  CHECK (
    state IN ('CLAIMED', 'RUNNING')
    OR (lease_owner IS NULL AND lease_until IS NULL)
  );

ALTER TABLE operational_executions
  ADD CONSTRAINT operational_executions_completed_timestamp_shape
  CHECK (
    completed_at IS NULL
    OR state IN ('SUCCEEDED', 'FAILED_TERMINAL', 'CANCELLED')
  );

COMMENT ON CONSTRAINT operational_executions_success_payload
  ON operational_executions IS
  'A successful execution has a result and no failure payload.';
COMMENT ON CONSTRAINT operational_executions_failure_payload
  ON operational_executions IS
  'Retryable, terminal, and cancelled executions carry a failure payload.';
COMMENT ON CONSTRAINT operational_executions_inactive_lease_clear
  ON operational_executions IS
  'Only claimed/running executions may retain a worker lease.';
