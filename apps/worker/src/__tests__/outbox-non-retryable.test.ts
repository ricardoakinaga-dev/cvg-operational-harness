import { TenantIdSchema } from '@cvg/platform'
import { InMemoryDatabase, OutboxRepository } from '@cvg/persistence'
import { describe, expect, it } from 'vitest'
import {
  NonRetryableOutboxError,
  processOutboxEvent
} from '../jobs/process-outbox-event.ts'
import { parseKernelTurnEnvelope } from '../kernel-composition.ts'

/**
 * ENGINE-PROD-FIX ENG-016: deterministic handler failures skip the retry
 * budget and go straight to dead-letter; other failures keep retrying.
 */

const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000162'
)
const correlationId = 'corr_00000000-0000-4000-8000-000000000162'

function adapterWithEvent(idempotencyKey: string) {
  const adapter = new OutboxRepository(new InMemoryDatabase())
  adapter.enqueue({
    tenantId,
    type: 'inbound.process',
    payload: { fixture: true },
    idempotencyKey,
    correlationId
  })
  return adapter
}

describe('outbox non-retryable handler failures', () => {
  it('dead-letters a non-retryable failure on the first attempt', async () => {
    const result = await processOutboxEvent({
      tenantId,
      workerId: 'worker-non-retryable',
      adapter: adapterWithEvent('worker-non-retryable-162'),
      effect: () => {
        throw new NonRetryableOutboxError('synthetic permanent failure')
      }
    })
    expect(result).toMatchObject({ status: 'dead_letter', attempts: 1 })
  })

  it('keeps an ordinary failure retryable', async () => {
    const result = await processOutboxEvent({
      tenantId,
      workerId: 'worker-retryable',
      adapter: adapterWithEvent('worker-retryable-162'),
      effect: () => {
        throw new Error('synthetic transient failure')
      }
    })
    expect(result).toMatchObject({ status: 'failed', attempts: 1 })
  })

  it('classifies an invalid kernel turn envelope as non-retryable', () => {
    expect(() => parseKernelTurnEnvelope('free text')).toThrow(
      NonRetryableOutboxError
    )
    expect(() =>
      parseKernelTurnEnvelope(JSON.stringify({ cvgTurn: { action: 'x' } }))
    ).toThrow(NonRetryableOutboxError)
  })
})
