import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Client, Pool } from 'pg'

type OperatorSessionFunctionName =
  | 'operator_session_create'
  | 'operator_session_get'
  | 'operator_session_replace'
  | 'operator_session_revoke'
  | 'oidc_state_reserve'
  | 'oidc_state_consume'

function assertOperatorAuthSchemaName(value: string): string {
  if (
    !/^[a-z][a-z0-9_]{0,62}$/.test(value) ||
    value === 'public' ||
    value.startsWith('pg_')
  ) {
    throw new Error('Invalid PostgreSQL operator-auth schema name')
  }
  return value
}

async function expectedFunctionBodies(
  schema: string,
  owner: string
): Promise<Record<OperatorSessionFunctionName, string>> {
  const template = await readFile(
    resolve(
      process.cwd(),
      'packages/persistence/migrations/operator-session/0000_auth.sql'
    ),
    'utf8'
  )
  const oidcStateTemplate = await readFile(
    resolve(
      process.cwd(),
      'packages/persistence/migrations/operator-session/0001_oidc_state.sql'
    ),
    'utf8'
  )
  const rendered = `${template}\n${oidcStateTemplate}`
    .replaceAll('__AUTH_SCHEMA__', `"${schema}"`)
    .replaceAll('__OWNER_ROLE__', `"${owner.replaceAll('"', '""')}"`)
  const bodies = {} as Record<OperatorSessionFunctionName, string>
  for (const name of Object.keys(
    functionContracts
  ) as OperatorSessionFunctionName[]) {
    const delimiter = name.startsWith('operator_session_')
      ? `$cvg_${name.replace('operator_session_', '')}$`
      : `$cvg_${name}$`
    const start = rendered.indexOf(`AS ${delimiter}`)
    const end = rendered.indexOf(delimiter, start + `AS ${delimiter}`.length)
    if (start < 0 || end < 0) invalid(`missing canonical body for ${name}`)
    bodies[name] = rendered.slice(start + `AS ${delimiter}`.length, end)
  }
  return bodies
}

const functionContracts: Record<
  OperatorSessionFunctionName,
  {
    arguments: string
    result: string
  }
> = {
  operator_session_create: {
    arguments: 'bytea,text,text,text,timestamptz',
    result: 'void'
  },
  operator_session_get: {
    arguments: 'bytea',
    result:
      'TABLE(tenant_id text, operator_id text, role text, expires_at timestamp with time zone)'
  },
  operator_session_replace: {
    arguments: 'bytea,bytea,text,text,text,timestamptz',
    result: 'void'
  },
  operator_session_revoke: {
    arguments: 'bytea',
    result: 'void'
  },
  oidc_state_reserve: {
    arguments: 'bytea,timestamptz',
    result: 'boolean'
  },
  oidc_state_consume: {
    arguments: 'bytea',
    result: 'boolean'
  }
}

function invalid(reason: string): never {
  throw new Error(
    `PostgreSQL operator-session boundary is not verified: ${reason}`
  )
}

interface RoleRow {
  oid: string
  name: string
  login_name: string
  can_login: boolean
  superuser: boolean
  bypass_rls: boolean
  create_db: boolean
  create_role: boolean
  database_create: boolean
  memberships: number
  granted_to: number
}

interface SchemaRow {
  oid: string
  owner_oid: string
  owner: string
  can_use: boolean
  can_create: boolean
  grants: Array<{ grantee: string; privilege: string }>
}

interface RelationRow {
  name: string
  kind: string
  owner: string
  rls: boolean
  force_rls: boolean
  table_privileges: boolean
  column_privileges: boolean
  unexpected_table_grants: boolean
  unexpected_column_grants: boolean
}

interface IndexRow {
  name: string
  table_name: string
  owner: string
  same_schema: boolean
  kind: string
  access_method: string
  primary: boolean
  unique: boolean
  valid: boolean
  ready: boolean
  live: boolean
  attributes: number
  key_attributes: number
  no_expressions: boolean
  no_predicate: boolean
  default_options: boolean
  key_definition: string
}

interface FunctionRow {
  oid: string
  name: string
  owner: string
  language: string
  security_definer: boolean
  config: string[] | null
  source: string
  sql_body: string | null
  result: string
  defaults: number
  can_execute: boolean
  grants: Array<{ grantee: string; privilege: string }>
}

/** Read-only startup guard for the dedicated, non-inheriting API session role. */
export async function assertPostgresOperatorSessionBoundary(
  pool: Pool | Client,
  options: {
    authSchemaName: string
    expectedSessionRole: string
    productSchemaName: string
  }
): Promise<void> {
  const schemaName = assertOperatorAuthSchemaName(options.authSchemaName)
  if (!options.productSchemaName || options.productSchemaName === schemaName) {
    invalid('shared or missing product schema')
  }
  const quotedSchema = `"${schemaName}"`

  const roles = await pool.query<RoleRow>(
    `SELECT r.oid::text AS oid, r.rolname AS name,
            session_user::text AS login_name, r.rolcanlogin AS can_login,
            r.rolsuper AS superuser, r.rolbypassrls AS bypass_rls,
            r.rolcreatedb AS create_db, r.rolcreaterole AS create_role,
            has_database_privilege(current_user, current_database(), 'CREATE') AS database_create,
            (SELECT count(*)::int FROM pg_auth_members m WHERE m.member = r.oid) AS memberships,
            (SELECT count(*)::int FROM pg_auth_members m WHERE m.roleid = r.oid) AS granted_to
     FROM pg_roles r WHERE r.rolname = current_user`
  )
  const role = roles.rows[0]
  if (
    !role ||
    role.name !== options.expectedSessionRole ||
    role.login_name !== options.expectedSessionRole ||
    !role.can_login ||
    role.superuser ||
    role.bypass_rls ||
    role.create_db ||
    role.create_role ||
    role.database_create ||
    role.memberships !== 0 ||
    role.granted_to !== 0
  ) {
    invalid('session role')
  }
  const product = await pool.query<{ can_use: boolean; can_create: boolean }>(
    `SELECT has_schema_privilege(current_user, oid, 'USAGE') AS can_use,
              has_schema_privilege(current_user, oid, 'CREATE') AS can_create
       FROM pg_namespace WHERE nspname = $1`,
    [options.productSchemaName]
  )
  if (
    product.rows.length !== 1 ||
    product.rows[0]?.can_use ||
    product.rows[0]?.can_create
  ) {
    invalid('product schema access')
  }

  const schemas = await pool.query<SchemaRow>(
    `SELECT n.oid::text AS oid, n.nspowner::text AS owner_oid,
            pg_get_userbyid(n.nspowner) AS owner,
            has_schema_privilege(current_user, n.oid, 'USAGE') AS can_use,
            has_schema_privilege(current_user, n.oid, 'CREATE') AS can_create,
            COALESCE((SELECT json_agg(json_build_object(
              'grantee', a.grantee::text, 'privilege', a.privilege_type))
              FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a), '[]'::json) AS grants
     FROM pg_namespace n WHERE n.nspname = $1`,
    [schemaName]
  )
  const schema = schemas.rows[0]
  if (
    !schema ||
    schema.owner_oid === role.oid ||
    !schema.can_use ||
    schema.can_create ||
    schema.grants.some(
      (grant) =>
        ![schema.owner_oid, role.oid].includes(grant.grantee) ||
        (grant.grantee === role.oid && grant.privilege !== 'USAGE')
    )
  ) {
    invalid('schema owner or grants')
  }

  const relations = await pool.query<RelationRow>(
    `SELECT c.relname AS name, c.relkind AS kind,
            pg_get_userbyid(c.relowner) AS owner,
            c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
            (has_table_privilege(current_user, c.oid, 'SELECT')
             OR has_table_privilege(current_user, c.oid, 'INSERT')
             OR has_table_privilege(current_user, c.oid, 'UPDATE')
             OR has_table_privilege(current_user, c.oid, 'DELETE')
             OR has_table_privilege(current_user, c.oid, 'TRUNCATE')
             OR has_table_privilege(current_user, c.oid, 'TRIGGER')
             OR has_table_privilege(current_user, c.oid, 'REFERENCES')) AS table_privileges,
            (has_any_column_privilege(current_user, c.oid, 'SELECT')
             OR has_any_column_privilege(current_user, c.oid, 'INSERT')
             OR has_any_column_privilege(current_user, c.oid, 'UPDATE')
             OR has_any_column_privilege(current_user, c.oid, 'REFERENCES')) AS column_privileges,
            EXISTS (
              SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
              WHERE a.grantee <> c.relowner
            ) AS unexpected_table_grants,
            EXISTS (
              SELECT 1 FROM pg_attribute attr,
                LATERAL aclexplode(attr.attacl) a
              WHERE attr.attrelid = c.oid AND attr.attnum > 0
                AND NOT attr.attisdropped AND a.grantee <> c.relowner
            ) AS unexpected_column_grants
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'v', 'm', 'S')`,
    [schemaName]
  )
  const expectedRelations = new Set([
    'schema_migrations',
    'operator_session_families',
    'operator_sessions',
    'oidc_login_states'
  ])
  if (
    relations.rows.length !== expectedRelations.size ||
    relations.rows.some(
      (relation) =>
        !expectedRelations.has(relation.name) ||
        relation.kind !== 'r' ||
        relation.owner !== schema.owner ||
        relation.table_privileges ||
        relation.column_privileges ||
        relation.unexpected_table_grants ||
        relation.unexpected_column_grants ||
        (relation.name !== 'schema_migrations' &&
          (!relation.rls || !relation.force_rls))
    )
  ) {
    invalid('auth tables or privileges')
  }

  const columns = await pool.query<{
    table_name: string
    name: string
    data_type: string
    not_null: boolean
    default_expression: string | null
    identity: string
    generated: string
  }>(
    `SELECT c.relname AS table_name, a.attname AS name,
            format_type(a.atttypid, a.atttypmod) AS data_type,
            a.attnotnull AS not_null,
            pg_get_expr(d.adbin, d.adrelid) AS default_expression,
            a.attidentity AS identity, a.attgenerated AS generated
     FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE n.nspname = $1 AND c.relkind = 'r'
       AND a.attnum > 0 AND NOT a.attisdropped`,
    [schemaName]
  )
  const expectedColumns = new Map<
    string,
    readonly [string, boolean, string | null]
  >([
    ['schema_migrations.version', ['text', true, null]],
    ['schema_migrations.checksum', ['text', true, null]],
    [
      'schema_migrations.applied_at',
      ['timestamp with time zone', true, 'clock_timestamp()']
    ],
    ['operator_session_families.family_id', ['bytea', true, null]],
    [
      'operator_session_families.revoked_at',
      ['timestamp with time zone', false, null]
    ],
    ['operator_sessions.token_digest', ['bytea', true, null]],
    ['operator_sessions.family_id', ['bytea', true, null]],
    ['operator_sessions.tenant_id', ['text', true, null]],
    ['operator_sessions.operator_id', ['text', true, null]],
    ['operator_sessions.role', ['text', true, null]],
    ['operator_sessions.created_at', ['timestamp with time zone', true, null]],
    ['operator_sessions.expires_at', ['timestamp with time zone', true, null]],
    ['operator_sessions.revoked_at', ['timestamp with time zone', false, null]],
    ['oidc_login_states.state_digest', ['bytea', true, null]],
    ['oidc_login_states.created_at', ['timestamp with time zone', true, null]],
    ['oidc_login_states.expires_at', ['timestamp with time zone', true, null]]
  ])
  if (
    columns.rows.length !== expectedColumns.size ||
    columns.rows.some((column) => {
      const expected = expectedColumns.get(
        `${column.table_name}.${column.name}`
      )
      return (
        !expected ||
        column.data_type !== expected[0] ||
        column.not_null !== expected[1] ||
        column.default_expression !== expected[2] ||
        column.identity !== '' ||
        column.generated !== ''
      )
    })
  ) {
    invalid('auth column inventory')
  }

  const rewrites = await pool.query<{ triggers: number; rules: number }>(
    `SELECT
       (SELECT count(*)::int FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND NOT t.tgisinternal) AS triggers,
       (SELECT count(*)::int FROM pg_rewrite r
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND r.rulename <> '_RETURN') AS rules`,
    [schemaName]
  )
  if (rewrites.rows[0]?.triggers !== 0 || rewrites.rows[0]?.rules !== 0) {
    invalid('auth table triggers or rules')
  }

  const policies = await pool.query<{
    table_name: string
    name: string
    roles: string[]
    command: string
    using_expression: string | null
    check_expression: string | null
  }>(
    `SELECT c.relname AS table_name, p.polname AS name,
            ARRAY(SELECT r.rolname::text FROM unnest(p.polroles) x(oid)
                  JOIN pg_roles r ON r.oid = x.oid)::text[] AS roles,
            p.polcmd AS command,
            pg_get_expr(p.polqual, p.polrelid) AS using_expression,
            pg_get_expr(p.polwithcheck, p.polrelid) AS check_expression
     FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1`,
    [schemaName]
  )
  if (
    policies.rows.length !== 3 ||
    policies.rows.some(
      (policy) =>
        ![
          ['operator_session_families', 'operator_session_families_owner_only'],
          ['operator_sessions', 'operator_sessions_owner_only'],
          ['oidc_login_states', 'oidc_login_states_owner_only']
        ].some(
          ([table, name]) => policy.table_name === table && policy.name === name
        ) ||
        policy.roles.length !== 1 ||
        policy.roles[0] !== schema.owner ||
        policy.command !== '*' ||
        policy.using_expression !== 'true' ||
        policy.check_expression !== 'true'
    )
  ) {
    invalid('row security policies')
  }

  const constraints = await pool.query<{
    table_name: string
    kind: string
    columns: string[]
    referenced_table: string | null
  }>(
    `SELECT c.relname AS table_name, co.contype AS kind,
            ARRAY(SELECT a.attname::text FROM unnest(co.conkey) WITH ORDINALITY x(attnum, ord)
                  JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = x.attnum
                  ORDER BY x.ord)::text[] AS columns,
            ref.relname AS referenced_table
     FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_class ref ON ref.oid = co.confrelid
     WHERE n.nspname = $1 AND co.contype IN ('p','f')`,
    [schemaName]
  )
  const requiredConstraints = [
    ['schema_migrations', 'p', 'version', null],
    ['operator_session_families', 'p', 'family_id', null],
    ['operator_sessions', 'p', 'token_digest', null],
    ['operator_sessions', 'f', 'family_id', 'operator_session_families'],
    ['oidc_login_states', 'p', 'state_digest', null]
  ] as const
  if (
    constraints.rows.length !== requiredConstraints.length ||
    requiredConstraints.some(
      ([table, kind, column, referenced]) =>
        !constraints.rows.some(
          (item) =>
            item.table_name === table &&
            item.kind === kind &&
            item.columns.length === 1 &&
            item.columns[0] === column &&
            item.referenced_table === referenced
        )
    )
  ) {
    invalid('primary or foreign keys')
  }

  const indexes = await pool.query<IndexRow>(
    `SELECT idx.relname AS name, tab.relname AS table_name,
            pg_get_userbyid(idx.relowner) AS owner,
            idx.relnamespace = n.oid AS same_schema,
            idx.relkind AS kind, am.amname AS access_method,
            i.indisprimary AS primary, i.indisunique AS unique,
            i.indisvalid AS valid, i.indisready AS ready, i.indislive AS live,
            i.indnatts::int AS attributes, i.indnkeyatts::int AS key_attributes,
            i.indexprs IS NULL AS no_expressions,
            i.indpred IS NULL AS no_predicate,
            idx.reloptions IS NULL AS default_options,
            pg_get_indexdef(i.indexrelid, 1, false) AS key_definition
     FROM pg_index i JOIN pg_class idx ON idx.oid = i.indexrelid
     JOIN pg_class tab ON tab.oid = i.indrelid
     JOIN pg_namespace n ON n.oid = tab.relnamespace
     JOIN pg_am am ON am.oid = idx.relam
     WHERE n.nspname = $1`,
    [schemaName]
  )
  const expectedIndexes = new Map<string, readonly [string, string, boolean]>([
    ['schema_migrations_pkey', ['schema_migrations', 'version', true]],
    [
      'operator_session_families_pkey',
      ['operator_session_families', 'family_id', true]
    ],
    ['operator_sessions_pkey', ['operator_sessions', 'token_digest', true]],
    [
      'operator_sessions_expires_at_idx',
      ['operator_sessions', 'expires_at', false]
    ],
    ['operator_sessions_family_idx', ['operator_sessions', 'family_id', false]],
    ['oidc_login_states_pkey', ['oidc_login_states', 'state_digest', true]],
    [
      'oidc_login_states_expires_at_idx',
      ['oidc_login_states', 'expires_at', false]
    ]
  ])
  if (
    indexes.rows.length !== expectedIndexes.size ||
    indexes.rows.some((index) => {
      const expected = expectedIndexes.get(index.name)
      return (
        !expected ||
        index.table_name !== expected[0] ||
        index.key_definition !== expected[1] ||
        index.primary !== expected[2] ||
        index.unique !== expected[2] ||
        index.owner !== schema.owner ||
        !index.same_schema ||
        index.kind !== 'i' ||
        index.access_method !== 'btree' ||
        !index.valid ||
        !index.ready ||
        !index.live ||
        index.attributes !== 1 ||
        index.key_attributes !== 1 ||
        !index.no_expressions ||
        !index.no_predicate ||
        !index.default_options
      )
    })
  ) {
    invalid('session index inventory')
  }

  const checks = await pool.query<{
    table_name: string
    name: string
    definition: string
    valid: boolean
    inherited: boolean
  }>(
    `SELECT c.relname AS table_name, co.conname AS name,
            pg_get_constraintdef(co.oid) AS definition,
            co.convalidated AS valid, co.conislocal = false AS inherited
     FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND co.contype = 'c'`,
    [schemaName]
  )
  const expectedChecks = new Map([
    [
      'operator_session_families_family_id_check',
      ['operator_session_families', 'CHECK ((octet_length(family_id) = 32))']
    ],
    [
      'operator_sessions_token_digest_check',
      ['operator_sessions', 'CHECK ((octet_length(token_digest) = 32))']
    ],
    [
      'operator_sessions_tenant_id_check',
      [
        'operator_sessions',
        "CHECK ((tenant_id ~ '^tenant_[0-9a-f-]{36}$'::text))"
      ]
    ],
    [
      'operator_sessions_operator_id_check',
      [
        'operator_sessions',
        "CHECK ((operator_id ~ '^[A-Za-z0-9._:-]{3,80}$'::text))"
      ]
    ],
    [
      'operator_sessions_role_check',
      [
        'operator_sessions',
        "CHECK ((role = ANY (ARRAY['Operator'::text, 'Approver'::text, 'Supervisor'::text, 'Admin'::text])))"
      ]
    ],
    [
      'operator_sessions_expiry_check',
      [
        'operator_sessions',
        "CHECK (((expires_at > created_at) AND (expires_at <= (created_at + '00:15:00'::interval))))"
      ]
    ],
    [
      'oidc_login_states_state_digest_check',
      ['oidc_login_states', 'CHECK ((octet_length(state_digest) = 32))']
    ],
    [
      'oidc_login_states_expiry_check',
      [
        'oidc_login_states',
        "CHECK (((expires_at > created_at) AND (expires_at <= (created_at + '00:05:00'::interval))))"
      ]
    ]
  ])
  if (
    checks.rows.length !== expectedChecks.size ||
    checks.rows.some((check) => {
      const expected = expectedChecks.get(check.name)
      return (
        !expected ||
        check.table_name !== expected[0] ||
        check.definition !== expected[1] ||
        !check.valid ||
        check.inherited
      )
    })
  ) {
    invalid('session check constraints')
  }

  const expectedBodies = await expectedFunctionBodies(schemaName, schema.owner)
  const functions = await pool.query<FunctionRow>(
    `SELECT p.oid::text AS oid, p.proname AS name,
            pg_get_userbyid(p.proowner) AS owner,
            l.lanname AS language, p.prosecdef AS security_definer,
            p.proconfig AS config, p.prosrc AS source,
            p.prosqlbody::text AS sql_body,
            pg_get_function_result(p.oid) AS result,
            p.pronargdefaults AS defaults,
            has_function_privilege(current_user, p.oid, 'EXECUTE') AS can_execute,
            COALESCE((SELECT json_agg(json_build_object(
              'grantee', a.grantee::text, 'privilege', a.privilege_type))
              FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a), '[]'::json) AS grants
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname = $1`,
    [schemaName]
  )
  if (functions.rows.length !== 6) invalid('function inventory')
  for (const [name, contract] of Object.entries(functionContracts) as Array<
    [
      OperatorSessionFunctionName,
      (typeof functionContracts)[OperatorSessionFunctionName]
    ]
  >) {
    const functionRow = functions.rows.find((item) => item.name === name)
    if (!functionRow) invalid(`missing ${name}`)
    const signature = `${quotedSchema}.${name}(${contract.arguments})`
    const resolved = await pool.query<{ oid: string | null }>(
      'SELECT to_regprocedure($1)::oid::text AS oid',
      [signature]
    )
    if (
      functionRow.oid !== resolved.rows[0]?.oid ||
      functionRow.owner !== schema.owner ||
      functionRow.language !== 'plpgsql' ||
      !functionRow.security_definer ||
      functionRow.sql_body !== null ||
      functionRow.defaults !== 0 ||
      functionRow.result !== contract.result ||
      functionRow.config?.length !== 1 ||
      functionRow.config[0] !== 'search_path=pg_catalog, pg_temp' ||
      functionRow.source !== expectedBodies[name] ||
      !functionRow.can_execute ||
      functionRow.grants.some(
        (grant) =>
          grant.privilege !== 'EXECUTE' ||
          ![schema.owner_oid, role.oid].includes(grant.grantee)
      )
    ) {
      invalid(`function ${name}`)
    }
  }
}
