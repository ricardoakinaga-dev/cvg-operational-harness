import { createHash } from 'node:crypto'
import { OperationalExecutionError } from '@cvg/harness'
import type { PostgresQueryable } from './postgres.ts'
import { readPostgresMigrationSql } from './postgres-migrations.ts'
import {
  JOURNAL_RESULT_MIGRATION,
  JOURNAL_RESULT_GUARD_FUNCTION,
  JOURNAL_RESULT_GUARD_TRIGGER,
  JOURNAL_RESULT_INACTIVE_GUARD_BODY,
  renderJournalResultActivation
} from './operational-effect-result-guard.ts'

export type JournalResultStorageMode = 0 | 1

export interface JournalResultReadiness {
  readonly mode: JournalResultStorageMode
  readonly expanded: boolean
  readonly schema: string
  readonly principal: string
  readonly bindingSha256: string | null
  readonly migrationChecksum: string | null
}

// Filled from the pinned PostgreSQL16 expansion observation and independently
// checked by native tamper controls. Unknown deparsing is not accepted.
const EXPECTED_STORAGE_CONSTRAINTS: Readonly<Record<string, string>> = {
  journal_result_storage_envelope:
    "CHECK (((result_storage_payload IS NULL) OR\nCASE\n    WHEN (jsonb_typeof(result_storage_payload) = 'object'::text) THEN COALESCE(((octet_length((result_storage_payload)::text) <= 1398616) AND (result_storage_payload ?& ARRAY['encoding'::text, 'decodedBytes'::text, 'decodedSha256'::text, 'data'::text]) AND ((result_storage_payload - ARRAY['encoding'::text, 'decodedBytes'::text, 'decodedSha256'::text, 'data'::text]) = '{}'::jsonb) AND ((result_storage_payload -> 'encoding'::text) = '\"base64\"'::jsonb) AND (jsonb_typeof((result_storage_payload -> 'decodedBytes'::text)) = 'number'::text) AND (jsonb_typeof((result_storage_payload -> 'decodedSha256'::text)) = 'string'::text) AND ((result_storage_payload ->> 'decodedSha256'::text) ~ '^[0-9a-f]{64}$'::text) AND (jsonb_typeof((result_storage_payload -> 'data'::text)) = 'string'::text) AND (length((result_storage_payload ->> 'data'::text)) <= 1398104) AND ((result_storage_payload ->> 'data'::text) ~ '^[A-Za-z0-9+/]*={0,2}$'::text) AND\n    CASE\n        WHEN ((result_storage_payload ->> 'decodedBytes'::text) ~ '^[1-9][0-9]{0,6}$'::text) THEN (((((result_storage_payload ->> 'decodedBytes'::text))::integer >= 1) AND (((result_storage_payload ->> 'decodedBytes'::text))::integer <= 1048576)) AND (length((result_storage_payload ->> 'data'::text)) = (4 * ((((result_storage_payload ->> 'decodedBytes'::text))::integer + 2) / 3))))\n        ELSE false\n    END), false)\n    ELSE false\nEND))",
  journal_result_storage_shape:
    "CHECK (\nCASE result_storage_version\n    WHEN 0 THEN (result_storage_payload IS NULL)\n    WHEN 1 THEN ((result IS NULL) AND\n    CASE\n        WHEN (state = 'CONFIRMED'::text) THEN ((result_storage_payload IS NOT NULL) AND (error IS NULL))\n        ELSE (result_storage_payload IS NULL)\n    END)\n    ELSE false\nEND)",
  journal_result_storage_version:
    'CHECK ((result_storage_version = ANY (ARRAY[0, 1])))'
}
const EXPECTED_TENANT_POLICY =
  "((tenant_isolation_quarantined = false) AND (tenant_id = NULLIF(current_setting('cvg.tenant_id'::text, true), ''::text)))"

function reject(): never {
  throw new OperationalExecutionError('invalid_action', 'JOURNAL_STORAGE_MODE')
}

/** No cross-connection cache. Call on the actual tenant client before using a mode. */
export async function verifyJournalResultStorage(
  client: PostgresQueryable,
  mode: JournalResultStorageMode
): Promise<JournalResultReadiness> {
  if (mode !== 0 && mode !== 1) reject()
  const relation = await client.query<{
    relation_id: string
    schema: string
    configured_schema: string
    principal: string
    login: string
    table_owner: string
    relrowsecurity: boolean
    relforcerowsecurity: boolean
  }>(
    `SELECT c.oid::text AS relation_id,n.nspname AS schema,
       current_schema() AS configured_schema,current_user AS principal,
       session_user AS login,pg_get_userbyid(c.relowner) AS table_owner,
       c.relrowsecurity,c.relforcerowsecurity
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
     WHERE c.oid=to_regclass('operational_effect_journal') AND c.relkind='r'`
  )
  const table = relation.rows[0]
  if (
    relation.rows.length !== 1 ||
    !table ||
    !/^\d+$/.test(table.relation_id) ||
    table.schema !== table.configured_schema
  )
    reject()
  const columns = await client.query<{
    attname: string
    type: string
    attnotnull: boolean
    default_expression: string | null
  }>(
    `SELECT a.attname,a.atttypid::regtype::text AS type,a.attnotnull,
       pg_get_expr(d.adbin,d.adrelid) AS default_expression
     FROM pg_attribute a LEFT JOIN pg_attrdef d
       ON d.adrelid=a.attrelid AND d.adnum=a.attnum
     WHERE a.attrelid=$1::oid AND NOT a.attisdropped
       AND a.attname=ANY($2::text[]) ORDER BY a.attname`,
    [table.relation_id, ['result_storage_payload', 'result_storage_version']]
  )
  if (columns.rows.length === 0) {
    if (mode !== 0) reject()
    return Object.freeze({
      mode,
      expanded: false,
      schema: table.schema,
      principal: table.principal,
      bindingSha256: null,
      migrationChecksum: null
    })
  }
  if (
    columns.rows.length !== 2 ||
    columns.rows[0]?.attname !== 'result_storage_payload' ||
    columns.rows[0].type !== 'jsonb' ||
    columns.rows[0].attnotnull !== false ||
    columns.rows[0].default_expression !== null ||
    columns.rows[1]?.attname !== 'result_storage_version' ||
    columns.rows[1].type !== 'smallint' ||
    columns.rows[1].attnotnull !== true ||
    columns.rows[1].default_expression !== '0'
  )
    reject()

  const constraints = await client.query<{
    conname: string
    definition: string
    convalidated: boolean
  }>(
    `SELECT conname,pg_get_constraintdef(oid) AS definition,convalidated
     FROM pg_constraint WHERE conrelid=$1::oid AND conname=ANY($2::text[])`,
    [table.relation_id, Object.keys(EXPECTED_STORAGE_CONSTRAINTS)]
  )
  if (
    constraints.rows.length !== 3 ||
    new Set(constraints.rows.map((r) => r.conname)).size !== 3 ||
    constraints.rows.some(
      (row) =>
        !row.convalidated ||
        row.definition !== EXPECTED_STORAGE_CONSTRAINTS[row.conname]
    )
  )
    reject()

  const guards = await client.query<{
    tgname: string
    tgtype: number
    tgenabled: string
    unconditional: boolean
    tgnargs: number
    prosrc: string
    prosecdef: boolean
    proconfig: string[] | null
    function_name: string
    local_function: boolean
    owner: string
    language: string
    return_type: string
  }>(
    `SELECT t.tgname,t.tgtype,t.tgenabled,t.tgqual IS NULL AS unconditional,
       t.tgnargs,p.prosrc,p.prosecdef,p.proconfig,p.proname AS function_name,
       p.pronamespace=c.relnamespace AS local_function,
       pg_get_userbyid(p.proowner) AS owner,l.lanname AS language,
       p.prorettype::regtype::text AS return_type
     FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
       JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_language l ON l.oid=p.prolang
     WHERE t.tgrelid=$1::oid AND NOT t.tgisinternal AND t.tgname=$2`,
    [table.relation_id, JOURNAL_RESULT_GUARD_TRIGGER]
  )
  const guard = guards.rows[0]
  if (
    guards.rows.length !== 1 ||
    !guard ||
    guard.tgtype !== 31 ||
    guard.tgenabled !== 'O' ||
    guard.unconditional !== true ||
    guard.tgnargs !== 0 ||
    guard.prosecdef !== false ||
    guard.local_function !== true ||
    guard.function_name !== JOURNAL_RESULT_GUARD_FUNCTION ||
    guard.language !== 'plpgsql' ||
    guard.return_type !== 'trigger' ||
    guard.proconfig?.length !== 1 ||
    guard.proconfig[0] !== 'search_path=pg_catalog'
  )
    reject()
  const inactive = guard.prosrc === JOURNAL_RESULT_INACTIVE_GUARD_BODY
  if (mode === 0 && !inactive) reject()
  if (mode === 1 && inactive) reject()
  let bindingSha256: string | null = null
  if (mode === 1) {
    const expected = renderJournalResultActivation(
      table.schema,
      table.principal
    )
    if (
      table.principal !== table.login ||
      guard.owner === table.principal ||
      table.table_owner === table.principal ||
      guard.prosrc !== expected.body ||
      !table.relrowsecurity ||
      !table.relforcerowsecurity
    )
      reject()
    bindingSha256 = expected.bindingSha256
    await verifyServingIdentity(client, table.relation_id, table.table_owner)
    const policies = await client.query<{
      polname: string
      polcmd: string
      polpermissive: boolean
      polroles: number[]
      using_expression: string | null
      check_expression: string | null
    }>(
      `SELECT polname,polcmd,polpermissive,polroles,
         pg_get_expr(polqual,polrelid) AS using_expression,
         pg_get_expr(polwithcheck,polrelid) AS check_expression
       FROM pg_policy WHERE polrelid=$1::oid`,
      [table.relation_id]
    )
    const policy = policies.rows[0]
    if (
      policies.rows.length !== 1 ||
      !policy ||
      policy.polname !== 'operational_effect_journal_tenant_isolation' ||
      policy.polcmd !== '*' ||
      policy.polpermissive !== true ||
      policy.polroles.length !== 1 ||
      policy.polroles[0] !== 0 ||
      policy.using_expression !== EXPECTED_TENANT_POLICY ||
      policy.check_expression !== EXPECTED_TENANT_POLICY
    )
      reject()
  }
  let migrationChecksum: string | null = null
  for (const version of [
    '0016_operational_execution_spine',
    '0029_controlled_published_kernel',
    JOURNAL_RESULT_MIGRATION
  ]) {
    const sql = await readPostgresMigrationSql(version)
    const expected = createHash('sha256').update(sql, 'utf8').digest('hex')
    const applied = await client.query<{ checksum: string | null }>(
      `SELECT checksum FROM "${table.schema.replace(/"/g, '""')}".schema_migrations WHERE version=$1`,
      [version]
    )
    if (applied.rows.length !== 1 || applied.rows[0]?.checksum !== expected)
      reject()
    if (version === JOURNAL_RESULT_MIGRATION) migrationChecksum = expected
  }
  return Object.freeze({
    mode,
    expanded: true,
    schema: table.schema,
    principal: table.principal,
    bindingSha256,
    migrationChecksum
  })
}

async function verifyServingIdentity(
  client: PostgresQueryable,
  relationId: string,
  tableOwner: string
): Promise<void> {
  const result = await client.query<{
    role_safe: boolean
    memberships: number
    database_owner: boolean
    database_ddl: boolean
    schema_authority: boolean
    can_select: boolean
    can_insert: boolean
    can_update: boolean
    forbidden_privilege: boolean
    other_table_acl: boolean
    column_acl: boolean
    other_login_access: boolean
    other_client_sessions: number
    security_definer_routes: boolean
  }>(
    `SELECT
       NOT(r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole
           OR r.rolreplication OR r.rolinherit) AND r.rolcanlogin AS role_safe,
       (SELECT count(*)::integer FROM pg_auth_members
         WHERE member=r.oid OR roleid=r.oid) AS memberships,
       d.datdba=r.oid AS database_owner,
       has_database_privilege(r.oid,d.oid,'CREATE,TEMPORARY') AS database_ddl,
       (n.nspowner=r.oid OR pg_has_role(r.oid,n.nspowner,'USAGE')
         OR has_schema_privilege(r.oid,n.oid,'CREATE')) AS schema_authority,
       has_table_privilege(r.oid,c.oid,'SELECT') AS can_select,
       has_table_privilege(r.oid,c.oid,'INSERT') AS can_insert,
       has_table_privilege(r.oid,c.oid,'UPDATE') AS can_update,
       has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER,REFERENCES') AS forbidden_privilege,
       EXISTS(SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a
         WHERE a.grantee NOT IN(c.relowner,r.oid)) AS other_table_acl,
       EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid
         AND NOT a.attisdropped AND a.attacl IS NOT NULL) AS column_acl,
       EXISTS(SELECT 1 FROM pg_roles other WHERE other.rolcanlogin
         AND other.oid NOT IN(c.relowner,r.oid)
         AND has_table_privilege(other.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')) AS other_login_access,
       EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace=n.oid
         AND p.prosecdef) AS security_definer_routes,
       (SELECT count(*)::integer FROM pg_stat_activity a
         -- Unprivileged roles see backend_type as NULL for other principals.
         -- Login identity remains visible and must not be filtered out.
         WHERE a.datname=current_database()
           AND a.usename NOT IN(current_user,$2) AND a.pid<>pg_backend_pid()) AS other_client_sessions
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       JOIN pg_roles r ON r.rolname=current_user
       JOIN pg_database d ON d.datname=current_database()
     WHERE c.oid=$1::oid`,
    [relationId, tableOwner]
  )
  const row = result.rows[0]
  if (
    result.rows.length !== 1 ||
    !row ||
    row.role_safe !== true ||
    row.memberships !== 0 ||
    row.database_owner !== false ||
    row.database_ddl !== false ||
    row.schema_authority !== false ||
    row.can_select !== true ||
    row.can_insert !== true ||
    row.can_update !== true ||
    row.forbidden_privilege !== false ||
    row.other_table_acl !== false ||
    row.column_acl !== false ||
    row.other_login_access !== false ||
    row.other_client_sessions !== 0 ||
    row.security_definer_routes !== false
  )
    reject()
}
