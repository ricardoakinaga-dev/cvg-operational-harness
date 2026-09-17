import {
  ConversationError,
  type DeliveryReceipt,
  type DeliveryRequest,
  type ResponseDelivery
} from './contracts.ts'
import { createHash, randomUUID } from 'node:crypto'
import type { ConversationTenantDatabase } from './postgres-store.ts'

interface DeliveryRecord {
  readonly tenantId: string
  readonly conversationId: string
  readonly turnId: string
  readonly responseId: string
  readonly deliveryKey: string
  readonly text: string
  status: 'PENDING' | 'DELIVERED' | 'FAILED'
  attempts: number
}

export interface InMemoryResponseDeliveryOptions {
  readonly send?: (input: DeliveryRequest) => Promise<void>
}

/**
 * Stable delivery adapter. A retry only sends the stored response identity;
 * it has no relationship with capability execution or effect reservation.
 */
export class InMemoryResponseDelivery implements ResponseDelivery {
  readonly #records = new Map<string, DeliveryRecord>()
  readonly #locks = new Map<string, Promise<void>>()
  readonly #send: (input: DeliveryRequest) => Promise<void>

  constructor(options: InMemoryResponseDeliveryOptions = {}) {
    this.#send = options.send ?? (async () => undefined)
  }

  async deliver(input: DeliveryRequest): Promise<DeliveryReceipt> {
    if (
      !input.scope.tenantId ||
      !input.responseId ||
      !input.deliveryKey ||
      !input.text
    ) {
      throw new ConversationError(
        'INVALID_INPUT',
        'Delivery identity and text are required'
      )
    }
    const key = `${String(input.scope.tenantId)}:${input.deliveryKey}`
    return this.withLock(key, async () => {
      let record = this.#records.get(key)
      if (record) {
        if (
          record.conversationId !== String(input.scope.conversationId) ||
          record.turnId !== String(input.turnId) ||
          record.responseId !== input.responseId ||
          record.text !== input.text
        ) {
          throw new ConversationError(
            'STATE_CONFLICT',
            'Delivery key is bound to another response'
          )
        }
        if (record.status === 'DELIVERED') return this.receipt(record)
      } else {
        record = {
          tenantId: String(input.scope.tenantId),
          conversationId: String(input.scope.conversationId),
          turnId: String(input.turnId),
          responseId: input.responseId,
          deliveryKey: input.deliveryKey,
          text: input.text,
          status: 'PENDING',
          attempts: 0
        }
        this.#records.set(key, record)
      }
      record.attempts += 1
      record.status = 'PENDING'
      try {
        await this.#send(input)
        record.status = 'DELIVERED'
        return this.receipt(record)
      } catch (error) {
        record.status = 'FAILED'
        throw error
      }
    })
  }

  inspect(tenantId: string, deliveryKey: string): DeliveryReceipt | null {
    const record = this.#records.get(`${tenantId}:${deliveryKey}`)
    return record ? this.receipt(record) : null
  }

  private receipt(record: DeliveryRecord): DeliveryReceipt {
    return {
      status: record.status,
      responseId: record.responseId,
      deliveryKey: record.deliveryKey,
      attempts: record.attempts
    }
  }

  private async withLock<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const previous = this.#locks.get(key) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    this.#locks.set(key, current)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.#locks.get(key) === current) this.#locks.delete(key)
    }
  }
}

export const MemoryResponseDelivery = InMemoryResponseDelivery

interface PostgresDeliveryRow extends Record<string, unknown> {
  conversation_id: string
  turn_id: string
  response_id: string
  delivery_key: string
  body: string
  status: 'PENDING' | 'SENDING' | 'DELIVERED' | 'FAILED'
  attempts: number | string
  payload_hash: string
  lease_until: unknown
  lease_token: string | null
}

export interface PostgresResponseDeliveryOptions {
  readonly database: ConversationTenantDatabase
  /**
   * The sink must treat `input.deliveryKey` as an idempotency key. The SQL
   * row and lease prevent concurrent duplicate sends, while a process crash
   * after the sink accepts the payload and before `DELIVERED` is committed
   * leaves an at-least-once retry window.
   */
  readonly send: (input: DeliveryRequest) => Promise<void>
}

/**
 * Durable response delivery. The sink call is outside SQL transactions; the
 * adapter therefore guarantees durable retry and at-least-once semantics,
 * with external deduplication delegated to the delivery key.
 */
export class PostgresResponseDelivery implements ResponseDelivery {
  readonly #database: ConversationTenantDatabase
  readonly #send: (input: DeliveryRequest) => Promise<void>

  constructor(options: PostgresResponseDeliveryOptions) {
    this.#database = options.database
    this.#send = options.send
  }

  async deliver(input: DeliveryRequest): Promise<DeliveryReceipt> {
    const payloadHash = createHash('sha256')
      .update(input.text, 'utf8')
      .digest('hex')
    const leaseToken = randomUUID()
    const leaseSeconds = 30
    const reservation = await this.#database.withTenantTransaction(
      String(input.scope.tenantId),
      async (client) => {
        const found = await client.query<PostgresDeliveryRow>(
          `SELECT conversation_id, turn_id, response_id, delivery_key, body, status, attempts, payload_hash, lease_until, lease_token
             FROM cvg_conversation_deliveries
            WHERE tenant_id = $1 AND (response_id = $2 OR delivery_key = $3)
            FOR UPDATE`,
          [String(input.scope.tenantId), input.responseId, input.deliveryKey]
        )
        const reserveExisting = async (
          row: PostgresDeliveryRow
        ): Promise<{
          readonly status: 'DELIVERED' | 'PENDING' | 'SENDING'
          readonly attempts: number
          readonly leaseToken?: string
        }> => {
          if (
            row.conversation_id !== String(input.scope.conversationId) ||
            row.turn_id !== String(input.turnId) ||
            row.response_id !== input.responseId ||
            row.delivery_key !== input.deliveryKey ||
            row.body !== input.text ||
            row.payload_hash !== payloadHash
          ) {
            throw new ConversationError(
              'STATE_CONFLICT',
              'Delivery identity or payload hash changed'
            )
          }
          if (row.status === 'DELIVERED')
            return {
              status: 'DELIVERED' as const,
              attempts: Number(row.attempts)
            }
          const leaseUntil = row.lease_until
            ? new Date(String(row.lease_until)).getTime()
            : 0
          if (row.status === 'SENDING' && leaseUntil > Date.now()) {
            return {
              status: 'PENDING' as const,
              attempts: Number(row.attempts)
            }
          }
          await client.query(
            `UPDATE cvg_conversation_deliveries
                SET status = 'SENDING', attempts = attempts + 1, lease_until = now() + ($5::text || ' seconds')::interval,
                    lease_token = $6, updated_at = now()
              WHERE tenant_id = $1 AND response_id = $2`,
            [
              String(input.scope.tenantId),
              input.responseId,
              input.deliveryKey,
              payloadHash,
              leaseSeconds,
              leaseToken
            ]
          )
          return {
            status: 'SENDING' as const,
            attempts: Number(row.attempts) + 1,
            leaseToken
          }
        }
        const row = found.rows[0]
        if (row) return reserveExisting(row)
        const inserted = await client.query<{ response_id: string }>(
          `INSERT INTO cvg_conversation_deliveries
             (tenant_id, response_id, delivery_key, conversation_id, turn_id, body, status, attempts, payload_hash, lease_until, lease_token, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'SENDING', 1, $7, now() + ($8::text || ' seconds')::interval, $9, now(), now())
           ON CONFLICT DO NOTHING
           RETURNING response_id`,
          [
            String(input.scope.tenantId),
            input.responseId,
            input.deliveryKey,
            String(input.scope.conversationId),
            String(input.turnId),
            input.text,
            payloadHash,
            leaseSeconds,
            leaseToken
          ]
        )
        if (inserted.rowCount === 1 || inserted.rows.length === 1)
          return { status: 'SENDING' as const, attempts: 1, leaseToken }
        const reread = await client.query<PostgresDeliveryRow>(
          `SELECT conversation_id, turn_id, response_id, delivery_key, body, status, attempts, payload_hash, lease_until, lease_token
             FROM cvg_conversation_deliveries
            WHERE tenant_id = $1 AND (response_id = $2 OR delivery_key = $3)
            FOR UPDATE`,
          [String(input.scope.tenantId), input.responseId, input.deliveryKey]
        )
        const concurrent = reread.rows[0]
        if (!concurrent)
          throw new ConversationError(
            'PERSISTENCE_FAILURE',
            'Delivery reservation could not be read after a concurrent insert'
          )
        return reserveExisting(concurrent)
      }
    )
    if (
      reservation.status === 'DELIVERED' ||
      reservation.status === 'PENDING'
    ) {
      return {
        status: reservation.status,
        responseId: input.responseId,
        deliveryKey: input.deliveryKey,
        attempts: reservation.attempts
      }
    }
    try {
      await this.#send(input)
    } catch (error) {
      await this.mark(input, 'FAILED', reservation.leaseToken)
      throw error
    }
    await this.mark(input, 'DELIVERED', reservation.leaseToken)
    return {
      status: 'DELIVERED',
      responseId: input.responseId,
      deliveryKey: input.deliveryKey,
      attempts: reservation.attempts
    }
  }

  private async mark(
    input: DeliveryRequest,
    status: 'DELIVERED' | 'FAILED',
    leaseToken?: string
  ): Promise<void> {
    await this.#database.withTenantTransaction(
      String(input.scope.tenantId),
      async (client) => {
        const result = await client.query(
          `UPDATE cvg_conversation_deliveries SET status = $4, updated_at = $5
          WHERE tenant_id = $1 AND response_id = $2 AND delivery_key = $3
            AND status = 'SENDING' AND ($6::text IS NULL OR lease_token = $6)`,
          [
            String(input.scope.tenantId),
            input.responseId,
            input.deliveryKey,
            status,
            new Date().toISOString(),
            leaseToken ?? null
          ]
        )
        if (result.rowCount !== undefined && result.rowCount !== 1) {
          throw new ConversationError(
            'STATE_CONFLICT',
            'Delivery lease is no longer owned by this attempt'
          )
        }
      }
    )
  }
}
