import { describe, expect, it } from 'vitest'
import { ControlledFakeChannelAdapter } from '../adapters/fake.ts'
import { ChannelGateway } from '../gateway.ts'
import {
  CanonicalOutboundMessageSchema,
  type CanonicalOutboundMessageInput
} from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-0000000000a1'
const CORRELATION = 'corr_00000000-0000-4000-8000-0000000000a1'
const NOW = new Date('2026-09-12T12:00:00.000Z')

function outbound(overrides: Partial<CanonicalOutboundMessageInput> = {}) {
  return CanonicalOutboundMessageSchema.parse({
    messageId: 'msg_race_1',
    tenantId: TENANT,
    conversationId: 'conv_race',
    channel: 'whatsapp',
    recipient: { id: '5511999999999', type: 'phone' },
    body: { text: 'ola concorrencia', attachments: [] },
    correlationId: CORRELATION,
    idempotencyKey: `${TENANT}:whatsapp:race-1`,
    metadata: {},
    ...overrides
  })
}

describe('AUD-20260912-F04 regression: concurrent outbound dispatch', () => {
  it('Promise.all of two identical dispatches produces exactly one provider send', async () => {
    const adapter = new ControlledFakeChannelAdapter({ clock: () => NOW })
    const gateway = new ChannelGateway({ outboundAdapters: [adapter] })

    const [first, second] = await Promise.all([
      gateway.dispatch(outbound(), { takeoverActive: false }),
      gateway.dispatch(outbound(), { takeoverActive: false })
    ])

    expect(adapter.sent).toHaveLength(1)
    expect(second).toEqual(first)
  })

  it('rejects a reused idempotency key carrying a different payload', async () => {
    const adapter = new ControlledFakeChannelAdapter({ clock: () => NOW })
    const gateway = new ChannelGateway({ outboundAdapters: [adapter] })

    await gateway.dispatch(outbound(), { takeoverActive: false })
    await expect(
      gateway.dispatch(
        outbound({ body: { text: 'payload diferente', attachments: [] } }),
        { takeoverActive: false }
      )
    ).rejects.toMatchObject({ code: 'idempotency_key_reuse' })
    expect(adapter.sent).toHaveLength(1)
  })
})
