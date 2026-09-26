import { describe, expect, it } from 'vitest'
import { ControlledDeliveryAdapter } from '@cvg/adapters'
import { ApprovalEngine } from '@cvg/approval-engine'
import {
  ChannelGateway,
  ControlledFakeChannelAdapter,
  InMemoryInboundDedupStore,
  InboundDeduplicator
} from '@cvg/channel-gateway'
import {
  DeterministicModelProvider,
  ModelGateway,
  ModelProviderError,
  PromptRegistry,
  type ModelProfile
} from '@cvg/model-gateway'
import { PolicyEngine, SECRETARY_POLICY_PROFILE } from '@cvg/policy-engine'
import { InMemoryDatabase, OutboxRepository } from '@cvg/persistence'
import { ChaosLedger } from '../faults.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const OTHER_TENANT = 'tenant_00000000-0000-4000-8000-000000000002'
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-09-11T12:00:00.000Z')

const ledger = new ChaosLedger()

function promptRegistry(): PromptRegistry {
  const registry = new PromptRegistry()
  registry.register({
    promptId: 'chaos',
    version: '1',
    content: 'chaos prompt',
    owner: 'platform',
    approvedBy: 'reviewer',
    status: 'approved',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    classification: 'INTERNAL',
    tenantId: TENANT
  })
  return registry
}

function modelProfile(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    name: 'fast',
    providerId: 'deterministic',
    model: 'deterministic-v1',
    location: 'local',
    temperature: 0,
    maxTokens: 64,
    timeoutMs: 5_000,
    maxCostUsd: 1,
    estimatedCostUsd: 0,
    maxRetries: 0,
    pricing: { inputPer1kUsd: 0, outputPer1kUsd: 0 },
    ...overrides
  }
}

function gatewayWith(
  provider: DeterministicModelProvider,
  overrides: Partial<ModelProfile> = {}
): ModelGateway {
  return new ModelGateway({
    providers: [provider],
    profiles: { fast: modelProfile(overrides) },
    prompts: promptRegistry(),
    clock: () => NOW,
    sleep: async () => undefined
  })
}

async function modelCall(gateway: ModelGateway): Promise<unknown> {
  return gateway.generate({
    requestId: 'req_chaos_00000001',
    tenantId: TENANT,
    correlationId: CORRELATION,
    promptId: 'chaos',
    promptVersion: '1',
    modelProfile: 'fast',
    dataClassification: 'INTERNAL',
    input: { messages: [{ role: 'user', content: 'ping' }] }
  })
}

describe('chaos: outbox and side effects', () => {
  it('CHAOS-01 worker crash before side effect: lease expires and another worker claims', async () => {
    let now = NOW
    const outbox = new OutboxRepository(new InMemoryDatabase(), {
      clock: () => now,
      leaseMs: 1_000
    })
    const event = outbox.enqueue({
      tenantId: TENANT,
      type: 'inbound.process',
      payload: {},
      idempotencyKey: 'chaos-key-0001',
      correlationId: CORRELATION
    })
    const first = outbox.claimNext({ tenantId: TENANT, workerId: 'worker-a' })
    expect(first?.id).toBe(event.id)
    now = new Date(now.getTime() + 1_001)
    const second = outbox.claimNext({ tenantId: TENANT, workerId: 'worker-b' })
    expect(second?.id).toBe(event.id)
    let effects = 0
    outbox.ack({
      tenantId: TENANT,
      eventId: event.id,
      workerId: 'worker-b',
      effect: () => {
        effects += 1
        return { ok: true }
      }
    })
    expect(effects).toBe(1)
    expect(outbox.findById(event.id, TENANT)?.status).toBe('processed')
    ledger.pass(
      'CHAOS-01',
      'worker crash before side effect',
      'lease takeover, 1 effect'
    )
  })

  it('CHAOS-02 worker crash after provider response: retry does not duplicate the effect', async () => {
    let now = NOW
    const outbox = new OutboxRepository(new InMemoryDatabase(), {
      clock: () => now,
      leaseMs: 1_000
    })
    const delivery = new ControlledDeliveryAdapter(false)
    const event = outbox.enqueue({
      tenantId: TENANT,
      type: 'message.outbound',
      payload: {},
      idempotencyKey: 'chaos-key-0002',
      correlationId: CORRELATION
    })
    const first = outbox.claimNext({ tenantId: TENANT, workerId: 'worker-a' })
    expect(first?.id).toBe(event.id)
    await delivery.send({
      tenantId: TENANT,
      recipientRef: 'r',
      body: 'b',
      idempotencyKey: 'chaos-key-0002',
      correlationId: CORRELATION
    })
    now = new Date(now.getTime() + 1_001)
    outbox.claimNext({ tenantId: TENANT, workerId: 'worker-b' })
    await outbox.ack({
      tenantId: TENANT,
      eventId: event.id,
      workerId: 'worker-b',
      effect: async () =>
        delivery.send({
          tenantId: TENANT,
          recipientRef: 'r',
          body: 'b',
          idempotencyKey: 'chaos-key-0002',
          correlationId: CORRELATION
        })
    })
    expect(delivery.count(TENANT)).toBe(1)
    ledger.pass(
      'CHAOS-02',
      'worker crash after provider response',
      'journal deduped'
    )
  })

  it('CHAOS-03 worker crash after external effect before ack: exactly one external effect', async () => {
    let now = NOW
    const outbox = new OutboxRepository(new InMemoryDatabase(), {
      clock: () => now,
      leaseMs: 1_000,
      retryBaseMs: 100,
      retryMaxMs: 1_000
    })
    const delivery = new ControlledDeliveryAdapter(false)
    const event = outbox.enqueue({
      tenantId: TENANT,
      type: 'message.outbound',
      payload: {},
      idempotencyKey: 'chaos-key-0003',
      correlationId: CORRELATION
    })
    outbox.claimNext({ tenantId: TENANT, workerId: 'worker-a' })
    await expect(
      outbox.ack({
        tenantId: TENANT,
        eventId: event.id,
        workerId: 'worker-a',
        effect: async () => {
          await delivery.send({
            tenantId: TENANT,
            recipientRef: 'r',
            body: 'b',
            idempotencyKey: 'chaos-key-0003',
            correlationId: CORRELATION
          })
          throw new Error('crash after external effect')
        }
      })
    ).rejects.toThrow('crash after external effect')
    outbox.fail({
      tenantId: TENANT,
      eventId: event.id,
      workerId: 'worker-a',
      error: new Error('crash after external effect')
    })
    now = new Date(now.getTime() + 2_000)
    const reclaimed = outbox.claimNext({
      tenantId: TENANT,
      workerId: 'worker-b'
    })
    expect(reclaimed?.id).toBe(event.id)
    await outbox.ack({
      tenantId: TENANT,
      eventId: event.id,
      workerId: 'worker-b',
      effect: async () =>
        delivery.send({
          tenantId: TENANT,
          recipientRef: 'r',
          body: 'b',
          idempotencyKey: 'chaos-key-0003',
          correlationId: CORRELATION
        })
    })
    expect(delivery.count(TENANT)).toBe(1)
    ledger.pass(
      'CHAOS-03',
      'crash after effect before ack',
      '1 external effect'
    )
  })

  it('CHAOS-14 duplicate worker claim: only one owner at a time', () => {
    const outbox = new OutboxRepository(new InMemoryDatabase(), {
      clock: () => NOW,
      leaseMs: 1_000
    })
    outbox.enqueue({
      tenantId: TENANT,
      type: 'inbound.process',
      payload: {},
      idempotencyKey: 'chaos-key-0014',
      correlationId: CORRELATION
    })
    expect(
      outbox.claimNext({ tenantId: TENANT, workerId: 'worker-a' })
    ).not.toBeNull()
    expect(
      outbox.claimNext({ tenantId: TENANT, workerId: 'worker-b' })
    ).toBeNull()
    ledger.pass('CHAOS-14', 'duplicate worker claim', 'single owner enforced')
  })
})

describe('chaos: providers and latency', () => {
  it('CHAOS-06 provider timeout is bounded by the deadline', async () => {
    const provider = new DeterministicModelProvider({
      latencyMs: 5_000
    })
    const gateway = gatewayWith(provider, { timeoutMs: 100 })
    await expect(modelCall(gateway)).rejects.toMatchObject({
      code: 'provider_timeout'
    })
    ledger.pass('CHAOS-06', 'provider timeout', 'deadline enforced')
  })

  it('CHAOS-07 provider 429 is retried with bounded backoff', async () => {
    let calls = 0
    const provider = new DeterministicModelProvider({
      respond: () => {
        calls += 1
        if (calls === 1) {
          throw new ModelProviderError(
            'deterministic',
            'rate_limited',
            '429',
            429
          )
        }
        return {
          text: 'ok',
          usage: { inputTokens: 0, outputTokens: 0 },
          providerId: 'deterministic',
          model: 'deterministic-v1',
          externalCall: false
        }
      }
    })
    const gateway = new ModelGateway({
      providers: [provider],
      profiles: { fast: modelProfile({ maxRetries: 1 }) },
      prompts: promptRegistry(),
      clock: () => NOW,
      sleep: async () => undefined,
      random: () => 0.5
    })
    const result = (await modelCall(gateway)) as { attempts: number }
    expect(result.attempts).toBe(2)
    ledger.pass('CHAOS-07', 'provider 429', 'retried once')
  })

  it('CHAOS-08 provider 503 fails closed with provider_unavailable', async () => {
    const provider = new DeterministicModelProvider({
      respond: () => {
        throw new ModelProviderError('deterministic', 'unavailable', '503', 503)
      }
    })
    const gateway = gatewayWith(provider)
    await expect(modelCall(gateway)).rejects.toMatchObject({
      code: 'provider_unavailable'
    })
    ledger.pass('CHAOS-08', 'provider 503', 'fail closed')
  })

  it('CHAOS-15 network latency: slow success still completes inside the deadline', async () => {
    const provider = new DeterministicModelProvider({
      latencyMs: 50,
      respond: () => ({
        text: 'slow ok',
        usage: { inputTokens: 0, outputTokens: 0 },
        providerId: 'deterministic',
        model: 'deterministic-v1',
        externalCall: false
      })
    })
    const gateway = gatewayWith(provider, { timeoutMs: 2_000 })
    const started = Date.now()
    const result = (await modelCall(gateway)) as { output: { text: string } }
    expect(result.output.text).toBe('slow ok')
    expect(Date.now() - started).toBeGreaterThanOrEqual(40)
    ledger.pass('CHAOS-15', 'network latency', 'slow success honored')
  })
})

describe('chaos: channels and idempotency', () => {
  it('CHAOS-09 duplicate webhook produces a single inbound event', () => {
    const events: string[] = []
    const gateway = new ChannelGateway({
      inboundAdapters: [new ControlledFakeChannelAdapter({ clock: () => NOW })],
      onEvent: (event) => events.push(event.type)
    })
    const raw = {
      externalId: 'CHAOS-DUP',
      senderId: '5511999999999',
      recipientId: 'instance',
      text: 'oi'
    }
    const context = {
      tenantId: TENANT,
      conversationId: 'conv',
      correlationId: CORRELATION
    }
    gateway.ingest('whatsapp', raw, context)
    gateway.ingest('whatsapp', raw, context)
    expect(
      events.filter((type) => type === 'channel.inbound.accepted')
    ).toHaveLength(1)
    ledger.pass('CHAOS-09', 'duplicate webhook', '1 inbound event')
  })

  it('CHAOS-10 out-of-order webhooks are all accepted without loss', () => {
    const gateway = new ChannelGateway({
      inboundAdapters: [new ControlledFakeChannelAdapter({ clock: () => NOW })]
    })
    const context = {
      tenantId: TENANT,
      conversationId: 'conv',
      correlationId: CORRELATION
    }
    for (const externalId of ['OUT-3', 'OUT-1', 'OUT-2']) {
      const result = gateway.ingest(
        'whatsapp',
        {
          externalId,
          senderId: '5511999999999',
          recipientId: 'instance',
          text: externalId
        },
        context
      )
      expect(result.accepted).toBe(true)
    }
    ledger.pass('CHAOS-10', 'out-of-order webhook', '0 lost messages')
  })

  it('CHAOS-13 replayed token is rejected by the replay store', () => {
    let now = NOW.getTime()
    const store = new InMemoryInboundDedupStore({ clock: () => now })
    const replay = new InboundDeduplicator({
      store,
      ttlMs: 1_000,
      clock: () => now
    })
    expect(replay.accept({ idempotencyKey: 'token-abc' }).accepted).toBe(true)
    expect(replay.accept({ idempotencyKey: 'token-abc' }).accepted).toBe(false)
    now += 1_001
    expect(replay.accept({ idempotencyKey: 'token-abc' }).accepted).toBe(true)
    ledger.pass('CHAOS-13', 'replayed token', 'replay rejected, TTL bounded')
  })

  it('CHAOS-16 channel provider outage: retry sends exactly once', async () => {
    const adapter = new ControlledFakeChannelAdapter({ clock: () => NOW })
    const gateway = new ChannelGateway({ outboundAdapters: [adapter] })
    const message = {
      messageId: 'msg_chaos_16',
      tenantId: TENANT,
      conversationId: 'conv',
      channel: 'whatsapp' as const,
      recipient: { id: '5511999999999', type: 'phone' as const },
      body: { text: 'oi', attachments: [] },
      correlationId: CORRELATION,
      idempotencyKey: 'chaos-out-key-16',
      metadata: {}
    }
    adapter.failNextSend()
    await expect(
      gateway.dispatch(message, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'send_failed', retryable: true })
    await gateway.dispatch(message, { takeoverActive: false })
    expect(adapter.sent).toHaveLength(1)
    ledger.pass('CHAOS-16', 'channel provider outage', 'retry sent once')
  })
})

describe('chaos: approvals and tenants', () => {
  it('CHAOS-11 expired approval fails closed during execution', () => {
    let now = NOW
    const approvals = new ApprovalEngine({ clock: () => now })
    const record = approvals.request({
      tenantId: TENANT,
      operatorId: 'op_1',
      agentId: 'agent_1',
      agentVersion: 'v1',
      action: 'appointment.cancel',
      resource: { type: 'appointment', id: 'apt_1' },
      payload: { reason: 'x' },
      policyVersion: 'v1',
      correlationId: CORRELATION,
      expiresInMs: 1_000
    })
    approvals.submit(TENANT, record.approvalId, 'op_1')
    approvals.approve(TENANT, record.approvalId, { approverId: 'op_2' })
    now = new Date(now.getTime() + 1_001)
    expect(() =>
      approvals.verifyAndConsume({
        tenantId: TENANT,
        approvalId: record.approvalId,
        action: 'appointment.cancel',
        resource: { type: 'appointment', id: 'apt_1' },
        payload: { reason: 'x' }
      })
    ).toThrowError(expect.objectContaining({ code: 'expired' }))
    ledger.pass('CHAOS-11', 'expired approval', 'fail closed')
  })

  it('CHAOS-12 tenant mismatch is denied across approval and policy boundaries', () => {
    const approvals = new ApprovalEngine({ clock: () => NOW })
    const record = approvals.request({
      tenantId: TENANT,
      operatorId: 'op_1',
      agentId: 'agent_1',
      agentVersion: 'v1',
      action: 'appointment.cancel',
      resource: { type: 'appointment', id: 'apt_1' },
      payload: {},
      policyVersion: 'v1',
      correlationId: CORRELATION
    })
    expect(() => approvals.get(OTHER_TENANT, record.approvalId)).toThrowError(
      expect.objectContaining({ code: 'not_found' })
    )
    const policy = new PolicyEngine({
      profile: SECRETARY_POLICY_PROFILE,
      clock: () => NOW
    })
    const decision = policy.evaluate({
      tenantId: TENANT,
      operatorId: 'op_1',
      operatorRole: 'Supervisor',
      agentId: 'agent_1',
      agentProfile: 'secretary',
      capability: 'appointment.modify',
      action: 'appointment.modify',
      correlationId: CORRELATION,
      resource: { type: 'appointment', id: 'apt_1', tenantId: OTHER_TENANT }
    })
    expect(decision.decision).toBe('DENY')
    expect(decision.reason).toBe('tenant_mismatch')
    ledger.pass('CHAOS-12', 'tenant mismatch', '0 cross-tenant access')
  })
})

describe('chaos ledger', () => {
  it('records every scenario with an explicit status', () => {
    const summary = ledger.summary()
    expect(summary.failed).toBe(0)
    expect(summary.executed + summary.notExecuted).toBe(16)
    expect(summary.passed).toBe(summary.executed)
  })
})
