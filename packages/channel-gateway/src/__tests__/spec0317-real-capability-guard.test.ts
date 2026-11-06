import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRealCapabilityGuards } from '@cvg/shared'
import {
  ChatwootChannelAdapter,
  ChannelGateway,
  ControlledFakeChannelAdapter,
  createExamDownloadTool,
  createExamUploadTool,
  EvolutionChannelAdapter,
  InMemoryChannelEffectJournal,
  type ChannelEvent,
  type ChannelGatewayComposition,
  type OutboundChannelAdapter
} from '../index.ts'
import {
  realChannelGuard,
  realComposition,
  syntheticComposition
} from './fixtures/channel-composition.ts'

const flagOff = createRealCapabilityGuards({ env: {} }).channels
const flagOnNoAuthorization = createRealCapabilityGuards({
  env: { ENABLE_REAL_CHANNELS: 'true' }
}).channels
const ragGuard = createRealCapabilityGuards({
  env: { ENABLE_REAL_RAG: 'true' },
  authorizations: {
    rag: { decisionId: 'T4-RAG', packageSha256: '1'.repeat(64) }
  }
}).rag

const closedGuards = [
  ['absent', undefined, 'guard_missing'],
  ['forged object', { capability: 'channels', open: true }, 'guard_missing'],
  ['flag false', flagOff, 'flag_disabled'],
  ['flag true without T4', flagOnNoAuthorization, 'authorization_missing'],
  ['guard of another capability', ragGuard, 'guard_capability_mismatch']
] as const

const adapters = [
  [
    'Evolution',
    (realCapabilityGuard: never, fetchImpl: typeof fetch) =>
      new EvolutionChannelAdapter({
        enabled: true,
        realCapabilityGuard,
        baseUrl: 'https://evolution.example',
        apiKey: 'synthetic',
        instance: 'synthetic',
        fetchImpl
      })
  ],
  [
    'Chatwoot',
    (realCapabilityGuard: never, fetchImpl: typeof fetch) =>
      new ChatwootChannelAdapter({
        enabled: true,
        realCapabilityGuard,
        baseUrl: 'https://chatwoot.example',
        apiKey: 'synthetic',
        accountId: '1',
        fetchImpl
      })
  ]
] as const

function outbound() {
  return {
    messageId: 'msg_0317',
    tenantId: 'tenant_synthetic',
    conversationId: 'conv_0317',
    channel: 'whatsapp' as const,
    recipient: { id: '5511000000000', type: 'phone' as const },
    body: { text: 'Mensagem fictícia', attachments: [] },
    correlationId: 'corr_0317_synthetic',
    idempotencyKey: 'idem_0317_synthetic',
    metadata: {}
  }
}

const context = {
  tenantId: 'tenant_synthetic',
  conversationId: 'conv_0317',
  correlationId: 'corr_0317_synthetic'
}

describe('SPEC 0317 G4 real channel adapters', () => {
  describe.each(adapters)('%s', (_name, build) => {
    it.each(closedGuards)(
      'refuses composition with guard %s before any I/O',
      (_label, guard, reason) => {
        const fetchImpl = vi.fn()
        expect(() =>
          build(guard as never, fetchImpl as unknown as typeof fetch)
        ).toThrowError(
          expect.objectContaining({
            code: 'real_capability_blocked',
            message: reason
          })
        )
        expect(fetchImpl).not.toHaveBeenCalled()
      }
    )

    it('stays disabled without a guard when nobody enabled it', () => {
      const adapter = new EvolutionChannelAdapter()
      expect(adapter.enabled).toBe(false)
    })

    it('cannot be classified as synthetic by the composition', () => {
      const adapter = build(
        realChannelGuard as never,
        vi.fn() as unknown as typeof fetch
      )
      expect(
        () =>
          new ChannelGateway({
            composition: syntheticComposition,
            outboundAdapters: [adapter]
          })
      ).toThrowError(
        expect.objectContaining({
          code: 'real_capability_blocked',
          message: 'real_adapter_in_synthetic_composition'
        })
      )
    })
  })
})

describe('SPEC 0317 G4 channel gateway composition', () => {
  it('refuses any adapter without a composition, including a self-declared one', () => {
    const selfDeclared = {
      channel: 'whatsapp',
      enabled: true,
      synthetic: true,
      send: vi.fn()
    } as unknown as OutboundChannelAdapter
    expect(
      () => new ChannelGateway({ outboundAdapters: [selfDeclared] })
    ).toThrowError(
      expect.objectContaining({
        code: 'real_capability_blocked',
        message: 'guard_missing'
      })
    )
    expect(selfDeclared.send).not.toHaveBeenCalled()
  })

  it('refuses a composition kind it does not know', () => {
    expect(
      () =>
        new ChannelGateway({
          composition: { kind: 'demo' } as unknown as ChannelGatewayComposition,
          outboundAdapters: [new ControlledFakeChannelAdapter()]
        })
    ).toThrowError(expect.objectContaining({ code: 'real_capability_blocked' }))
  })

  it.each(closedGuards)(
    'refuses a real composition with guard %s',
    (_label, guard, reason) => {
      expect(
        () =>
          new ChannelGateway({
            composition: {
              kind: 'real',
              guard: guard as never,
              authorizeDispatch: () => true
            },
            outboundAdapters: [new ControlledFakeChannelAdapter()]
          })
      ).toThrowError(
        expect.objectContaining({
          code: 'real_capability_blocked',
          message: reason
        })
      )
    }
  )

  it('needs a dispatch decision even with an open guard', () => {
    expect(
      () =>
        new ChannelGateway({
          composition: {
            kind: 'real',
            guard: realChannelGuard
          } as unknown as ChannelGatewayComposition,
          outboundAdapters: [new ControlledFakeChannelAdapter()]
        })
    ).toThrowError(
      expect.objectContaining({ message: 'dispatch_authorization_missing' })
    )
  })

  it.each([
    ['refused', () => false, 'dispatch_not_authorized'],
    ['truthy but not true', () => 'yes' as never, 'dispatch_not_authorized'],
    [
      'failing',
      () => {
        throw new Error('grant store offline')
      },
      'dispatch_authorization_failed'
    ]
  ])(
    'a %s decision blocks before journal and provider',
    async (_label, authorizeDispatch, message) => {
      const adapter = new ControlledFakeChannelAdapter()
      const send = vi.spyOn(adapter, 'send')
      const journal = new InMemoryChannelEffectJournal()
      const reserve = vi.spyOn(journal, 'reserve')
      const events: ChannelEvent[] = []
      const gateway = new ChannelGateway({
        composition: { ...realComposition, authorizeDispatch },
        outboundAdapters: [adapter],
        effectJournal: journal,
        onEvent: (event) => events.push(event)
      })

      await expect(
        gateway.dispatch(outbound(), { takeoverActive: false })
      ).rejects.toMatchObject({ code: 'real_capability_blocked', message })

      expect(send).not.toHaveBeenCalled()
      expect(reserve).not.toHaveBeenCalled()
      expect(events).toEqual([
        expect.objectContaining({
          type: 'channel.outbound.blocked',
          code: 'real_capability_blocked'
        })
      ])
      expect(JSON.stringify(events)).not.toContain('grant store offline')
    }
  )

  it('sends through a real composition only after guard and decision', async () => {
    const adapter = new ControlledFakeChannelAdapter()
    const authorizeDispatch = vi.fn(() => true)
    const gateway = new ChannelGateway({
      composition: { ...realComposition, authorizeDispatch },
      outboundAdapters: [adapter]
    })

    await expect(
      gateway.dispatch(outbound(), { takeoverActive: false })
    ).resolves.toMatchObject({ accepted: true })
    expect(authorizeDispatch).toHaveBeenCalledTimes(1)
    expect(adapter.sent).toHaveLength(1)
  })

  it('keeps takeover ahead of any authorization decision', async () => {
    const authorizeDispatch = vi.fn(() => true)
    const gateway = new ChannelGateway({
      composition: { ...realComposition, authorizeDispatch },
      outboundAdapters: [new ControlledFakeChannelAdapter()]
    })

    await expect(
      gateway.dispatch(outbound(), { takeoverActive: true })
    ).rejects.toMatchObject({ code: 'human_takeover_active' })
    expect(authorizeDispatch).not.toHaveBeenCalled()
  })

  it('keeps the synthetic fixture working with no external access', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const adapter = new ControlledFakeChannelAdapter()
    const gateway = new ChannelGateway({
      composition: syntheticComposition,
      inboundAdapters: [adapter],
      outboundAdapters: [adapter]
    })

    expect(
      gateway.ingest(
        'whatsapp',
        {
          externalId: 'fixture-1',
          senderId: 'sender',
          recipientId: 'recipient',
          text: 'Mensagem fictícia'
        },
        context
      ).accepted
    ).toBe(true)
    await expect(
      gateway.dispatch(outbound(), { takeoverActive: false })
    ).resolves.toMatchObject({ accepted: true })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('refuses a synthetic composition in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      expect(
        () =>
          new ChannelGateway({
            composition: syntheticComposition,
            outboundAdapters: [new ControlledFakeChannelAdapter()]
          })
      ).toThrowError(
        expect.objectContaining({
          message: 'synthetic_composition_forbidden_in_production'
        })
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('ignores self-declaration in the payload of the inbound and outbound paths', async () => {
    const send = vi.fn()
    const adapter = new ControlledFakeChannelAdapter()
    adapter.send = send
    const gateway = new ChannelGateway({
      composition: { ...realComposition, authorizeDispatch: () => false },
      outboundAdapters: [adapter]
    })

    await expect(
      gateway.dispatch(
        {
          ...outbound(),
          metadata: { synthetic: 'true', composition: 'synthetic' }
        },
        { takeoverActive: false }
      )
    ).rejects.toMatchObject({ code: 'real_capability_blocked' })
    expect(send).not.toHaveBeenCalled()
  })
})

describe('SPEC 0317 G4 exam egress', () => {
  const dirs: string[] = []
  afterEach(() => {
    while (dirs.length > 0) {
      rmSync(dirs.pop() as string, { recursive: true, force: true })
    }
  })

  function options() {
    const root = mkdtempSync(join(tmpdir(), 'cvg-0317-exam-'))
    dirs.push(root)
    writeFileSync(join(root, 'exam.txt'), 'synthetic')
    return {
      effectJournal: new InMemoryChannelEffectJournal(),
      workspaceRoot: root,
      urlGuard: { allowedHosts: ['exams.example.com'] },
      requireApproval: true,
      dnsLookup: async () => ['93.184.216.34']
    }
  }

  it.each(closedGuards)(
    'refuses both tools with guard %s before any I/O',
    (_label, guard, reason) => {
      const fetchImpl = vi.fn()
      for (const create of [createExamUploadTool, createExamDownloadTool]) {
        expect(() =>
          create({
            ...options(),
            realCapabilityGuard: guard as never,
            fetchImpl: fetchImpl as unknown as typeof fetch
          })
        ).toThrowError(
          expect.objectContaining({
            code: 'real_capability_blocked',
            message: reason
          })
        )
      }
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  )
})
