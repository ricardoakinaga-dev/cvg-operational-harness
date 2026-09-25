-- AUD19-005 — standardize conversation policy names.
--
-- Migration 0020 created the conversation tables with policies named
-- `<table>_tenant_policy`, while the tenant-isolation preflight requires the
-- uniform `<table>_tenant_isolation` name. This migration renames the five
-- policies so the whole tenant-scoped schema is machine-checkable under one
-- rule. The policy expressions are unchanged.
--
-- Forward-fix / recovery: renames hold no data. Rollback renames back with
-- the symmetric ALTER POLICY statements. The DO block makes the migration
-- idempotent and a no-op when a database already carries the standard names.
BEGIN;

DO $$
DECLARE
  table_name text;
  old_name text;
  new_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'cvg_conversation_sessions',
    'cvg_conversation_messages',
    'cvg_conversation_turns',
    'cvg_conversation_execution_claims',
    'cvg_conversation_deliveries'
  ] LOOP
    old_name := table_name || '_tenant_policy';
    new_name := table_name || '_tenant_isolation';
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = current_schema()
        AND tablename = table_name
        AND policyname = old_name
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = current_schema()
        AND tablename = table_name
        AND policyname = new_name
    ) THEN
      EXECUTE format('ALTER POLICY %I ON %I RENAME TO %I', old_name, table_name, new_name);
    END IF;
  END LOOP;
END $$;

COMMIT;
