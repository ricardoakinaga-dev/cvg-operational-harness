-- PDSH-021 / SPEC0202. Opt-in dedicated schema: no legacy tables are altered.
-- The existing migration runner owns transaction/advisory lock/checksum.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=current_schema() AND c.relname IN ('conversations','sessions','messages')) THEN
    RAISE EXCEPTION 'session event migration requires a dedicated schema';
  END IF;
END $$;

CREATE TABLE session_streams (
  tenant_id text NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 200),
  session_id text NOT NULL CHECK (length(session_id) BETWEEN 1 AND 200),
  format_version integer NOT NULL CHECK (format_version = 1),
  next_sequence bigint NOT NULL DEFAULT 1 CHECK (next_sequence BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY (tenant_id, session_id)
);
CREATE TABLE session_events (
  tenant_id text NOT NULL,
  session_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence BETWEEN 1 AND 9007199254740991),
  event_id text NOT NULL CHECK (length(event_id) BETWEEN 1 AND 200),
  format_version integer NOT NULL CHECK (format_version = 1),
  event_type text NOT NULL CHECK (event_type IN ('turn/start','model/request','model/result','tool/call','tool/result','turn/end','message/user','message/assistant','context/compacted')),
  schema_fingerprint text NOT NULL CHECK (schema_fingerprint ~ '^[a-f0-9]{64}$'),
  input_digest text NOT NULL CHECK (input_digest ~ '^[a-f0-9]{64}$'),
  -- JSONB text adds formatting spaces; the runtime caps canonical bytes at
  -- 1 MiB. This separate physical backstop must not reject that valid limit.
  record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object' AND octet_length(record::text) <= 2097152),
  PRIMARY KEY (tenant_id, session_id, sequence),
  UNIQUE (tenant_id, session_id, event_id),
  FOREIGN KEY (tenant_id, session_id) REFERENCES session_streams(tenant_id, session_id),
  CHECK (record->>'tenantId' IS NOT DISTINCT FROM tenant_id),
  CHECK (record->>'sessionId' IS NOT DISTINCT FROM session_id),
  CHECK (record->>'eventId' IS NOT DISTINCT FROM event_id),
  CHECK (record->>'type' IS NOT DISTINCT FROM event_type),
  CHECK (record->>'schemaFingerprint' IS NOT DISTINCT FROM schema_fingerprint),
  CHECK ((record->>'sequence')::bigint IS NOT DISTINCT FROM sequence),
  CHECK ((record->>'formatVersion')::integer IS NOT DISTINCT FROM format_version)
);
ALTER TABLE session_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_streams FORCE ROW LEVEL SECURITY;
ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_events FORCE ROW LEVEL SECURITY;
CREATE POLICY session_streams_tenant_isolation ON session_streams
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));
CREATE POLICY session_events_tenant_isolation ON session_events
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));

CREATE FUNCTION reject_session_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'session_events is append-only' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER session_events_no_mutation BEFORE UPDATE OR DELETE ON session_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_session_event_mutation();
CREATE TRIGGER session_events_no_truncate BEFORE TRUNCATE ON session_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_session_event_mutation();
CREATE FUNCTION protect_session_stream_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.format_version IS DISTINCT FROM OLD.format_version THEN
    RAISE EXCEPTION 'session stream identity and format are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER session_streams_identity BEFORE UPDATE ON session_streams
  FOR EACH ROW EXECUTE FUNCTION protect_session_stream_identity();
REVOKE ALL ON session_events, session_streams FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_session_event_mutation(), protect_session_stream_identity() FROM PUBLIC;
COMMENT ON TABLE session_events IS 'PDSH-021 v1 immutable facts; serving SELECT/INSERT only, no model scratchpad.';
COMMENT ON TABLE session_streams IS 'PDSH-021 neutral session identity and transactional sequence cursor.';
