-- PAR-S01 / SPEC 0221 + recomposition f64a1b89 + note 0221b. Opt-in, after 0028, dedicated schema.
-- Additive: facts, ordering, sequences and digests of 0028 are never rewritten. The migration
-- runner owns the transaction, the advisory lock and the checksum.
DO $$
BEGIN
  IF to_regclass('session_streams') IS NULL OR to_regclass('session_events') IS NULL THEN
    RAISE EXCEPTION 'session ownership migration requires 0028_session_events in the same dedicated schema';
  END IF;
END $$;

ALTER TABLE session_streams
  ADD COLUMN writer_lock_id integer GENERATED ALWAYS AS IDENTITY (START WITH 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE),
  ADD COLUMN header_json text,
  ADD COLUMN inherited_event_count bigint,
  ADD CONSTRAINT session_streams_writer_lock_id_key UNIQUE (writer_lock_id),
  ADD CONSTRAINT session_streams_writer_lock_id_positive CHECK (writer_lock_id > 0),
  ADD CONSTRAINT session_streams_header_cut_paired CHECK ((header_json IS NULL) = (inherited_event_count IS NULL)),
  ADD CONSTRAINT session_streams_header_size CHECK (header_json IS NULL OR octet_length(header_json) <= 65536),
  ADD CONSTRAINT session_streams_cut_range CHECK (inherited_event_count IS NULL OR inherited_event_count BETWEEN 0 AND 9007199254740991);

-- The writer lock key is the two-int advisory pair
-- (oid(session_streams) - 2^31, writer_lock_id): never an OID of events, never a hash of
-- tenant/session. It is separate from the bigint space used by the migration runner.

-- A stream created by the legacy path gets an honest header of its creation instant,
-- unseeded and cut 0. Existing streams stay NULL (migration-required) until adopted.
CREATE FUNCTION session_stream_default_header() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.header_json IS NULL AND NEW.inherited_event_count IS NULL THEN
    NEW.header_json := json_build_object(
      'version', 1, 'id', NEW.session_id,
      'createdAt', (extract(epoch FROM clock_timestamp()) * 1000)::bigint,
      'isSeeded', false)::text;
    NEW.inherited_event_count := 0;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER session_streams_default_header BEFORE INSERT ON session_streams
  FOR EACH ROW EXECUTE FUNCTION session_stream_default_header();

-- Fact writes need the transaction try-lock of the writer key. It is re-entrant on the
-- owner connection and fails at once (no wait, so no row/advisory cycle) elsewhere.
CREATE FUNCTION guard_session_event_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  lock_id integer;
  expected bigint;
BEGIN
  SELECT writer_lock_id, next_sequence INTO lock_id, expected
    FROM session_streams WHERE tenant_id = NEW.tenant_id AND session_id = NEW.session_id;
  IF lock_id IS NULL THEN
    RAISE EXCEPTION 'session stream is not open' USING ERRCODE = '23503';
  END IF;
  IF NOT pg_try_advisory_xact_lock((to_regclass('session_streams')::oid::bigint - 2147483648)::integer, lock_id) THEN
    RAISE EXCEPTION 'session is owned by another writer' USING ERRCODE = '55P03';
  END IF;
  IF NEW.sequence IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'session event sequence differs from the stream cursor' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER session_events_writer_guard BEFORE INSERT ON session_events
  FOR EACH ROW EXECUTE FUNCTION guard_session_event_insert();

CREATE FUNCTION guard_session_stream_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  head bigint;
  table_owner name;
BEGIN
  IF NEW.writer_lock_id IS DISTINCT FROM OLD.writer_lock_id THEN
    RAISE EXCEPTION 'session writer lock id is immutable' USING ERRCODE = '55000';
  END IF;
  IF NOT pg_try_advisory_xact_lock((TG_RELID::bigint - 2147483648)::integer, OLD.writer_lock_id) THEN
    RAISE EXCEPTION 'session is owned by another writer' USING ERRCODE = '55P03';
  END IF;
  IF OLD.header_json IS NOT NULL THEN
    IF NEW.header_json IS DISTINCT FROM OLD.header_json
       OR NEW.inherited_event_count IS DISTINCT FROM OLD.inherited_event_count THEN
      RAISE EXCEPTION 'session header and cut are immutable' USING ERRCODE = '55000';
    END IF;
  ELSIF NEW.header_json IS NOT NULL THEN
    -- Adoption NULL -> metadata belongs to the migration authority (the table owner).
    SELECT pg_get_userbyid(relowner) INTO table_owner FROM pg_class WHERE oid = TG_RELID;
    IF current_user <> table_owner THEN
      RAISE EXCEPTION 'session header adoption needs the migration authority' USING ERRCODE = '42501';
    END IF;
  END IF;
  SELECT COALESCE(max(sequence), 0) INTO head FROM session_events
    WHERE tenant_id = NEW.tenant_id AND session_id = NEW.session_id;
  IF NEW.next_sequence IS DISTINCT FROM head + 1 THEN
    RAISE EXCEPTION 'session cursor must equal the last sequence plus one' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER session_streams_writer_guard BEFORE UPDATE ON session_streams
  FOR EACH ROW EXECUTE FUNCTION guard_session_stream_update();

CREATE FUNCTION reject_session_stream_removal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'session_streams rows are never removed' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER session_streams_no_delete BEFORE DELETE ON session_streams
  FOR EACH STATEMENT EXECUTE FUNCTION reject_session_stream_removal();
CREATE TRIGGER session_streams_no_truncate BEFORE TRUNCATE ON session_streams
  FOR EACH STATEMENT EXECUTE FUNCTION reject_session_stream_removal();

-- Final state at COMMIT: cursor = highest sequence + 1. A direct INSERT without the cursor
-- advance cannot leave an incoherent stream. The caller cannot defer this past COMMIT.
CREATE FUNCTION check_session_cursor_at_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cursor_value bigint;
  head bigint;
BEGIN
  SELECT next_sequence INTO cursor_value FROM session_streams
    WHERE tenant_id = NEW.tenant_id AND session_id = NEW.session_id;
  SELECT COALESCE(max(sequence), 0) INTO head FROM session_events
    WHERE tenant_id = NEW.tenant_id AND session_id = NEW.session_id;
  IF cursor_value IS DISTINCT FROM head + 1 THEN
    RAISE EXCEPTION 'session cursor is incoherent at commit' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER session_events_cursor_at_commit AFTER INSERT ON session_events
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_session_cursor_at_commit();
CREATE CONSTRAINT TRIGGER session_streams_cursor_at_commit AFTER INSERT OR UPDATE ON session_streams
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_session_cursor_at_commit();

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'session_stream_default_header', 'guard_session_event_insert', 'guard_session_stream_update',
    'reject_session_stream_removal', 'check_session_cursor_at_commit'] LOOP
    EXECUTE format('ALTER FUNCTION %I() SET search_path = %I, pg_catalog', fn, current_schema());
    EXECUTE format('REVOKE ALL ON FUNCTION %I() FROM PUBLIC', fn);
  END LOOP;
END $$;
COMMENT ON COLUMN session_streams.writer_lock_id IS 'PAR-S01 writer advisory key part; identity NO CYCLE, never reused.';
