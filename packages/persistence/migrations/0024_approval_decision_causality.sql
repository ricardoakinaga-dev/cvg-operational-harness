-- AUD20-007: retain the immutable human decision envelope on the approval row.
--
-- The existing approval, policy and payload fields remain the authority for the
-- request. These additive fields bind the decision request itself so a worker
-- can recover an audit event without inventing actor or correlation metadata.

ALTER TABLE runtime_approvals
  ADD COLUMN IF NOT EXISTS decision_actor_type text;

ALTER TABLE runtime_approvals
  ADD COLUMN IF NOT EXISTS decision_correlation_id text;

ALTER TABLE runtime_approvals
  ADD COLUMN IF NOT EXISTS decision_command_key text;

COMMENT ON COLUMN runtime_approvals.decision_actor_type IS
  'Trusted role that made the durable approval decision; legacy null values fail closed during recovery.';
COMMENT ON COLUMN runtime_approvals.decision_correlation_id IS
  'Correlation generated for the decision request, distinct from the original approval request correlation.';
COMMENT ON COLUMN runtime_approvals.decision_command_key IS
  'Idempotency-Key of the decision request; it is retained for exact recovery provenance.';
