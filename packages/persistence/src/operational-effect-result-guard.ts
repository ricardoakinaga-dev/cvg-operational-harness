import { createHash } from 'node:crypto'
import { OperationalExecutionError } from '@cvg/harness'

export const JOURNAL_RESULT_MIGRATION = '0033_complete_tool_result_journal'
export const JOURNAL_RESULT_GUARD_FUNCTION = 'cvg_journal_result_storage_guard'
export const JOURNAL_RESULT_GUARD_TRIGGER = 'journal_result_storage_guard'

/** Must remain identical to the initially closed guard in migration 0033. */
export const JOURNAL_RESULT_INACTIVE_GUARD_BODY = `
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.result_storage_version <> 0 THEN
      RAISE EXCEPTION 'JOURNAL_STORAGE_MODE' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.result_storage_version IS DISTINCT FROM OLD.result_storage_version THEN
      RAISE EXCEPTION 'JOURNAL_STORAGE_MODE' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.result_storage_version <> 0 THEN
    RAISE EXCEPTION 'JOURNAL_STORAGE_MODE' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
`

function identifier(value: string): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
    throw new OperationalExecutionError(
      'validation_failed',
      'JOURNAL_STORAGE_MODE'
    )
  }
  return value
}

export interface JournalResultActivation {
  readonly schema: string
  readonly principal: string
  readonly body: string
  readonly bindingSha256: string
  readonly sql: string
}

/** Owner-side installation text only. This function neither connects nor executes SQL. */
export function renderJournalResultActivation(
  schemaName: string,
  principalName: string
): JournalResultActivation {
  const schema = identifier(schemaName)
  const principal = identifier(principalName)
  // Both literals and the qualified identifier derive only from the finite ASCII grammar.
  const body = `
BEGIN
  IF TG_TABLE_SCHEMA <> '${schema}' THEN
    RAISE EXCEPTION 'JOURNAL_STORAGE_MODE' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.result_storage_version = 1
       OR session_user = '${principal}' OR current_user = '${principal}' THEN
      RAISE EXCEPTION 'JOURNAL_STORAGE_MODE' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.result_storage_version IS DISTINCT FROM OLD.result_storage_version THEN
      RAISE EXCEPTION 'JOURNAL_STORAGE_MODE' USING ERRCODE = '23514';
    END IF;
    IF OLD.result_storage_version = 1 AND OLD.state = 'CONFIRMED'
       AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'JOURNAL_RESULT_CONFLICT' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.result_storage_version = 1 THEN
    IF session_user <> '${principal}' OR current_user <> '${principal}' THEN
      RAISE EXCEPTION 'JOURNAL_STORAGE_MODE' USING ERRCODE = '42501';
    END IF;
  ELSIF session_user = '${principal}' OR current_user = '${principal}' THEN
    RAISE EXCEPTION 'JOURNAL_STORAGE_MODE' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
`
  const qualified = `"${schema}"."${JOURNAL_RESULT_GUARD_FUNCTION}"`
  const sql = `CREATE OR REPLACE FUNCTION ${qualified}() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp
AS $cvg0033$${body}$cvg0033$;
REVOKE ALL ON FUNCTION ${qualified}() FROM PUBLIC;
`
  return Object.freeze({
    schema,
    principal,
    body,
    bindingSha256: createHash('sha256').update(body, 'utf8').digest('hex'),
    sql
  })
}
