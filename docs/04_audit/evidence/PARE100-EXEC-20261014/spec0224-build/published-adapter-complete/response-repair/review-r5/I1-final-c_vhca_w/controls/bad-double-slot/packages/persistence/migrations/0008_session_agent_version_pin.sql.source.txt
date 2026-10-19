-- Controlled conversation continuity boundary. Existing sessions remain
-- unpinned until the first published runtime execution binds them atomically.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS agent_id text,
  ADD COLUMN IF NOT EXISTS agent_version_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'sessions_agent_binding_pair_check'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_agent_binding_pair_check
      CHECK ((agent_id IS NULL) = (agent_version_id IS NULL)) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'sessions_agent_binding_agent_fk'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_agent_binding_agent_fk
      FOREIGN KEY (tenant_id, agent_id)
      REFERENCES platform_agents (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'sessions_agent_binding_version_fk'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_agent_binding_version_fk
      FOREIGN KEY (tenant_id, agent_id, agent_version_id)
      REFERENCES platform_agent_versions (tenant_id, agent_id, id) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sessions_tenant_agent_version
  ON sessions (tenant_id, agent_id, agent_version_id);

COMMENT ON COLUMN sessions.agent_version_id IS
  'Immutable runtime pin; archived snapshots remain valid for existing sessions.';
