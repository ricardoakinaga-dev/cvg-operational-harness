-- Controlled audit evidence checkpoints retain only the reviewed event IDs and
-- their canonical metadata digest. They never copy raw event payloads.
CREATE TABLE IF NOT EXISTS audit_evidence_checkpoints (
  tenant_id text NOT NULL,
  id text PRIMARY KEY
    CONSTRAINT audit_evidence_checkpoints_id_check
    CHECK (id ~ '^audit_checkpoint_[0-9a-f-]{36}$'),
  filters jsonb NOT NULL
    CONSTRAINT audit_evidence_checkpoints_filters_check
    CHECK (
      jsonb_typeof(filters) = 'object'
      AND jsonb_array_length(jsonb_path_query_array(filters, '$.*')) <= 4
      AND NOT (filters ?| ARRAY['payload', 'body', 'content', 'secret'])
    ),
  event_ids jsonb NOT NULL
    CONSTRAINT audit_evidence_checkpoints_event_ids_check
    CHECK (
      jsonb_typeof(event_ids) = 'array'
      AND jsonb_array_length(event_ids) BETWEEN 1 AND 200
    ),
  event_count integer NOT NULL
    CONSTRAINT audit_evidence_checkpoints_event_count_check
    CHECK (event_count BETWEEN 1 AND 200),
  evidence_digest text NOT NULL
    CONSTRAINT audit_evidence_checkpoints_digest_check
    CHECK (evidence_digest ~ '^[0-9a-f]{64}$'),
  status text NOT NULL
    CONSTRAINT audit_evidence_checkpoints_status_check
    CHECK (status IN ('SEALED', 'ARCHIVED')),
  created_by text NOT NULL
    CONSTRAINT audit_evidence_checkpoints_created_by_check
    CHECK (created_by ~ '^[A-Za-z0-9._:-]{3,120}$'),
  updated_by text NOT NULL
    CONSTRAINT audit_evidence_checkpoints_updated_by_check
    CHECK (updated_by ~ '^[A-Za-z0-9._:-]{3,120}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  tenant_isolation_quarantined boolean NOT NULL DEFAULT false,
  CONSTRAINT audit_evidence_checkpoints_count_matches_ids_check
    CHECK (event_count = jsonb_array_length(event_ids)),
  CONSTRAINT audit_evidence_checkpoints_identity_key
    UNIQUE (tenant_id, evidence_digest)
);

CREATE INDEX IF NOT EXISTS idx_audit_evidence_checkpoints_tenant_status
  ON audit_evidence_checkpoints (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_evidence_checkpoints_tenant_created
  ON audit_evidence_checkpoints (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION cvg_audit_evidence_checkpoints_update_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.filters IS DISTINCT FROM NEW.filters
     OR OLD.event_ids IS DISTINCT FROM NEW.event_ids
     OR OLD.event_count IS DISTINCT FROM NEW.event_count
     OR OLD.evidence_digest IS DISTINCT FROM NEW.evidence_digest
     OR OLD.created_by IS DISTINCT FROM NEW.created_by
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.tenant_isolation_quarantined IS DISTINCT FROM NEW.tenant_isolation_quarantined
  THEN
    RAISE EXCEPTION 'Audit evidence checkpoint identity is immutable';
  END IF;

  IF OLD.status = 'SEALED' AND NEW.status = 'ARCHIVED' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Audit evidence checkpoint status transition is invalid';
END;
$$;

DROP TRIGGER IF EXISTS audit_evidence_checkpoints_update_guard
  ON audit_evidence_checkpoints;
CREATE TRIGGER audit_evidence_checkpoints_update_guard
  BEFORE UPDATE ON audit_evidence_checkpoints
  FOR EACH ROW
  EXECUTE FUNCTION cvg_audit_evidence_checkpoints_update_guard();

ALTER TABLE audit_evidence_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_evidence_checkpoints FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_evidence_checkpoints_tenant_isolation
  ON audit_evidence_checkpoints;
CREATE POLICY audit_evidence_checkpoints_tenant_isolation
  ON audit_evidence_checkpoints
  USING (
    tenant_isolation_quarantined = false
    AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')
  )
  WITH CHECK (
    tenant_isolation_quarantined = false
    AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')
  );
