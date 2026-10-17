-- Incremental PR-301 auth-schema migration. The runner quotes both identifiers.
CREATE TABLE __AUTH_SCHEMA__.oidc_login_states (
  state_digest bytea PRIMARY KEY CHECK (octet_length(state_digest) = 32),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT oidc_login_states_expiry_check CHECK (
    expires_at > created_at
    AND expires_at <= created_at + interval '5 minutes'
  )
);

CREATE INDEX oidc_login_states_expires_at_idx
  ON __AUTH_SCHEMA__.oidc_login_states (expires_at);

ALTER TABLE __AUTH_SCHEMA__.oidc_login_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE __AUTH_SCHEMA__.oidc_login_states FORCE ROW LEVEL SECURITY;
CREATE POLICY oidc_login_states_owner_only
  ON __AUTH_SCHEMA__.oidc_login_states
  FOR ALL TO __OWNER_ROLE__ USING (true) WITH CHECK (true);

CREATE FUNCTION __AUTH_SCHEMA__.oidc_state_reserve(
  p_digest bytea, p_expires timestamptz
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $cvg_oidc_state_reserve$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_inserted bigint;
BEGIN
  IF p_digest IS NULL OR octet_length(p_digest) <> 32
     OR p_expires IS NULL OR p_expires <= v_now
     OR p_expires > v_now + interval '5 minutes 30 seconds'
  THEN
    RAISE EXCEPTION 'Invalid OIDC login state' USING ERRCODE = '22023';
  END IF;
  INSERT INTO __AUTH_SCHEMA__.oidc_login_states
    (state_digest, created_at, expires_at)
  VALUES (p_digest, v_now, LEAST(p_expires, v_now + interval '5 minutes'))
  ON CONFLICT (state_digest) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted = 1;
END;
$cvg_oidc_state_reserve$;

CREATE FUNCTION __AUTH_SCHEMA__.oidc_state_consume(p_digest bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $cvg_oidc_state_consume$
DECLARE v_expires timestamptz;
BEGIN
  IF p_digest IS NULL OR octet_length(p_digest) <> 32 THEN RETURN false; END IF;
  DELETE FROM __AUTH_SCHEMA__.oidc_login_states
  WHERE state_digest = p_digest
  RETURNING expires_at INTO v_expires;
  RETURN v_expires IS NOT NULL AND v_expires > clock_timestamp();
END;
$cvg_oidc_state_consume$;

REVOKE ALL ON TABLE __AUTH_SCHEMA__.oidc_login_states FROM PUBLIC;
REVOKE ALL ON FUNCTION __AUTH_SCHEMA__.oidc_state_reserve(bytea,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION __AUTH_SCHEMA__.oidc_state_consume(bytea) FROM PUBLIC;
