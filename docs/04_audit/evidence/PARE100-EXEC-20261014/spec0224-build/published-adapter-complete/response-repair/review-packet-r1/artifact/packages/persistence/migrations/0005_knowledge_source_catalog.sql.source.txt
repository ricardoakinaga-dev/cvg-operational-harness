-- Controlled knowledge source identity metadata only. This catalog stores no
-- content, ingestion state, embeddings, provider credentials or URLs.
CREATE TABLE IF NOT EXISTS platform_knowledge_sources (
  tenant_id text NOT NULL,
  id text PRIMARY KEY
    CONSTRAINT platform_knowledge_sources_id_check
    CHECK (id ~ '^knowledge_source_[0-9a-f-]{36}$'),
  source text NOT NULL
    CONSTRAINT platform_knowledge_sources_source_check
    CHECK (
      char_length(btrim(source)) BETWEEN 1 AND 200
      AND source ~ '^controlled://[A-Za-z0-9._:/-]+$'
    ),
  version text NOT NULL
    CONSTRAINT platform_knowledge_sources_version_check
    CHECK (version ~ '^[A-Za-z0-9._:-]{1,120}$'),
  label text NOT NULL
    CONSTRAINT platform_knowledge_sources_label_check
    CHECK (char_length(btrim(label)) BETWEEN 1 AND 120),
  description text NOT NULL
    CONSTRAINT platform_knowledge_sources_description_check
    CHECK (char_length(btrim(description)) <= 1000),
  status text NOT NULL
    CONSTRAINT platform_knowledge_sources_status_check
    CHECK (status IN ('DRAFT', 'APPROVED', 'ARCHIVED')),
  created_by text NOT NULL
    CONSTRAINT platform_knowledge_sources_created_by_check
    CHECK (btrim(created_by) <> ''),
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  tenant_isolation_quarantined boolean NOT NULL DEFAULT false,
  CONSTRAINT platform_knowledge_sources_tenant_identity_key
    UNIQUE (tenant_id, source, version),
  CONSTRAINT platform_knowledge_sources_secret_metadata_check
    CHECK (
      source !~* '(secret|token|password|api[_-]?key)'
      AND version !~* '(secret|token|password|api[_-]?key)'
      AND label !~* '(secret|token|password|api[_-]?key)'
      AND description !~* '(secret|token|password|api[_-]?key)'
    ),
  CONSTRAINT platform_knowledge_sources_approved_by_check
    CHECK (
      status <> 'APPROVED'
      OR (approved_by IS NOT NULL AND btrim(approved_by) <> '')
    )
);

CREATE INDEX IF NOT EXISTS idx_platform_knowledge_sources_tenant_status
  ON platform_knowledge_sources (tenant_id, status, updated_at DESC);

CREATE OR REPLACE FUNCTION cvg_knowledge_sources_update_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.source IS DISTINCT FROM NEW.source
     OR OLD.version IS DISTINCT FROM NEW.version
     OR OLD.label IS DISTINCT FROM NEW.label
     OR OLD.description IS DISTINCT FROM NEW.description
     OR OLD.created_by IS DISTINCT FROM NEW.created_by
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.tenant_isolation_quarantined IS DISTINCT FROM NEW.tenant_isolation_quarantined
  THEN
    RAISE EXCEPTION 'Knowledge source identity is immutable';
  END IF;

  IF OLD.status = NEW.status
     AND OLD.approved_by IS NOT DISTINCT FROM NEW.approved_by
  THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'DRAFT'
     AND NEW.status IN ('APPROVED', 'ARCHIVED')
  THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'APPROVED' AND NEW.status = 'ARCHIVED' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Knowledge source status transition is invalid';
END;
$$;

DROP TRIGGER IF EXISTS platform_knowledge_sources_update_guard
  ON platform_knowledge_sources;
CREATE TRIGGER platform_knowledge_sources_update_guard
  BEFORE UPDATE ON platform_knowledge_sources
  FOR EACH ROW
  EXECUTE FUNCTION cvg_knowledge_sources_update_guard();

ALTER TABLE platform_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_knowledge_sources FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_knowledge_sources_tenant_isolation
  ON platform_knowledge_sources;
CREATE POLICY platform_knowledge_sources_tenant_isolation
  ON platform_knowledge_sources
  USING (
    tenant_isolation_quarantined = false
    AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')
  )
  WITH CHECK (
    tenant_isolation_quarantined = false
    AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')
  );
