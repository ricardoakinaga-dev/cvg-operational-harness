-- SPEC0217: additive, opt-in controlled published inbound continuation.
-- No legacy turn is backfilled. Migration0028 remains a dedicated schema.
-- The migration owner supplies the serving role's explicit minimal grants:
-- bindings SELECT/INSERT/UPDATE; evidence SELECT/INSERT. PUBLIC gets none.

-- messages previously had only a global id PK; a tenant-qualified FK needs
-- this explicit composite key. No row is rewritten or backfilled.
CREATE UNIQUE INDEX controlled_published_message_tenant_key ON messages (tenant_id,id);

CREATE TABLE controlled_published_bindings (
  tenant_id text NOT NULL,
  execution_id text NOT NULL,
  inbound_message_id text NOT NULL,
  conversation_id text NOT NULL,
  session_id text NOT NULL,
  outbox_id text NOT NULL,
  agent_id text NOT NULL,
  version_id text NOT NULL,
  trace_id text NOT NULL,
  correlation_id text NOT NULL,
  adapter_version text NOT NULL DEFAULT 'controlled-published-v1'
    CHECK (adapter_version = 'controlled-published-v1'),
  request_digest text NOT NULL CHECK (request_digest ~ '^sha256-[0-9a-f]{64}$'),
  capability_fingerprint text NOT NULL,
  admission_input jsonb NOT NULL CHECK (jsonb_typeof(admission_input)='object'),
  admission_runtime jsonb NOT NULL CHECK (jsonb_typeof(admission_runtime)='object'),
  prepared_runtime jsonb,
  runtime_result jsonb,
  prepared jsonb CHECK (prepared IS NULL OR jsonb_typeof(prepared) = 'object'),
  prepared_digest text CHECK (prepared_digest IS NULL OR prepared_digest ~ '^sha256-[0-9a-f]{64}$'),
  state jsonb CHECK (state IS NULL OR jsonb_typeof(state) = 'object'),
  state_digest text CHECK (state_digest IS NULL OR state_digest ~ '^sha256-[0-9a-f]{64}$'),
  state_revision bigint NOT NULL DEFAULT 0 CHECK (state_revision BETWEEN 0 AND 9007199254740991),
  evidence_sequence integer NOT NULL DEFAULT 0 CHECK (evidence_sequence BETWEEN 0 AND 256),
  evidence_bytes integer NOT NULL DEFAULT 0 CHECK (evidence_bytes BETWEEN 0 AND 4194304),
  evidence_hash text NOT NULL CHECK (evidence_hash ~ '^sha256-[0-9a-f]{64}$'),
  started_at timestamptz,
  expires_at timestamptz,
  dispatch_closed boolean NOT NULL DEFAULT false,
  fault jsonb CHECK (fault IS NULL OR jsonb_typeof(fault) = 'object'),
  closed_trace jsonb CHECK (closed_trace IS NULL OR jsonb_typeof(closed_trace) = 'object'),
  closed_trace_digest text CHECK (closed_trace_digest IS NULL OR closed_trace_digest ~ '^sha256-[0-9a-f]{64}$'),
  phase_state text NOT NULL DEFAULT 'IDLE_SEALED'
    CHECK (phase_state IN ('IDLE_SEALED', 'OPEN', 'FAULTED', 'CLOSED')),
  phase_revision bigint NOT NULL DEFAULT 0 CHECK (phase_revision BETWEEN 0 AND 9007199254740991),
  seal_id text NOT NULL,
  seal_checkpoint_digest text,
  sealed_checkpoint jsonb CHECK (sealed_checkpoint IS NULL OR jsonb_typeof(sealed_checkpoint)='object'),
  seal_state_digest text,
  sealed_through_sequence integer NOT NULL DEFAULT 0 CHECK (sealed_through_sequence BETWEEN 0 AND 256),
  consumed_seal_id text,
  open_phase_id text,
  open_phase_type text,
  open_phase_input_digest text,
  open_phase_attempt integer,
  open_phase_acked boolean NOT NULL DEFAULT false,
  active_outer_attempt integer,
  active_outer_worker_id text,
  active_outer_attempt_row_id bigint,
  approval_receipt jsonb CHECK (approval_receipt IS NULL OR jsonb_typeof(approval_receipt) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  tenant_isolation_quarantined boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, execution_id),
  UNIQUE (tenant_id, inbound_message_id),
  UNIQUE (tenant_id, trace_id),
  FOREIGN KEY (tenant_id, execution_id) REFERENCES operational_executions (tenant_id, id),
  FOREIGN KEY (tenant_id, inbound_message_id) REFERENCES messages (tenant_id, id),
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations (tenant_id, id),
  FOREIGN KEY (tenant_id, session_id) REFERENCES sessions (tenant_id, id),
  FOREIGN KEY (tenant_id, outbox_id) REFERENCES outbox_events (tenant_id, id),
  FOREIGN KEY (tenant_id, agent_id) REFERENCES platform_agents (tenant_id, id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES platform_agent_versions (tenant_id, id),
  CHECK ((prepared IS NULL) = (prepared_digest IS NULL)),
  CHECK ((state IS NULL) = (state_digest IS NULL)),
  CHECK ((closed_trace IS NULL) = (closed_trace_digest IS NULL)),
  CHECK ((sealed_checkpoint IS NULL) = (seal_checkpoint_digest IS NULL)),
  CHECK ((started_at IS NULL) = (expires_at IS NULL)),
  CHECK (expires_at IS NULL OR (expires_at > started_at AND expires_at <= started_at + interval '120 seconds')),
  CHECK (prepared IS NULL OR octet_length(prepared::text) <= 1048576),
  CHECK (state IS NULL OR octet_length(state::text) <= 1048576),
  CHECK (phase_state <> 'IDLE_SEALED' OR open_phase_id IS NULL),
  CHECK (phase_state <> 'CLOSED' OR (dispatch_closed AND closed_trace IS NOT NULL)),
  CHECK (active_outer_attempt IS NULL OR active_outer_attempt > 0),
  CHECK (active_outer_attempt_row_id IS NULL OR active_outer_attempt_row_id > 0),
  CHECK ((active_outer_attempt IS NULL) = (active_outer_worker_id IS NULL)),
  CHECK ((active_outer_attempt IS NULL) = (active_outer_attempt_row_id IS NULL))
);

CREATE TABLE controlled_published_evidence (
  tenant_id text NOT NULL,
  execution_id text NOT NULL,
  sequence integer NOT NULL CHECK (sequence BETWEEN 1 AND 256),
  event_key text NOT NULL CHECK (length(event_key) BETWEEN 1 AND 500),
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 100),
  canonical_payload jsonb NOT NULL CHECK (jsonb_typeof(canonical_payload) = 'object'),
  payload_digest text NOT NULL CHECK (payload_digest ~ '^sha256-[0-9a-f]{64}$'),
  previous_hash text NOT NULL CHECK (previous_hash ~ '^sha256-[0-9a-f]{64}$'),
  event_hash text NOT NULL CHECK (event_hash ~ '^sha256-[0-9a-f]{64}$'),
  originating_attempt integer NOT NULL CHECK (originating_attempt >= 0),
  created_at timestamptz NOT NULL,
  tenant_isolation_quarantined boolean NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, execution_id, sequence),
  UNIQUE (tenant_id, execution_id, event_key),
  FOREIGN KEY (tenant_id, execution_id) REFERENCES controlled_published_bindings (tenant_id, execution_id),
  CHECK (octet_length(canonical_payload::text) <= 1048576)
);

ALTER TABLE controlled_published_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE controlled_published_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE controlled_published_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE controlled_published_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY controlled_published_bindings_tenant_isolation ON controlled_published_bindings
 USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id',true),''))
 WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id',true),''));
CREATE POLICY controlled_published_evidence_tenant_isolation ON controlled_published_evidence
 USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id',true),''))
 WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id',true),''));
REVOKE ALL ON controlled_published_bindings, controlled_published_evidence FROM PUBLIC;

CREATE FUNCTION cvg_controlled_evidence_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'controlled published evidence is append only' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER controlled_published_evidence_append_only
 BEFORE UPDATE OR DELETE OR TRUNCATE ON controlled_published_evidence
 FOR EACH STATEMENT EXECUTE FUNCTION cvg_controlled_evidence_append_only();

CREATE FUNCTION cvg_controlled_binding_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'controlled binding cannot be deleted' USING ERRCODE='42501';
  END IF;
  IF ROW(NEW.tenant_id,NEW.execution_id,NEW.inbound_message_id,NEW.conversation_id,
         NEW.session_id,NEW.outbox_id,NEW.agent_id,NEW.version_id,NEW.trace_id,
         NEW.correlation_id,NEW.adapter_version,NEW.request_digest,NEW.capability_fingerprint,NEW.created_at,NEW.admission_input,NEW.admission_runtime)
     IS DISTINCT FROM
     ROW(OLD.tenant_id,OLD.execution_id,OLD.inbound_message_id,OLD.conversation_id,
         OLD.session_id,OLD.outbox_id,OLD.agent_id,OLD.version_id,OLD.trace_id,
         OLD.correlation_id,OLD.adapter_version,OLD.request_digest,OLD.capability_fingerprint,OLD.created_at,OLD.admission_input,OLD.admission_runtime)
     OR (OLD.prepared IS NOT NULL AND ROW(NEW.prepared,NEW.prepared_digest,NEW.started_at,NEW.expires_at,NEW.prepared_runtime)
           IS DISTINCT FROM ROW(OLD.prepared,OLD.prepared_digest,OLD.started_at,OLD.expires_at,OLD.prepared_runtime))
     OR (OLD.dispatch_closed AND NOT NEW.dispatch_closed)
     OR (OLD.fault IS NOT NULL AND NEW.fault IS DISTINCT FROM OLD.fault)
     OR (OLD.closed_trace IS NOT NULL AND ROW(NEW.closed_trace,NEW.closed_trace_digest)
           IS DISTINCT FROM ROW(OLD.closed_trace,OLD.closed_trace_digest))
     OR NEW.state_revision < OLD.state_revision OR NEW.phase_revision < OLD.phase_revision
     OR NEW.evidence_sequence < OLD.evidence_sequence OR NEW.evidence_bytes < OLD.evidence_bytes
     OR (OLD.phase_state='CLOSED' AND NEW IS DISTINCT FROM OLD)
     OR (OLD.phase_state='FAULTED' AND NEW.phase_state NOT IN ('FAULTED','CLOSED')) THEN
    RAISE EXCEPTION 'controlled binding immutable or monotonic field changed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER controlled_published_binding_immutable
 BEFORE UPDATE OR DELETE ON controlled_published_bindings
 FOR EACH ROW EXECUTE FUNCTION cvg_controlled_binding_immutable();

-- Context is a guard against old software, not a credential against a serving
-- process with arbitrary SQL access. All supported writers lock/check the parent,
-- outer attempt, pause and deadline in the same transaction before setting it.
-- Bind lookups to the trigger's schema, never a mutable caller search_path.
CREATE FUNCTION cvg_controlled_bound_writer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  t text; x text; bound boolean; parent record; mode text; owner text; fence text;
  controlled boolean;
BEGIN
  t := COALESCE(to_jsonb(NEW)->>'tenant_id',to_jsonb(OLD)->>'tenant_id');
  IF TG_TABLE_NAME='operational_executions' THEN
    x := COALESCE(to_jsonb(NEW)->>'id',to_jsonb(OLD)->>'id');
    controlled := COALESCE(to_jsonb(NEW)#>>'{request,runtime,context,values,adapterVersion}','')='controlled-published-v1'
      OR COALESCE(to_jsonb(OLD)#>>'{request,runtime,context,values,adapterVersion}','')='controlled-published-v1';
  ELSIF TG_TABLE_NAME='operational_effect_journal' THEN
    EXECUTE format('SELECT id FROM %I.operational_executions WHERE tenant_id=$1 AND request#>>''{runtime,context,values,adapterVersion}''=''controlled-published-v1'' AND left($2,length(id)+2)=id||'':s'' LIMIT 1',TG_TABLE_SCHEMA)
      INTO x USING t,COALESCE(to_jsonb(NEW)->>'operation_key',to_jsonb(OLD)->>'operation_key');
    controlled := x IS NOT NULL;
  ELSE
    x := COALESCE(to_jsonb(NEW)->>'execution_id',to_jsonb(OLD)->>'execution_id');
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.operational_executions WHERE tenant_id=$1 AND id=$2 AND request#>>''{runtime,context,values,adapterVersion}''=''controlled-published-v1'')',TG_TABLE_SCHEMA)
      INTO controlled USING t,x;
  END IF;
  -- The reserved parent marker is only a deny discriminator. Ordinary roles
  -- must not need grants on private sidecars to keep writing unbound work.
  IF x IS NULL OR NOT controlled THEN RETURN COALESCE(NEW,OLD); END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2)',TG_TABLE_SCHEMA)
    INTO bound USING t,x;
  IF NOT bound THEN RETURN COALESCE(NEW,OLD); END IF;
  mode := current_setting('cvg.published_mode',true);
  owner := current_setting('cvg.published_worker',true);
  fence := current_setting('cvg.published_attempt',true);
  IF current_setting('cvg.published_execution',true) IS DISTINCT FROM x
     OR current_setting('cvg.tenant_id',true) IS DISTINCT FROM t
     OR mode IS NULL OR mode NOT IN ('active','settlement','claim','close','cancel','cancel_close')
     OR fence IS NULL OR fence !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'bound execution requires controlled fence context' USING ERRCODE='42501';
  END IF;
  EXECUTE format('SELECT state,attempt,lease_owner,lease_until FROM %I.operational_executions WHERE tenant_id=$1 AND id=$2',TG_TABLE_SCHEMA)
    INTO parent USING t,x;
  IF parent IS NULL THEN RAISE EXCEPTION 'bound execution parent missing' USING ERRCODE='42501'; END IF;
  IF mode='cancel_close' THEN
    IF TG_TABLE_NAME NOT IN ('controlled_published_bindings','controlled_published_evidence')
       OR parent.state<>'CANCELLED' OR parent.attempt::text IS DISTINCT FROM fence THEN
      RAISE EXCEPTION 'invalid cancellation closure writer' USING ERRCODE='42501';
    END IF;
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.operational_execution_events WHERE tenant_id=$1 AND execution_id=$2 AND event_type=''CANCELLED'' AND attempt=$3 AND sequence::text=$4)',TG_TABLE_SCHEMA)
      INTO bound USING t,x,parent.attempt,current_setting('cvg.published_cancel_event',true);
    IF NOT bound THEN RAISE EXCEPTION 'cancellation event binding missing' USING ERRCODE='42501'; END IF;
  ELSIF mode='cancel' THEN
    IF TG_TABLE_NAME NOT IN ('operational_executions','operational_execution_outbox','operational_execution_events')
       OR parent.state NOT IN ('QUEUED','FAILED_RETRYABLE','CANCELLED')
       OR parent.attempt::text IS DISTINCT FROM fence THEN
      RAISE EXCEPTION 'invalid bound cancellation writer' USING ERRCODE='42501';
    END IF;
  ELSIF mode='claim' THEN
    IF TG_TABLE_NAME NOT IN ('operational_executions','operational_execution_outbox','operational_execution_events','controlled_published_bindings','controlled_published_evidence')
       OR parent.state NOT IN ('QUEUED','FAILED_RETRYABLE','CLAIMED','RUNNING')
       OR parent.attempt > fence::bigint
       OR parent.attempt < fence::bigint-1
       OR (parent.state IN ('CLAIMED','RUNNING') AND parent.lease_until>clock_timestamp()
            AND (parent.lease_owner IS DISTINCT FROM owner OR parent.attempt::text IS DISTINCT FROM fence)) THEN
      RAISE EXCEPTION 'invalid bound claim writer' USING ERRCODE='42501';
    END IF;
  ELSIF mode='close' AND parent.state IN ('SUCCEEDED','FAILED_TERMINAL','CANCELLED') THEN
    IF TG_TABLE_NAME NOT IN ('operational_execution_outbox','operational_execution_events')
       OR parent.attempt::text IS DISTINCT FROM fence THEN
      RAISE EXCEPTION 'closed execution rejects further writes' USING ERRCODE='42501';
    END IF;
  ELSE
    IF parent.state NOT IN ('CLAIMED','RUNNING') OR parent.lease_owner IS DISTINCT FROM owner
       OR parent.attempt::text IS DISTINCT FROM fence OR parent.lease_until<=clock_timestamp() THEN
      RAISE EXCEPTION 'bound execution fence expired or lost' USING ERRCODE='42501';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'bound execution cannot be deleted' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER controlled_bound_execution_writer BEFORE UPDATE OR DELETE ON operational_executions
 FOR EACH ROW EXECUTE FUNCTION cvg_controlled_bound_writer();
CREATE TRIGGER controlled_bound_queue_writer BEFORE INSERT OR UPDATE OR DELETE ON operational_execution_outbox
 FOR EACH ROW EXECUTE FUNCTION cvg_controlled_bound_writer();
CREATE TRIGGER controlled_bound_event_writer BEFORE INSERT OR UPDATE OR DELETE ON operational_execution_events
 FOR EACH ROW EXECUTE FUNCTION cvg_controlled_bound_writer();
CREATE TRIGGER controlled_bound_step_writer BEFORE INSERT OR UPDATE OR DELETE ON operational_execution_steps
 FOR EACH ROW EXECUTE FUNCTION cvg_controlled_bound_writer();
CREATE TRIGGER controlled_bound_checkpoint_writer BEFORE INSERT OR UPDATE OR DELETE ON operational_execution_checkpoints
 FOR EACH ROW EXECUTE FUNCTION cvg_controlled_bound_writer();
CREATE TRIGGER controlled_bound_journal_writer BEFORE INSERT OR UPDATE OR DELETE ON operational_effect_journal
 FOR EACH ROW EXECUTE FUNCTION cvg_controlled_bound_writer();
CREATE TRIGGER controlled_bound_binding_writer BEFORE UPDATE ON controlled_published_bindings
 FOR EACH ROW EXECUTE FUNCTION cvg_controlled_bound_writer();
CREATE TRIGGER controlled_bound_evidence_writer BEFORE INSERT ON controlled_published_evidence
 FOR EACH ROW EXECUTE FUNCTION cvg_controlled_bound_writer();
