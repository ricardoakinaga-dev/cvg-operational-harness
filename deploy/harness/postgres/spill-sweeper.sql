-- SPEC 0293 R2 (PAR-C03) — least-privilege role of the spill expiry sweep.
--
-- Run by the INSTANCE ADMINISTRATOR (not by the migration role, which has no CREATEROLE),
-- after migration 0037_tool_output_spill has created the table in the data schema:
--
--   psql "<admin connection>" -X \
--     -v data_schema=cvg_data -v sweep_login_role=cvg_spill_sweep_job \
--     -f deploy/harness/postgres/spill-sweeper.sql
--
-- `sweep_login_role` is the login role the sweep job connects as; it must already exist
-- (roles.sql style: LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOINHERIT; the grant below
-- is WITH INHERIT TRUE, PostgreSQL 16+, so only this role is inherited). The sweeper needs
-- the expiry of the rows to delete them and nothing else: it can read the identity and
-- expiry columns and DELETE, and it can NOT read `content`, INSERT, UPDATE or TRUNCATE.
-- The RLS policies of the migration additionally limit it to rows already expired.
-- PostgresSpillSweeper refuses to run when any of this does not hold.

\set ON_ERROR_STOP on

BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cvg_spill_sweeper') THEN
    CREATE ROLE cvg_spill_sweeper NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB
      NOCREATEROLE NOREPLICATION NOINHERIT;
  END IF;
END $$;
GRANT USAGE ON SCHEMA :"data_schema" TO cvg_spill_sweeper;
REVOKE ALL ON :"data_schema".spill_objects FROM cvg_spill_sweeper;
GRANT SELECT (tenant_id, session_id, locator_hash, expires_at), DELETE
  ON :"data_schema".spill_objects TO cvg_spill_sweeper;
GRANT cvg_spill_sweeper TO :"sweep_login_role" WITH INHERIT TRUE;
COMMIT;
