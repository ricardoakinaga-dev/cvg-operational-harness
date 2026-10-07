import { createHash } from 'node:crypto'
import { guardPostgresPoolErrors } from '@cvg/persistence'
import { OperatorIdentitySchema, type OperatorIdentity } from '@cvg/shared'
import { Pool, type QueryResultRow } from 'pg'
import {
  createOpaqueOperatorSessionId,
  type OperatorSessionRecord,
  type OperatorSessionStore
} from './operator-session.ts'

const SESSION_ID_PATTERN = /^opsess_[A-Za-z0-9_-]{43}$/
const MAX_SESSION_MS = 15 * 60_000
const QUERY_TIMEOUT_MS = 2_000

type SessionRow = QueryResultRow & {
  tenant_id: string
  operator_id: string
  role: string
  expires_at: Date | string
}

function requireAuthSchemaName(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value) || value === 'public') {
    throw new Error('Invalid PostgreSQL operator-auth schema name')
  }
  return value
}

function digestSessionId(sessionId: string): Buffer | null {
  if (!SESSION_ID_PATTERN.test(sessionId)) return null
  return createHash('sha256').update(sessionId, 'utf8').digest()
}

function validatedInput(input: {
  identity: OperatorIdentity
  expiresAt: number
}): { identity: OperatorIdentity & { tenantId: string }; expiresAt: number } {
  const identity = OperatorIdentitySchema.parse(input.identity)
  const now = Date.now()
  if (!identity.tenantId) {
    throw new Error('Operator session requires a verified tenant')
  }
  if (
    !Number.isSafeInteger(input.expiresAt) ||
    input.expiresAt <= now ||
    input.expiresAt > now + MAX_SESSION_MS
  ) {
    throw new Error('Operator session expiry is outside the allowed window')
  }
  return {
    identity: { ...identity, tenantId: identity.tenantId },
    expiresAt: input.expiresAt
  }
}

/**
 * Only the dedicated API session role should back this pool. The migration
 * role must never be present in the serving process.
 */
export class PostgresOperatorSessionStore implements OperatorSessionStore {
  private readonly schema: string

  constructor(
    private readonly pool: Pool,
    authSchemaName: string
  ) {
    this.schema = `"${requireAuthSchemaName(authSchemaName)}"`
  }

  private query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[]
  ) {
    return this.pool.query<T>(text, values)
  }

  async create(input: {
    identity: OperatorIdentity
    expiresAt: number
  }): Promise<OperatorSessionRecord> {
    const { identity, expiresAt } = validatedInput(input)
    const sessionId = createOpaqueOperatorSessionId()
    const digest = digestSessionId(sessionId)
    if (!digest) throw new Error('Generated operator session is invalid')
    await this.query(
      `SELECT ${this.schema}.operator_session_create($1,$2,$3,$4,$5)`,
      [
        digest,
        identity.tenantId,
        identity.operatorId,
        identity.role,
        new Date(expiresAt)
      ]
    )
    return { sessionId, identity, expiresAt }
  }

  async get(sessionId: string): Promise<OperatorSessionRecord | null> {
    const digest = digestSessionId(sessionId)
    if (!digest) return null
    const result = await this.query<SessionRow>(
      `SELECT * FROM ${this.schema}.operator_session_get($1)`,
      [digest]
    )
    const row = result.rows[0]
    if (!row) return null
    const identity = OperatorIdentitySchema.parse({
      tenantId: row.tenant_id,
      operatorId: row.operator_id,
      role: row.role
    })
    const expiresAt = new Date(row.expires_at).getTime()
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
      return null
    }
    return { sessionId, identity, expiresAt }
  }

  async replace(
    previousSessionId: string,
    input: { identity: OperatorIdentity; expiresAt: number }
  ): Promise<OperatorSessionRecord> {
    const previousDigest = digestSessionId(previousSessionId)
    if (!previousDigest) throw new Error('Previous operator session is invalid')
    const { identity, expiresAt } = validatedInput(input)
    const sessionId = createOpaqueOperatorSessionId()
    const nextDigest = digestSessionId(sessionId)
    if (!nextDigest) throw new Error('Generated operator session is invalid')
    await this.query(
      `SELECT ${this.schema}.operator_session_replace($1,$2,$3,$4,$5,$6)`,
      [
        previousDigest,
        nextDigest,
        identity.tenantId,
        identity.operatorId,
        identity.role,
        new Date(expiresAt)
      ]
    )
    return { sessionId, identity, expiresAt }
  }

  async switchIdentity(
    previousSessionId: string,
    input: { identity: OperatorIdentity; expiresAt: number }
  ): Promise<OperatorSessionRecord> {
    const { identity, expiresAt } = validatedInput(input)
    const sessionId = createOpaqueOperatorSessionId()
    const digest = digestSessionId(sessionId)
    if (!digest) throw new Error('Generated operator session is invalid')
    const previousDigest = digestSessionId(previousSessionId)
    const client = await this.pool.connect()
    let failed = true
    try {
      await client.query('BEGIN')
      // Both functions run in this transaction: a failed create rolls the
      // revocation back, so the previous session survives intact. A lost
      // connection rejects the pending query (the pool guard keeps the
      // client's `error` event handled) and the server aborts the
      // transaction. Only a loss after COMMIT is sent is ambiguous: the
      // caller still answers 503 without a cookie, so the operator signs in
      // again whichever way the commit went.
      if (previousDigest) {
        await client.query(
          `SELECT ${this.schema}.operator_session_revoke($1)`,
          [previousDigest]
        )
      }
      await client.query(
        `SELECT ${this.schema}.operator_session_create($1,$2,$3,$4,$5)`,
        [
          digest,
          identity.tenantId,
          identity.operatorId,
          identity.role,
          new Date(expiresAt)
        ]
      )
      await client.query('COMMIT')
      failed = false
      return { sessionId, identity, expiresAt }
    } finally {
      if (failed) await client.query('ROLLBACK').catch(() => undefined)
      client.release(failed)
    }
  }

  async revoke(sessionId: string): Promise<void> {
    const digest = digestSessionId(sessionId)
    if (!digest) return
    await this.query(`SELECT ${this.schema}.operator_session_revoke($1)`, [
      digest
    ])
  }
}

export function createPostgresOperatorSessionPool(
  connectionString: string
): Pool {
  return guardPostgresPoolErrors(
    new Pool({
      connectionString,
      connectionTimeoutMillis: 1_000,
      query_timeout: QUERY_TIMEOUT_MS,
      statement_timeout: QUERY_TIMEOUT_MS,
      max: 10
    })
  )
}
