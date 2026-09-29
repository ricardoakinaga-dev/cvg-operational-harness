import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { PostgresPoolLike } from '@cvg/persistence'

export interface WebhookSigningInput {
  eventId: string
  timestampSeconds: number
  channel: string
  body: unknown
  rawBody?: string
}

export interface WebhookVerificationInput {
  headers: Record<string, unknown>
  body: unknown
  channel: string
  rawBody?: string
}

export interface WebhookVerificationLease {
  verified: true
  commit(): void | Promise<void>
  release(): void | Promise<void>
}

export interface WebhookReplayReservation {
  key: string
  generation: number
  token: string
}

export interface WebhookReplayWindow {
  timestampSeconds: number
  toleranceSeconds: number
}

export interface WebhookReplayStore {
  claim(
    key: string,
    expiresAtMs: number,
    window?: WebhookReplayWindow
  ): boolean | Promise<boolean>
  reserve?(
    key: string,
    expiresAtMs: number,
    window?: WebhookReplayWindow
  ):
    | WebhookReplayReservation
    | false
    | Promise<WebhookReplayReservation | false>
  commit?(reservation: WebhookReplayReservation): boolean | Promise<boolean>
  release?(reservation: WebhookReplayReservation): boolean | Promise<boolean>
}

interface HmacWebhookVerifierOptions {
  secret: string | readonly string[]
  replayStore?: WebhookReplayStore
  now?: () => number
  toleranceSeconds?: number
}

interface ReplayEntry {
  expiresAt: number
  status: 'reserved' | 'committed'
  generation: number
  token: string
}

const DEFAULT_TOLERANCE_SECONDS = 300
// A crashed worker must not strand a signed event until the full replay
// tolerance expires. The lease is intentionally shorter than the replay
// retention window; a still-running request renews it only by committing.
const RESERVATION_LEASE_SECONDS = 30
const SIGNATURE_HEADER = 'x-cvg-webhook-signature'
const EVENT_ID_HEADER = 'x-cvg-webhook-id'
const TIMESTAMP_HEADER = 'x-cvg-webhook-timestamp'

export class InMemoryWebhookReplayStore implements WebhookReplayStore {
  private entries = new Map<string, ReplayEntry>()
  private lastObservedMs = -1
  private clockRegressed = false

  constructor(private readonly now: () => number = Date.now) {}

  claim(
    key: string,
    expiresAtMs: number,
    window?: WebhookReplayWindow
  ): boolean {
    const reservation = this.reserve(key, expiresAtMs, window)
    if (!reservation) return false
    if (this.commit(reservation)) return true
    this.release(reservation)
    return false
  }

  reserve(
    key: string,
    expiresAtMs: number,
    window?: WebhookReplayWindow
  ): WebhookReplayReservation | false {
    const currentTime = this.readTime()
    if (currentTime === null) return false
    const activeEntries = this.activeEntries(currentTime)
    if (
      expiresAtMs <= currentTime ||
      (window !== undefined && !isWithinReplayWindow(currentTime, window)) ||
      activeEntries.has(key)
    ) {
      this.entries = activeEntries
      return false
    }
    const reservation: WebhookReplayReservation = {
      key,
      generation: 1,
      token: randomUUID()
    }
    this.entries = new Map(activeEntries).set(key, {
      expiresAt: expiresAtMs,
      status: 'reserved',
      generation: reservation.generation,
      token: reservation.token
    })
    return reservation
  }

  commit(reservation: WebhookReplayReservation): boolean {
    const currentTime = this.readTime()
    if (currentTime === null) return false
    const activeEntries = this.activeEntries(currentTime)
    const entry = activeEntries.get(reservation.key)
    if (
      !entry ||
      entry.status !== 'reserved' ||
      entry.generation !== reservation.generation ||
      entry.token !== reservation.token
    ) {
      this.entries = activeEntries
      return false
    }
    this.entries = new Map(activeEntries).set(reservation.key, {
      ...entry,
      status: 'committed'
    })
    return true
  }

  release(reservation: WebhookReplayReservation): boolean {
    const currentTime = this.readTime()
    if (currentTime === null) return false
    const activeEntries = this.activeEntries(currentTime)
    const entry = activeEntries.get(reservation.key)
    if (
      !entry ||
      entry.status !== 'reserved' ||
      entry.generation !== reservation.generation ||
      entry.token !== reservation.token
    ) {
      this.entries = activeEntries
      return false
    }
    const releasedEntries = new Map(activeEntries)
    releasedEntries.delete(reservation.key)
    this.entries = releasedEntries
    return true
  }

  private readTime(): number | null {
    if (this.clockRegressed) return null
    const currentTime = this.now()
    if (
      !Number.isSafeInteger(currentTime) ||
      currentTime < 0 ||
      currentTime < this.lastObservedMs
    ) {
      this.clockRegressed = true
      return null
    }
    this.lastObservedMs = currentTime
    return currentTime
  }

  private activeEntries(currentTime: number): Map<string, ReplayEntry> {
    return new Map(
      [...this.entries].filter(([, entry]) => entry.expiresAt > currentTime)
    )
  }
}

/**
 * Shared replay storage for production deployments. Each operation uses one
 * checked-out connection and a single conditional SQL mutation, so concurrent
 * API instances cannot both reserve the same signed event.
 */
export class PostgresWebhookReplayStore implements WebhookReplayStore {
  constructor(private readonly pool: PostgresPoolLike) {}

  async claim(
    key: string,
    expiresAtMs: number,
    window?: WebhookReplayWindow
  ): Promise<boolean> {
    const reservation = await this.reserve(key, expiresAtMs, window)
    if (!reservation) return false
    const committed = await this.commit(reservation)
    if (committed) return true
    await this.release(reservation)
    return false
  }

  async reserve(
    key: string,
    expiresAtMs: number,
    window?: WebhookReplayWindow
  ): Promise<WebhookReplayReservation | false> {
    validateReplayEntry(key, expiresAtMs, window === undefined)
    if (window !== undefined) validateReplayWindow(window)
    const token = randomUUID()
    const windowParams = [
      window?.timestampSeconds ?? null,
      window?.toleranceSeconds ?? null
    ]
    const client = await this.pool.connect()
    try {
      await client.query(
        `DELETE FROM webhook_replay_events
         WHERE expires_at <= CURRENT_TIMESTAMP`
      )
      const inserted = await client.query<ReplayReservationRow>(
        `INSERT INTO webhook_replay_events
           (event_key, status, expires_at, lease_generation, lease_token)
         SELECT $1, 'reserved', $2, 1, $3
         WHERE $2::timestamptz > clock_timestamp()
           AND ($4::bigint IS NULL OR ABS(FLOOR(EXTRACT(EPOCH FROM clock_timestamp())) - $4::bigint) <= $5::bigint)
         ON CONFLICT (event_key) DO NOTHING
         RETURNING event_key, lease_generation, lease_token`,
        [key, new Date(expiresAtMs), token, ...windowParams]
      )
      if (inserted.rows[0]) return mapReplayReservation(inserted.rows[0])
      const reused = await client.query<ReplayReservationRow>(
        `UPDATE webhook_replay_events
          SET status = 'reserved',
              expires_at = $2,
              created_at = CURRENT_TIMESTAMP,
              lease_generation = lease_generation + 1,
              lease_token = $3
          WHERE event_key = $1
            AND status = 'reserved'
            AND $2::timestamptz > clock_timestamp()
            AND ($4::bigint IS NULL OR ABS(FLOOR(EXTRACT(EPOCH FROM clock_timestamp())) - $4::bigint) <= $5::bigint)
            AND (
              expires_at <= CURRENT_TIMESTAMP
              OR created_at <= CURRENT_TIMESTAMP - INTERVAL '${RESERVATION_LEASE_SECONDS} seconds'
            )
          RETURNING event_key, lease_generation, lease_token`,
        [key, new Date(expiresAtMs), token, ...windowParams]
      )
      return reused.rows[0] ? mapReplayReservation(reused.rows[0]) : false
    } finally {
      client.release()
    }
  }

  async commit(reservation: WebhookReplayReservation): Promise<boolean> {
    const client = await this.pool.connect()
    try {
      const result = await client.query(
        `UPDATE webhook_replay_events
          SET status = 'committed', lease_token = NULL
          WHERE event_key = $1
            AND status = 'reserved'
            AND expires_at > CURRENT_TIMESTAMP
            AND lease_generation = $2
            AND lease_token = $3
          RETURNING event_key`,
        [reservation.key, reservation.generation, reservation.token]
      )
      return result.rows.length > 0
    } finally {
      client.release()
    }
  }

  async release(reservation: WebhookReplayReservation): Promise<boolean> {
    const client = await this.pool.connect()
    try {
      const result = await client.query(
        `DELETE FROM webhook_replay_events
          WHERE event_key = $1
            AND status = 'reserved'
            AND lease_generation = $2
            AND lease_token = $3
          RETURNING event_key`,
        [reservation.key, reservation.generation, reservation.token]
      )
      return result.rows.length > 0
    } finally {
      client.release()
    }
  }
}

export class HmacWebhookVerifier {
  private readonly secrets: readonly string[]
  private readonly replayStore: WebhookReplayStore
  private readonly now: () => number
  private readonly toleranceSeconds: number

  constructor(options: HmacWebhookVerifierOptions) {
    const configuredSecrets = Array.isArray(options.secret)
      ? options.secret
      : [options.secret]
    this.secrets = configuredSecrets
      .map((secret) => secret.trim())
      .filter(Boolean)
    if (this.secrets.length === 0) {
      throw new Error('At least one webhook signing secret is required')
    }
    this.now = options.now ?? Date.now
    this.replayStore =
      options.replayStore ?? new InMemoryWebhookReplayStore(this.now)
    this.toleranceSeconds =
      options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
    if (
      !Number.isInteger(this.toleranceSeconds) ||
      this.toleranceSeconds <= 0 ||
      this.toleranceSeconds > 86_400
    ) {
      throw new Error('Webhook tolerance must be a positive number of seconds')
    }
  }

  verify = async (input: WebhookVerificationInput): Promise<boolean> => {
    try {
      const prepared = this.prepare(input)
      if (!prepared) return false
      return await this.replayStore.claim(
        prepared.key,
        prepared.expiresAtMs,
        prepared.window
      )
    } catch {
      return false
    }
  }

  verifyWithLease = async (
    input: WebhookVerificationInput
  ): Promise<WebhookVerificationLease | null> => {
    try {
      const prepared = this.prepare(input)
      if (!prepared) return null
      if (
        !this.replayStore.reserve ||
        !this.replayStore.commit ||
        !this.replayStore.release
      ) {
        const claimed = await this.replayStore.claim(
          prepared.key,
          prepared.expiresAtMs,
          prepared.window
        )
        return claimed
          ? {
              verified: true,
              commit: () => undefined,
              release: () => undefined
            }
          : null
      }
      const reserved = await this.replayStore.reserve(
        prepared.key,
        prepared.expiresAtMs,
        prepared.window
      )
      if (!reserved) return null
      return {
        verified: true,
        commit: async () => {
          const committed = await this.replayStore.commit!(reserved)
          if (!committed) throw new Error('Webhook replay commit failed')
        },
        release: async () => {
          await this.replayStore.release!(reserved)
        }
      }
    } catch {
      return null
    }
  }

  private prepare(
    input: WebhookVerificationInput
  ): { key: string; expiresAtMs: number; window: WebhookReplayWindow } | null {
    const eventId = readHeader(input.headers, EVENT_ID_HEADER)
    const signature = readHeader(input.headers, SIGNATURE_HEADER)
    const timestampHeader = readHeader(input.headers, TIMESTAMP_HEADER)
    const timestampSeconds = parseTimestamp(timestampHeader)
    if (
      !eventId ||
      eventId.length > 256 ||
      !signature ||
      timestampSeconds === null
    ) {
      return null
    }

    const nowMs = this.now()
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) return null
    const currentSeconds = Math.floor(nowMs / 1000)
    if (Math.abs(currentSeconds - timestampSeconds) > this.toleranceSeconds) {
      return null
    }

    const signingInput: WebhookSigningInput = {
      eventId,
      timestampSeconds,
      channel: input.channel,
      body: input.body,
      ...(input.rawBody !== undefined ? { rawBody: input.rawBody } : {})
    }
    const matchedSecret = this.secrets.some((secret) =>
      signaturesMatch(signature, createWebhookSignature(secret, signingInput))
    )
    if (!matchedSecret) return null

    // The signed timestamp is valid through the end of second ts + T.
    // The replay reservation expires at the start of the next second.
    const exclusiveExpirySeconds = timestampSeconds + this.toleranceSeconds + 1
    const expiresAtMs = exclusiveExpirySeconds * 1000
    if (
      !Number.isSafeInteger(exclusiveExpirySeconds) ||
      !Number.isSafeInteger(expiresAtMs) ||
      Number.isNaN(new Date(expiresAtMs).getTime())
    ) {
      return null
    }
    return {
      key: `webhook:${input.channel}:${eventId}`,
      expiresAtMs,
      window: { timestampSeconds, toleranceSeconds: this.toleranceSeconds }
    }
  }
}

export function createWebhookSignature(
  secret: string,
  input: WebhookSigningInput
): string {
  if (!secret.trim()) throw new Error('Webhook signing secret is required')
  const payload = buildWebhookSigningPayload(input)
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
}

export function buildWebhookSigningPayload(input: WebhookSigningInput): string {
  const eventId = requireNonBlank(input.eventId, 'eventId')
  const channel = requireNonBlank(input.channel, 'channel')
  if (
    !Number.isSafeInteger(input.timestampSeconds) ||
    input.timestampSeconds < 0
  ) {
    throw new Error('Webhook timestamp must be a non-negative integer')
  }
  const body = input.rawBody ?? canonicalJson(input.body)
  return `${eventId}.${input.timestampSeconds}.${channel}.${body}`
}

function readHeader(
  headers: Record<string, unknown>,
  expectedName: string
): string | null {
  const entry = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === expectedName
  )?.[1]
  return typeof entry === 'string' && entry.trim() ? entry.trim() : null
}

function parseTimestamp(value: string | null): number | null {
  if (!value || !/^\d{1,12}$/.test(value)) return null
  const timestamp = Number(value)
  return Number.isSafeInteger(timestamp) ? timestamp : null
}

function signaturesMatch(received: string, expected: string): boolean {
  const normalized = received.toLowerCase()
  if (!/^sha256=[a-f0-9]{64}$/.test(normalized)) return false
  const receivedDigest = Buffer.from(normalized.slice('sha256='.length), 'hex')
  const expectedDigest = Buffer.from(expected.slice('sha256='.length), 'hex')
  return (
    receivedDigest.length === expectedDigest.length &&
    timingSafeEqual(receivedDigest, expectedDigest)
  )
}

function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('Webhook body is not JSON-safe')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Webhook body must contain plain JSON objects')
    }
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right)
    )
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  }
  throw new Error('Webhook body is not JSON-safe')
}

function requireNonBlank(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`Webhook ${field} is required`)
  return normalized
}

function validateReplayEntry(
  key: string,
  expiresAtMs: number,
  requireLocalFuture: boolean
): void {
  if (!key.trim() || key.length > 300) {
    throw new Error('Webhook replay key is invalid')
  }
  if (
    !Number.isSafeInteger(expiresAtMs) ||
    Number.isNaN(new Date(expiresAtMs).getTime()) ||
    (requireLocalFuture && expiresAtMs <= Date.now())
  ) {
    throw new Error('Webhook replay expiry is invalid')
  }
}

function validateReplayWindow(window: WebhookReplayWindow): void {
  if (
    !Number.isSafeInteger(window.timestampSeconds) ||
    window.timestampSeconds < 0 ||
    !Number.isSafeInteger(window.toleranceSeconds) ||
    window.toleranceSeconds <= 0 ||
    window.toleranceSeconds > 86_400
  ) {
    throw new Error('Webhook replay window is invalid')
  }
}

function isWithinReplayWindow(
  nowMs: number,
  window: WebhookReplayWindow
): boolean {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) return false
  validateReplayWindow(window)
  return (
    Math.abs(Math.floor(nowMs / 1000) - window.timestampSeconds) <=
    window.toleranceSeconds
  )
}

interface ReplayReservationRow {
  event_key: string
  lease_generation: number | string
  lease_token: string | null
}

function mapReplayReservation(
  row: ReplayReservationRow
): WebhookReplayReservation {
  const generation = Number(row.lease_generation)
  if (
    !row.event_key ||
    !Number.isSafeInteger(generation) ||
    generation <= 0 ||
    typeof row.lease_token !== 'string' ||
    row.lease_token.trim() === ''
  ) {
    throw new Error('Webhook replay reservation fencing state is invalid')
  }
  return {
    key: row.event_key,
    generation,
    token: row.lease_token
  }
}
