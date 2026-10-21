-- SPEC0176 / AUD0621-AUTH-BUILD-0176: internal case assignment registry and
-- per-case read authorization. Additive: no existing row is changed and no
-- historical grant is created. The migration runner owns the transaction,
-- advisory lock and checksum.

-- audit_events.id is the primary key; this composite key only lets the new
-- tenant-bound link reference (tenant_id, id).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname = 'audit_events_tenant_id_id_key'
  ) THEN
    ALTER TABLE audit_events ADD CONSTRAINT audit_events_tenant_id_id_key
      UNIQUE (tenant_id, id);
  END IF;
END $$;

CREATE TABLE case_principals (
  tenant_id text NOT NULL,
  operator_id text NOT NULL,
  role text NOT NULL,
  active boolean NOT NULL,
  revision bigint NOT NULL,
  identity_source text NOT NULL,
  authority_version text NOT NULL,
  proof_digest text NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT case_principals_pkey PRIMARY KEY (tenant_id, operator_id),
  CONSTRAINT case_principals_tenant_check
    CHECK (tenant_id ~ '^tenant_[0-9a-f-]{36}$'),
  CONSTRAINT case_principals_operator_check
    CHECK (operator_id ~ '^[A-Za-z0-9._:-]{3,80}$'),
  CONSTRAINT case_principals_role_check
    CHECK (role IN ('Operator', 'Approver', 'Supervisor', 'Admin')),
  CONSTRAINT case_principals_revision_check CHECK (revision >= 1),
  CONSTRAINT case_principals_source_check
    CHECK (identity_source IN ('verified_adapter', 'synthetic_fixture')),
  CONSTRAINT case_principals_authority_version_check
    CHECK (char_length(authority_version) BETWEEN 1 AND 120),
  CONSTRAINT case_principals_proof_digest_check
    CHECK (proof_digest ~ '^[0-9a-f]{64}$')
);

CREATE TABLE case_roots (
  tenant_id text NOT NULL,
  case_id text NOT NULL,
  kind text NOT NULL,
  core_conversation_id text,
  harness_conversation_id text,
  execution_id text,
  created_at timestamptz NOT NULL,
  CONSTRAINT case_roots_pkey PRIMARY KEY (tenant_id, case_id),
  CONSTRAINT case_roots_case_id_check
    CHECK (case_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  CONSTRAINT case_roots_kind_reference_check CHECK (
    (kind = 'core_conversation' AND core_conversation_id IS NOT NULL
      AND harness_conversation_id IS NULL AND execution_id IS NULL)
    OR (kind = 'harness_conversation' AND harness_conversation_id IS NOT NULL
      AND core_conversation_id IS NULL AND execution_id IS NULL)
    OR (kind = 'independent_execution' AND execution_id IS NOT NULL
      AND core_conversation_id IS NULL AND harness_conversation_id IS NULL)
  ),
  CONSTRAINT case_roots_core_conversation_key
    UNIQUE (tenant_id, core_conversation_id),
  CONSTRAINT case_roots_harness_conversation_key
    UNIQUE (tenant_id, harness_conversation_id),
  CONSTRAINT case_roots_execution_key UNIQUE (tenant_id, execution_id),
  CONSTRAINT case_roots_core_conversation_fk
    FOREIGN KEY (tenant_id, core_conversation_id)
    REFERENCES conversations (tenant_id, id),
  CONSTRAINT case_roots_harness_conversation_fk
    FOREIGN KEY (tenant_id, harness_conversation_id)
    REFERENCES cvg_conversation_sessions (tenant_id, conversation_id),
  CONSTRAINT case_roots_execution_fk
    FOREIGN KEY (tenant_id, execution_id)
    REFERENCES operational_executions (tenant_id, id)
);

CREATE TABLE case_assignments (
  tenant_id text NOT NULL,
  case_id text NOT NULL,
  operator_id text NOT NULL,
  scope text NOT NULL,
  status text NOT NULL,
  revision bigint NOT NULL,
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL,
  CONSTRAINT case_assignments_pkey PRIMARY KEY (tenant_id, case_id, operator_id),
  CONSTRAINT case_assignments_scope_check CHECK (scope = 'read_case'),
  CONSTRAINT case_assignments_status_check
    CHECK (status IN ('ACTIVE', 'REVOKED')),
  CONSTRAINT case_assignments_revision_check CHECK (revision >= 1),
  CONSTRAINT case_assignments_changed_by_check
    CHECK (changed_by ~ '^[A-Za-z0-9._:-]{3,80}$'),
  CONSTRAINT case_assignments_root_fk
    FOREIGN KEY (tenant_id, case_id) REFERENCES case_roots (tenant_id, case_id),
  CONSTRAINT case_assignments_principal_fk
    FOREIGN KEY (tenant_id, operator_id)
    REFERENCES case_principals (tenant_id, operator_id)
);
CREATE INDEX idx_case_assignments_operator_active
  ON case_assignments (tenant_id, operator_id, case_id)
  WHERE status = 'ACTIVE';

CREATE TABLE case_execution_links (
  tenant_id text NOT NULL,
  execution_id text NOT NULL,
  case_id text NOT NULL,
  core_session_id text,
  validated_by text NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT case_execution_links_pkey PRIMARY KEY (tenant_id, execution_id),
  CONSTRAINT case_execution_links_validated_by_check CHECK (
    (validated_by = 'core_parent_pair' AND core_session_id IS NOT NULL)
    OR (validated_by = 'independent_root' AND core_session_id IS NULL)
  ),
  CONSTRAINT case_execution_links_execution_fk
    FOREIGN KEY (tenant_id, execution_id)
    REFERENCES operational_executions (tenant_id, id),
  CONSTRAINT case_execution_links_root_fk
    FOREIGN KEY (tenant_id, case_id) REFERENCES case_roots (tenant_id, case_id),
  CONSTRAINT case_execution_links_session_fk
    FOREIGN KEY (tenant_id, core_session_id) REFERENCES sessions (tenant_id, id)
);
CREATE INDEX idx_case_execution_links_case
  ON case_execution_links (tenant_id, case_id);

CREATE TABLE case_audit_links (
  tenant_id text NOT NULL,
  audit_event_id text NOT NULL,
  case_id text NOT NULL,
  core_session_id text,
  harness_conversation_id text,
  harness_session_id text,
  created_at timestamptz NOT NULL,
  CONSTRAINT case_audit_links_pkey PRIMARY KEY (tenant_id, audit_event_id),
  CONSTRAINT case_audit_links_session_reference_check CHECK (
    (core_session_id IS NOT NULL AND harness_conversation_id IS NULL
      AND harness_session_id IS NULL)
    OR (core_session_id IS NULL AND harness_conversation_id IS NOT NULL
      AND harness_session_id IS NOT NULL)
  ),
  CONSTRAINT case_audit_links_event_fk
    FOREIGN KEY (tenant_id, audit_event_id)
    REFERENCES audit_events (tenant_id, id),
  CONSTRAINT case_audit_links_root_fk
    FOREIGN KEY (tenant_id, case_id) REFERENCES case_roots (tenant_id, case_id),
  CONSTRAINT case_audit_links_core_session_fk
    FOREIGN KEY (tenant_id, core_session_id) REFERENCES sessions (tenant_id, id),
  CONSTRAINT case_audit_links_harness_session_fk
    FOREIGN KEY (tenant_id, harness_conversation_id, harness_session_id)
    REFERENCES cvg_conversation_sessions (tenant_id, conversation_id, session_id)
);
CREATE INDEX idx_case_audit_links_core_session
  ON case_audit_links (tenant_id, core_session_id)
  WHERE core_session_id IS NOT NULL;
CREATE INDEX idx_case_audit_links_harness_session
  ON case_audit_links (tenant_id, harness_conversation_id, harness_session_id)
  WHERE harness_conversation_id IS NOT NULL;

-- Lineage is enforced by the database, not by the caller: a link may only
-- point at the root that owns its execution or session.
CREATE FUNCTION case_execution_link_lineage() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  root_kind text;
  root_conversation text;
  root_execution text;
BEGIN
  SELECT kind, core_conversation_id, execution_id
    INTO root_kind, root_conversation, root_execution
    FROM case_roots
   WHERE tenant_id = NEW.tenant_id AND case_id = NEW.case_id;
  IF NEW.validated_by = 'independent_root' THEN
    IF root_kind IS DISTINCT FROM 'independent_execution'
       OR root_execution IS DISTINCT FROM NEW.execution_id THEN
      RAISE EXCEPTION 'case execution link lineage mismatch' USING ERRCODE = '23514';
    END IF;
  ELSIF root_kind IS DISTINCT FROM 'core_conversation' OR NOT EXISTS (
    SELECT 1 FROM sessions
     WHERE sessions.tenant_id = NEW.tenant_id
       AND sessions.id = NEW.core_session_id
       AND sessions.conversation_id = root_conversation
  ) THEN
    RAISE EXCEPTION 'case execution link lineage mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION case_audit_link_lineage() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  root_kind text;
  root_core text;
  root_harness text;
BEGIN
  SELECT kind, core_conversation_id, harness_conversation_id
    INTO root_kind, root_core, root_harness
    FROM case_roots
   WHERE tenant_id = NEW.tenant_id AND case_id = NEW.case_id;
  IF NEW.core_session_id IS NOT NULL THEN
    IF root_kind IS DISTINCT FROM 'core_conversation' OR NOT EXISTS (
      SELECT 1 FROM sessions
       WHERE sessions.tenant_id = NEW.tenant_id
         AND sessions.id = NEW.core_session_id
         AND sessions.conversation_id = root_core
    ) THEN
      RAISE EXCEPTION 'case audit link lineage mismatch' USING ERRCODE = '23514';
    END IF;
  ELSIF root_kind IS DISTINCT FROM 'harness_conversation'
     OR root_harness IS DISTINCT FROM NEW.harness_conversation_id THEN
    RAISE EXCEPTION 'case audit link lineage mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- Assignment history is a CAS chain: keys and scope never change, every
-- effective write increments the revision by exactly one, no hard delete.
CREATE FUNCTION case_assignment_revision_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.case_id IS DISTINCT FROM OLD.case_id
     OR NEW.operator_id IS DISTINCT FROM OLD.operator_id
     OR NEW.scope IS DISTINCT FROM OLD.scope
     OR NEW.revision IS DISTINCT FROM OLD.revision + 1 THEN
    RAISE EXCEPTION 'case assignment changes require a CAS revision' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION case_principal_revision_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.operator_id IS DISTINCT FROM OLD.operator_id
     OR NEW.revision IS DISTINCT FROM OLD.revision + 1 THEN
    RAISE EXCEPTION 'case principal changes require a CAS revision' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION case_authority_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'case authority rows are immutable' USING ERRCODE = '55000';
END $$;

-- Pin name resolution of the trigger functions to this schema with pg_temp
-- last, so a session temporary table can never shadow the lineage lookups.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'case_execution_link_lineage()',
    'case_audit_link_lineage()',
    'case_assignment_revision_guard()',
    'case_principal_revision_guard()',
    'case_authority_reject_mutation()'
  ] LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path = %I, pg_temp',
      fn,
      current_schema()
    );
  END LOOP;
END $$;

CREATE TRIGGER case_execution_links_lineage BEFORE INSERT ON case_execution_links
  FOR EACH ROW EXECUTE FUNCTION case_execution_link_lineage();
CREATE TRIGGER case_audit_links_lineage BEFORE INSERT ON case_audit_links
  FOR EACH ROW EXECUTE FUNCTION case_audit_link_lineage();
CREATE TRIGGER case_assignments_revision BEFORE UPDATE ON case_assignments
  FOR EACH ROW EXECUTE FUNCTION case_assignment_revision_guard();
CREATE TRIGGER case_principals_revision BEFORE UPDATE ON case_principals
  FOR EACH ROW EXECUTE FUNCTION case_principal_revision_guard();
CREATE TRIGGER case_roots_immutable BEFORE UPDATE OR DELETE ON case_roots
  FOR EACH ROW EXECUTE FUNCTION case_authority_reject_mutation();
CREATE TRIGGER case_execution_links_immutable BEFORE UPDATE OR DELETE ON case_execution_links
  FOR EACH ROW EXECUTE FUNCTION case_authority_reject_mutation();
CREATE TRIGGER case_audit_links_immutable BEFORE UPDATE OR DELETE ON case_audit_links
  FOR EACH ROW EXECUTE FUNCTION case_authority_reject_mutation();
CREATE TRIGGER case_assignments_no_delete BEFORE DELETE ON case_assignments
  FOR EACH ROW EXECUTE FUNCTION case_authority_reject_mutation();
CREATE TRIGGER case_principals_no_delete BEFORE DELETE ON case_principals
  FOR EACH ROW EXECUTE FUNCTION case_authority_reject_mutation();
CREATE TRIGGER case_roots_no_truncate BEFORE TRUNCATE ON case_roots
  FOR EACH STATEMENT EXECUTE FUNCTION case_authority_reject_mutation();
CREATE TRIGGER case_assignments_no_truncate BEFORE TRUNCATE ON case_assignments
  FOR EACH STATEMENT EXECUTE FUNCTION case_authority_reject_mutation();
CREATE TRIGGER case_principals_no_truncate BEFORE TRUNCATE ON case_principals
  FOR EACH STATEMENT EXECUTE FUNCTION case_authority_reject_mutation();
CREATE TRIGGER case_execution_links_no_truncate BEFORE TRUNCATE ON case_execution_links
  FOR EACH STATEMENT EXECUTE FUNCTION case_authority_reject_mutation();
CREATE TRIGGER case_audit_links_no_truncate BEFORE TRUNCATE ON case_audit_links
  FOR EACH STATEMENT EXECUTE FUNCTION case_authority_reject_mutation();

ALTER TABLE case_principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_principals FORCE ROW LEVEL SECURITY;
ALTER TABLE case_roots ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_roots FORCE ROW LEVEL SECURITY;
ALTER TABLE case_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE case_execution_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_execution_links FORCE ROW LEVEL SECURITY;
ALTER TABLE case_audit_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_audit_links FORCE ROW LEVEL SECURITY;

CREATE POLICY case_principals_tenant_isolation ON case_principals
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
CREATE POLICY case_roots_tenant_isolation ON case_roots
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
CREATE POLICY case_assignments_tenant_isolation ON case_assignments
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
CREATE POLICY case_execution_links_tenant_isolation ON case_execution_links
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
CREATE POLICY case_audit_links_tenant_isolation ON case_audit_links
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));

REVOKE ALL ON case_principals, case_roots, case_assignments,
  case_execution_links, case_audit_links FROM PUBLIC;
REVOKE ALL ON FUNCTION case_execution_link_lineage(), case_audit_link_lineage(),
  case_assignment_revision_guard(), case_principal_revision_guard(),
  case_authority_reject_mutation() FROM PUBLIC;

COMMENT ON TABLE case_principals IS
  'SPEC0176 internal materialization of verified identity; written only by the principal provisioning port.';
COMMENT ON TABLE case_roots IS
  'SPEC0176 typed case roots; created with the resource or by a lineage backfill, never by GET.';
COMMENT ON TABLE case_assignments IS
  'SPEC0176 read_case grants; CAS revisions, audited in the same transaction, no hard delete.';
COMMENT ON TABLE case_execution_links IS
  'SPEC0176 immutable execution-to-case lineage validated by the submission composition.';
COMMENT ON TABLE case_audit_links IS
  'SPEC0176 immutable audit-event-to-session lineage written by the producer; payload is never the source.';
