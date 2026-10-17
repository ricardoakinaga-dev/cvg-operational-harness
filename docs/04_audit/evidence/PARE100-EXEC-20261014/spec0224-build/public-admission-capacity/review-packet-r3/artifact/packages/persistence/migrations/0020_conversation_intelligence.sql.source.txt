-- Phase 4A generic conversation state. These names are intentionally
-- separate from the product/channel conversations, messages and sessions.
-- The tables hold bounded state and references; capability effects remain in
-- the existing Runtime/Effect Journal authorities.

CREATE TABLE IF NOT EXISTS cvg_conversation_sessions (
  tenant_id text NOT NULL,
  conversation_id text NOT NULL,
  session_id text NOT NULL,
  profile_id text NOT NULL,
  profile_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'WAITING_USER', 'WAITING_APPROVAL', 'HANDOFF', 'COMPLETED', 'CANCELLED')),
  state_version bigint NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  working_memory jsonb NOT NULL CHECK (octet_length(working_memory::text) <= 32000),
  tenant_isolation_quarantined boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, conversation_id),
  UNIQUE (tenant_id, conversation_id, session_id)
);

CREATE TABLE IF NOT EXISTS cvg_conversation_messages (
  tenant_id text NOT NULL,
  conversation_id text NOT NULL,
  turn_id text NOT NULL,
  message_id text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  tenant_isolation_quarantined boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, message_id),
  UNIQUE (tenant_id, conversation_id, turn_id),
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES cvg_conversation_sessions (tenant_id, conversation_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cvg_conversation_turns (
  tenant_id text NOT NULL,
  conversation_id text NOT NULL,
  session_id text NOT NULL,
  profile_id text NOT NULL,
  profile_version text NOT NULL,
  turn_id text NOT NULL,
  message_id text NOT NULL,
  correlation_id text NOT NULL,
  execution_id text,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  status text NOT NULL CHECK (status IN ('ACCEPTED', 'PROCESSING', 'WAITING_USER', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'HANDOFF', 'CANCELLED')),
  execution_status text CHECK (execution_status IS NULL OR execution_status IN ('PENDING', 'RUNNING', 'WAITING_USER', 'WAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'UNCERTAIN')),
  interpretation jsonb,
  plan_kind text,
  response jsonb CHECK (response IS NULL OR octet_length(response::text) <= 16000),
  tenant_isolation_quarantined boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, turn_id),
  UNIQUE (tenant_id, message_id),
  UNIQUE (tenant_id, conversation_id, turn_id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, conversation_id, session_id)
    REFERENCES cvg_conversation_sessions (tenant_id, conversation_id, session_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cvg_conversation_execution_claims (
  tenant_id text NOT NULL,
  conversation_id text NOT NULL,
  operation_key text NOT NULL CHECK (char_length(operation_key) BETWEEN 8 AND 512),
  turn_id text NOT NULL,
  proposal_hash text NOT NULL CHECK (proposal_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('IN_FLIGHT', 'WAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'UNCERTAIN')),
  execution_id text NOT NULL,
  lease_until timestamptz,
  lease_token text,
  approval_id text,
  effect_confirmed boolean NOT NULL DEFAULT false,
  output jsonb CHECK (output IS NULL OR octet_length(output::text) <= 16000),
  response text CHECK (response IS NULL OR char_length(response) <= 8000),
  stop_reason text,
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_refs) = 'array'),
  tenant_isolation_quarantined boolean NOT NULL DEFAULT false,
  recorded_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, conversation_id, operation_key),
  FOREIGN KEY (tenant_id, conversation_id)
    REFERENCES cvg_conversation_sessions (tenant_id, conversation_id)
    ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, conversation_id, turn_id)
    REFERENCES cvg_conversation_turns (tenant_id, conversation_id, turn_id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cvg_conversation_deliveries (
  tenant_id text NOT NULL,
  response_id text NOT NULL,
  delivery_key text NOT NULL,
  conversation_id text NOT NULL,
  turn_id text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 8000),
  status text NOT NULL CHECK (status IN ('PENDING', 'SENDING', 'DELIVERED', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  lease_until timestamptz,
  lease_token text,
  tenant_isolation_quarantined boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, response_id),
  UNIQUE (tenant_id, delivery_key),
  FOREIGN KEY (tenant_id, conversation_id, turn_id)
    REFERENCES cvg_conversation_turns (tenant_id, conversation_id, turn_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cvg_conversation_turns_scope
  ON cvg_conversation_turns (tenant_id, conversation_id, created_at, turn_id);
CREATE INDEX IF NOT EXISTS idx_cvg_conversation_messages_scope
  ON cvg_conversation_messages (tenant_id, conversation_id, created_at, message_id);
CREATE INDEX IF NOT EXISTS idx_cvg_conversation_execution_status
  ON cvg_conversation_execution_claims (tenant_id, conversation_id, status);
CREATE INDEX IF NOT EXISTS idx_cvg_conversation_deliveries_status
  ON cvg_conversation_deliveries (tenant_id, status, updated_at);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'cvg_conversation_sessions',
    'cvg_conversation_messages',
    'cvg_conversation_turns',
    'cvg_conversation_execution_claims',
    'cvg_conversation_deliveries'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', table_name);
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I',
      table_name || '_tenant_policy', table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting(''cvg.tenant_id'', true), '''')) WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting(''cvg.tenant_id'', true), ''''))',
      table_name || '_tenant_policy', table_name
    );
  END LOOP;
END $$;
