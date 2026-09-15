import { describe, expect, it } from 'vitest'
import { composePrompt } from '../prompt-composer.ts'
import type { AgentConfig, ModelConfig } from '../contracts.ts'
import {
  createControlledModelProviderRegistry,
  createDryRunModelProvider,
  DeterministicModelProvider,
  ModelProviderRegistry,
  type ModelProvider
} from '../model-provider.ts'
import { RetentionLedger } from '../retention-ledger.ts'
import {
  createAgentId,
  createAgentVersionId,
  createTenantId,
  createTraceId
} from '../ids.ts'
import {
  assertPlatformIds,
  assertTraceId,
  AgentConfigSchema
} from '../contracts.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000441' as const
const modelConfig = AgentConfigSchema.shape.model.parse({
  provider: 'fake',
  model: 'deterministic-v1',
  temperature: 0,
  maxTokens: 128,
  timeoutMs: 1000,
  retries: 0,
  secretRef: 'secret://controlled/fake'
})

describe('prompt composer ordering', () => {
  it('breaks priority ties by block id and filters disabled blocks', () => {
    const composed = composePrompt({
      promptBlocks: [
        {
          id: 'beta',
          kind: 'persona',
          content: 'B',
          priority: 10,
          enabled: true
        },
        {
          id: 'alpha',
          kind: 'persona',
          content: 'A',
          priority: 10,
          enabled: true
        },
        {
          id: 'safety',
          kind: 'safety',
          content: 'S',
          priority: 0,
          enabled: true
        },
        {
          id: 'disabled',
          kind: 'persona',
          content: 'X',
          priority: 1,
          enabled: false
        }
      ]
    } as AgentConfig)

    expect(composed).toEqual({
      blockIds: ['safety', 'alpha', 'beta'],
      text: 'S\n\nA\n\nB'
    })
  })
})

describe('controlled model provider branches', () => {
  it('accepts only the exact controlled configuration', async () => {
    const provider = new DeterministicModelProvider(modelConfig)
    await expect(
      provider.complete({ prompt: 'ignored', fallbackText: 'fallback' })
    ).resolves.toEqual({
      text: 'fallback',
      provider: 'fake',
      model: 'deterministic-v1',
      externalCall: false
    })

    expect(
      () =>
        new DeterministicModelProvider({
          ...modelConfig,
          provider: 'openai'
        })
    ).toThrow(/unavailable/)
    expect(
      () =>
        new DeterministicModelProvider({
          ...modelConfig,
          model: 'deterministic-v2'
        })
    ).toThrow(/unavailable/)
    expect(
      () =>
        new DeterministicModelProvider({
          ...modelConfig,
          fallbackProvider: 'fake'
        } as ModelConfig)
    ).toThrow(/unavailable/)
  })

  it('freezes custom provider registrations and resolves them immutably', async () => {
    const custom: ModelProvider = {
      name: 'custom.fixture',
      supportedModels: ['fixture-v1'],
      complete: async ({ fallbackText }) => ({
        text: fallbackText,
        provider: 'custom.fixture',
        model: 'fixture-v1',
        externalCall: false
      })
    }
    const registry = new ModelProviderRegistry([custom])
    const resolved = registry.resolve('custom.fixture')

    expect(resolved).not.toBeNull()
    expect(resolved).not.toBe(custom)
    expect(Object.isFrozen(resolved)).toBe(true)
    expect(Object.isFrozen(resolved?.supportedModels)).toBe(true)
    await expect(
      resolved?.complete({ prompt: 'p', fallbackText: 'fixture' })
    ).resolves.toMatchObject({ text: 'fixture' })
    expect(
      registry.resolveForConfig({
        ...modelConfig,
        provider: 'custom.fixture',
        model: 'fixture-v1'
      })
    ).toBe(resolved)
    expect(() => registry.register(custom)).toThrow(/already registered/)
  })

  it('keeps the compiled registry deterministic and closed', () => {
    const registry = createControlledModelProviderRegistry()
    const compiled = registry.resolveForConfig(modelConfig)
    const dryRun = createDryRunModelProvider(modelConfig)
    expect(compiled).toBeInstanceOf(DeterministicModelProvider)
    expect(dryRun).toBeInstanceOf(DeterministicModelProvider)
    expect(compiled.name).toBe(dryRun.name)
    expect(compiled.supportedModels).toEqual(dryRun.supportedModels)
    expect(registry.list()).toHaveLength(1)
  })
})

describe('retention ledger validation branches', () => {
  it('validates kind, expiry, metadata and clock inputs', () => {
    const ledger = new RetentionLedger()
    const future = new Date(Date.now() + 60_000)

    expect(
      ledger.append({ tenantId, kind: 'metric', expiresAt: future }).kind
    ).toBe('metric')
    expect(() =>
      ledger.append({
        tenantId,
        kind: 'metric',
        expiresAt: new Date(Date.now() - 1)
      })
    ).toThrow(/Retention expiry is invalid/)
    expect(() =>
      ledger.append({
        tenantId,
        kind: 'metric',
        expiresAt: new Date('invalid')
      })
    ).toThrow(/Retention expiry is invalid/)
    expect(() =>
      ledger.append({
        tenantId,
        kind: 'unknown' as never,
        expiresAt: future
      })
    ).toThrow(/Retention kind is invalid/)
    expect(() =>
      ledger.append({
        tenantId,
        kind: 'metric',
        expiresAt: future,
        metadata: { 'invalid key': 'value' }
      })
    ).toThrow(/Retention metadata is invalid/)
    expect(() =>
      ledger.append({
        tenantId,
        kind: 'metric',
        expiresAt: future,
        metadata: { key: 42 as never }
      })
    ).toThrow(/Retention metadata is invalid/)
    expect(() =>
      ledger.append({
        tenantId,
        kind: 'metric',
        expiresAt: future,
        metadata: { key: 'x'.repeat(121) }
      })
    ).toThrow(/Retention metadata is invalid/)

    const frozenClock = new RetentionLedger(() => new Date('invalid'))
    expect(() =>
      frozenClock.append({ tenantId, kind: 'metric', expiresAt: future })
    ).toThrow(/Retention clock is invalid/)
  })
})

describe('platform id factories and assertions', () => {
  it('creates well-formed ids and asserts valid and invalid scopes', () => {
    expect(createTenantId()).toMatch(/^tenant_[0-9a-f-]{36}$/)
    expect(createAgentId()).toMatch(/^agent_[0-9a-f-]{36}$/)
    expect(createAgentVersionId()).toMatch(/^agent_version_[0-9a-f-]{36}$/)
    expect(createTraceId()).toMatch(/^trace_[0-9a-f-]{36}$/)

    const valid = {
      tenantId: createTenantId(),
      agentId: createAgentId(),
      versionId: createAgentVersionId()
    }
    expect(() => assertPlatformIds(valid)).not.toThrow()
    expect(() =>
      assertPlatformIds({ ...valid, tenantId: 'tenant-invalid' as never })
    ).toThrow()
    expect(() =>
      assertPlatformIds({ ...valid, agentId: 'agent-invalid' as never })
    ).toThrow()
    expect(() =>
      assertPlatformIds({ ...valid, versionId: 'version-invalid' as never })
    ).toThrow()

    expect(() => assertTraceId(createTraceId())).not.toThrow()
    expect(() => assertTraceId('trace-invalid')).toThrow()
  })
})
