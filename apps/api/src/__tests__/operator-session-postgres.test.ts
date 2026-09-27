import { createHash, randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  createOpaqueOperatorSessionId,
  parseOperatorSessionCookie
} from '../operator-session.ts'
import { PostgresOperatorSessionStore } from '../operator-session-postgres.ts'
import { assertPostgresOperatorSessionBoundary } from '../operator-session-preflight.ts'
import {
  grantOperatorSessionFunctions,
  runOperatorSessionMigrations
} from '../../../../packages/persistence/src/operator-session-migrations.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const pgRequired = process.env.AUD19_PG_REQUIRED === '1'
if (pgRequired && !testDatabaseUrl) {
  throw new Error('AUD19_PG_REQUIRED=1 requires TEST_DATABASE_URL')
}
const itWithPostgres = testDatabaseUrl ? it : it.skip

function digest(): Buffer {
  return createHash('sha256').update(randomBytes(32)).digest()
}

async function withAuthDatabase(
  callback: (input: {
    schema: string
    productSchema: string
    pool: Pool
    otherPool: Pool
    admin: Client
    migrator: Client
    migrationRole: string
    sessionRole: string
  }) => Promise<void>
): Promise<void> {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`
  const schema = `cvg_auth_${suffix}`
  const productSchema = `cvg_product_${suffix}`
  const migrationRole = `cvg_auth_mig_${suffix}`
  const sessionRole = `cvg_auth_api_${suffix}`
  const admin = new Client({ connectionString: testDatabaseUrl as string })
  let migrator: Client | undefined
  let pool: Pool | undefined
  let otherPool: Pool | undefined
  let databaseName: string | undefined
  await admin.connect()
  try {
    const database = await admin.query<{ name: string }>(
      'SELECT current_database() AS name'
    )
    databaseName = database.rows[0]?.name
    if (!databaseName) throw new Error('Synthetic PostgreSQL database missing')
    await admin.query(
      `CREATE ROLE ${migrationRole} LOGIN PASSWORD 'synthetic_migration' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`
    )
    await admin.query(
      `CREATE ROLE ${sessionRole} LOGIN PASSWORD 'synthetic_session' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`
    )
    await admin.query(
      `GRANT CREATE ON DATABASE "${databaseName}" TO ${migrationRole}`
    )
    await admin.query(
      `CREATE SCHEMA ${productSchema} AUTHORIZATION ${migrationRole}`
    )
    const migrationUrl = new URL(testDatabaseUrl as string)
    migrationUrl.username = migrationRole
    migrationUrl.password = 'synthetic_migration'
    migrator = new Client({ connectionString: migrationUrl.toString() })
    await migrator.connect()
    await runOperatorSessionMigrations(migrator, schema, productSchema)
    await grantOperatorSessionFunctions(migrator, schema, sessionRole)

    const sessionUrl = new URL(testDatabaseUrl as string)
    sessionUrl.username = sessionRole
    sessionUrl.password = 'synthetic_session'
    pool = new Pool({ connectionString: sessionUrl.toString() })
    otherPool = new Pool({ connectionString: sessionUrl.toString() })
    await callback({
      schema,
      productSchema,
      pool,
      otherPool,
      admin,
      migrator,
      migrationRole,
      sessionRole
    })
  } finally {
    await pool?.end().catch(() => undefined)
    await otherPool?.end().catch(() => undefined)
    await migrator?.end().catch(() => undefined)
    await admin
      .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      .catch(() => undefined)
    await admin
      .query(`DROP SCHEMA IF EXISTS ${productSchema} CASCADE`)
      .catch(() => undefined)
    if (databaseName) {
      await admin
        .query(
          `REVOKE CREATE ON DATABASE "${databaseName}" FROM ${migrationRole}`
        )
        .catch(() => undefined)
    }
    await admin
      .query(`DROP ROLE IF EXISTS ${sessionRole}`)
      .catch(() => undefined)
    await admin
      .query(`DROP ROLE IF EXISTS ${migrationRole}`)
      .catch(() => undefined)
    await admin.end()
  }
}

describe('opaque operator session IDs', () => {
  it('encodes 32 random bytes without exposing identity in the browser cookie', () => {
    const ids = Array.from({ length: 64 }, createOpaqueOperatorSessionId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const sessionId of ids) {
      expect(sessionId).toMatch(/^opsess_[A-Za-z0-9_-]{43}$/)
      expect(
        parseOperatorSessionCookie(`cvg_operator_session=${sessionId}`)
      ).toBe(sessionId)
    }
  })
})

describe('PostgreSQL operator session boundary', () => {
  itWithPostgres(
    'shares sessions across two API pools without direct table access',
    async () => {
      await withAuthDatabase(
        async ({ schema, productSchema, pool, otherPool, sessionRole }) => {
          await assertPostgresOperatorSessionBoundary(pool, {
            authSchemaName: schema,
            expectedSessionRole: sessionRole,
            productSchemaName: productSchema
          })
          const storeA = new PostgresOperatorSessionStore(pool, schema)
          const storeB = new PostgresOperatorSessionStore(otherPool, schema)
          const identity = {
            tenantId: 'tenant_00000000-0000-4000-8000-000000000701',
            operatorId: 'operator.synthetic.pg',
            role: 'Supervisor' as const
          }
          const created = await storeA.create({
            identity,
            expiresAt: Date.now() + 60_000
          })
          expect(created.sessionId).toMatch(/^opsess_[A-Za-z0-9_-]{43}$/)
          expect(await storeB.get(created.sessionId)).toMatchObject({
            identity
          })
          await expect(
            pool.query(`SELECT * FROM ${schema}.operator_sessions`)
          ).rejects.toMatchObject({ code: '42501' })
          await expect(
            pool.query(`SELECT * FROM ${schema}.operator_session_get($1)`, [
              digest()
            ])
          ).resolves.toMatchObject({ rows: [] })
          await expect(
            pool.query(
              `SELECT ${schema}.operator_session_create($1,$2,$3,$4,$5)`,
              [
                digest(),
                'tenant_00000000-0000-4000-8000-000000000701',
                'operator.synthetic.pg',
                'Supervisor',
                new Date(Date.now() + 16 * 60_000)
              ]
            )
          ).rejects.toMatchObject({ code: '22023' })
          await storeB.revoke(created.sessionId)
          expect(await storeA.get(created.sessionId)).toBeNull()
        }
      )
    }
  )

  itWithPostgres(
    'revokes the whole lineage across concurrent replacement and logout',
    async () => {
      await withAuthDatabase(async ({ schema, pool, otherPool }) => {
        const original = digest()
        const successor = digest()
        const expires = new Date(Date.now() + 60_000)
        const identity = [
          'tenant_00000000-0000-4000-8000-000000000701',
          'operator.synthetic.pg',
          'Supervisor',
          expires
        ]
        await pool.query(
          `SELECT ${schema}.operator_session_create($1,$2,$3,$4,$5)`,
          [original, ...identity]
        )
        const outcomes = await Promise.allSettled([
          pool.query(
            `SELECT ${schema}.operator_session_replace($1,$2,$3,$4,$5,$6)`,
            [original, successor, ...identity]
          ),
          otherPool.query(`SELECT ${schema}.operator_session_revoke($1)`, [
            original
          ])
        ])
        expect(outcomes[1]?.status).toBe('fulfilled')
        expect(
          (
            await pool.query(
              `SELECT * FROM ${schema}.operator_session_get($1)`,
              [original]
            )
          ).rows
        ).toEqual([])
        expect(
          (
            await otherPool.query(
              `SELECT * FROM ${schema}.operator_session_get($1)`,
              [successor]
            )
          ).rows
        ).toEqual([])
      })
    }
  )

  itWithPostgres(
    'rejects unexpected table, column, and function access at startup',
    async () => {
      await withAuthDatabase(
        async ({ schema, productSchema, pool, admin, sessionRole }) => {
          const verify = () =>
            assertPostgresOperatorSessionBoundary(pool, {
              authSchemaName: schema,
              expectedSessionRole: sessionRole,
              productSchemaName: productSchema
            })
          await verify()
          await admin.query(
            `GRANT SELECT ON ${schema}.operator_sessions TO ${sessionRole}`
          )
          await expect(verify()).rejects.toThrow('auth tables or privileges')
          await admin.query(
            `REVOKE SELECT ON ${schema}.operator_sessions FROM ${sessionRole}`
          )
          await verify()

          await admin.query(
            `GRANT SELECT (tenant_id) ON ${schema}.operator_sessions TO ${sessionRole}`
          )
          await expect(verify()).rejects.toThrow('auth tables or privileges')
          await admin.query(
            `REVOKE SELECT (tenant_id) ON ${schema}.operator_sessions FROM ${sessionRole}`
          )
          await verify()

          await admin.query(
            `GRANT EXECUTE ON FUNCTION ${schema}.operator_session_get(bytea) TO PUBLIC`
          )
          await expect(verify()).rejects.toThrow(
            'function operator_session_get'
          )
          await admin.query(
            `REVOKE EXECUTE ON FUNCTION ${schema}.operator_session_get(bytea) FROM PUBLIC`
          )
          await verify()

          await admin.query(
            `GRANT USAGE ON SCHEMA ${productSchema} TO ${sessionRole}`
          )
          await expect(verify()).rejects.toThrow('product schema access')
          await admin.query(
            `REVOKE USAGE ON SCHEMA ${productSchema} FROM ${sessionRole}`
          )
          await verify()

          await admin.query(
            `GRANT SELECT ON ${schema}.operator_sessions TO PUBLIC`
          )
          await expect(verify()).rejects.toThrow('auth tables or privileges')
        }
      )
    }
  )

  itWithPostgres(
    'rejects changed row security and function bodies at startup',
    async () => {
      await withAuthDatabase(
        async ({ schema, productSchema, pool, admin, sessionRole }) => {
          const verify = () =>
            assertPostgresOperatorSessionBoundary(pool, {
              authSchemaName: schema,
              expectedSessionRole: sessionRole,
              productSchemaName: productSchema
            })
          await admin.query(
            `ALTER TABLE ${schema}.operator_sessions NO FORCE ROW LEVEL SECURITY`
          )
          await expect(verify()).rejects.toThrow('auth tables or privileges')
          await admin.query(
            `ALTER TABLE ${schema}.operator_sessions FORCE ROW LEVEL SECURITY`
          )
          await verify()

          await admin.query(
            `ALTER TABLE ${schema}.operator_sessions DROP CONSTRAINT operator_sessions_expiry_check`
          )
          await expect(verify()).rejects.toThrow('session check constraints')
          await admin.query(
            `ALTER TABLE ${schema}.operator_sessions ADD CONSTRAINT operator_sessions_expiry_check
           CHECK (expires_at > created_at AND expires_at <= created_at + interval '15 minutes')`
          )
          await verify()

          await admin.query(
            `CREATE OR REPLACE FUNCTION ${schema}.operator_session_get(p_digest bytea)
         RETURNS TABLE(tenant_id text, operator_id text, role text, expires_at timestamptz)
         LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
         AS 'BEGIN RETURN; END;'`
          )
          await expect(verify()).rejects.toThrow(
            'function operator_session_get'
          )
        }
      )
    }
  )

  itWithPostgres(
    'rejects missing, altered, partial, and extra auth indexes at startup',
    async () => {
      await withAuthDatabase(
        async ({ schema, productSchema, pool, admin, sessionRole }) => {
          const verify = () =>
            assertPostgresOperatorSessionBoundary(pool, {
              authSchemaName: schema,
              expectedSessionRole: sessionRole,
              productSchemaName: productSchema
            })
          await verify()

          await admin.query(
            `DROP INDEX ${schema}.operator_sessions_expires_at_idx`
          )
          await expect(verify()).rejects.toThrow('session index inventory')
          await admin.query(
            `CREATE INDEX operator_sessions_expires_at_idx ON ${schema}.operator_sessions (role)`
          )
          await expect(verify()).rejects.toThrow('session index inventory')
          await admin.query(
            `DROP INDEX ${schema}.operator_sessions_expires_at_idx`
          )
          await admin.query(
            `CREATE INDEX operator_sessions_expires_at_idx ON ${schema}.operator_sessions (expires_at)`
          )
          await verify()

          await admin.query(`DROP INDEX ${schema}.operator_sessions_family_idx`)
          await admin.query(
            `CREATE INDEX operator_sessions_family_idx ON ${schema}.operator_sessions (family_id) WHERE revoked_at IS NULL`
          )
          await expect(verify()).rejects.toThrow('session index inventory')
          await admin.query(`DROP INDEX ${schema}.operator_sessions_family_idx`)
          await admin.query(
            `CREATE INDEX operator_sessions_family_idx ON ${schema}.operator_sessions (family_id)`
          )
          await verify()

          await admin.query(
            `CREATE INDEX unexpected_auth_idx ON ${schema}.operator_sessions (operator_id)`
          )
          await expect(verify()).rejects.toThrow('session index inventory')
        }
      )
    }
  )

  itWithPostgres(
    'refuses a pool as a migration transaction client',
    async () => {
      await withAuthDatabase(
        async ({ schema, pool, productSchema, migrator }) => {
          await expect(
            runOperatorSessionMigrations(
              pool as unknown as Client,
              `${schema}_bad`,
              productSchema
            )
          ).rejects.toThrow('one pinned PostgreSQL Client')
          await expect(
            runOperatorSessionMigrations(
              migrator,
              productSchema,
              undefined as unknown as string
            )
          ).rejects.toThrow('must differ from the product schema')
          const objects = await migrator.query(
            `SELECT 1 FROM information_schema.tables
           WHERE table_schema = $1 AND table_name = 'operator_sessions'`,
            [productSchema]
          )
          expect(objects.rows).toEqual([])
        }
      )
    }
  )

  itWithPostgres(
    'rejects role inheritance and SET ROLE login masquerading',
    async () => {
      await withAuthDatabase(
        async ({
          schema,
          productSchema,
          pool,
          admin,
          migrationRole,
          sessionRole
        }) => {
          const options = {
            authSchemaName: schema,
            productSchemaName: productSchema,
            expectedSessionRole: sessionRole
          }
          await assertPostgresOperatorSessionBoundary(pool, options)
          await admin.query(`GRANT ${sessionRole} TO ${migrationRole}`)
          await expect(
            assertPostgresOperatorSessionBoundary(pool, options)
          ).rejects.toThrow('session role')
          await admin.query(`REVOKE ${sessionRole} FROM ${migrationRole}`)
          await assertPostgresOperatorSessionBoundary(pool, options)

          await admin.query(`SET ROLE ${sessionRole}`)
          try {
            await expect(
              assertPostgresOperatorSessionBoundary(admin, options)
            ).rejects.toThrow('session role')
          } finally {
            await admin.query('RESET ROLE')
          }
        }
      )
    }
  )

  itWithPostgres(
    'rejects an auth-table trigger that could alter the stored role',
    async () => {
      await withAuthDatabase(
        async ({ schema, productSchema, pool, admin, sessionRole }) => {
          await admin.query(
            `CREATE FUNCTION ${productSchema}.elevate_operator_role()
         RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN NEW.role := 'Admin'; RETURN NEW; END;
         $$`
          )
          await admin.query(
            `CREATE TRIGGER elevate_operator_role BEFORE INSERT ON ${schema}.operator_sessions
         FOR EACH ROW EXECUTE FUNCTION ${productSchema}.elevate_operator_role()`
          )
          await expect(
            assertPostgresOperatorSessionBoundary(pool, {
              authSchemaName: schema,
              productSchemaName: productSchema,
              expectedSessionRole: sessionRole
            })
          ).rejects.toThrow('auth table triggers or rules')
        }
      )
    }
  )
})
