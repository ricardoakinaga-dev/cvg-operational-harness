CREATE TABLE IF NOT EXISTS platform_test_suites (
  tenant_id text NOT NULL,
  id text PRIMARY KEY CHECK (id ~ '^test_suite_[0-9a-f-]{36}$'),
  slug text NOT NULL CHECK (slug ~ '^[a-z][a-z0-9-]{0,79}$'),
  name text NOT NULL,
  description text NOT NULL,
  agent_id text NOT NULL,
  version_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  cases jsonb NOT NULL CHECK (jsonb_typeof(cases) = 'array'),
  previous_suite_id text,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  tenant_isolation_quarantined boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, agent_id, id),
  UNIQUE (tenant_id, slug, version),
  CONSTRAINT platform_test_suites_tenant_agent_version_fk
    FOREIGN KEY (tenant_id, agent_id, version_id)
    REFERENCES platform_agent_versions (tenant_id, agent_id, id),
  CONSTRAINT platform_test_suites_previous_fk
    FOREIGN KEY (tenant_id, previous_suite_id)
    REFERENCES platform_test_suites (tenant_id, id),
  CONSTRAINT platform_test_suites_previous_agent_fk
    FOREIGN KEY (tenant_id, agent_id, previous_suite_id)
    REFERENCES platform_test_suites (tenant_id, agent_id, id)
);

CREATE INDEX IF NOT EXISTS idx_platform_test_suites_tenant_agent
  ON platform_test_suites (tenant_id, agent_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS platform_test_suite_runs (
  tenant_id text NOT NULL,
  id text PRIMARY KEY CHECK (id ~ '^test_suite_run_[0-9a-f-]{36}$'),
  suite_id text NOT NULL,
  agent_id text NOT NULL,
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_isolation_quarantined boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, id),
  CONSTRAINT platform_test_suite_runs_tenant_suite_fk
    FOREIGN KEY (tenant_id, suite_id)
    REFERENCES platform_test_suites (tenant_id, id),
  CONSTRAINT platform_test_suite_runs_tenant_agent_fk
    FOREIGN KEY (tenant_id, agent_id)
    REFERENCES platform_agents (tenant_id, id),
  CONSTRAINT platform_test_suite_runs_tenant_suite_agent_fk
    FOREIGN KEY (tenant_id, agent_id, suite_id)
    REFERENCES platform_test_suites (tenant_id, agent_id, id)
);

CREATE INDEX IF NOT EXISTS idx_platform_test_suite_runs_tenant_created
  ON platform_test_suite_runs (tenant_id, suite_id, created_at DESC);

ALTER TABLE platform_test_suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_test_suites FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_test_suites_tenant_isolation
  ON platform_test_suites;
CREATE POLICY platform_test_suites_tenant_isolation
  ON platform_test_suites
  USING (
    tenant_isolation_quarantined = false
    AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')
  )
  WITH CHECK (
    tenant_isolation_quarantined = false
    AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')
  );

ALTER TABLE platform_test_suite_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_test_suite_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_test_suite_runs_tenant_isolation
  ON platform_test_suite_runs;
CREATE POLICY platform_test_suite_runs_tenant_isolation
  ON platform_test_suite_runs
  USING (
    tenant_isolation_quarantined = false
    AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')
  )
  WITH CHECK (
    tenant_isolation_quarantined = false
    AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')
  );
