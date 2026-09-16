// P1 falsification probe F04 (AAA-12): two concurrent channel gateway sends
// with the same identity must produce exactly one provider send.
// Uses the durable FileChannelEffectJournal shared by two gateway instances.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CanonicalOutboundMessageSchema,
  type CanonicalOutboundMessage,
  type CanonicalOutboundMessageInput,
  type OutboundChannelAdapter,
  type OutboundResult
} from '/home/ricardo/cvg-agent-secretary-v2/packages/channel-gateway/src/contracts.ts'
import { ChannelGateway } from '/home/ricardo/cvg-agent-secretary-v2/packages/channel-gateway/src/gateway.ts'
import { FileChannelEffectJournal } from '/home/ricardo/cvg-agent-secretary-v2/packages/channel-gateway/src/effect-journal-file.ts'
import { report } from './harness.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-0000000000f4'
const CORRELATION = 'corr_00000000-0000-4000-8000-0000000000f4'
const KEY = `${TENANT}:whatsapp:probe-f04-key`

class SlowCountingAdapter implements OutboundChannelAdapter {
  readonly channel = 'whatsapp'
  readonly enabled = true
  readonly sent: CanonicalOutboundMessage[] = []
  async send(message: CanonicalOutboundMessage): Promise<OutboundResult> {
    await new Promise((resolve) => setTimeout(resolve, 60))
    this.sent.push(message)
    return {
      externalId: `ext_${this.sent.length}`,
      channel: 'whatsapp',
      accepted: true,
      sentAt: new Date().toISOString()
    }
  }
}

function outbound(
  overrides: Partial<CanonicalOutboundMessageInput> = {}
): CanonicalOutboundMessageInput {
  return CanonicalOutboundMessageSchema.parse({
    messageId: 'msg_f04',
    tenantId: TENANT,
    conversationId: 'conv_f04',
    channel: 'whatsapp',
    recipient: { id: '5511999999999', type: 'phone' },
    body: { text: 'probe f04', attachments: [] },
    correlationId: CORRELATION,
    idempotencyKey: KEY,
    metadata: {},
    ...overrides
  })
}

async function main(): Promise<void> {
  const failures: string[] = []
  const dir = await mkdtemp(join(tmpdir(), 'p1-f04-'))
  const adapter = new SlowCountingAdapter()
  const journal = new FileChannelEffectJournal({
    directory: dir,
    clock: () => Date.now()
  })
  const gwA = new ChannelGateway({
    outboundAdapters: [adapter],
    effectJournal: journal,
    leaseOwner: 'worker-A',
    waitTimeoutMs: 5_000
  })
  const gwB = new ChannelGateway({
    outboundAdapters: [adapter],
    effectJournal: new FileChannelEffectJournal({
      directory: dir,
      clock: () => Date.now()
    }),
    leaseOwner: 'worker-B',
    waitTimeoutMs: 5_000
  })

  const results = await Promise.allSettled([
    gwA.dispatch(outbound(), { takeoverActive: false }),
    gwB.dispatch(outbound(), { takeoverActive: false })
  ])
  const fulfilled = results.filter((r) => r.status === 'fulfilled')
  const rejected = results.filter((r) => r.status === 'rejected')

  if (adapter.sent.length !== 1) {
    failures.push(`provider sends = ${adapter.sent.length} (expected 1)`)
  }
  if (fulfilled.length !== 2) {
    failures.push(
      `fulfilled dispatches = ${fulfilled.length}; rejected=${JSON.stringify(
        rejected.map((r) => String((r as PromiseRejectedResult).reason))
      )}`
    )
  }
  const identity = {
    tenantId: TENANT,
    channel: 'whatsapp',
    operationKind: 'outbound_message' as const,
    idempotencyKey: KEY
  }
  const record = await journal.find(identity)
  if (record?.state !== 'CONFIRMED') {
    failures.push(`journal state = ${record?.state}`)
  }
  if (record?.attempt !== undefined && record.attempt !== 1) {
    failures.push(`journal attempt = ${record.attempt}`)
  }

  // Replay after a fresh gateway over the same durable directory: no resend.
  const gwC = new ChannelGateway({
    outboundAdapters: [adapter],
    effectJournal: new FileChannelEffectJournal({
      directory: dir,
      clock: () => Date.now()
    }),
    leaseOwner: 'worker-C',
    waitTimeoutMs: 5_000
  })
  const replay = await gwC.dispatch(outbound(), { takeoverActive: false })
  if (adapter.sent.length !== 1) {
    failures.push(
      `provider sends after restart replay = ${adapter.sent.length}`
    )
  }
  if (replay.externalId !== 'ext_1') {
    failures.push(`replayed result externalId = ${replay.externalId}`)
  }

  // Same key with a different payload -> idempotency_key_reuse, no new send.
  let conflictCode: string | undefined
  try {
    await gwC.dispatch(
      outbound({ body: { text: 'different payload', attachments: [] } }),
      { takeoverActive: false }
    )
  } catch (error) {
    conflictCode = (error as { code?: string }).code
  }
  if (conflictCode !== 'idempotency_key_reuse') {
    failures.push(`conflict code = ${conflictCode}`)
  }
  if (adapter.sent.length !== 1) {
    failures.push(`provider sends after conflict = ${adapter.sent.length}`)
  }

  // hash_version fail-closed: a record persisted with the legacy version must
  // never be silently compared against the shared-version payload hash.
  const identity2 = {
    tenantId: TENANT,
    channel: 'whatsapp',
    operationKind: 'outbound_message' as const,
    idempotencyKey: `${TENANT}:whatsapp:probe-f04-legacy`
  }
  const journal2 = new FileChannelEffectJournal({
    directory: dir,
    clock: () => Date.now()
  })
  const legacyReserve = await journal2.reserve({
    identity: identity2,
    payloadHash: 'b'.repeat(64),
    hashVersion: 'legacy-local-v1',
    leaseOwner: 'legacy-worker',
    leaseMs: 30_000
  })
  if (legacyReserve.outcome !== 'reserved')
    failures.push(`legacy reserve=${legacyReserve.outcome}`)
  const gwLegacy = new ChannelGateway({
    outboundAdapters: [adapter],
    effectJournal: journal2,
    leaseOwner: 'worker-legacy',
    waitTimeoutMs: 5_000
  })
  let versionCode: string | undefined
  try {
    await gwLegacy.dispatch(
      outbound({
        idempotencyKey: `${TENANT}:whatsapp:probe-f04-legacy`,
        messageId: 'msg_f04_legacy'
      }),
      { takeoverActive: false }
    )
  } catch (error) {
    versionCode = (error as { code?: string }).code
  }
  if (versionCode !== 'hash_algorithm_mismatch') {
    failures.push(`version mismatch code = ${versionCode}`)
  }
  if (adapter.sent.length !== 1) {
    failures.push(
      `provider sends after version mismatch = ${adapter.sent.length}`
    )
  }

  // Actor alignment: reconciliation requires an accountable actor+reason, and
  // a non-UNCERTAIN record can never be reopened.
  const identity3 = {
    tenantId: TENANT,
    channel: 'whatsapp',
    operationKind: 'outbound_message' as const,
    idempotencyKey: `${TENANT}:whatsapp:probe-f04-actor`
  }
  const journal3 = new FileChannelEffectJournal({
    directory: dir,
    clock: () => Date.now()
  })
  await journal3.reserve({
    identity: identity3,
    payloadHash: 'c'.repeat(64),
    hashVersion: 'shared-rfc8785-subset-v1',
    leaseOwner: 'actor-worker',
    leaseMs: 30_000
  })
  await journal3.claimSend(identity3, 'actor-worker')
  await journal3.markUncertain(identity3, 'actor-worker', 'send_failed')
  const actorCodes: Record<string, string | undefined> = {}
  try {
    await journal3.resolveUncertain(
      identity3,
      { kind: 'not_effected' },
      { actorId: '', reason: '' }
    )
  } catch (error) {
    actorCodes.noActor = (error as { code?: string }).code
  }
  const notEffected = await journal3.resolveUncertain(
    identity3,
    { kind: 'not_effected' },
    { actorId: 'op_reviewer', reason: 'provider reports no delivery' }
  )
  if (notEffected.state !== 'PENDING') {
    failures.push(`resolve not_effected state = ${notEffected.state}`)
  }
  try {
    await journal3.resolveUncertain(
      identity3,
      { kind: 'not_effected' },
      { actorId: 'op_reviewer', reason: 'repeat' }
    )
  } catch (error) {
    actorCodes.terminal = (error as { code?: string }).code
  }
  if (actorCodes.noActor !== 'reconciliation_required') {
    failures.push(`actorless reconciliation code = ${actorCodes.noActor}`)
  }
  if (actorCodes.terminal !== 'reconciliation_required') {
    failures.push(`terminal reconciliation code = ${actorCodes.terminal}`)
  }
  if (adapter.sent.length !== 1) {
    failures.push(
      `provider sends after reconciliation checks = ${adapter.sent.length}`
    )
  }

  report('F04-channel-concurrency', {
    directory: dir,
    providerSends: adapter.sent.length,
    fulfilled: fulfilled.length,
    rejected: rejected.length,
    journalState: record?.state ?? null,
    replayExternalId: replay.externalId,
    conflictCode,
    versionCode,
    actorCodes,
    failures
  })

  await rm(dir, { recursive: true, force: true })
  console.log(
    JSON.stringify({ probe: 'F04', falsified: failures.length > 0, failures })
  )
  if (failures.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
