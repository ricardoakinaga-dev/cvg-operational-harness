import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CANONICAL_JSON_MAX_NODES,
  CanonicalJsonError,
  canonicalizeJson,
  type ModelRequest,
  type StepContext
} from '@cvg/harness-contracts'
import {
  HybridOrchestrator,
  OrchestratorDecisionError,
  ScriptedModelGateway,
  SinglePassOrchestrator,
  StaticOrchestrator
} from '@cvg/harness-orchestrator'
import {
  compactConversation,
  createCompactionControl,
  createSessionCompactionRecorder
} from '../compaction.ts'
import { createKernelRuntime } from '../kernel/profile.ts'
import { createSessionKernelLog } from '../session/kernel-log.ts'
import { InMemorySessionEventStore } from '../session/memory.ts'
import {
  SessionEventError,
  sessionEventFingerprint
} from '../session/events.ts'
import {
  SessionFormatMigrationError,
  createSessionFormatRegistry,
  sessionFormatDefinitionV1,
  type SessionFormatDefinition,
  type SessionFormatEvent,
  type SessionFormatStep
} from '../session/format-migration.ts'
import { assertSkillsAvailable } from '../skills/assert.ts'
import { loadSkillsFromDirectory } from '../skills/loader.ts'
import { createSkillRegistry } from '../skills/registry.ts'
import {
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine,
  createPhase3ToolRegistry,
  phase3AgentProfile,
  phase3RuntimeInput
} from './fixtures/phase3-fixtures.ts'

const tempRoots: string[] = []

function tempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  vi.restoreAllMocks()
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop() as string, { recursive: true, force: true })
  }
})

function canonicalCode(fn: () => unknown): string | undefined {
  try {
    fn()
    return undefined
  } catch (error) {
    return error instanceof CanonicalJsonError
      ? error.code
      : `unexpected:${String(error)}`
  }
}

function migrationCode(fn: () => unknown): string | undefined {
  try {
    fn()
    return undefined
  } catch (error) {
    return error instanceof SessionFormatMigrationError
      ? error.code
      : `unexpected:${String(error)}`
  }
}

describe('PDSH-031 core per-file closure — canonical JSON edges', () => {
  it('serializes null, null-prototype objects and array undefined', () => {
    expect(canonicalizeJson(null)).toBe('null')
    const nullPrototype = Object.assign(Object.create(null), { a: 1 })
    expect(canonicalizeJson(nullPrototype)).toBe('{"a":1}')
    expect(canonicalizeJson([undefined, 1])).toBe('[null,1]')
  })

  it('fails closed on top-level undefined, non-plain objects and node budget', () => {
    expect(canonicalCode(() => canonicalizeJson(undefined))).toBe(
      'canonical_json_unsupported_value'
    )
    expect(canonicalCode(() => canonicalizeJson(new Date()))).toBe(
      'canonical_json_unsupported_object'
    )
    expect(
      canonicalCode(() =>
        canonicalizeJson(
          Array.from({ length: CANONICAL_JSON_MAX_NODES }, () => 1)
        )
      )
    ).toBe('canonical_json_node_limit')
  })

  it('rejects deep, cyclic, non-finite and unsupported primitives', () => {
    const deep: Record<string, unknown> = {}
    let cursor = deep
    for (let index = 0; index < 70; index += 1) {
      const next: Record<string, unknown> = {}
      cursor.child = next
      cursor = next
    }
    expect(canonicalCode(() => canonicalizeJson(deep))).toBe(
      'canonical_json_depth_limit'
    )
    const cyclic: Record<string, unknown> = { a: 1 }
    cyclic.self = cyclic
    expect(canonicalCode(() => canonicalizeJson(cyclic))).toBe(
      'canonical_json_cycle'
    )
    expect(canonicalCode(() => canonicalizeJson(Number.NaN))).toBe(
      'canonical_json_non_finite_number'
    )
    expect(canonicalCode(() => canonicalizeJson(1n))).toBe(
      'canonical_json_unsupported_type'
    )
    expect(canonicalCode(() => canonicalizeJson(() => 1))).toBe(
      'canonical_json_unsupported_type'
    )
    expect(canonicalCode(() => canonicalizeJson(Symbol('x')))).toBe(
      'canonical_json_unsupported_type'
    )
    expect(canonicalizeJson({ a: undefined, b: 1 })).toBe('{"b":1}')
  })
})

describe('PDSH-031 core per-file closure — session internals', () => {
  it('recorder falls back to random event ids and the wall clock', async () => {
    const store = new InMemorySessionEventStore()
    const stream = {
      tenantId: 'tenant_pdsh031',
      sessionId: 'session_pdsh031',
      formatVersion: 1
    } as const
    await store.openSession(stream)
    await store.append({
      ...stream,
      eventId: 'seed',
      timestamp: '2026-10-12T00:00:00.000Z',
      correlationId: 'corr_pdsh031',
      traceId: 'trace_pdsh031',
      type: 'message/user',
      payload: { text: 'seed' }
    })
    const result = compactConversation(
      [
        { sequence: 1, role: 'user', content: 'x'.repeat(100) },
        { sequence: 2, role: 'user', content: 'y' }
      ],
      { maxInputTokens: 1, keepRecentMessages: 1 }
    )
    expect(result.compacted).toBe(true)
    const recorder = createSessionCompactionRecorder({
      store,
      tenantId: stream.tenantId,
      sessionId: stream.sessionId,
      correlationId: 'corr_pdsh031',
      traceId: 'trace_pdsh031'
    })

    await recorder(result)

    const events = await store.read({
      tenantId: stream.tenantId,
      sessionId: stream.sessionId
    })
    const compacted = events.find((event) => event.type === 'context/compacted')
    expect(compacted?.sequence).toBe(2)
    expect(compacted?.eventId.length).toBeGreaterThan(0)
    expect(Number.isFinite(Date.parse(compacted?.timestamp ?? ''))).toBe(true)
  })

  it('kernel log refuses a correlation that differs from the bound turn', async () => {
    const store = new InMemorySessionEventStore()
    await store.openSession({
      tenantId: 'tenant_pdsh031',
      sessionId: 'session_pdsh031',
      formatVersion: 1
    })
    const log = createSessionKernelLog({
      store,
      tenantId: 'tenant_pdsh031',
      sessionId: 'session_pdsh031',
      formatVersion: 1,
      traceId: 'trace_pdsh031',
      correlationId: 'corr_bound'
    })
    await expect(
      log.append({ type: 'turn/start', correlationId: 'corr_other' })
    ).rejects.toMatchObject({ code: 'invalid_session_event' })
  })

  it('reading an unopened session fails closed', async () => {
    const store = new InMemorySessionEventStore()
    await expect(
      store.read({ tenantId: 'tenant_pdsh031', sessionId: 'missing' })
    ).rejects.toBeInstanceOf(SessionEventError)
  })

  it('re-opening an existing stream is idempotent', async () => {
    const store = new InMemorySessionEventStore()
    const stream = {
      tenantId: 'tenant_pdsh031',
      sessionId: 'session_reopen',
      formatVersion: 1
    } as const
    await store.openSession(stream)
    await store.openSession(stream)
    const events = await store.read({
      tenantId: stream.tenantId,
      sessionId: stream.sessionId
    })
    expect(events).toEqual([])
  })

  it('format registry rejects invalid boot input and invalid versions', () => {
    const v1 = sessionFormatDefinitionV1()
    expect(
      migrationCode(() => createSessionFormatRegistry(null as never))
    ).toBe('format_registry_invalid')
    expect(
      migrationCode(() =>
        createSessionFormatRegistry({ definitions: [v1], steps: null as never })
      )
    ).toBe('format_registry_invalid')
    expect(
      migrationCode(() =>
        createSessionFormatRegistry({
          definitions: [null as never],
          steps: []
        })
      )
    ).toBe('format_registry_invalid')
    expect(
      migrationCode(() =>
        createSessionFormatRegistry({
          definitions: [{ version: 1, validate: null } as never],
          steps: []
        })
      )
    ).toBe('format_registry_invalid')
    for (const version of [0, 1.5, Number.NaN]) {
      expect(
        migrationCode(() =>
          createSessionFormatRegistry({
            definitions: [{ ...v1, version }],
            steps: []
          })
        )
      ).toBe('format_registry_invalid')
    }
  })

  it('format registry survives cycles via the freeze guard and non-Error throws', () => {
    const cyclic: Record<string, unknown> = {
      formatVersion: 1,
      eventId: 'event-cyclic',
      tenantId: 'tenant_pdsh031',
      sessionId: 'session_pdsh031',
      sequence: 1,
      type: 'message/user',
      schemaFingerprint: 'a'.repeat(64),
      timestamp: '2026-10-12T00:00:00.000Z',
      correlationId: 'corr_pdsh031',
      traceId: 'trace_pdsh031'
    }
    cyclic.payload = { self: cyclic }
    const rogueV1: SessionFormatDefinition = {
      version: 1,
      validate: () => cyclic as unknown as SessionFormatEvent,
      fingerprint: () => 'f'.repeat(64)
    }
    const v2: SessionFormatDefinition = {
      version: 2,
      validate: (event) => event as SessionFormatEvent,
      fingerprint: () => 'g'.repeat(64)
    }
    const identity: SessionFormatStep = {
      from: 1,
      to: 2,
      transform: () => ({ ok: true })
    }
    const registry = createSessionFormatRegistry({
      definitions: [rogueV1, v2],
      steps: [identity]
    })
    expect(registry.migrate({ formatVersion: 1 }, 2).formatVersion).toBe(2)

    const throwing: SessionFormatStep = {
      from: 1,
      to: 2,
      transform: () => {
        const failure: unknown = 'boom'
        throw failure
      }
    }
    const throwingRegistry = createSessionFormatRegistry({
      definitions: [sessionFormatDefinitionV1(), v2],
      steps: [throwing]
    })
    expect(
      migrationCode(() =>
        throwingRegistry.migrate(
          {
            formatVersion: 1,
            eventId: 'event-1',
            tenantId: 'tenant_pdsh031',
            sessionId: 'session_pdsh031',
            sequence: 1,
            type: 'message/user',
            schemaFingerprint: sessionEventFingerprint('message/user'),
            timestamp: '2026-10-12T00:00:00.000Z',
            correlationId: 'corr_pdsh031',
            traceId: 'trace_pdsh031',
            payload: { text: 'x' }
          },
          2
        )
      )
    ).toBe('invalid_step_output')
  })

  it('v1 definition exposes the real catalog fingerprint', () => {
    expect(sessionFormatDefinitionV1().fingerprint('turn/start')).toBe(
      sessionEventFingerprint('turn/start')
    )
  })
})

describe('PDSH-031 core per-file closure — skills loader/assert edges', () => {
  function skillsRoot(manifest: unknown): string {
    const root = tempRoot('pdsh031-skills-')
    mkdirSync(join(root, 'skill-x'))
    writeFileSync(join(root, 'skill-x', 'skill.json'), JSON.stringify(manifest))
    return root
  }

  const valid = {
    id: 'skill-x',
    version: '1.0.0',
    description: 'synthetic skill',
    requiredTools: [],
    requiredKnowledge: [],
    riskLevel: 'LOW'
  }

  function messages(manifest: unknown): string[] {
    const result = loadSkillsFromDirectory(skillsRoot(manifest))
    if (result.ok) return []
    return result.errors.map((error) => error.message)
  }

  it('rejects non-object, invalid-field and bad-collection manifests', () => {
    expect(messages([])).toContain('manifesto não é um objeto JSON')
    expect(messages({ ...valid, id: 'Bad_ID' })).toContain(
      'id deve ser string [a-z0-9-]+ não vazia'
    )
    expect(messages({ ...valid, version: '' })).toContain(
      'version deve ser string não vazia'
    )
    expect(messages({ ...valid, description: '' })).toContain(
      'description deve ser string não vazia'
    )
    expect(messages({ ...valid, requiredTools: [1] })).toContain(
      'requiredTools deve ser array de strings não vazias'
    )
    expect(messages({ ...valid, requiredKnowledge: 'nope' })).toContain(
      'requiredKnowledge deve ser array de strings não vazias'
    )
  })

  it('reports an inaccessible entry and a non-Error manifest failure', () => {
    const root = tempRoot('pdsh031-skills-broken-')
    symlinkSync(join(root, 'missing-target'), join(root, 'broken-entry'))
    const broken = loadSkillsFromDirectory(root)
    expect(broken.ok).toBe(false)
    if (!broken.ok) {
      expect(broken.errors.map((error) => error.message)).toContain(
        'entrada inacessível'
      )
    }

    vi.spyOn(JSON, 'parse').mockImplementation(() => {
      throw Object('raw') as never
    })
    expect(messages(valid)).toContain('skill.json ilegível: raw')
  })

  it('names a version-less missing requirement without the version suffix', () => {
    const registry = createSkillRegistry([])
    expect(() =>
      assertSkillsAvailable([{ id: 'missing-skill' }], registry)
    ).toThrow('missing-skill ausente')
    expect(() =>
      assertSkillsAvailable(
        [{ id: 'missing-skill', version: '1.0.0' }],
        registry
      )
    ).toThrow('missing-skill@1.0.0 ausente')
  })
})

describe('PDSH-031 core per-file closure — orchestrator edges', () => {
  function context(overrides: Partial<StepContext> = {}): StepContext {
    return {
      executionId: 'exec_pdsh031',
      tenantId: 'tenant_pdsh031' as never,
      conversationId: 'conversation_pdsh031',
      stepNumber: 1,
      runtimeProfile: 'iterative',
      agentId: 'agent.pdsh031' as never,
      agentVersion: 'v1',
      objective: 'Synthetic objective',
      instructions: [],
      goal: 'Synthetic goal',
      userMessage: 'do the thing',
      stateSummary: 'step=0',
      observations: [],
      capabilities: [],
      knowledgeAvailable: false,
      completionStrategy: 'DETERMINISTIC',
      allowedDecisionTypes: ['RESPOND', 'CALL_TOOL'],
      budget: {
        maxSteps: 5,
        maxModelCalls: 3,
        maxToolCalls: 3,
        maxDurationMs: 5_000,
        maxCostUsd: 1,
        maxTokens: 1_000
      },
      budgetUsage: {
        steps: 0,
        modelCalls: 0,
        toolCalls: 0,
        knowledgeCalls: 0,
        verificationCalls: 0,
        replans: 0,
        decisionRepairs: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        activeDurationMs: 0
      },
      tokenBudget: 1_000,
      contextItems: [],
      correlationId: 'correlation_pdsh031' as never,
      traceId: 'trace_pdsh031' as never,
      ...overrides
    }
  }

  it('bounds the static orchestrator call count', async () => {
    const orchestrator = new StaticOrchestrator({
      decision: {
        decisionType: 'RESPOND',
        reasonCode: 'GOAL_SATISFIED',
        responseText: 'bounded'
      },
      maxCalls: 1
    })
    await expect(orchestrator.decide()).resolves.toMatchObject({
      decision: { decisionType: 'RESPOND' }
    })
    await expect(orchestrator.decide()).rejects.toThrow(
      'static orchestrator call bound exceeded'
    )
  })

  it('fails when the scripted model gateway runs out of responses', async () => {
    const gateway = new ScriptedModelGateway({ responses: [] })
    await expect(gateway.complete({} as never)).rejects.toThrow(
      'scripted model gateway responses exhausted'
    )
  })

  it('reports a braced non-JSON model answer as unparseable', async () => {
    const model = new ScriptedModelGateway({ responses: ['{not json}'] })
    await expect(
      new HybridOrchestrator({
        decisionModel: model,
        maxDecisionRepairs: 0
      }).decide({ context: context() })
    ).rejects.toBeInstanceOf(OrchestratorDecisionError)
  })

  it('skips rules that abstain and prompts with observations and knowledge', async () => {
    const model = new ScriptedModelGateway({
      responses: [
        JSON.stringify({
          decisionType: 'RESPOND',
          reasonCode: 'GOAL_SATISFIED',
          responseText: 'prompted'
        })
      ]
    })
    const orchestrator = new HybridOrchestrator({
      decisionModel: model,
      rules: [() => undefined, () => undefined]
    })
    const turn = await orchestrator.decide({
      context: context({
        knowledgeAvailable: true,
        observations: [
          {
            observationId: 'observation_pdsh031',
            executionId: 'exec_pdsh031',
            stepId: 'step_pdsh031',
            stepNumber: 1,
            type: 'TOOL_RESULT',
            source: 'TOOL',
            trust: 'UNTRUSTED',
            payload: { synthetic: true },
            summary: 'synthetic observation',
            provenance: { sourceId: 'synthetic.tool' },
            timestamp: '2026-10-12T00:00:00.000Z'
          }
        ]
      })
    })
    expect(turn.decision.decisionType).toBe('RESPOND')
  })

  it('repairs a non-Error decision failure and normalizes NaN repair budget', async () => {
    let calls = 0
    const rogue = {
      complete: async () => {
        calls += 1
        if (calls === 1) {
          return {
            get text(): string {
              throw Object('raw') as never
            },
            inputTokens: 0,
            outputTokens: 0,
            costUsd: 0
          }
        }
        return {
          text: JSON.stringify({
            decisionType: 'RESPOND',
            reasonCode: 'GOAL_SATISFIED',
            responseText: 'repaired'
          }),
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0
        }
      }
    }
    const turn = await new HybridOrchestrator({
      decisionModel: rogue as never,
      maxDecisionRepairs: Number.NaN
    }).decide({ context: context() })
    expect(turn.decision).toMatchObject({ responseText: 'repaired' })
    expect(calls).toBe(2)
  })
})

describe('PDSH-031 core per-file closure — compaction control edges', () => {
  it('compacts a long request without an audit callback', async () => {
    const captured: ModelRequest[] = []
    const runtime = createKernelRuntime({
      orchestrator: new SinglePassOrchestrator(),
      modelGateway: {
        complete: async (request) => {
          captured.push(request)
          return {
            text: 'sem callback',
            provider: 'synthetic',
            model: 'synthetic-v1',
            inputTokens: 1,
            outputTokens: 1,
            costUsd: 0
          }
        }
      },
      policy: new ScriptedPolicyEngine(),
      approvals: new InMemoryApprovalEngine(),
      tools: createPhase3ToolRegistry({ availability: 'AVAILABLE' }),
      audit: new RecordingAuditSink(),
      telemetry: new RecordingTelemetrySink(),
      plugins: [
        {
          name: 'owned.history',
          kind: 'control',
          apply(ctx) {
            ctx.on('model/before-call', async (call, next) => {
              const request = call.request as {
                messages: readonly { role: string; content: string }[]
              }
              request.messages = [
                ...request.messages.slice(0, 1),
                { role: 'user', content: 'pergunta anterior '.repeat(60) },
                { role: 'assistant', content: 'resposta anterior '.repeat(60) },
                ...request.messages.slice(1)
              ]
              return next()
            })
          }
        },
        createCompactionControl({
          maxInputTokens: 200,
          keepRecentMessages: 1
        })
      ]
    })
    const result = await runtime.execute(
      phase3RuntimeInput({
        runtimeProfile: 'single_pass',
        userMessage: 'pergunta atual',
        agent: phase3AgentProfile({ instructions: ['instrução curta'] })
      })
    )
    expect(result.stopReason).toBe('COMPLETED')
    expect(captured[0]?.messages[0]?.role).toBe('system')
    expect(captured[0]?.messages[1]?.role).toBe('user')
    expect(captured[0]?.messages[1]?.content).toContain('[contexto compactado]')
  })
})
