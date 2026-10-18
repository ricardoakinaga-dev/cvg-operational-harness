-- Controlled release-candidate evidence only. This ledger never publishes,
-- deploys, activates or authorizes a provider, channel or capability.
CREATE TABLE IF NOT EXISTS platform_release_candidates (
  tenant_id text NOT NULL,
  id text PRIMARY KEY
    CONSTRAINT platform_release_candidates_id_check
    CHECK (id ~ '^release_candidate_[0-9a-f-]{36}$'),
  agent_id text NOT NULL
    CONSTRAINT platform_release_candidates_agent_id_check
    CHECK (agent_id ~ '^agent_[0-9a-f-]{36}$'),
  version_id text NOT NULL
    CONSTRAINT platform_release_candidates_version_id_check
    CHECK (version_id ~ '^agent_version_[0-9a-f-]{36}$'),
  evidence_digest text NOT NULL
    CONSTRAINT platform_release_candidates_digest_check
    CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  gate_results jsonb NOT NULL
    CONSTRAINT platform_release_candidates_gates_check
    CHECK (
      jsonb_typeof(gate_results) = 'array'
      AND jsonb_array_length(gate_results) = 4
      AND gate_results @> '[{"key":"safety_preflight"}]'::jsonb
      AND gate_results @> '[{"key":"test_lab_regression"}]'::jsonb
      AND gate_results @> '[{"key":"snapshot_integrity"}]'::jsonb
      AND gate_results @> '[{"key":"external_boundary"}]'::jsonb
    ),
  status text NOT NULL
    CONSTRAINT platform_release_candidates_status_check
    CHECK (status IN ('DRAFT', 'VALIDATED', 'REJECTED', 'ARCHIVED')),
  created_by text NOT NULL
    CONSTRAINT platform_release_candidates_created_by_check
    CHECK (btrim(created_by) <> ''),
  validated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  tenant_isolation_quarantined boolean NOT NULL DEFAULT false,
  CONSTRAINT platform_release_candidates_identity_key
    UNIQUE (tenant_id, agent_id, version_id, evidence_digest),
  CONSTRAINT platform_release_candidates_validation_actor_check
    CHECK (status <> 'VALIDATED' OR (validated_by IS NOT NULL AND btrim(validated_by) <> '' AND validated_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_platform_release_candidates_tenant_status
  ON platform_release_candidates (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_release_candidates_tenant_agent
  ON platform_release_candidates (tenant_id, agent_id, version_id, updated_at DESC);

CREATE OR REPLACE FUNCTION cvg_release_candidates_update_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.agent_id IS DISTINCT FROM NEW.agent_id
     OR OLD.version_id IS DISTINCT FROM NEW.version_id
     OR OLD.evidence_digest IS DISTINCT FROM NEW.evidence_digest
     OR OLD.gate_results IS DISTINCT FROM NEW.gate_results
     OR OLD.created_by IS DISTINCT FROM NEW.created_by
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.tenant_isolation_quarantined IS DISTINCT FROM NEW.tenant_isolation_quarantined
  THEN
    RAISE EXCEPTION 'Release candidate evidence identity is immutable';
  END IF;

  IF OLD.status = NEW.status
     AND OLD.validated_by IS NOT DISTINCT FROM NEW.validated_by
     AND OLD.validated_at IS NOT DISTINCT FROM NEW.validated_at
  THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'DRAFT' AND NEW.status IN ('VALIDATED', 'REJECTED', 'ARCHIVED') THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('VALIDATED', 'REJECTED') AND NEW.status = 'ARCHIVED' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Release candidate status transition is invalid';
END;
$$;

DROP TRIGGER IF EXISTS platform_release_candidates_update_guard
  ON platform_release_candidates;
CREATE TRIGGER platform_release_candidates_update_guard
  BEFORE UPDATE ON platform_release_candidates
  FOR EACH ROW
  EXECUTE FUNCTION cvg_release_candidates_update_guard();

ALTER TABLE platform_release_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_release_candidates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_release_candidates_tenant_isolation
  ON platform_release_candidates;
CREATE POLICY platform_release_candidates_tenant_isolation
  ON platform_release_candidates
  USING (
    tenant_isolation_quarantined = false
    AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')
  )
  WITH CHECK (
    tenant_isolation_quarantined = false
    AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')
  );
