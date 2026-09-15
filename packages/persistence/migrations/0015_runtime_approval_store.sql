-- PROD-04 / D01=C: durable runtime approval authority (ApprovalAuthority).
--
-- Additive migration. It persists the canonical ApprovalRecord fields produced
-- by the approval-engine state machine so a restart, a concurrent attempt or a
-- second generation can never reuse a reservation token. SQL is the
-- concurrency authority: every mutation compare-and-sets on
-- (revision, status, reservation_id, reservation_generation). No decision
-- logic lives here and no legacy table is modified.
--
-- Authorities kept distinct (contract v2 section 6): platform_capability_approvals
-- (migration 0002) and approval_requests (migration 0000).

CREATE TABLE IF NOT EXISTS runtime_approvals (
  tenant_id text NOT NULL,
  approval_id text NOT NULL,
  operator_id text NOT NULL,
  agent_id text NOT NULL,
  agent_version text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  payload_hash text NOT NULL,
  policy_version text NOT NULL,
  prompt_version text,
  correlation_id text NOT NULL,
  status text NOT NULL CHECK (status IN
    ('REQUESTED','PENDING','APPROVED','RESERVED','EXECUTING','REJECTED',
     'EXPIRED','CANCELLED','EXECUTED','FAILED','UNCERTAIN')),
  single_use boolean NOT NULL,
  requested_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  executed_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  expired_at timestamptz,
  approver_id text,
  decision_reason text,
  execution_count integer NOT NULL DEFAULT 0 CHECK (execution_count >= 0),
  execution_ref text,
  reservation_id text,
  reservation_owner text,
  reservation_expires_at timestamptz,
  reservation_generation bigint NOT NULL DEFAULT 0
    CHECK (reservation_generation >= 0),
  used_reservation_ids jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(used_reservation_ids) = 'array'),
  reserved_at timestamptz,
  executing_at timestamptz,
  released_at timestamptz,
  failed_at timestamptz,
  uncertain_at timestamptz,
  confirmed_at timestamptz,
  confirmation_evidence_ref text,
  proposal_id text,
  proposal_hash text,
  capability text,
  data_classification text,
  proposal_payload jsonb,
  operation_key text,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, approval_id)
);

CREATE INDEX IF NOT EXISTS idx_runtime_approvals_status_reservation_expires
  ON runtime_approvals (tenant_id, status, reservation_expires_at);
CREATE INDEX IF NOT EXISTS idx_runtime_approvals_operation_key
  ON runtime_approvals (tenant_id, operation_key);

ALTER TABLE runtime_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE runtime_approvals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS runtime_approvals_tenant_isolation ON runtime_approvals;
CREATE POLICY runtime_approvals_tenant_isolation
  ON runtime_approvals
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));

REVOKE ALL ON runtime_approvals FROM PUBLIC;

COMMENT ON TABLE runtime_approvals IS
  'Durable ApprovalRecord state machine (PROD-04). Reservations are single-use per generation; every mutation compare-and-sets on revision, status, reservation_id and reservation_generation.';
COMMENT ON COLUMN runtime_approvals.revision IS
  'Monotonic compare-and-set revision. Every persisted transition increments it; a stale revision never matches.';
COMMENT ON COLUMN runtime_approvals.reservation_generation IS
  'Generation counter retained after release/failure so a token from an older generation can never confirm or mutate a newer reservation.';
COMMENT ON COLUMN runtime_approvals.used_reservation_ids IS
  'Reservation tokens already consumed by previous generations; reusing one fails closed in the engine.';
COMMENT ON COLUMN runtime_approvals.proposal_payload IS
  'Synthetic/classified proposal payload required to revalidate execution at restart; real clinical or financial data stays blocked (D02/D05).';
COMMENT ON COLUMN runtime_approvals.operation_key IS
  'Stable governed operation identity. Not unique: the effect journal (0013) is the authority that binds a key to a single effect.';
COMMENT ON COLUMN runtime_approvals.execution_ref IS
  'Reference to the confirmed effect. Result digests remain in the effect journal (0013), never duplicated here.';
