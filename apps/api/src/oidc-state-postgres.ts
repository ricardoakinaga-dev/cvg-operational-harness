import { Pool, type QueryResultRow } from 'pg'
import type { OidcLoginStateStore } from './oidc-login-transaction.ts'

const DIGEST_PATTERN = /^[0-9a-f]{64}$/
const MAX_STATE_AGE_MS = 5 * 60_000

type BooleanRow = QueryResultRow & { accepted: boolean }

/** The pool must use the dedicated API auth role checked by the startup guard. */
export class PostgresOidcLoginStateStore implements OidcLoginStateStore {
  private readonly schema: string

  constructor(
    private readonly pool: Pool,
    authSchemaName: string
  ) {
    const bounded = (value: number | false | undefined, limit: number) =>
      typeof value === 'number' && value > 0 && value <= limit
    if (
      !pool?.options ||
      !bounded(pool.options.connectionTimeoutMillis, 1_000) ||
      !bounded(pool.options.query_timeout, 2_000) ||
      !bounded(pool.options.statement_timeout, 2_000)
    ) {
      throw new Error('OIDC state store requires a bounded auth pool')
    }
    if (
      !/^[a-z][a-z0-9_]{0,62}$/.test(authSchemaName) ||
      authSchemaName === 'public' ||
      authSchemaName.startsWith('pg_')
    ) {
      throw new Error('Invalid PostgreSQL operator-auth schema name')
    }
    this.schema = `"${authSchemaName}"`
  }

  async reserve(stateDigest: string, expiresAt: number): Promise<boolean> {
    const now = Date.now()
    if (
      !DIGEST_PATTERN.test(stateDigest) ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= now ||
      expiresAt > now + MAX_STATE_AGE_MS
    ) {
      throw new Error('OIDC state reservation is invalid')
    }
    const result = await this.pool.query<BooleanRow>(
      `SELECT ${this.schema}.oidc_state_reserve($1,$2) AS accepted`,
      [Buffer.from(stateDigest, 'hex'), new Date(expiresAt)]
    )
    if (typeof result.rows[0]?.accepted !== 'boolean') {
      throw new Error('OIDC state reservation result is invalid')
    }
    return result.rows[0].accepted
  }

  async consume(stateDigest: string): Promise<boolean> {
    if (!DIGEST_PATTERN.test(stateDigest)) return false
    const result = await this.pool.query<BooleanRow>(
      `SELECT ${this.schema}.oidc_state_consume($1) AS accepted`,
      [Buffer.from(stateDigest, 'hex')]
    )
    if (typeof result.rows[0]?.accepted !== 'boolean') {
      throw new Error('OIDC state consumption result is invalid')
    }
    return result.rows[0].accepted
  }
}
