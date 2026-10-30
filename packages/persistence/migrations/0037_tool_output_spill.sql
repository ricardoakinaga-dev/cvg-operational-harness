-- SPEC 0293 R2 / PAR-C03 slice 2: durable storage of large tool output, shown to the
-- model as a preview plus an opaque locator. Opt-in dedicated schema, like
-- 0028_session_events: no legacy table is altered and it is not in the default run.
-- The migration runner owns the transaction, the advisory lock and the checksum.
--
-- The locator is never stored, only its SHA-256. It is derived by the application
-- (HMAC with a server key), so a repeated write finds the same row. An object is
-- immutable: its expiry cannot be extended and its content cannot change; the only
-- way a row leaves is DELETE (expiry sweep or an erasure request).
CREATE TABLE spill_objects (
  tenant_id text NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 200),
  session_id text NOT NULL CHECK (length(session_id) BETWEEN 1 AND 200),
  locator_hash text NOT NULL CHECK (locator_hash ~ '^[a-f0-9]{64}$'),
  execution_id text NOT NULL CHECK (length(execution_id) BETWEEN 1 AND 200),
  operation_key text NOT NULL CHECK (length(operation_key) BETWEEN 1 AND 4096),
  source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 200),
  classification text NOT NULL CHECK (length(classification) BETWEEN 1 AND 64),
  media_type text NOT NULL CHECK (media_type IN ('text/plain', 'application/json')),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  byte_length bigint NOT NULL CHECK (byte_length BETWEEN 1 AND 16777216),
  -- UTF-8 bytes exactly as stored; byte_length is the physical backstop of the policy limit.
  content bytea NOT NULL CHECK (octet_length(content) = byte_length),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  PRIMARY KEY (tenant_id, session_id, locator_hash)
);
CREATE INDEX spill_objects_expiry ON spill_objects (expires_at);
CREATE INDEX spill_objects_session ON spill_objects (tenant_id, session_id);

ALTER TABLE spill_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE spill_objects FORCE ROW LEVEL SECURITY;
CREATE POLICY spill_objects_tenant_isolation ON spill_objects
  USING (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''));

-- The expiry sweep runs for every tenant without a tenant context, as a member of the
-- dedicated maintenance role cvg_spill_sweeper (granted by the operator to the sweep job
-- only). Members can see and delete rows whose validity has ended, and nothing else: a live
-- row is out of reach and there is no INSERT or UPDATE path. Creating the role needs
-- CREATEROLE; where the migration authority lacks it, the operator creates the role and the
-- sweep stays unavailable until then (no other policy changes).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cvg_spill_sweeper') THEN
    CREATE ROLE cvg_spill_sweeper NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'cvg_spill_sweeper was not created: the expiry sweep needs it';
END $$;
CREATE POLICY spill_objects_expiry_sweep_read ON spill_objects FOR SELECT
  USING (to_regrole('cvg_spill_sweeper') IS NOT NULL
         AND pg_has_role(current_user, 'cvg_spill_sweeper', 'member')
         AND expires_at <= now());
CREATE POLICY spill_objects_expiry_sweep ON spill_objects FOR DELETE
  USING (to_regrole('cvg_spill_sweeper') IS NOT NULL
         AND pg_has_role(current_user, 'cvg_spill_sweeper', 'member')
         AND expires_at <= now());

CREATE FUNCTION reject_spill_object_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'spill_objects rows are immutable' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER spill_objects_no_update BEFORE UPDATE ON spill_objects
  FOR EACH ROW EXECUTE FUNCTION reject_spill_object_update();
CREATE TRIGGER spill_objects_no_truncate BEFORE TRUNCATE ON spill_objects
  FOR EACH STATEMENT EXECUTE FUNCTION reject_spill_object_update();
