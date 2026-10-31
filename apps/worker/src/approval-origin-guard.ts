import {
  readPostgresMigrationSql,
  type PostgresQueryable
} from '@cvg/persistence'

/** SPEC 0291: additive migration that adds the immutable origin of a runtime approval. */
export const APPROVAL_ORIGIN_MIGRATION = '0035_runtime_approval_origin'
const GUARD_FUNCTION = 'cvg_runtime_approvals_origin_immutable'
const GUARD_TRIGGER = 'runtime_approvals_origin_immutable'
// pg_trigger.tgtype: ROW (1) + BEFORE (2) + UPDATE (16), and nothing else
const BEFORE_UPDATE_FOR_EACH_ROW = 1 + 2 + 16

const normalise = (text: string): string => text.replace(/\r\n/g, '\n').trim()

function bodyOf(definition: string): string {
  const match = /\bAS\s+\$(\w*)\$([\s\S]*?)\$\1\$/i.exec(definition)
  if (!match) throw new Error('Approval origin guard body is unavailable')
  return normalise(match[2]!)
}

/**
 * SPEC 0291 I1, checked when the worker starts and not at the first approval: the origin columns
 * exist, and the immutability trigger is present, enabled, `BEFORE UPDATE FOR EACH ROW`, runs a
 * `SECURITY INVOKER` function pinned to `pg_catalog, pg_temp` and whose body is the one of the
 * migration. A database without the 0035, or with its guard dropped, disabled or replaced, would
 * either fail on the first approval or let an origin change; the worker refuses to start instead.
 * The client must already be inside the tenant context.
 */
export async function assertApprovalOriginGuard(
  client: PostgresQueryable,
  tenantId: string
): Promise<void> {
  await client.query(
    'SELECT origin_conversation_id, origin_session_id FROM runtime_approvals WHERE tenant_id = $1 LIMIT 0',
    [tenantId]
  )
  const guard = await client.query<{
    enabled: string
    type: number
    security_definer: boolean
    config: string[] | null
    unconditional: boolean
    arguments: number
    columns: string
    definition: string
  }>(
    `SELECT t.tgenabled AS enabled, t.tgtype AS type,
            p.prosecdef AS security_definer, p.proconfig AS config,
            t.tgqual IS NULL AS unconditional, t.tgnargs AS arguments,
            t.tgattr::text AS columns,
            pg_get_functiondef(p.oid) AS definition
       FROM pg_trigger t
       JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE t.tgrelid = to_regclass(format('%I.%I', current_schema(), 'runtime_approvals'))
        AND t.tgname = $1
        AND NOT t.tgisinternal`,
    [GUARD_TRIGGER]
  )
  const row = guard.rows[0]
  if (
    guard.rows.length !== 1 ||
    row === undefined ||
    row.enabled !== 'O' ||
    row.type !== BEFORE_UPDATE_FOR_EACH_ROW ||
    // no WHEN condition, no arguments and no column list (UPDATE OF ...): it fires on every update
    row.unconditional !== true ||
    row.arguments !== 0 ||
    row.columns !== '' ||
    row.security_definer !== false ||
    row.config?.length !== 1 ||
    row.config[0] !== 'search_path=pg_catalog, pg_temp'
  )
    throw new Error(
      `Approval origin guard is missing or altered (${APPROVAL_ORIGIN_MIGRATION})`
    )
  const migration = await readPostgresMigrationSql(APPROVAL_ORIGIN_MIGRATION)
  const start = migration.indexOf(`FUNCTION ${GUARD_FUNCTION}(`)
  if (start < 0 || bodyOf(row.definition) !== bodyOf(migration.slice(start)))
    throw new Error(
      `Approval origin guard is missing or altered (${APPROVAL_ORIGIN_MIGRATION})`
    )
}
