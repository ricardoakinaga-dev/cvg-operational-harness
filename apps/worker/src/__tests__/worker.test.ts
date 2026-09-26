import {
  ensureControlledAgentPreset,
  createControlledReferencePreset,
  InMemoryControlPlaneStore,
  TenantIdSchema
} from '@cvg/platform'
import { InMemoryDatabase, OutboxRepository } from '@cvg/persistence'
import { describe, expect, it } from 'vitest'
import { workerHealth } from '../health.ts'
import { processAgentTurnJob } from '../jobs/process-agent-turn.ts'
import { processOutboxEvent } from '../jobs/process-outbox-event.ts'

const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000134'
)

describe('worker runtime', () => {
  it('reports health and processes deterministic jobs', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await ensureControlledAgentPreset(
      platform,
      createControlledReferencePreset(),
      tenantId,
      'worker.test'
    )
    const version = await platform.resolvePublished({ tenantId }, agent.id)
    if (!version) throw new Error('Worker fixture did not publish a version')

    await expect(
      processAgentTurnJob(
        {
          tenantId,
          agentId: agent.id,
          versionId: version.id,
          message: 'Mensagem determinística',
          history: [],
          sessionId: 'sess_1'
        },
        { platform }
      )
    ).resolves.toMatchObject({ status: 'completed' })
    const outbox = new OutboxRepository(new InMemoryDatabase())
    const queued = outbox.enqueue({
      tenantId,
      type: 'message.outbound',
      payload: { fixture: true },
      idempotencyKey: 'worker-outbox-1',
      correlationId: 'corr_00000000-0000-4000-8000-000000000134'
    })
    await expect(
      processOutboxEvent({
        tenantId,
        workerId: 'worker_fixture',
        adapter: outbox,
        effect: () => ({ delivered: false })
      })
    ).resolves.toMatchObject({
      id: queued.id,
      type: 'message.outbound',
      status: 'processed'
    })
    expect(workerHealth()).toEqual({ status: 'ok' })
  })
})
