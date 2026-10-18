CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version)
VALUES ('0000_initial')
ON CONFLICT (version) DO NOTHING;

CREATE TABLE IF NOT EXISTS conversations (
  tenant_id text NOT NULL,
  id text PRIMARY KEY,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'web', 'internal')),
  sender_ref text NOT NULL,
  sender_ref_hash text NOT NULL,
  status text NOT NULL,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sender_ref_hash text;

CREATE TABLE IF NOT EXISTS messages (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id),
  external_message_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body text NOT NULL,
  runtime_status text NOT NULL DEFAULT 'pending'
    CHECK (runtime_status IN ('pending', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, external_message_id)
);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS runtime_status text;
UPDATE messages SET runtime_status = 'pending' WHERE runtime_status IS NULL;
ALTER TABLE messages ALTER COLUMN runtime_status SET DEFAULT 'pending';
ALTER TABLE messages ALTER COLUMN runtime_status SET NOT NULL;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_runtime_status_check;
ALTER TABLE messages ADD CONSTRAINT messages_runtime_status_check
  CHECK (runtime_status IN ('pending', 'completed'));

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES conversations(id),
  status text NOT NULL,
  takeover_state text NOT NULL DEFAULT 'BOT_ACTIVE' CHECK (takeover_state IN ('BOT_ACTIVE', 'HANDOFF_REQUESTED', 'HUMAN_ACTIVE', 'RESOLVED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS takeover_state text NOT NULL DEFAULT 'BOT_ACTIVE';
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_takeover_state_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_takeover_state_check CHECK (takeover_state IN ('BOT_ACTIVE', 'HANDOFF_REQUESTED', 'HUMAN_ACTIVE', 'RESOLVED'));

CREATE TABLE IF NOT EXISTS agent_runs (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES sessions(id),
  status text NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tool_calls (
  id text PRIMARY KEY,
  agent_run_id text NOT NULL REFERENCES agent_runs(id),
  tool_name text NOT NULL,
  status text NOT NULL,
  input jsonb NOT NULL,
  output jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES sessions(id),
  proposed_action text NOT NULL,
  summary text NOT NULL,
  risk_level text NOT NULL,
  status text NOT NULL,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES sessions(id),
  title text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL,
  source text NOT NULL,
  status text NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, source, idempotency_key)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  correlation_id text NOT NULL,
  policy_version text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency (
  tenant_id text NOT NULL,
  key text NOT NULL,
  resource_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);

-- Compatibility guard for controlled schemas created before tenant scoping.
-- Existing rows without an approved tenant mapping intentionally make this
-- migration fail closed instead of silently assigning ownership.
ALTER TABLE idempotency ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE idempotency DROP CONSTRAINT IF EXISTS idempotency_pkey;
ALTER TABLE idempotency ADD CONSTRAINT idempotency_pkey PRIMARY KEY (tenant_id, key);

COMMENT ON TABLE idempotency IS 'Inbound idempotency keys are scoped by tenant and use inbound:<channel>:<externalMessageId>.';

CREATE TABLE IF NOT EXISTS outbox_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'processed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_runtime_status
  ON messages(runtime_status, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_conversation_id ON sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_session_id ON agent_runs(session_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_session_id ON approval_requests(session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_session_id ON tasks(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_correlation_id ON audit_events(correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit_events(type);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor_id ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_payload_session_id ON audit_events((payload->>'sessionId'));
CREATE INDEX IF NOT EXISTS idx_outbox_events_status ON outbox_events(status);

CREATE TABLE IF NOT EXISTS platform_agents (
  tenant_id text NOT NULL,
  id text PRIMARY KEY,
  slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  active_version_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_platform_agents_tenant_id
  ON platform_agents(tenant_id);

CREATE TABLE IF NOT EXISTS platform_agent_versions (
  tenant_id text NOT NULL,
  id text PRIMARY KEY,
  agent_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL CHECK (
    status IN ('DRAFT', 'TESTING', 'APPROVED', 'PUBLISHED', 'ARCHIVED')
  ),
  config jsonb NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (tenant_id, agent_id, version),
  UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_platform_agent_versions_tenant_agent
  ON platform_agent_versions(tenant_id, agent_id, version DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_agent_versions_one_published
  ON platform_agent_versions(tenant_id, agent_id)
  WHERE status = 'PUBLISHED';

CREATE TABLE IF NOT EXISTS platform_test_runs (
  tenant_id text NOT NULL,
  trace_id text PRIMARY KEY,
  agent_id text NOT NULL,
  version_id text NOT NULL,
  trace jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, trace_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_test_runs_tenant_created
  ON platform_test_runs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_execution_traces (
  tenant_id text NOT NULL,
  trace_id text PRIMARY KEY,
  agent_id text NOT NULL,
  version_id text NOT NULL,
  trace jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (tenant_id, trace_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_execution_traces_tenant_created
  ON platform_execution_traces(tenant_id, created_at DESC);
