import {
  readPostgresMigrationSql,
  type PostgresQueryable
} from '@cvg/persistence'

/** SPEC 0291: additive migration that adds the immutable origin of a runtime approval. */
export const APPROVAL_ORIGIN_MIGRATION = '0035_runtime_approval_origin'
/** SPEC 0317 G1: additive migration that adds the immutable requester. */
export const REQUESTER_PRINCIPAL_MIGRATION = '0039_requester_principal'
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
  await assertImmutabilityTrigger(client, {
    table: 'runtime_approvals',
    trigger: 'runtime_approvals_origin_immutable',
    guardFunction: 'cvg_runtime_approvals_origin_immutable',
    migration: APPROVAL_ORIGIN_MIGRATION
  })
}

/**
 * SPEC 0317 G1, the same standard for the author of an execution and of its approval: without
 * these guards the author could change after the fact, so the operational worker refuses to
 * start. The client must already be inside the tenant context.
 */
export async function assertRequesterPrincipalGuard(
  client: PostgresQueryable,
  tenantId: string
): Promise<void> {
  await client.query(
    'SELECT requested_by_kind, requested_by_id, requested_by_tenant_id, requester_binding FROM runtime_approvals WHERE tenant_id = $1 LIMIT 0',
    [tenantId]
  )
  await client.query(
    'SELECT submitted_by_kind, submitted_by_id, submitted_by_tenant_id FROM operational_executions WHERE tenant_id = $1 LIMIT 0',
    [tenantId]
  )
  await assertImmutabilityTrigger(client, {
    table: 'runtime_approvals',
    trigger: 'runtime_approvals_requested_by_immutable',
    guardFunction: 'cvg_runtime_approvals_requested_by_immutable',
    migration: REQUESTER_PRINCIPAL_MIGRATION
  })
  await assertImmutabilityTrigger(client, {
    table: 'operational_executions',
    trigger: 'operational_executions_submitted_by_immutable',
    guardFunction: 'cvg_operational_executions_submitted_by_immutable',
    migration: REQUESTER_PRINCIPAL_MIGRATION
  })
}

async function assertImmutabilityTrigger(
  client: PostgresQueryable,
  guardSpec: {
    readonly table: string
    readonly trigger: string
    readonly guardFunction: string
    readonly migration: string
  }
): Promise<void> {
  const { table, trigger, guardFunction, migration: migrationName } = guardSpec
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
      WHERE t.tgrelid = to_regclass(format('%I.%I', current_schema(), $2::text))
        AND t.tgname = $1
        AND NOT t.tgisinternal`,
    [trigger, table]
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
      `Approval origin guard is missing or altered (${migrationName})`
    )
  const migration = await readPostgresMigrationSql(migrationName)
  const start = migration.indexOf(`FUNCTION ${guardFunction}(`)
  if (start < 0 || bodyOf(row.definition) !== bodyOf(migration.slice(start)))
    throw new Error(
      `Approval origin guard is missing or altered (${migrationName})`
    )
}
