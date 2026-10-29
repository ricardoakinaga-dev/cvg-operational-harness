-- SPEC 0257 R2 — durable receipts for HTTP creations of internal tasks and
-- approval requests. A receipt binds (tenant, route, key digest) to the
-- resource and its single creation audit event, so a retry after COMMIT
-- (including a lost response) returns the same resource with no new resource
-- or event. Forward-only and additive: no existing row is changed, no
-- historical receipt is invented, and no published migration is touched. The
-- migration runner owns the transaction, advisory lock and checksum.
--
-- Support keys for the composite foreign keys. sessions(tenant_id, id) and
-- audit_events(tenant_id, id) already exist (0001, 0029); add the two that
-- are missing for tasks and approval_requests only when absent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'tasks_tenant_id_session_id_id_key'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_tenant_id_session_id_id_key
      UNIQUE (tenant_id, session_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'approval_requests_tenant_id_session_id_id_key'
  ) THEN
    ALTER TABLE approval_requests
      ADD CONSTRAINT approval_requests_tenant_id_session_id_id_key
      UNIQUE (tenant_id, session_id, id);
  END IF;
END $$;

CREATE TABLE api_creation_receipts (
  tenant_id text NOT NULL,
  route text NOT NULL,
  digest_version smallint NOT NULL,
  key_digest text NOT NULL,
  request_digest text NOT NULL,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  session_id text NOT NULL,
  task_source text,
  task_id text,
  approval_id text,
  audit_id text NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT api_creation_receipts_pkey
    PRIMARY KEY (tenant_id, route, key_digest),
  CONSTRAINT api_creation_receipts_tenant_check
    CHECK (tenant_id ~ '^tenant_[0-9a-f-]{36}$'),
  CONSTRAINT api_creation_receipts_route_check
    CHECK (route IN ('/v1/tasks', '/v1/approvals')),
  CONSTRAINT api_creation_receipts_digest_version_check
    CHECK (digest_version = 1),
  CONSTRAINT api_creation_receipts_key_digest_check
    CHECK (key_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT api_creation_receipts_request_digest_check
    CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT api_creation_receipts_actor_type_check
    CHECK (actor_type IN ('System', 'Operator', 'Approver', 'Supervisor', 'Admin')),
  CONSTRAINT api_creation_receipts_actor_id_check
    CHECK (char_length(actor_id) >= 1),
  CONSTRAINT api_creation_receipts_resource_check CHECK (
    (route = '/v1/tasks' AND task_id IS NOT NULL
      AND task_source IS NOT NULL AND char_length(task_source) >= 1
      AND approval_id IS NULL)
    OR (route = '/v1/approvals' AND approval_id IS NOT NULL
      AND task_id IS NULL AND task_source IS NULL)
  ),
  CONSTRAINT api_creation_receipts_task_key UNIQUE (tenant_id, task_id),
  CONSTRAINT api_creation_receipts_approval_key UNIQUE (tenant_id, approval_id),
  CONSTRAINT api_creation_receipts_audit_key UNIQUE (tenant_id, audit_id),
  CONSTRAINT api_creation_receipts_session_fk
    FOREIGN KEY (tenant_id, session_id) REFERENCES sessions (tenant_id, id),
  CONSTRAINT api_creation_receipts_task_fk
    FOREIGN KEY (tenant_id, session_id, task_id)
    REFERENCES tasks (tenant_id, session_id, id),
  CONSTRAINT api_creation_receipts_approval_fk
    FOREIGN KEY (tenant_id, session_id, approval_id)
    REFERENCES approval_requests (tenant_id, session_id, id),
  CONSTRAINT api_creation_receipts_audit_fk
    FOREIGN KEY (tenant_id, audit_id) REFERENCES audit_events (tenant_id, id)
);

-- A receipt is immutable once written: not even its owner can rewrite history
-- by accident through UPDATE/DELETE/TRUNCATE (the runtime role also lacks the
-- privileges; see migrate-job and the preflights).
CREATE FUNCTION api_creation_receipt_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'api creation receipts are immutable' USING ERRCODE = '55000';
END $$;

CREATE TRIGGER api_creation_receipts_no_update_delete
  BEFORE UPDATE OR DELETE ON api_creation_receipts
  FOR EACH ROW EXECUTE FUNCTION api_creation_receipt_reject_mutation();
CREATE TRIGGER api_creation_receipts_no_truncate
  BEFORE TRUNCATE ON api_creation_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION api_creation_receipt_reject_mutation();

ALTER TABLE api_creation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_creation_receipts FORCE ROW LEVEL SECURITY;

CREATE POLICY api_creation_receipts_tenant_isolation ON api_creation_receipts
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));

REVOKE ALL ON api_creation_receipts FROM PUBLIC;
REVOKE ALL ON FUNCTION api_creation_receipt_reject_mutation() FROM PUBLIC;

COMMENT ON TABLE api_creation_receipts IS
  'SPEC0257 immutable receipt of an HTTP creation (task or approval request) bound to its resource and single creation audit event; runtime role has SELECT/INSERT only.';
