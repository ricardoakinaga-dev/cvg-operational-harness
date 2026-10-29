-- Owner role of this schema (no new policy is needed here): __OWNER_ROLE__
-- SPEC 0262 §6.2: binds every operator session to the principal revision it was
-- issued under. Rendered only by runOperatorSessionMigrations. Zero marks a
-- legacy row: it is never a current binding and `operator_session_get_v2`
-- filters it out, so a pre-cutover cookie requires a new login.

ALTER TABLE __AUTH_SCHEMA__.operator_sessions
  ADD COLUMN principal_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE __AUTH_SCHEMA__.operator_sessions
  ADD CONSTRAINT operator_sessions_principal_revision_check
  CHECK (principal_revision BETWEEN 0 AND 9007199254740991);

-- No overload or permissive alias of the unbound functions survives.
DROP FUNCTION __AUTH_SCHEMA__.operator_session_create(bytea,text,text,text,timestamptz);
DROP FUNCTION __AUTH_SCHEMA__.operator_session_get(bytea);
DROP FUNCTION __AUTH_SCHEMA__.operator_session_replace(bytea,bytea,text,text,text,timestamptz);

CREATE FUNCTION __AUTH_SCHEMA__.operator_session_create_v2(
  p_digest bytea, p_tenant text, p_operator text, p_role text,
  p_principal_revision bigint, p_expires timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $cvg_create_v2$
DECLARE v_now timestamptz := clock_timestamp();
BEGIN
  IF p_digest IS NULL OR octet_length(p_digest) <> 32
     OR p_tenant IS NULL OR p_tenant !~ '^tenant_[0-9a-f-]{36}$'
     OR p_operator IS NULL OR p_operator !~ '^[A-Za-z0-9._:-]{3,80}$'
     OR p_role IS NULL OR p_role NOT IN ('Operator', 'Approver', 'Supervisor', 'Admin')
     OR p_principal_revision IS NULL
     OR p_principal_revision < 1 OR p_principal_revision > 9007199254740991
     OR p_expires IS NULL OR p_expires <= v_now
     OR p_expires > v_now + interval '15 minutes'
  THEN
    RAISE EXCEPTION 'Invalid operator session' USING ERRCODE = '22023';
  END IF;
  INSERT INTO __AUTH_SCHEMA__.operator_session_families (family_id)
  VALUES (p_digest);
  INSERT INTO __AUTH_SCHEMA__.operator_sessions
    (token_digest, family_id, tenant_id, operator_id, role, principal_revision,
     created_at, expires_at)
  VALUES (p_digest, p_digest, p_tenant, p_operator, p_role, p_principal_revision,
          v_now, p_expires);
END;
$cvg_create_v2$;

CREATE FUNCTION __AUTH_SCHEMA__.operator_session_get_v2(p_digest bytea)
RETURNS TABLE(tenant_id text, operator_id text, role text,
              principal_revision bigint, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $cvg_get_v2$
BEGIN
  IF p_digest IS NULL OR octet_length(p_digest) <> 32 THEN RETURN; END IF;
  RETURN QUERY
  SELECT s.tenant_id, s.operator_id, s.role, s.principal_revision, s.expires_at
  FROM __AUTH_SCHEMA__.operator_sessions AS s
  JOIN __AUTH_SCHEMA__.operator_session_families AS f ON f.family_id = s.family_id
  WHERE s.token_digest = p_digest
    AND s.principal_revision >= 1
    AND s.revoked_at IS NULL
    AND f.revoked_at IS NULL
    AND s.expires_at > clock_timestamp();
END;
$cvg_get_v2$;

CREATE FUNCTION __AUTH_SCHEMA__.operator_session_replace_v2(
  p_old_digest bytea, p_new_digest bytea, p_tenant text,
  p_operator text, p_role text, p_principal_revision bigint,
  p_expires timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp AS $cvg_replace_v2$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_family_id bytea;
  v_old_tenant text;
  v_old_operator text;
  v_old_role text;
  v_old_revision bigint;
BEGIN
  IF p_old_digest IS NULL OR octet_length(p_old_digest) <> 32
     OR p_new_digest IS NULL OR octet_length(p_new_digest) <> 32
     OR p_old_digest = p_new_digest
     OR p_tenant IS NULL OR p_tenant !~ '^tenant_[0-9a-f-]{36}$'
     OR p_operator IS NULL OR p_operator !~ '^[A-Za-z0-9._:-]{3,80}$'
     OR p_role IS NULL OR p_role NOT IN ('Operator', 'Approver', 'Supervisor', 'Admin')
     OR p_principal_revision IS NULL
     OR p_principal_revision < 1 OR p_principal_revision > 9007199254740991
     OR p_expires IS NULL OR p_expires <= v_now
     OR p_expires > v_now + interval '15 minutes'
  THEN
    RAISE EXCEPTION 'Invalid operator session replacement' USING ERRCODE = '22023';
  END IF;

  SELECT s.family_id, s.tenant_id, s.operator_id, s.role, s.principal_revision
    INTO v_family_id, v_old_tenant, v_old_operator, v_old_role, v_old_revision
  FROM __AUTH_SCHEMA__.operator_sessions AS s
  WHERE s.token_digest = p_old_digest;
  IF v_family_id IS NULL THEN
    RAISE EXCEPTION 'Operator session is unavailable' USING ERRCODE = '22023';
  END IF;
  -- A rotation keeps tenant, operator, role and revision: any change of
  -- identity or revision goes through a new family (switchIdentity).
  IF v_old_tenant <> p_tenant OR v_old_operator <> p_operator
     OR v_old_role <> p_role OR v_old_revision <> p_principal_revision
  THEN
    RAISE EXCEPTION 'Operator session binding changed' USING ERRCODE = '22023';
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

  v_now := clock_timestamp();
  IF p_expires <= v_now OR p_expires > v_now + interval '15 minutes' THEN
    RAISE EXCEPTION 'Invalid operator session replacement expiry' USING ERRCODE = '22023';
  END IF;

  INSERT INTO __AUTH_SCHEMA__.operator_sessions
    (token_digest, family_id, tenant_id, operator_id, role, principal_revision,
     created_at, expires_at)
  VALUES (p_new_digest, v_family_id, p_tenant, p_operator, p_role,
          p_principal_revision, v_now, p_expires);
  UPDATE __AUTH_SCHEMA__.operator_sessions
  SET revoked_at = clock_timestamp()
  WHERE token_digest = p_old_digest AND revoked_at IS NULL;
END;
$cvg_replace_v2$;

REVOKE ALL ON FUNCTION __AUTH_SCHEMA__.operator_session_create_v2(bytea,text,text,text,bigint,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION __AUTH_SCHEMA__.operator_session_get_v2(bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION __AUTH_SCHEMA__.operator_session_replace_v2(bytea,bytea,text,text,text,bigint,timestamptz) FROM PUBLIC;
