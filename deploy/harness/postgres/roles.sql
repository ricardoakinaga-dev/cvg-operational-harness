-- PLAN0374 Fase C (C2) — roles and schemas of the harness core database.
--
-- Run ONCE, before the first migration job, by the instance administrator
-- (on a managed service: the admin user the platform provides):
--
--   psql "<admin connection>" -X \
--     -v database=cvg -v data_schema=cvg_data \
--     -v migration_role=cvg_migration -v runtime_role=cvg_runtime \
--     -v auth_owner_role=cvg_auth_owner -v session_role=cvg_session \
--     -v backup_role=cvg_backup \
--     -f deploy/harness/postgres/roles.sql
--
-- Passwords are NOT set here. Afterwards, in the same psql session, run
-- `\password <role>` for each role: psql hashes on the client, so nothing
-- reaches shell history or server logs in clear text.
--
-- Same recipe as the "Roles and schemas" block of
-- scripts/production-stack-smoke.ts (barra 0373, smoke 22/22), plus the
-- read-only backup role. scripts/baseline-postgres.ts does NOT create roles
-- (it baselines a legacy schema) and does not apply to a new database.
-- Expected state after the first migration job: verify-roles.sql.

\set ON_ERROR_STOP on

-- Four serving/migration roles: no superuser, no RLS bypass, no role or
-- database creation, no replication, no inherited privileges.
CREATE ROLE :"migration_role" LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
CREATE ROLE :"runtime_role" LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
CREATE ROLE :"auth_owner_role" LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;
CREATE ROLE :"session_role" LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT;

-- Backup role (C6): read-only and the ONLY role with BYPASSRLS. The data
-- tables use FORCE ROW LEVEL SECURITY and pg_dump refuses to write a dump
-- that row security would silently filter. Never configured in serving;
-- its credential lives only in /etc/cvg-harness/backup.env.
-- PostgreSQL 16 requires the creating role to hold BYPASSRLS itself; if the
-- platform admin cannot, see postgres/README.md (alternatives).
CREATE ROLE :"backup_role" LOGIN NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT CONNECTION LIMIT 2;
ALTER ROLE :"backup_role" SET default_transaction_read_only = on;

-- The data schema exists before the job and belongs to the migration role
-- (scripts/migrate-job.mjs runs with createSchema: false).
CREATE SCHEMA :"data_schema" AUTHORIZATION :"migration_role";
ALTER ROLE :"migration_role" SET search_path = :"data_schema";
ALTER ROLE :"runtime_role" SET search_path = :"data_schema";

-- The auth owner creates its private schema inside the migration job, which
-- needs CREATE on the database. Grant it only around each migration run
-- (README.md, C3):
--   GRANT CREATE ON DATABASE :"database" TO :"auth_owner_role";
--   ... docker compose up -d (the migrate service runs first) ...
--   REVOKE CREATE ON DATABASE :"database" FROM :"auth_owner_role";
