-- PR-301: rendered only by runOperatorSessionMigrations. Both placeholders
-- are SQL identifiers quoted by the runner before this template executes.

CREATE TABLE __AUTH_SCHEMA__.operator_session_families (
  family_id bytea PRIMARY KEY CHECK (octet_length(family_id) = 32),
  revoked_at timestamptz
);

CREATE TABLE __AUTH_SCHEMA__.operator_sessions (
  token_digest bytea PRIMARY KEY CHECK (octet_length(token_digest) = 32),
  family_id bytea NOT NULL REFERENCES __AUTH_SCHEMA__.operator_session_families(family_id),
  tenant_id text NOT NULL CHECK (tenant_id ~ '^tenant_[0-9a-f-]{36}$'),
  operator_id text NOT NULL CHECK (operator_id ~ '^[A-Za-z0-9._:-]{3,80}$'),
  role text NOT NULL CHECK (role IN ('Operator', 'Approver', 'Supervisor', 'Admin')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT operator_sessions_expiry_check CHECK (
    expires_at > created_at
    AND expires_at <= created_at + interval '15 minutes'
  )
);

CREATE INDEX operator_sessions_expires_at_idx
  ON __AUTH_SCHEMA__.operator_sessions (expires_at);
CREATE INDEX operator_sessions_family_idx
  ON __AUTH_SCHEMA__.operator_sessions (family_id);

ALTER TABLE __AUTH_SCHEMA__.operator_session_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE __AUTH_SCHEMA__.operator_session_families FORCE ROW LEVEL SECURITY;
ALTER TABLE __AUTH_SCHEMA__.operator_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE __AUTH_SCHEMA__.operator_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY operator_session_families_owner_only
  ON __AUTH_SCHEMA__.operator_session_families
  FOR ALL TO __OWNER_ROLE__ USING (true) WITH CHECK (true);
CREATE POLICY operator_sessions_owner_only
  ON __AUTH_SCHEMA__.operator_sessions
  FOR ALL TO __OWNER_ROLE__ USING (true) WITH CHECK (true);

-- The body delimiters are stable inputs to the live-definition preflight.
CREATE FUNCTION __AUTH_SCHEMA__.operator_session_create(
  p_digest bytea, p_tenant text, p_operator text, p_role text, p_expires timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $cvg_create$
DECLARE v_now timestamptz := clock_timestamp();
BEGIN
  IF p_digest IS NULL OR octet_length(p_digest) <> 32
     OR p_tenant IS NULL OR p_tenant !~ '^tenant_[0-9a-f-]{36}$'
     OR p_operator IS NULL OR p_operator !~ '^[A-Za-z0-9._:-]{3,80}$'
     OR p_role IS NULL OR p_role NOT IN ('Operator', 'Approver', 'Supervisor', 'Admin')
     OR p_expires IS NULL OR p_expires <= v_now
     OR p_expires > v_now + interval '15 minutes'
  THEN
    RAISE EXCEPTION 'Invalid operator session' USING ERRCODE = '22023';
  END IF;
  INSERT INTO __AUTH_SCHEMA__.operator_session_families (family_id)
  VALUES (p_digest);
  INSERT INTO __AUTH_SCHEMA__.operator_sessions
    (token_digest, family_id, tenant_id, operator_id, role, created_at, expires_at)
  VALUES (p_digest, p_digest, p_tenant, p_operator, p_role, v_now, p_expires);
END;
$cvg_create$;

CREATE FUNCTION __AUTH_SCHEMA__.operator_session_get(p_digest bytea)
RETURNS TABLE(tenant_id text, operator_id text, role text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $cvg_get$
BEGIN
  IF p_digest IS NULL OR octet_length(p_digest) <> 32 THEN RETURN; END IF;
  RETURN QUERY
  SELECT s.tenant_id, s.operator_id, s.role, s.expires_at
  FROM __AUTH_SCHEMA__.operator_sessions AS s
  JOIN __AUTH_SCHEMA__.operator_session_families AS f ON f.family_id = s.family_id
  WHERE s.token_digest = p_digest
    AND s.revoked_at IS NULL
    AND f.revoked_at IS NULL
    AND s.expires_at > clock_timestamp();
END;
$cvg_get$;

CREATE FUNCTION __AUTH_SCHEMA__.operator_session_replace(
  p_old_digest bytea, p_new_digest bytea, p_tenant text,
  p_operator text, p_role text, p_expires timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $cvg_replace$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_family_id bytea;
BEGIN
  IF p_old_digest IS NULL OR octet_length(p_old_digest) <> 32
     OR p_new_digest IS NULL OR octet_length(p_new_digest) <> 32
     OR p_old_digest = p_new_digest
     OR p_tenant IS NULL OR p_tenant !~ '^tenant_[0-9a-f-]{36}$'
     OR p_operator IS NULL OR p_operator !~ '^[A-Za-z0-9._:-]{3,80}$'
     OR p_role IS NULL OR p_role NOT IN ('Operator', 'Approver', 'Supervisor', 'Admin')
     OR p_expires IS NULL OR p_expires <= v_now
     OR p_expires > v_now + interval '15 minutes'
  THEN
    RAISE EXCEPTION 'Invalid operator session replacement' USING ERRCODE = '22023';
  END IF;

  SELECT s.family_id INTO v_family_id
  FROM __AUTH_SCHEMA__.operator_sessions AS s
  WHERE s.token_digest = p_old_digest;
  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Operator session is unavailable' USING ERRCODE = '22023';
  END IF;

  -- Lock the family first in both replace and revoke. Re-check the old row
  -- after acquiring it so a second replacement cannot reuse a revoked link.
  PERFORM 1 FROM __AUTH_SCHEMA__.operator_session_families AS f
  WHERE f.family_id = v_family_id AND f.revoked_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operator session family is revoked' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM __AUTH_SCHEMA__.operator_sessions AS s
  WHERE s.token_digest = p_old_digest AND s.family_id = v_family_id
    AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operator session is unavailable' USING ERRCODE = '22023';
  END IF;

  -- A concurrent logout may hold the family lock until the proposed expiry
  -- has passed. Validate time again after acquiring that lock.
  v_now := clock_timestamp();
  IF p_expires <= v_now OR p_expires > v_now + interval '15 minutes' THEN
    RAISE EXCEPTION 'Invalid operator session replacement expiry' USING ERRCODE = '22023';
  END IF;

  INSERT INTO __AUTH_SCHEMA__.operator_sessions
    (token_digest, family_id, tenant_id, operator_id, role, created_at, expires_at)
  VALUES (p_new_digest, v_family_id, p_tenant, p_operator, p_role, v_now, p_expires);
  UPDATE __AUTH_SCHEMA__.operator_sessions
  SET revoked_at = clock_timestamp()
  WHERE token_digest = p_old_digest AND revoked_at IS NULL;
END;
$cvg_replace$;

CREATE FUNCTION __AUTH_SCHEMA__.operator_session_revoke(p_digest bytea)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $cvg_revoke$
DECLARE v_family_id bytea;
BEGIN
  IF p_digest IS NULL OR octet_length(p_digest) <> 32 THEN RETURN; END IF;
  SELECT s.family_id INTO v_family_id
  FROM __AUTH_SCHEMA__.operator_sessions AS s
  WHERE s.token_digest = p_digest;
  IF v_family_id IS NULL THEN RETURN; END IF;

  PERFORM 1 FROM __AUTH_SCHEMA__.operator_session_families AS f
  WHERE f.family_id = v_family_id FOR UPDATE;
  UPDATE __AUTH_SCHEMA__.operator_session_families
  SET revoked_at = COALESCE(revoked_at, clock_timestamp())
  WHERE family_id = v_family_id;
END;
$cvg_revoke$;

REVOKE ALL ON TABLE __AUTH_SCHEMA__.operator_session_families FROM PUBLIC;
REVOKE ALL ON TABLE __AUTH_SCHEMA__.operator_sessions FROM PUBLIC;
REVOKE ALL ON FUNCTION __AUTH_SCHEMA__.operator_session_create(bytea,text,text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION __AUTH_SCHEMA__.operator_session_get(bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION __AUTH_SCHEMA__.operator_session_replace(bytea,bytea,text,text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION __AUTH_SCHEMA__.operator_session_revoke(bytea) FROM PUBLIC;
