-- Phase 3 (Runtime V2): iterative governed agent loop durability.
--
-- This migration is additive. It adds the step/checkpoint authority used by
-- the iterative runtime plus the durable resume binding for WAITING_USER,
-- without changing the Phase 2 execution/queue/effect-journal contracts.

ALTER TABLE operational_executions
  ADD COLUMN IF NOT EXISTS resume jsonb;

CREATE TABLE IF NOT EXISTS operational_execution_steps (
  tenant_id text NOT NULL,
  execution_id text NOT NULL,
  step_number integer NOT NULL CHECK (step_number >= 1),
  step_id text NOT NULL,
  step_type text NOT NULL CHECK (
    step_type IN (
      'MODEL', 'TOOL', 'KNOWLEDGE', 'POLICY', 'APPROVAL', 'USER_INPUT',
      'VERIFY', 'RESPOND', 'HANDOFF', 'STOP'
    )
  ),
  status text NOT NULL CHECK (
    status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'WAITING', 'SKIPPED')
  ),
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  side_effecting boolean NOT NULL DEFAULT false,
  decision_type text CHECK (
    decision_type IS NULL OR decision_type IN (
      'RESPOND', 'CALL_TOOL', 'SEARCH_KNOWLEDGE', 'ASK_USER',
      'REQUEST_APPROVAL', 'VERIFY', 'REPLAN', 'HANDOFF', 'STOP'
    )
  ),
  reason_code text,
  error_code text,
  observation_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  tenant_isolation_quarantined boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, execution_id, step_number),
  FOREIGN KEY (tenant_id, execution_id)
    REFERENCES operational_executions (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS operational_execution_checkpoints (
  tenant_id text NOT NULL,
  execution_id text NOT NULL,
  checkpoint_id text NOT NULL,
  checkpoint_version integer NOT NULL CHECK (checkpoint_version >= 1),
  runtime_profile text NOT NULL CHECK (runtime_profile IN ('single_pass', 'iterative')),
  runtime_version text NOT NULL,
  orchestrator_version text NOT NULL,
  step_number integer NOT NULL CHECK (step_number >= 0),
  state jsonb NOT NULL,
  budget_usage jsonb NOT NULL,
  digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_isolation_quarantined boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, execution_id),
  FOREIGN KEY (tenant_id, execution_id)
    REFERENCES operational_executions (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_operational_execution_steps_lookup
  ON operational_execution_steps (tenant_id, execution_id, step_number);

ALTER TABLE operational_execution_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_execution_steps FORCE ROW LEVEL SECURITY;
ALTER TABLE operational_execution_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_execution_checkpoints FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operational_execution_steps_tenant_isolation
  ON operational_execution_steps;
CREATE POLICY operational_execution_steps_tenant_isolation
  ON operational_execution_steps
  USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));

DROP POLICY IF EXISTS operational_execution_checkpoints_tenant_isolation
  ON operational_execution_checkpoints;
CREATE POLICY operational_execution_checkpoints_tenant_isolation
  ON operational_execution_checkpoints
  USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));

REVOKE ALL ON operational_execution_steps FROM PUBLIC;
REVOKE ALL ON operational_execution_checkpoints FROM PUBLIC;

COMMENT ON COLUMN operational_executions.resume IS
  'Phase 3 durable resume binding: {"kind":"approval"|"user_input",...} set by the authenticated resolveApproval/provideUserInput paths only.';
COMMENT ON TABLE operational_execution_steps IS
  'Phase 3 iterative runtime step ledger; one row per cognitive step, sequential by step_number.';
COMMENT ON TABLE operational_execution_checkpoints IS
  'Phase 3 bounded cognitive checkpoint (structured state + budget usage + digest); chain-of-thought is never persisted.';
