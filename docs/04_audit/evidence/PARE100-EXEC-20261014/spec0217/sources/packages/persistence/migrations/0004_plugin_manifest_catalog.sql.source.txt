-- Declarative plugin metadata only. This catalog never stores executable code,
-- install instructions, credentials, provider configuration or side effects.
CREATE TABLE IF NOT EXISTS platform_plugin_catalog (
  tenant_id text NOT NULL,
  id text PRIMARY KEY
    CONSTRAINT platform_plugin_catalog_id_check
    CHECK (id ~ '^plugin_catalog_[0-9a-f-]{36}$'),
  name text NOT NULL
    CONSTRAINT platform_plugin_catalog_name_check
    CHECK (name ~ '^[A-Za-z0-9._:-]{1,120}$'),
  version text NOT NULL
    CONSTRAINT platform_plugin_catalog_version_check
    CHECK (char_length(btrim(version)) BETWEEN 1 AND 80),
  manifest jsonb NOT NULL
    CONSTRAINT platform_plugin_catalog_manifest_check
    CHECK (jsonb_typeof(manifest) = 'object'),
  status text NOT NULL
    CONSTRAINT platform_plugin_catalog_status_check
    CHECK (status IN ('DRAFT', 'APPROVED', 'ARCHIVED')),
  created_by text NOT NULL
    CONSTRAINT platform_plugin_catalog_created_by_check
    CHECK (btrim(created_by) <> ''),
  approved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  tenant_isolation_quarantined boolean NOT NULL DEFAULT false,
  CONSTRAINT platform_plugin_catalog_tenant_name_version_key
    UNIQUE (tenant_id, name, version),
  CONSTRAINT platform_plugin_catalog_manifest_identity_check
    CHECK (
      manifest->>'name' = name
      AND manifest->>'version' = version
    ),
  CONSTRAINT platform_plugin_catalog_approved_by_check
    CHECK (status <> 'APPROVED' OR btrim(approved_by) <> '')
);

CREATE INDEX IF NOT EXISTS idx_platform_plugin_catalog_tenant_status
  ON platform_plugin_catalog (tenant_id, status, updated_at DESC);

CREATE OR REPLACE FUNCTION cvg_plugin_catalog_update_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id
     OR OLD.name IS DISTINCT FROM NEW.name
     OR OLD.version IS DISTINCT FROM NEW.version
     OR OLD.manifest IS DISTINCT FROM NEW.manifest
     OR OLD.created_by IS DISTINCT FROM NEW.created_by
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.tenant_isolation_quarantined IS DISTINCT FROM NEW.tenant_isolation_quarantined
  THEN
    RAISE EXCEPTION 'Plugin catalog identity is immutable';
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

  RAISE EXCEPTION 'Plugin catalog status transition is invalid';
END;
$$;

DROP TRIGGER IF EXISTS platform_plugin_catalog_update_guard
  ON platform_plugin_catalog;
CREATE TRIGGER platform_plugin_catalog_update_guard
  BEFORE UPDATE ON platform_plugin_catalog
  FOR EACH ROW
  EXECUTE FUNCTION cvg_plugin_catalog_update_guard();

ALTER TABLE platform_plugin_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_plugin_catalog FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_plugin_catalog_tenant_isolation
  ON platform_plugin_catalog;
CREATE POLICY platform_plugin_catalog_tenant_isolation
  ON platform_plugin_catalog
  USING (
    tenant_isolation_quarantined = false
    AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')
  )
  WITH CHECK (
    tenant_isolation_quarantined = false
    AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')
  );
