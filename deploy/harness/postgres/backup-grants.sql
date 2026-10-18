-- PLAN0374 Fase C (C6) — read access of the backup role to the data schema.
--
-- Run as the MIGRATION role (owner of the data schema), once, after the
-- first migration job has created the tables:
--
--   psql "<DATABASE_MIGRATION_URL>" -X \
--     -v data_schema=cvg_data -v migration_role=cvg_migration \
--     -v backup_role=cvg_backup \
--     -f deploy/harness/postgres/backup-grants.sql
--
-- Default privileges cover tables created by later migrations. The backup
-- role gets nothing on the operator-auth schema: sessions are short-lived
-- and the migration job recreates that schema after a restore.

\set ON_ERROR_STOP on

BEGIN;
GRANT USAGE ON SCHEMA :"data_schema" TO :"backup_role";
GRANT SELECT ON ALL TABLES IN SCHEMA :"data_schema" TO :"backup_role";
GRANT SELECT ON ALL SEQUENCES IN SCHEMA :"data_schema" TO :"backup_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_role" IN SCHEMA :"data_schema"
  GRANT SELECT ON TABLES TO :"backup_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_role" IN SCHEMA :"data_schema"
  GRANT SELECT ON SEQUENCES TO :"backup_role";
COMMIT;
