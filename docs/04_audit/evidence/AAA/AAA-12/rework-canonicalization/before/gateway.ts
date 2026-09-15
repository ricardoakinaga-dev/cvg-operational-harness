import { randomUUID } from 'node:crypto'
import {
  CanonicalEnvelopeSchema,
  CanonicalOutboundMessageSchema,
  type CanonicalEnvelope,
  type CanonicalEnvelopeInput,
  type CanonicalOutboundMessageInput,
  type InboundChannelAdapter,
  type InboundNormalizeContext,
  type OutboundChannelAdapter,
  type OutboundResult
} from './contracts.ts'
import { ChannelError } from './errors.ts'
import {
  CHANNEL_OPERATION_KIND,
  InMemoryChannelEffectJournal,
  hashOutboundPayload,
  type ChannelEffectIdentity,
  type ChannelEffectJournal,
  type ChannelEffectRecord
} from './effect-journal.ts'
import { InboundDeduplicator } from './idempotency.ts'

export type ChannelEventType =
  | 'channel.inbound.accepted'
  | 'channel.inbound.duplicate'
  | 'channel.inbound.rejected'
  | 'channel.outbound.sent'
  | 'channel.outbound.replayed'
  | 'channel.outbound.blocked'
  | 'channel.outbound.rejected'
  | 'channel.outbound.uncertain'

export interface ChannelEvent {
  type: ChannelEventType
  channel: string
  tenantId: string
  correlationId: string
  messageId?: string
  code?: string
}

export interface ChannelGatewayOptions {
  inboundAdapters?: InboundChannelAdapter[]
  outboundAdapters?: OutboundChannelAdapter[]
  deduplicator?: InboundDeduplicator
  effectJournal?: ChannelEffectJournal
  leaseMs?: number
  leaseOwner?: string
  clock?: () => number
  waitTimeoutMs?: number
  heartbeatIntervalMs?: number
  onEvent?: (event: ChannelEvent) => void
}

export interface IngestResult {
  accepted: boolean
  duplicate: boolean
  envelope: CanonicalEnvelope
}

export const DEFAULT_CHANNEL_LEASE_MS = 30_000

/**
 * Single entry point for every channel. Inbound payloads are canonicalized and
 * deduplicated; outbound messages are blocked by human takeover and reserved
 * atomically before any provider effect, so concurrent dispatches, retries and
 * restarts never produce a second confirmed send for the same operation.
 */
export class ChannelGateway {
  readonly #inbound = new Map<string, InboundChannelAdapter>()
  readonly #outbound = new Map<string, OutboundChannelAdapter>()
  readonly #deduplicator: InboundDeduplicator
  readonly #effects: ChannelEffectJournal
  readonly #leaseMs: number
  readonly #leaseOwner: string
  readonly #clock: () => number
  readonly #waitTimeoutMs: number
  readonly #heartbeatIntervalMs: number
  readonly #onEvent?: (event: ChannelEvent) => void

  constructor(options: ChannelGatewayOptions = {}) {
    for (const adapter of options.inboundAdapters ?? []) {
      this.#inbound.set(adapter.channel, adapter)
    }
    for (const adapter of options.outboundAdapters ?? []) {
      this.#outbound.set(adapter.channel, adapter)
    }
    this.#deduplicator = options.deduplicator ?? new InboundDeduplicator()
    this.#effects = options.effectJournal ?? new InMemoryChannelEffectJournal()
    this.#leaseMs = options.leaseMs ?? DEFAULT_CHANNEL_LEASE_MS
    this.#leaseOwner = `${
      options.leaseOwner ?? 'gateway'
    }:${process.pid}:${randomUUID()}`
    this.#clock = options.clock ?? (() => Date.now())
    this.#waitTimeoutMs = options.waitTimeoutMs ?? this.#leaseMs * 2
    this.#heartbeatIntervalMs =
      options.heartbeatIntervalMs ?? Math.max(1, Math.floor(this.#leaseMs / 3))
    if (options.onEvent) this.#onEvent = options.onEvent
  }

  ingest(
    channel: string,
    raw: unknown,
    context: InboundNormalizeContext
  ): IngestResult {
    const adapter = this.#inbound.get(channel)
    if (!adapter) {
      throw new ChannelError(
        'channel_unknown',
        `No inbound adapter for ${channel}`
      )
    }
    if (!adapter.enabled) {
      throw new ChannelError(
        'channel_disabled',
        `Channel ${channel} is disabled`
      )
    }
    let envelopeInput: CanonicalEnvelopeInput
    try {
      envelopeInput = adapter.normalize(raw, context)
    } catch (error) {
      this.#emit({
        type: 'channel.inbound.rejected',
        channel,
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        code: error instanceof ChannelError ? error.code : 'invalid_payload'
      })
      throw error
    }
    const envelope = CanonicalEnvelopeSchema.parse(envelopeInput)
    const { accepted } = this.#deduplicator.accept(envelope)
    this.#emit({
      type: accepted ? 'channel.inbound.accepted' : 'channel.inbound.duplicate',
      channel,
      tenantId: envelope.tenantId,
      correlationId: envelope.correlationId,
      messageId: envelope.messageId
    })
    return { accepted, duplicate: !accepted, envelope }
  }

  async dispatch(
    message: CanonicalOutboundMessageInput,
    options: { takeoverActive: boolean }
  ): Promise<OutboundResult> {
    const parsed = CanonicalOutboundMessageSchema.safeParse(message)
    if (!parsed.success) {
      throw new ChannelError(
        'invalid_payload',
        'Outbound message failed schema validation'
      )
    }
    const outbound = parsed.data
    if (options.takeoverActive) {
      this.#emit({
        type: 'channel.outbound.blocked',
        channel: outbound.channel,
        tenantId: outbound.tenantId,
        correlationId: outbound.correlationId,
        messageId: outbound.messageId,
        code: 'human_takeover_active'
      })
      throw new ChannelError(
        'human_takeover_active',
        'Human takeover is active; automatic outbound effects are blocked'
      )
    }

    const adapter = this.#outbound.get(outbound.channel)
    if (!adapter) {
      throw new ChannelError(
        'channel_unknown',
        `No outbound adapter for ${outbound.channel}`
      )
    }
    if (!adapter.enabled) {
      this.#emit({
        type: 'channel.outbound.rejected',
        channel: outbound.channel,
        tenantId: outbound.tenantId,
        correlationId: outbound.correlationId,
        messageId: outbound.messageId,
        code: 'channel_disabled'
      })
      throw new ChannelError(
        'channel_disabled',
        `Channel ${outbound.channel} is disabled`
      )
    }

    const identity: ChannelEffectIdentity = {
      tenantId: outbound.tenantId,
      channel: outbound.channel,
      operationKind: CHANNEL_OPERATION_KIND,
      idempotencyKey: outbound.idempotencyKey
    }
    const leaseOwner = this.#leaseOwner
    const reservation = await this.#effects.reserve({
      identity,
      payloadHash: hashOutboundPayload(outbound),
      leaseOwner,
      leaseMs: this.#leaseMs
    })

    if (reservation.outcome === 'conflict') {
      throw new ChannelError(
        'idempotency_key_reuse',
        'Idempotency key was reused with a different payload',
        false
      )
    }
    if (reservation.outcome === 'replay') {
      return this.#settleReplay(outbound, reservation.record)
    }
    if (reservation.outcome === 'uncertain') {
      this.#emit({
        type: 'channel.outbound.uncertain',
        channel: outbound.channel,
        tenantId: outbound.tenantId,
        correlationId: outbound.correlationId,
        messageId: outbound.messageId,
        code: reservation.record.errorCode ?? 'effect_uncertain'
      })
      throw new ChannelError(
        'effect_uncertain',
        'Channel operation effect is uncertain; reconcile before retrying',
        false
      )
    }
    if (reservation.outcome === 'in_flight') {
      const terminal = await this.#effects.waitForTerminal(
        identity,
        this.#waitTimeoutMs
      )
      if (!terminal) {
        throw new ChannelError(
          'operation_in_progress',
          'Channel operation is still in progress elsewhere',
          true
        )
      }
      return this.#settleReplay(outbound, terminal)
    }

    try {
      await this.#effects.claimSend(identity, leaseOwner)
    } catch {
      throw new ChannelError(
        'lease_lost',
        'Channel operation lease was lost before the send started',
        true
      )
    }

    const heartbeat = setInterval(() => {
      void this.#effects
        .renew(identity, leaseOwner, this.#leaseMs)
        .catch(() => undefined)
    }, this.#heartbeatIntervalMs)
    const unref = (heartbeat as { unref?: () => void }).unref
    if (typeof unref === 'function') unref.call(heartbeat)

    let sendResult: OutboundResult
    try {
      sendResult = await adapter.send(outbound)
    } catch (error) {
      clearInterval(heartbeat)
      return await this.#handleSendFailure(
        outbound,
        identity,
        leaseOwner,
        error
      )
    }
    clearInterval(heartbeat)

    const transition = await this.#effects.complete(
      identity,
      leaseOwner,
      sendResult
    )
    if (transition === 'committed') {
      this.#emit({
        type: 'channel.outbound.sent',
        channel: outbound.channel,
        tenantId: outbound.tenantId,
        correlationId: outbound.correlationId,
        messageId: outbound.messageId
      })
      return sendResult
    }

    const current = await this.#effects.find(identity)
    if (current?.state === 'CONFIRMED' && current.result) {
      this.#emit({
        type: 'channel.outbound.replayed',
        channel: outbound.channel,
        tenantId: outbound.tenantId,
        correlationId: outbound.correlationId,
        messageId: outbound.messageId
      })
      return current.result
    }
    await this.#effects
      .markUncertain(identity, leaseOwner, 'lease_lost')
      .catch(() => undefined)
    this.#emit({
      type: 'channel.outbound.uncertain',
      channel: outbound.channel,
      tenantId: outbound.tenantId,
      correlationId: outbound.correlationId,
      messageId: outbound.messageId,
      code: 'lease_lost'
    })
    throw new ChannelError(
      'effect_uncertain',
      'Send completed but the effect could not be recorded under this lease',
      false
    )
  }

  async #handleSendFailure(
    outbound: {
      channel: string
      tenantId: string
      correlationId: string
      messageId: string
    },
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    error: unknown
  ): Promise<never> {
    const channelError =
      error instanceof ChannelError
        ? error
        : new ChannelError(
            'send_failed',
            'Outbound channel send failed',
            true,
            { effectUnknown: true }
          )

    if (channelError.effectUnknown) {
      await this.#effects
        .markUncertain(identity, leaseOwner, channelError.code)
        .catch(() => undefined)
      this.#emit({
        type: 'channel.outbound.uncertain',
        channel: outbound.channel,
        tenantId: outbound.tenantId,
        correlationId: outbound.correlationId,
        messageId: outbound.messageId,
        code: channelError.code
      })
      throw new ChannelError(
        'effect_uncertain',
        `Outbound effect is uncertain after ${channelError.code}`,
        false
      )
    }

    const transition = channelError.retryable
      ? await this.#effects.release(identity, leaseOwner, channelError.code)
      : await this.#effects.fail(identity, leaseOwner, channelError.code)
    this.#emit({
      type: 'channel.outbound.rejected',
      channel: outbound.channel,
      tenantId: outbound.tenantId,
      correlationId: outbound.correlationId,
      messageId: outbound.messageId,
      code: channelError.code
    })
    if (transition === 'lease_lost') {
      throw new ChannelError(
        'lease_lost',
        'Channel operation lease was lost before the failure was recorded',
        true
      )
    }
    throw channelError
  }

  #settleReplay(
    outbound: {
      channel: string
      tenantId: string
      correlationId: string
      messageId: string
    },
    record: ChannelEffectRecord
  ): OutboundResult {
    if (record.state === 'CONFIRMED' && record.result) {
      this.#emit({
        type: 'channel.outbound.replayed',
        channel: outbound.channel,
        tenantId: outbound.tenantId,
        correlationId: outbound.correlationId,
        messageId: outbound.messageId
      })
      return record.result
    }
    if (record.state === 'FAILED') {
      throw new ChannelError(
        record.errorCode ?? 'send_failed',
        'Recorded channel operation failure',
        false
      )
    }
    if (record.state === 'UNCERTAIN') {
      this.#emit({
        type: 'channel.outbound.uncertain',
        channel: outbound.channel,
        tenantId: outbound.tenantId,
        correlationId: outbound.correlationId,
        messageId: outbound.messageId,
        code: record.errorCode ?? 'effect_uncertain'
      })
      throw new ChannelError(
        'effect_uncertain',
        'Channel operation effect is uncertain; reconcile before retrying',
        false
      )
    }
    throw new ChannelError(
      'operation_in_progress',
      'Channel operation is still in progress',
      true
    )
  }

  #emit(event: ChannelEvent): void {
    this.#onEvent?.(event)
  }
}
