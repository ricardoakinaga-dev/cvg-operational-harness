-- Tenant isolation contract. This migration is intentionally separate from
-- 0000_initial so already-applied legacy databases are never silently changed
-- by re-running the old marker.

CREATE TABLE IF NOT EXISTS tenant_isolation_quarantine (
  table_name text NOT NULL,
  row_id text NOT NULL,
  reason text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, row_id)
);

ALTER TABLE schema_migrations
  ADD COLUMN IF NOT EXISTS checksum text,
  ADD COLUMN IF NOT EXISTS baseline_actor text,
  ADD COLUMN IF NOT EXISTS baseline_reference text,
  ADD COLUMN IF NOT EXISTS baseline_at timestamptz;
GRANT SELECT ON schema_migrations TO PUBLIC;
REVOKE ALL ON tenant_isolation_quarantine FROM PUBLIC;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE tool_calls ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE approval_requests ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS tenant_id text;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS tenant_isolation_quarantined boolean NOT NULL DEFAULT false;
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS tenant_isolation_quarantined boolean NOT NULL DEFAULT false;
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS tenant_isolation_quarantined boolean NOT NULL DEFAULT false;
ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS tenant_isolation_quarantined boolean NOT NULL DEFAULT false;
ALTER TABLE tool_calls
  ADD COLUMN IF NOT EXISTS tenant_isolation_quarantined boolean NOT NULL DEFAULT false;
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS tenant_isolation_quarantined boolean NOT NULL DEFAULT false;
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS tenant_isolation_quarantined boolean NOT NULL DEFAULT false;
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS tenant_isolation_quarantined boolean NOT NULL DEFAULT false;
ALTER TABLE idempotency
  ADD COLUMN IF NOT EXISTS tenant_isolation_quarantined boolean NOT NULL DEFAULT false;
ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS tenant_isolation_quarantined boolean NOT NULL DEFAULT false;
ALTER TABLE platform_agents
  ADD COLUMN IF NOT EXISTS tenant_isolation_quarantined boolean NOT NULL DEFAULT false;
ALTER TABLE platform_agent_versions
  ADD COLUMN IF NOT EXISTS tenant_isolation_quarantined boolean NOT NULL DEFAULT false;
ALTER TABLE platform_test_runs
  ADD COLUMN IF NOT EXISTS tenant_isolation_quarantined boolean NOT NULL DEFAULT false;
ALTER TABLE platform_execution_traces
  ADD COLUMN IF NOT EXISTS tenant_isolation_quarantined boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'conversations_tenant_id_id_key'
  ) THEN
    ALTER TABLE conversations ADD CONSTRAINT conversations_tenant_id_id_key
      UNIQUE (tenant_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'sessions_tenant_id_id_key'
  ) THEN
    ALTER TABLE sessions ADD CONSTRAINT sessions_tenant_id_id_key
      UNIQUE (tenant_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'agent_runs_tenant_id_id_key'
  ) THEN
    ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_tenant_id_id_key
      UNIQUE (tenant_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'platform_agents_tenant_id_id_key'
  ) THEN
    ALTER TABLE platform_agents ADD CONSTRAINT platform_agents_tenant_id_id_key
      UNIQUE (tenant_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'platform_agent_versions_tenant_agent_id_key'
  ) THEN
    ALTER TABLE platform_agent_versions
      ADD CONSTRAINT platform_agent_versions_tenant_agent_id_key
      UNIQUE (tenant_id, agent_id, id);
  END IF;
END $$;

UPDATE messages AS child
SET tenant_id = parent.tenant_id
FROM conversations AS parent
WHERE child.tenant_id IS NULL
  AND parent.id = child.conversation_id;

UPDATE sessions AS child
SET tenant_id = parent.tenant_id
FROM conversations AS parent
WHERE child.tenant_id IS NULL
  AND parent.id = child.conversation_id;

UPDATE agent_runs AS child
SET tenant_id = parent.tenant_id
FROM sessions AS session
INNER JOIN conversations AS parent ON parent.id = session.conversation_id
WHERE child.tenant_id IS NULL
  AND session.id = child.session_id;

UPDATE tool_calls AS child
SET tenant_id = parent.tenant_id
FROM agent_runs AS run
INNER JOIN sessions AS session ON session.id = run.session_id
INNER JOIN conversations AS parent ON parent.id = session.conversation_id
WHERE child.tenant_id IS NULL
  AND run.id = child.agent_run_id;

UPDATE approval_requests AS child
SET tenant_id = parent.tenant_id
FROM sessions AS session
INNER JOIN conversations AS parent ON parent.id = session.conversation_id
WHERE child.tenant_id IS NULL
  AND session.id = child.session_id;

UPDATE tasks AS child
SET tenant_id = parent.tenant_id
FROM sessions AS session
INNER JOIN conversations AS parent ON parent.id = session.conversation_id
WHERE child.tenant_id IS NULL
  AND session.id = child.session_id;

-- A payload tenantId is an untrusted claim. Legacy rows are mapped only
-- through an existing relationship owned by the database. If any supplied
-- relationship is missing or contradictory, the row remains NULL and is
-- quarantined below.
-- Clear any pre-populated compatibility columns first. A partially migrated
-- schema must not retain a tenant claim that was written before this
-- relationship validation ran.
UPDATE audit_events SET tenant_id = NULL;
UPDATE outbox_events SET tenant_id = NULL;

CREATE TEMP TABLE cvg_audit_tenant_authority ON COMMIT DROP AS
SELECT event.id,
       CASE
         WHEN session_scope.id IS NOT NULL
          AND session_conversation_scope.id IS NOT NULL
          AND session_scope.tenant_id = session_conversation_scope.tenant_id
          AND session_scope.tenant_isolation_quarantined = false
          AND session_conversation_scope.tenant_isolation_quarantined = false
         THEN session_conversation_scope.tenant_id
       END AS session_tenant_id,
       CASE
         WHEN conversation_scope.id IS NOT NULL
          AND conversation_scope.tenant_isolation_quarantined = false
         THEN conversation_scope.tenant_id
       END AS conversation_tenant_id,
       CASE
         WHEN version_scope.id IS NOT NULL
          AND version_agent_scope.id IS NOT NULL
          AND version_scope.tenant_id = version_agent_scope.tenant_id
          AND version_scope.agent_id = version_agent_scope.id
          AND version_scope.tenant_isolation_quarantined = false
          AND version_agent_scope.tenant_isolation_quarantined = false
          AND (
            version_agent_scope.active_version_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM platform_agent_versions AS active_version_scope
              WHERE active_version_scope.id = version_agent_scope.active_version_id
                AND active_version_scope.tenant_id = version_agent_scope.tenant_id
                AND active_version_scope.agent_id = version_agent_scope.id
                AND active_version_scope.tenant_isolation_quarantined = false
            )
          )
         THEN version_agent_scope.tenant_id
       END AS version_tenant_id,
       CASE
         WHEN agent_scope.id IS NOT NULL
          AND agent_scope.tenant_isolation_quarantined = false
          AND (
            agent_scope.active_version_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM platform_agent_versions AS active_version_scope
              WHERE active_version_scope.id = agent_scope.active_version_id
                AND active_version_scope.tenant_id = agent_scope.tenant_id
                AND active_version_scope.agent_id = agent_scope.id
                AND active_version_scope.tenant_isolation_quarantined = false
            )
          )
         THEN agent_scope.tenant_id
       END AS agent_tenant_id,
       NULLIF(event.payload->>'tenantId', '') AS claimed_tenant_id
FROM audit_events AS event
LEFT JOIN sessions AS session_scope
  ON session_scope.id = event.payload->>'sessionId'
LEFT JOIN conversations AS session_conversation_scope
  ON session_conversation_scope.id = session_scope.conversation_id
LEFT JOIN conversations AS conversation_scope
  ON conversation_scope.id = event.payload->>'conversationId'
LEFT JOIN platform_agent_versions AS version_scope
  ON version_scope.id = event.payload->>'versionId'
 AND (
   event.payload->>'agentId' IS NULL
   OR version_scope.agent_id = event.payload->>'agentId'
 )
LEFT JOIN platform_agents AS version_agent_scope
  ON version_agent_scope.id = version_scope.agent_id
LEFT JOIN platform_agents AS agent_scope
  ON agent_scope.id = event.payload->>'agentId';

CREATE TEMP TABLE cvg_outbox_tenant_authority ON COMMIT DROP AS
SELECT event.id,
       CASE
         WHEN session_scope.id IS NOT NULL
          AND session_conversation_scope.id IS NOT NULL
          AND session_scope.tenant_id = session_conversation_scope.tenant_id
          AND session_scope.tenant_isolation_quarantined = false
          AND session_conversation_scope.tenant_isolation_quarantined = false
         THEN session_conversation_scope.tenant_id
       END AS session_tenant_id,
       CASE
         WHEN conversation_scope.id IS NOT NULL
          AND conversation_scope.tenant_isolation_quarantined = false
         THEN conversation_scope.tenant_id
       END AS conversation_tenant_id,
       CASE
         WHEN version_scope.id IS NOT NULL
          AND version_agent_scope.id IS NOT NULL
          AND version_scope.tenant_id = version_agent_scope.tenant_id
          AND version_scope.agent_id = version_agent_scope.id
          AND version_scope.tenant_isolation_quarantined = false
          AND version_agent_scope.tenant_isolation_quarantined = false
          AND (
            version_agent_scope.active_version_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM platform_agent_versions AS active_version_scope
              WHERE active_version_scope.id = version_agent_scope.active_version_id
                AND active_version_scope.tenant_id = version_agent_scope.tenant_id
                AND active_version_scope.agent_id = version_agent_scope.id
                AND active_version_scope.tenant_isolation_quarantined = false
            )
          )
         THEN version_agent_scope.tenant_id
       END AS version_tenant_id,
       CASE
         WHEN agent_scope.id IS NOT NULL
          AND agent_scope.tenant_isolation_quarantined = false
          AND (
            agent_scope.active_version_id IS NULL
            OR EXISTS (
              SELECT 1
              FROM platform_agent_versions AS active_version_scope
              WHERE active_version_scope.id = agent_scope.active_version_id
                AND active_version_scope.tenant_id = agent_scope.tenant_id
                AND active_version_scope.agent_id = agent_scope.id
                AND active_version_scope.tenant_isolation_quarantined = false
            )
          )
         THEN agent_scope.tenant_id
       END AS agent_tenant_id,
       NULLIF(event.payload->>'tenantId', '') AS claimed_tenant_id
FROM outbox_events AS event
LEFT JOIN sessions AS session_scope
  ON session_scope.id = event.payload->>'sessionId'
LEFT JOIN conversations AS session_conversation_scope
  ON session_conversation_scope.id = session_scope.conversation_id
LEFT JOIN conversations AS conversation_scope
  ON conversation_scope.id = event.payload->>'conversationId'
LEFT JOIN platform_agent_versions AS version_scope
  ON version_scope.id = event.payload->>'versionId'
 AND (
   event.payload->>'agentId' IS NULL
   OR version_scope.agent_id = event.payload->>'agentId'
 )
LEFT JOIN platform_agents AS version_agent_scope
  ON version_agent_scope.id = version_scope.agent_id
LEFT JOIN platform_agents AS agent_scope
  ON agent_scope.id = event.payload->>'agentId';

UPDATE audit_events AS event
SET tenant_id = authority.authoritative_tenant_id
FROM (
  SELECT id,
         COALESCE(
           session_tenant_id,
           conversation_tenant_id,
           version_tenant_id,
           agent_tenant_id
         ) AS authoritative_tenant_id,
         session_tenant_id,
         conversation_tenant_id,
         version_tenant_id,
         agent_tenant_id,
         claimed_tenant_id
  FROM cvg_audit_tenant_authority
) AS authority
WHERE event.id = authority.id
  AND authority.authoritative_tenant_id IS NOT NULL
  AND (
    event.payload->>'sessionId' IS NULL
    OR authority.session_tenant_id IS NOT NULL
  )
  AND (
    event.payload->>'conversationId' IS NULL
    OR authority.conversation_tenant_id IS NOT NULL
  )
  AND (
    event.payload->>'versionId' IS NULL
    OR authority.version_tenant_id IS NOT NULL
  )
  AND (
    event.payload->>'agentId' IS NULL
    OR authority.agent_tenant_id IS NOT NULL
  )
  AND (
    authority.session_tenant_id IS NULL
    OR authority.session_tenant_id = authority.authoritative_tenant_id
  )
  AND (
    authority.conversation_tenant_id IS NULL
    OR authority.conversation_tenant_id = authority.authoritative_tenant_id
  )
  AND (
    authority.version_tenant_id IS NULL
    OR authority.version_tenant_id = authority.authoritative_tenant_id
  )
  AND (
    authority.agent_tenant_id IS NULL
    OR authority.agent_tenant_id = authority.authoritative_tenant_id
  )
  AND (
    authority.claimed_tenant_id IS NULL
    OR authority.claimed_tenant_id = authority.authoritative_tenant_id
  );

UPDATE outbox_events AS event
SET tenant_id = authority.authoritative_tenant_id
FROM (
  SELECT id,
         COALESCE(
           session_tenant_id,
           conversation_tenant_id,
           version_tenant_id,
           agent_tenant_id
         ) AS authoritative_tenant_id,
         session_tenant_id,
         conversation_tenant_id,
         version_tenant_id,
         agent_tenant_id,
         claimed_tenant_id
  FROM cvg_outbox_tenant_authority
) AS authority
WHERE event.id = authority.id
  AND authority.authoritative_tenant_id IS NOT NULL
  AND (
    event.payload->>'sessionId' IS NULL
    OR authority.session_tenant_id IS NOT NULL
  )
  AND (
    event.payload->>'conversationId' IS NULL
    OR authority.conversation_tenant_id IS NOT NULL
  )
  AND (
    event.payload->>'versionId' IS NULL
    OR authority.version_tenant_id IS NOT NULL
  )
  AND (
    event.payload->>'agentId' IS NULL
    OR authority.agent_tenant_id IS NOT NULL
  )
  AND (
    authority.session_tenant_id IS NULL
    OR authority.session_tenant_id = authority.authoritative_tenant_id
  )
  AND (
    authority.conversation_tenant_id IS NULL
    OR authority.conversation_tenant_id = authority.authoritative_tenant_id
  )
  AND (
    authority.version_tenant_id IS NULL
    OR authority.version_tenant_id = authority.authoritative_tenant_id
  )
  AND (
    authority.agent_tenant_id IS NULL
    OR authority.agent_tenant_id = authority.authoritative_tenant_id
  )
  AND (
    authority.claimed_tenant_id IS NULL
    OR authority.claimed_tenant_id = authority.authoritative_tenant_id
  );

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'messages', id, 'conversation_tenant_unresolved'
FROM messages
WHERE tenant_id IS NULL
ON CONFLICT (table_name, row_id) DO NOTHING;

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'sessions', id, 'conversation_tenant_unresolved'
FROM sessions
WHERE tenant_id IS NULL
ON CONFLICT (table_name, row_id) DO NOTHING;

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'agent_runs', id, 'session_tenant_unresolved'
FROM agent_runs
WHERE tenant_id IS NULL
ON CONFLICT (table_name, row_id) DO NOTHING;

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'tool_calls', id, 'agent_run_tenant_unresolved'
FROM tool_calls
WHERE tenant_id IS NULL
ON CONFLICT (table_name, row_id) DO NOTHING;

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'approval_requests', id, 'session_tenant_unresolved'
FROM approval_requests
WHERE tenant_id IS NULL
ON CONFLICT (table_name, row_id) DO NOTHING;

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'tasks', id, 'session_tenant_unresolved'
FROM tasks
WHERE tenant_id IS NULL
ON CONFLICT (table_name, row_id) DO NOTHING;

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'audit_events', authority.id, 'audit_tenant_claim_mismatch'
FROM (
  SELECT id,
         claimed_tenant_id,
         COALESCE(
           session_tenant_id,
           conversation_tenant_id,
           version_tenant_id,
           agent_tenant_id
         ) AS authoritative_tenant_id
  FROM cvg_audit_tenant_authority
) AS authority
WHERE authority.claimed_tenant_id IS NOT NULL
  AND authority.authoritative_tenant_id IS NOT NULL
  AND authority.claimed_tenant_id <> authority.authoritative_tenant_id
ON CONFLICT (table_name, row_id) DO NOTHING;

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'audit_events', id, 'audit_tenant_unresolved'
FROM audit_events
WHERE tenant_id IS NULL
ON CONFLICT (table_name, row_id) DO NOTHING;

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'outbox_events', authority.id, 'outbox_tenant_claim_mismatch'
FROM (
  SELECT id,
         claimed_tenant_id,
         COALESCE(
           session_tenant_id,
           conversation_tenant_id,
           version_tenant_id,
           agent_tenant_id
         )
           AS authoritative_tenant_id
  FROM cvg_outbox_tenant_authority
) AS authority
WHERE authority.claimed_tenant_id IS NOT NULL
  AND authority.authoritative_tenant_id IS NOT NULL
  AND authority.claimed_tenant_id <> authority.authoritative_tenant_id
ON CONFLICT (table_name, row_id) DO NOTHING;

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'outbox_events', id, 'outbox_tenant_unresolved'
FROM outbox_events
WHERE tenant_id IS NULL
ON CONFLICT (table_name, row_id) DO NOTHING;

UPDATE messages SET tenant_isolation_quarantined = true WHERE tenant_id IS NULL;
UPDATE sessions SET tenant_isolation_quarantined = true WHERE tenant_id IS NULL;
UPDATE agent_runs SET tenant_isolation_quarantined = true WHERE tenant_id IS NULL;
UPDATE tool_calls SET tenant_isolation_quarantined = true WHERE tenant_id IS NULL;
UPDATE approval_requests SET tenant_isolation_quarantined = true WHERE tenant_id IS NULL;
UPDATE tasks SET tenant_isolation_quarantined = true WHERE tenant_id IS NULL;
UPDATE audit_events SET tenant_isolation_quarantined = true WHERE tenant_id IS NULL;
UPDATE outbox_events SET tenant_isolation_quarantined = true WHERE tenant_id IS NULL;

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'messages', child.id, 'tenant_mismatch'
FROM messages AS child
INNER JOIN conversations AS parent ON parent.id = child.conversation_id
WHERE child.tenant_id IS NOT NULL
  AND child.tenant_id <> parent.tenant_id
ON CONFLICT (table_name, row_id) DO NOTHING;
UPDATE messages AS child
SET tenant_isolation_quarantined = true
FROM conversations AS parent
WHERE parent.id = child.conversation_id
  AND child.tenant_id IS NOT NULL
  AND child.tenant_id <> parent.tenant_id;

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'sessions', child.id, 'tenant_mismatch'
FROM sessions AS child
INNER JOIN conversations AS parent ON parent.id = child.conversation_id
WHERE child.tenant_id IS NOT NULL
  AND child.tenant_id <> parent.tenant_id
ON CONFLICT (table_name, row_id) DO NOTHING;
UPDATE sessions AS child
SET tenant_isolation_quarantined = true
FROM conversations AS parent
WHERE parent.id = child.conversation_id
  AND child.tenant_id IS NOT NULL
  AND child.tenant_id <> parent.tenant_id;

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'agent_runs', child.id, 'tenant_mismatch'
FROM agent_runs AS child
INNER JOIN sessions AS parent ON parent.id = child.session_id
WHERE child.tenant_id IS NOT NULL
  AND child.tenant_id <> parent.tenant_id
ON CONFLICT (table_name, row_id) DO NOTHING;
UPDATE agent_runs AS child
SET tenant_isolation_quarantined = true
FROM sessions AS parent
WHERE parent.id = child.session_id
  AND child.tenant_id IS NOT NULL
  AND child.tenant_id <> parent.tenant_id;

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'tool_calls', child.id, 'tenant_mismatch'
FROM tool_calls AS child
INNER JOIN agent_runs AS parent ON parent.id = child.agent_run_id
WHERE child.tenant_id IS NOT NULL
  AND child.tenant_id <> parent.tenant_id
ON CONFLICT (table_name, row_id) DO NOTHING;
UPDATE tool_calls AS child
SET tenant_isolation_quarantined = true
FROM agent_runs AS parent
WHERE parent.id = child.agent_run_id
  AND child.tenant_id IS NOT NULL
  AND child.tenant_id <> parent.tenant_id;

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'approval_requests', child.id, 'tenant_mismatch'
FROM approval_requests AS child
INNER JOIN sessions AS parent ON parent.id = child.session_id
WHERE child.tenant_id IS NOT NULL
  AND child.tenant_id <> parent.tenant_id
ON CONFLICT (table_name, row_id) DO NOTHING;
UPDATE approval_requests AS child
SET tenant_isolation_quarantined = true
FROM sessions AS parent
WHERE parent.id = child.session_id
  AND child.tenant_id IS NOT NULL
  AND child.tenant_id <> parent.tenant_id;

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'tasks', child.id, 'tenant_mismatch'
FROM tasks AS child
INNER JOIN sessions AS parent ON parent.id = child.session_id
WHERE child.tenant_id IS NOT NULL
  AND child.tenant_id <> parent.tenant_id
ON CONFLICT (table_name, row_id) DO NOTHING;
UPDATE tasks AS child
SET tenant_isolation_quarantined = true
FROM sessions AS parent
WHERE parent.id = child.session_id
  AND child.tenant_id IS NOT NULL
  AND child.tenant_id <> parent.tenant_id;

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'platform_agent_versions', version.id, 'agent_tenant_unresolved'
FROM platform_agent_versions AS version
LEFT JOIN platform_agents AS agent ON agent.id = version.agent_id
WHERE agent.id IS NULL OR version.tenant_id <> agent.tenant_id
ON CONFLICT (table_name, row_id) DO NOTHING;
UPDATE platform_agent_versions AS version
SET tenant_isolation_quarantined = true
WHERE NOT EXISTS (
  SELECT 1 FROM platform_agents AS agent
  WHERE agent.id = version.agent_id
    AND version.tenant_id = agent.tenant_id
);

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'platform_agents', agent.id, 'active_version_tenant_unresolved'
FROM platform_agents AS agent
LEFT JOIN platform_agent_versions AS version
  ON version.id = agent.active_version_id
WHERE agent.active_version_id IS NOT NULL
  AND (
    version.id IS NULL
    OR version.tenant_id <> agent.tenant_id
    OR version.agent_id <> agent.id
  )
ON CONFLICT (table_name, row_id) DO NOTHING;
UPDATE platform_agents AS agent
SET tenant_isolation_quarantined = true
WHERE agent.active_version_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM platform_agent_versions AS version
    WHERE version.id = agent.active_version_id
      AND version.tenant_id = agent.tenant_id
      AND version.agent_id = agent.id
  );

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'platform_test_runs', trace.trace_id, 'agent_version_tenant_unresolved'
FROM platform_test_runs AS trace
WHERE NOT EXISTS (
  SELECT 1
  FROM platform_agent_versions AS version
  WHERE version.tenant_id = trace.tenant_id
    AND version.agent_id = trace.agent_id
    AND version.id = trace.version_id
)
ON CONFLICT (table_name, row_id) DO NOTHING;
UPDATE platform_test_runs AS trace
SET tenant_isolation_quarantined = true
WHERE NOT EXISTS (
  SELECT 1
  FROM platform_agent_versions AS version
  WHERE version.tenant_id = trace.tenant_id
    AND version.agent_id = trace.agent_id
    AND version.id = trace.version_id
);

INSERT INTO tenant_isolation_quarantine (table_name, row_id, reason)
SELECT 'platform_execution_traces', trace.trace_id, 'agent_version_tenant_unresolved'
FROM platform_execution_traces AS trace
WHERE NOT EXISTS (
  SELECT 1
  FROM platform_agent_versions AS version
  WHERE version.tenant_id = trace.tenant_id
    AND version.agent_id = trace.agent_id
    AND version.id = trace.version_id
)
ON CONFLICT (table_name, row_id) DO NOTHING;
UPDATE platform_execution_traces AS trace
SET tenant_isolation_quarantined = true
WHERE NOT EXISTS (
  SELECT 1
  FROM platform_agent_versions AS version
  WHERE version.tenant_id = trace.tenant_id
    AND version.agent_id = trace.agent_id
    AND version.id = trace.version_id
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'messages_tenant_id_not_null'
  ) THEN
    ALTER TABLE messages ADD CONSTRAINT messages_tenant_id_not_null
      CHECK (tenant_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'sessions_tenant_id_not_null'
  ) THEN
    ALTER TABLE sessions ADD CONSTRAINT sessions_tenant_id_not_null
      CHECK (tenant_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'agent_runs_tenant_id_not_null'
  ) THEN
    ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_tenant_id_not_null
      CHECK (tenant_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'tool_calls_tenant_id_not_null'
  ) THEN
    ALTER TABLE tool_calls ADD CONSTRAINT tool_calls_tenant_id_not_null
      CHECK (tenant_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'approval_requests_tenant_id_not_null'
  ) THEN
    ALTER TABLE approval_requests ADD CONSTRAINT approval_requests_tenant_id_not_null
      CHECK (tenant_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'tasks_tenant_id_not_null'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_tenant_id_not_null
      CHECK (tenant_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'audit_events_tenant_id_not_null'
  ) THEN
    ALTER TABLE audit_events ADD CONSTRAINT audit_events_tenant_id_not_null
      CHECK (tenant_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'outbox_events_tenant_id_not_null'
  ) THEN
    ALTER TABLE outbox_events ADD CONSTRAINT outbox_events_tenant_id_not_null
      CHECK (tenant_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'messages_tenant_conversation_fk'
  ) THEN
    ALTER TABLE messages ADD CONSTRAINT messages_tenant_conversation_fk
      FOREIGN KEY (tenant_id, conversation_id)
      REFERENCES conversations (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'sessions_tenant_conversation_fk'
  ) THEN
    ALTER TABLE sessions ADD CONSTRAINT sessions_tenant_conversation_fk
      FOREIGN KEY (tenant_id, conversation_id)
      REFERENCES conversations (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'agent_runs_tenant_session_fk'
  ) THEN
    ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_tenant_session_fk
      FOREIGN KEY (tenant_id, session_id)
      REFERENCES sessions (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'tool_calls_tenant_run_fk'
  ) THEN
    ALTER TABLE tool_calls ADD CONSTRAINT tool_calls_tenant_run_fk
      FOREIGN KEY (tenant_id, agent_run_id)
      REFERENCES agent_runs (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'approval_requests_tenant_session_fk'
  ) THEN
    ALTER TABLE approval_requests ADD CONSTRAINT approval_requests_tenant_session_fk
      FOREIGN KEY (tenant_id, session_id)
      REFERENCES sessions (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'tasks_tenant_session_fk'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_tenant_session_fk
      FOREIGN KEY (tenant_id, session_id)
      REFERENCES sessions (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'platform_versions_tenant_agent_fk'
  ) THEN
    ALTER TABLE platform_agent_versions
      ADD CONSTRAINT platform_versions_tenant_agent_fk
      FOREIGN KEY (tenant_id, agent_id)
      REFERENCES platform_agents (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'platform_agents_active_version_fk'
  ) THEN
    ALTER TABLE platform_agents
      ADD CONSTRAINT platform_agents_active_version_fk
      FOREIGN KEY (tenant_id, active_version_id)
      REFERENCES platform_agent_versions (tenant_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'platform_test_runs_tenant_agent_version_fk'
  ) THEN
    ALTER TABLE platform_test_runs
      ADD CONSTRAINT platform_test_runs_tenant_agent_version_fk
      FOREIGN KEY (tenant_id, agent_id, version_id)
      REFERENCES platform_agent_versions (tenant_id, agent_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'platform_execution_traces_tenant_agent_version_fk'
  ) THEN
    ALTER TABLE platform_execution_traces
      ADD CONSTRAINT platform_execution_traces_tenant_agent_version_fk
      FOREIGN KEY (tenant_id, agent_id, version_id)
      REFERENCES platform_agent_versions (tenant_id, agent_id, id) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_tenant_conversation
  ON messages (tenant_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant_conversation
  ON sessions (tenant_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant_session
  ON agent_runs (tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_tenant_run
  ON tool_calls (tenant_id, agent_run_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_session
  ON approval_requests (tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_session
  ON tasks (tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_created
  ON audit_events (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_events_tenant_status
  ON outbox_events (tenant_id, status);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_calls FORCE ROW LEVEL SECURITY;
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_agents FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_agent_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_test_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_execution_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_execution_traces FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_tenant_isolation ON conversations;
CREATE POLICY conversations_tenant_isolation ON conversations
  USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
DROP POLICY IF EXISTS messages_tenant_isolation ON messages;
CREATE POLICY messages_tenant_isolation ON messages
  USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
DROP POLICY IF EXISTS sessions_tenant_isolation ON sessions;
CREATE POLICY sessions_tenant_isolation ON sessions
  USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
DROP POLICY IF EXISTS agent_runs_tenant_isolation ON agent_runs;
CREATE POLICY agent_runs_tenant_isolation ON agent_runs
  USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
DROP POLICY IF EXISTS tool_calls_tenant_isolation ON tool_calls;
CREATE POLICY tool_calls_tenant_isolation ON tool_calls
  USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
DROP POLICY IF EXISTS approval_requests_tenant_isolation ON approval_requests;
CREATE POLICY approval_requests_tenant_isolation ON approval_requests
  USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
DROP POLICY IF EXISTS tasks_tenant_isolation ON tasks;
CREATE POLICY tasks_tenant_isolation ON tasks
  USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
DROP POLICY IF EXISTS audit_events_tenant_isolation ON audit_events;
CREATE POLICY audit_events_tenant_isolation ON audit_events
  USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
DROP POLICY IF EXISTS idempotency_tenant_isolation ON idempotency;
CREATE POLICY idempotency_tenant_isolation ON idempotency
  USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
DROP POLICY IF EXISTS outbox_events_tenant_isolation ON outbox_events;
CREATE POLICY outbox_events_tenant_isolation ON outbox_events
  USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
DROP POLICY IF EXISTS platform_agents_tenant_isolation ON platform_agents;
CREATE POLICY platform_agents_tenant_isolation ON platform_agents
  USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
DROP POLICY IF EXISTS platform_agent_versions_tenant_isolation ON platform_agent_versions;
CREATE POLICY platform_agent_versions_tenant_isolation ON platform_agent_versions
  USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
DROP POLICY IF EXISTS platform_test_runs_tenant_isolation ON platform_test_runs;
CREATE POLICY platform_test_runs_tenant_isolation ON platform_test_runs
  USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
DROP POLICY IF EXISTS platform_execution_traces_tenant_isolation ON platform_execution_traces;
CREATE POLICY platform_execution_traces_tenant_isolation ON platform_execution_traces
  USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));

COMMENT ON TABLE tenant_isolation_quarantine IS
  'Rows that cannot be mapped to a tenant deterministically. They remain hidden by RLS until an approved backfill resolves them.';
