import { describe, expect, it, vi } from 'vitest'
import {
  AgentConfigSchema,
  CONTROLLED_OUTPUT_MAX_CHARS,
  CONTROLLED_SAFE_OUTPUTS,
  InMemoryControlPlaneStore,
  PlatformEventBus,
  PluginManifestSchema,
  enforceControlledOutput,
  executeConfiguredAgent,
  runTestLab,
  type CapabilityGateway,
  type PlatformEventEnvelope,
  type PluginHookHandler
} from '../index.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000241'

function evaluate(
  overrides: Partial<Parameters<typeof enforceControlledOutput>[0]> = {}
) {
  return enforceControlledOutput({
    text: 'Resposta controlada.',
    mode: 'answer',
    riskLevel: 'low',
    ...overrides
  })
}

describe('controlled output policy', () => {
  it('allows bounded output and reports a stable decision', () => {
    expect(evaluate()).toEqual({
      decision: 'allowed',
      reason: 'output_allowed',
      mode: 'answer',
      text: 'Resposta controlada.',
      redacted: false
    })
  })

  it('redacts PII without replacing an otherwise safe answer', () => {
    const result = evaluate({ text: 'Retorne para teste@example.com.' })

    expect(result).toMatchObject({
      decision: 'allowed',
      reason: 'output_redacted',
      mode: 'answer',
      redacted: true
    })
    expect(result.text).not.toContain('teste@example.com')
  })

  it('rewrites unsafe diagnostic and medication content to a handoff', () => {
    const result = evaluate({
      text: 'O diagnóstico é gastrite; dê dipirona 10 mg ao animal.',
      mode: 'answer'
    })

    expect(result).toMatchObject({
      decision: 'rewritten',
      reason: 'unsafe_output_rejected',
      mode: 'handoff',
      text: CONTROLLED_SAFE_OUTPUTS.handoff,
      redacted: false
    })
    expect(result.text).not.toMatch(/diagn[oó]stico|dipirona|10\s*mg/i)
  })

  it.each([
    'Tome 10 mg duas vezes ao dia.',
    'As medicações prescritas estão prontas.',
    'Os diagnósticos e o tratamento foram registrados.',
    'Agende uma consulta para amanhã.',
    'Marque uma consulta para amanhã.',
    'Marcar uma consulta para amanhã.',
    'Confirmar o agendamento da consulta.',
    'cancelar\nconsulta agora.',
    'cancelar\u2028consulta agora.',
    'Reagendar a consulta para amanhã.',
    'Remarcar a consulta para amanhã.',
    'O cancelamento da consulta foi solicitado.',
    'Pagamento aprovado.',
    '\uff30\uff41\uff47\uff41\uff4d\uff45\uff4e\uff54\uff4f aprovado.',
    'diagn\u200bóstico: gastrite.',
    'D\u0456agnóstico: gastrite.',
    'd\u0131p\u0131r\u043Enа recomendada.',
    'd\u0456agnóst\u0131co: gastrite.',
    'p\u0251gamento aprovado.'
  ])('rejects unsafe output variants: %s', (text) => {
    expect(evaluate({ text })).toMatchObject({
      decision: 'rewritten',
      reason: 'unsafe_output_rejected',
      mode: 'handoff',
      text: CONTROLLED_SAFE_OUTPUTS.handoff
    })
  })

  it.each(['answer', 'clarify', 'handoff', 'blocked'] as const)(
    'rewrites unsafe output from a %s response template',
    (mode) => {
      expect(
        evaluate({
          text: 'Prescrito: dipirona 10 mg.',
          mode
        })
      ).toMatchObject({
        decision: 'rewritten',
        reason: 'unsafe_output_rejected',
        mode: mode === 'blocked' ? 'blocked' : 'handoff'
      })
    }
  )

  it('keeps the kernel-owned medication refusal as a safe handoff', () => {
    expect(
      evaluate({
        text: CONTROLLED_SAFE_OUTPUTS.medicationRefusal,
        mode: 'handoff',
        riskLevel: 'critical'
      })
    ).toMatchObject({
      decision: 'allowed',
      mode: 'handoff',
      text: CONTROLLED_SAFE_OUTPUTS.medicationRefusal
    })
  })

  it('rewrites non-textual, empty and oversized output without echoing it', () => {
    expect(evaluate({ text: null })).toMatchObject({
      decision: 'rewritten',
      reason: 'invalid_output',
      mode: 'handoff',
      text: CONTROLLED_SAFE_OUTPUTS.handoff
    })
    expect(evaluate({ text: '   ' })).toMatchObject({
      decision: 'rewritten',
      reason: 'invalid_output',
      mode: 'handoff',
      text: CONTROLLED_SAFE_OUTPUTS.handoff
    })
    expect(
      evaluate({ text: 'x'.repeat(CONTROLLED_OUTPUT_MAX_CHARS + 1) })
    ).toMatchObject({
      decision: 'rewritten',
      reason: 'output_too_large',
      mode: 'handoff',
      text: CONTROLLED_SAFE_OUTPUTS.handoff
    })
  })

  it('does not leave a high-risk answer in answer mode', () => {
    expect(
      evaluate({
        text: 'Procure atendimento veterinário imediatamente.',
        mode: 'answer',
        riskLevel: 'critical'
      })
    ).toMatchObject({
      decision: 'rewritten',
      reason: 'unsafe_output_rejected',
      mode: 'handoff',
      text: CONTROLLED_SAFE_OUTPUTS.handoff
    })
  })

  it.each(['critical ', 'CRITICAL', null, { level: 'critical' }])(
    'fails closed for unknown risk metadata: %s',
    (riskLevel) => {
      expect(
        evaluate({
          text: 'Resposta institucional controlada.',
          mode: 'answer',
          riskLevel
        })
      ).toMatchObject({
        decision: 'rewritten',
        reason: 'invalid_output',
        mode: 'handoff',
        text: CONTROLLED_SAFE_OUTPUTS.handoff
      })
    }
  )

  it('preserves redaction metadata when unsafe content also contains PII', () => {
    expect(
      evaluate({
        text: 'Diagnóstico para teste@example.com: gastrite.'
      })
    ).toMatchObject({
      decision: 'rewritten',
      reason: 'unsafe_output_rejected',
      redacted: true,
      text: CONTROLLED_SAFE_OUTPUTS.handoff
    })
  })
})

describe('runtime output boundary integration', () => {
  it('does not deliver unsafe approved knowledge and records coherent handoff events', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId },
      {
        slug: 'output-boundary-agent',
        name: 'Output Boundary Agent',
        description: 'Controlled output fixture'
      }
    )
    const version = await store.createVersion(
      { tenantId },
      agent.id,
      AgentConfigSchema.parse({
        persona: { name: 'Boundary', role: 'assistant', tone: 'calm' },
        greeting: 'Resposta padrão.',
        promptBlocks: [
          {
            id: 'output-boundary',
            kind: 'safety',
            content: 'Nunca entregue orientação clínica.',
            priority: 1,
            enabled: true
          }
        ],
        responseTemplates: {
          institutional_question: 'Resposta institucional padrão.',
          no_knowledge: 'Diagnóstico: gastrite.'
        },
        model: {
          provider: 'fake',
          model: 'deterministic-v1',
          temperature: 0,
          maxTokens: 128,
          timeoutMs: 1000,
          retries: 0,
          secretRef: 'secret://controlled/output-boundary'
        },
        policies: {
          version: 'output-boundary-v1',
          minConfidence: 0.7,
          lowConfidence: 'clarify',
          maxClarifications: 2,
          enabledActions: ['respond', 'institutional_question'],
          approvalActions: [],
          blockedActions: []
        },
        plugins: [],
        knowledge: [
          {
            source: 'controlled://output-fixture',
            version: 'v1',
            enabled: true,
            requiresApprovedSource: true
          }
        ],
        handoff: {
          lowConfidenceDestination: 'controlled-reception',
          destinations: ['controlled-reception'],
          maxClarifications: 2
        }
      }),
      'output-boundary.test'
    )
    const observedEventNames = [
      'model.after',
      'policy.output.before',
      'policy.output.after',
      'handoff.requested',
      'response.after',
      'conversation.completed'
    ] as const
    const observed: PlatformEventEnvelope[] = []
    const hook: PluginHookHandler = (event) => {
      observed.push(event)
    }
    const manifest = PluginManifestSchema.parse({
      name: 'output-boundary.observer',
      version: '1.0.0',
      capabilities: [],
      permissions: [],
      tools: [],
      hooks: [...observedEventNames],
      dependencies: [],
      configSchemaVersion: '1'
    })
    const hooks = Object.fromEntries(
      observedEventNames.map((name) => [name, hook])
    ) as Record<string, PluginHookHandler>
    const eventBus = new PlatformEventBus().registerPlugin({
      tenantId,
      plugin: { manifest, handlers: {}, hooks }
    })
    const planTools = vi.fn().mockReturnValue([
      {
        plugin: 'fixture.output',
        version: '1.0.0',
        toolName: 'fixture_tool'
      }
    ])
    const execute = vi.fn().mockResolvedValue({
      status: 'succeeded',
      correlationId: 'corr_output_boundary_fixture'
    })
    const resolveCapabilityApproval = vi.fn().mockResolvedValue(null)
    const capabilityGateway = {
      planTools,
      execute
    } as unknown as CapabilityGateway

    const trace = await runTestLab({
      store,
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      message: 'Qual o horário de funcionamento?',
      history: [],
      eventBus,
      capabilityGateway,
      actor: {
        id: 'actor.output-boundary',
        role: 'Operator',
        permissions: ['fixture:execute']
      },
      requireCapabilityApproval: true,
      resolveCapabilityApproval,
      approvedKnowledge: {
        source: 'controlled://output-fixture',
        version: 'v1',
        answer: 'Diagnóstico: gastrite. Dê dipirona 10 mg.'
      }
    })

    expect(trace.response).toMatchObject({
      mode: 'handoff',
      text: CONTROLLED_SAFE_OUTPUTS.handoff
    })
    expect(trace.handoff).toMatchObject({
      requested: true,
      reason: 'unsafe_output_rejected',
      state: 'HANDOFF_REQUESTED'
    })
    expect(trace.outputPolicy).toEqual({
      decision: 'rewritten',
      reason: 'unsafe_output_rejected',
      mode: 'handoff',
      redacted: false
    })
    expect(trace.tools).toEqual([])
    expect(planTools).not.toHaveBeenCalled()
    expect(resolveCapabilityApproval).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
    expect(JSON.stringify(trace)).not.toMatch(
      /Diagnóstico|gastrite|dipirona|10\s*mg/i
    )

    const events = observed.map((event) => event.name)
    expect(events).toEqual([...observedEventNames])
    expect(events.filter((name) => name === 'handoff.requested')).toHaveLength(
      1
    )
    expect(observed[1]?.payload).toMatchObject({ mode: 'answer' })
    expect(observed[2]?.payload).toMatchObject({
      decision: 'rewritten',
      reason: 'unsafe_output_rejected',
      mode: 'handoff',
      redacted: false
    })
    expect(observed[3]?.payload).toMatchObject({
      reason: 'unsafe_output_rejected'
    })
    expect(JSON.stringify(observed)).not.toMatch(
      /Diagnóstico|gastrite|dipirona|10\s*mg/i
    )

    observed.length = 0
    const confusableTrace = await executeConfiguredAgent({
      store,
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      message: 'Qual o horário de funcionamento?',
      history: [],
      executionMode: 'TEST_LAB',
      eventBus,
      capabilityGateway,
      actor: {
        id: 'actor.output-boundary',
        role: 'Operator',
        permissions: ['fixture:execute']
      },
      requireCapabilityApproval: true,
      resolveCapabilityApproval,
      approvedKnowledge: {
        source: 'controlled://output-fixture',
        version: 'v1',
        answer: 'dıpırоnа recomendada.'
      }
    })

    expect(confusableTrace.response).toEqual({
      mode: 'handoff',
      text: CONTROLLED_SAFE_OUTPUTS.handoff
    })
    expect(confusableTrace.outputPolicy).toMatchObject({
      decision: 'rewritten',
      reason: 'unsafe_output_rejected'
    })
    expect(confusableTrace.tools).toEqual([])
    expect(planTools).not.toHaveBeenCalled()
    expect(JSON.stringify(confusableTrace)).not.toMatch(/dipirona|recomendada/i)

    const safeTrace = await executeConfiguredAgent({
      store,
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      message: 'Qual o horário de funcionamento?',
      history: [],
      executionMode: 'TEST_LAB',
      approvedKnowledge: {
        source: 'controlled://output-fixture',
        version: 'v1',
        answer: 'O atendimento ocorre em horário controlado.'
      }
    })
    const traceWithUnknownOutputMetadata = {
      ...safeTrace,
      outputPolicy: {
        ...safeTrace.outputPolicy!,
        text: 'Diagnóstico: gastrite.'
      }
    } as unknown as typeof safeTrace
    const storedTestRun = await store.recordTestRun(
      { tenantId },
      traceWithUnknownOutputMetadata
    )
    const storedExecutionTrace = await store.recordExecutionTrace(
      { tenantId },
      traceWithUnknownOutputMetadata
    )
    expect(storedTestRun.outputPolicy).not.toHaveProperty('text')
    expect(storedExecutionTrace.outputPolicy).not.toHaveProperty('text')
    expect(JSON.stringify(storedTestRun)).not.toMatch(/Diagnóstico|gastrite/i)
    expect(JSON.stringify(storedExecutionTrace)).not.toMatch(
      /Diagnóstico|gastrite/i
    )
    const executionTraceCount = (await store.listExecutionTraces({ tenantId }))
      .length

    const malformedTrace = {
      ...trace,
      response: {
        ...trace.response,
        text: 'Diagnóstico: gastrite.'
      },
      outputPolicy: {
        ...trace.outputPolicy!,
        text: 'Diagnóstico: gastrite.'
      }
    } as unknown as typeof trace
    await expect(
      store.recordTestRun({ tenantId }, malformedTrace)
    ).rejects.toMatchObject({ code: 'validation_failed' })
    await expect(
      store.recordExecutionTrace({ tenantId }, malformedTrace)
    ).rejects.toMatchObject({ code: 'validation_failed' })
    const executionTraces = await store.listExecutionTraces({ tenantId })
    expect(executionTraces).toHaveLength(executionTraceCount)
    expect(JSON.stringify(executionTraces)).not.toMatch(/Diagnóstico|gastrite/i)

    observed.length = 0
    const preexistingHandoffTrace = await executeConfiguredAgent({
      store,
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      message: 'Qual o horário de funcionamento?',
      history: [],
      executionMode: 'TEST_LAB',
      eventBus,
      capabilityGateway,
      actor: {
        id: 'actor.output-boundary',
        role: 'Operator',
        permissions: ['fixture:execute']
      },
      requireCapabilityApproval: true,
      resolveCapabilityApproval
    })

    expect(preexistingHandoffTrace.handoff).toMatchObject({
      requested: true,
      reason: 'unsafe_output_rejected',
      state: 'HANDOFF_REQUESTED'
    })
    expect(observed.map((event) => event.name)).toEqual([
      'model.after',
      'policy.output.before',
      'policy.output.after',
      'handoff.requested',
      'response.after',
      'conversation.completed'
    ])
    expect(observed[3]?.payload).toMatchObject({
      reason: 'unsafe_output_rejected'
    })
  })
})
