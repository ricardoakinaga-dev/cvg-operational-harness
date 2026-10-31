-- PAR-S02 / SPEC 0292 R1. Opt-in, after 0028 and 0034, in the same dedicated schema. The table is
-- a DERIVED CACHE of the session log: it can be dropped or emptied at any time and the projection
-- is rebuilt from the log (I1). It never holds message or tool text (I6), only ids, counters and
-- references. The migration runner owns the transaction, the advisory lock and the checksum.
DO $$
BEGIN
  IF to_regclass('session_streams') IS NULL OR to_regclass('session_events') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = current_schema()
                       AND table_name = 'session_streams' AND column_name = 'writer_lock_id') THEN
    RAISE EXCEPTION 'session projection migration requires 0028_session_events and 0034_session_writer_ownership in the same dedicated schema';
  END IF;
END $$;

CREATE TABLE session_projection_checkpoints (
  tenant_id text NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 200),
  session_id text NOT NULL CHECK (length(session_id) BETWEEN 1 AND 200),
  projection_id text NOT NULL CHECK (projection_id ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  projection_version integer NOT NULL CHECK (projection_version >= 1),
  through_sequence bigint NOT NULL CHECK (through_sequence BETWEEN 1 AND 9007199254740991),
  -- input_digest of the event at through_sequence: the checkpoint names the exact point it covers
  tail_input_digest text NOT NULL CHECK (tail_input_digest ~ '^[a-f0-9]{64}$'),
  -- sha256 of the stream header text: the identity of the stream the state was derived from
  header_digest text NOT NULL CHECK (header_digest ~ '^[a-f0-9]{64}$'),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object' AND octet_length(state::text) <= 262144),
  state_digest text NOT NULL CHECK (state_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, session_id, projection_id),
  FOREIGN KEY (tenant_id, session_id) REFERENCES session_streams (tenant_id, session_id)
);

ALTER TABLE session_projection_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_projection_checkpoints FORCE ROW LEVEL SECURITY;
CREATE POLICY session_projection_checkpoints_tenant_isolation ON session_projection_checkpoints
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));

-- Only the owner of the stream writes its checkpoint (SPEC 0292 I8), as for events: the session
-- advisory lock is taken by the owner's connection and the try-lock below is re-entrant there.
-- The point the checkpoint names must be a real event of the stream with that digest, and the
-- header digest must be that of the stream. The state itself is not checked by SQL (SP-G).
CREATE FUNCTION guard_session_projection_checkpoint() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  lock_id integer;
  head bigint;
  header text;
  point_digest text;
BEGIN
  SELECT writer_lock_id, next_sequence - 1, header_json INTO lock_id, head, header
    FROM session_streams WHERE tenant_id = NEW.tenant_id AND session_id = NEW.session_id;
  IF lock_id IS NULL THEN
    RAISE EXCEPTION 'session projection checkpoint needs its stream' USING ERRCODE = '23503';
  END IF;
  IF NOT pg_try_advisory_xact_lock((to_regclass('session_streams')::oid::bigint - 2147483648)::integer, lock_id) THEN
    RAISE EXCEPTION 'session is owned by another writer' USING ERRCODE = '55P03';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.projection_id IS DISTINCT FROM OLD.projection_id
     OR NEW.through_sequence < OLD.through_sequence) THEN
    RAISE EXCEPTION 'session projection checkpoint only advances' USING ERRCODE = '55000';
  END IF;
  IF NEW.through_sequence > head THEN
    RAISE EXCEPTION 'session projection checkpoint is beyond the log' USING ERRCODE = '23514';
  END IF;
  SELECT input_digest INTO point_digest FROM session_events
    WHERE tenant_id = NEW.tenant_id AND session_id = NEW.session_id AND sequence = NEW.through_sequence;
  IF point_digest IS DISTINCT FROM NEW.tail_input_digest THEN
    RAISE EXCEPTION 'session projection checkpoint point differs from the log' USING ERRCODE = '23514';
  END IF;
  IF NEW.header_digest IS DISTINCT FROM encode(sha256(convert_to(header, 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'session projection checkpoint header differs from the stream' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER session_projection_checkpoints_guard BEFORE INSERT OR UPDATE ON session_projection_checkpoints
  FOR EACH ROW EXECUTE FUNCTION guard_session_projection_checkpoint();

CREATE FUNCTION reject_session_projection_checkpoint_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'session projection checkpoints are not truncated in bulk' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER session_projection_checkpoints_no_truncate BEFORE TRUNCATE ON session_projection_checkpoints
  FOR EACH STATEMENT EXECUTE FUNCTION reject_session_projection_checkpoint_truncate();

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'guard_session_projection_checkpoint', 'reject_session_projection_checkpoint_truncate'] LOOP
    EXECUTE format('ALTER FUNCTION %I() SET search_path = pg_catalog, %I, pg_temp', fn, current_schema());
    EXECUTE format('REVOKE ALL ON FUNCTION %I() FROM PUBLIC', fn);
  END LOOP;
END $$;

COMMENT ON TABLE session_projection_checkpoints IS
  'PAR-S02 derived cache of the session projection; droppable, never a source (SPEC 0292).';
