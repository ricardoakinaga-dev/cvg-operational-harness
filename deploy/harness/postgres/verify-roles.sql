-- PLAN0374 Fase C (C2, C3) — read-only verification of roles, schemas and RLS.
--
-- Catalog queries only (plus schema_migrations), so the RUNTIME role can run
-- it; no admin credential is needed. Run after the first migration job:
--
--   psql "<DATABASE_URL>" -X -P pager=off \
--     -v data_schema=cvg_data -v auth_schema=cvg_auth \
--     -v migration_role=cvg_migration -v runtime_role=cvg_runtime \
--     -v auth_owner_role=cvg_auth_owner -v session_role=cvg_session \
--     -v backup_role=cvg_backup \
--     -f deploy/harness/postgres/verify-roles.sql
--
-- The expected output of each query is written above it and in
-- deploy/harness/postgres/README.md. Any difference is a C2/C3 failure.

\set ON_ERROR_STOP on

-- Q1 role attributes. Expected 5 rows. The four serving/migration roles:
-- can_login t; superuser, bypassrls, createdb, createrole, replication and
-- inherit all f. Backup role: bypassrls t (the only one), everything else f,
-- config contains default_transaction_read_only=on.
\echo 'Q1 role attributes'
SELECT rolname,
       rolcanlogin AS can_login,
       rolsuper AS superuser,
       rolbypassrls AS bypassrls,
       rolcreatedb AS createdb,
       rolcreaterole AS createrole,
       rolreplication AS replication,
       rolinherit AS inherit,
       COALESCE(array_to_string(rolconfig, ','), '') AS config
  FROM pg_roles
 WHERE rolname IN (:'migration_role', :'runtime_role', :'auth_owner_role',
                   :'session_role', :'backup_role')
 ORDER BY rolname;

-- Q2 memberships touching these roles, on either side. Expected 0 rows.
-- The API refuses a session role granted to anyone (granted_to = 0) and the
-- runtime role must not be a member of another role. On PostgreSQL 16 a
-- non-superuser admin is implicitly granted ADMIN on each role it creates:
-- such rows must be revoked before the API starts (postgres/README.md).
\echo 'Q2 memberships (expected: 0 rows)'
SELECT granted.rolname AS role,
       member.rolname AS member,
       membership.admin_option,
       grantor.rolname AS grantor
  FROM pg_auth_members AS membership
  JOIN pg_roles AS granted ON granted.oid = membership.roleid
  JOIN pg_roles AS member ON member.oid = membership.member
  JOIN pg_roles AS grantor ON grantor.oid = membership.grantor
 WHERE granted.rolname IN (:'migration_role', :'runtime_role', :'auth_owner_role',
                           :'session_role', :'backup_role')
    OR member.rolname IN (:'migration_role', :'runtime_role', :'auth_owner_role',
                          :'session_role', :'backup_role')
 ORDER BY 1, 2;

-- Q3 schema owners. Expected 2 rows:
--   <data_schema> | <migration_role>
--   <auth_schema> | <auth_owner_role>
\echo 'Q3 schema owners'
SELECT nspname AS schema, pg_get_userbyid(nspowner) AS owner
  FROM pg_namespace
 WHERE nspname IN (:'data_schema', :'auth_schema')
 ORDER BY 1;

-- Q4 database privileges. Expected db_create f for every role (the auth
-- owner holds CREATE only inside the migration window, C3).
\echo 'Q4 database privileges'
SELECT role.rolname,
       has_database_privilege(role.rolname, current_database(), 'CREATE') AS db_create
  FROM (VALUES (:'migration_role'), (:'runtime_role'), (:'auth_owner_role'),
               (:'session_role'), (:'backup_role')) AS role(rolname)
 ORDER BY 1;

-- Q5 schema privileges. Expected (usage/create):
--   migration_role  data t/t  auth f/f
--   runtime_role    data t/f  auth f/f
--   auth_owner_role data f/f  auth t/t
--   session_role    data f/f  auth t/f   (the API refuses any data access)
--   backup_role     data t/f  auth f/f
\echo 'Q5 schema privileges'
SELECT role.rolname,
       schema.nspname AS schema,
       has_schema_privilege(role.rolname, schema.nspname, 'USAGE') AS usage,
       has_schema_privilege(role.rolname, schema.nspname, 'CREATE') AS "create"
  FROM (VALUES (:'migration_role'), (:'runtime_role'), (:'auth_owner_role'),
               (:'session_role'), (:'backup_role')) AS role(rolname)
 CROSS JOIN (VALUES (:'data_schema'), (:'auth_schema')) AS schema(nspname)
 ORDER BY 1, 2;

-- Q6 tables with a row-security policy that is not ENABLEd and FORCEd.
-- Expected 0 rows (the API and worker preflights refuse to start otherwise).
\echo 'Q6 policy tables without ENABLE+FORCE RLS (expected: 0 rows)'
SELECT n.nspname AS schema, c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
 WHERE n.nspname IN (:'data_schema', :'auth_schema')
   AND c.relkind = 'r'
   AND EXISTS (SELECT 1 FROM pg_policy AS p WHERE p.polrelid = c.oid)
   AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
 ORDER BY 1, 2;

-- Q7 RLS summary per schema. Expected: tables_without_rls identical to the
-- rehearsal database (--profile local-postgres) on the same SHA; only
-- infrastructure tables without tenant data (for example schema_migrations,
-- webhook_replay_events, rate_limit_buckets) may appear.
\echo 'Q7 RLS summary'
SELECT n.nspname AS schema,
       count(*) FILTER (WHERE c.relrowsecurity AND c.relforcerowsecurity) AS rls_forced,
       count(*) FILTER (WHERE NOT c.relrowsecurity) AS without_rls,
       COALESCE(string_agg(c.relname, ',' ORDER BY c.relname)
                  FILTER (WHERE NOT c.relrowsecurity), '') AS tables_without_rls
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
 WHERE n.nspname IN (:'data_schema', :'auth_schema')
   AND c.relkind = 'r'
 GROUP BY 1
 ORDER BY 1;

-- Q8 applied product migrations. Expected: latest equals the last file in
-- packages/persistence/migrations at the deployed SHA (0027_worker_operations
-- at 31dc1c3).
\echo 'Q8 applied migrations'
SELECT count(*) AS applied, max(version) AS latest
  FROM :"data_schema".schema_migrations;
