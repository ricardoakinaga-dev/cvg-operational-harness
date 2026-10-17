import { afterEach, describe, expect, it, vi } from 'vitest'

import { AgentConfigSchema } from '../packages/platform/src/contracts.ts'
import { InMemoryControlPlaneStore } from '../packages/platform/src/control-plane-store.ts'
import {
  createControlledCapabilityGateway,
  createControlledSchedulingPlugin
} from '../packages/platform/src/controlled-plugins.ts'

import { InMemoryCapabilityApprovalAuthority } from '../packages/platform/src/approval-authority.ts'
import { DeterministicModelProvider } from '../packages/platform/src/model-provider.ts'
import { createControlledTraceTiming } from '../packages/platform/src/test-lab.ts'
import { createTraceId } from '../packages/platform/src/ids.ts'
import {
  executeControlledKernel,
  createLocalControlledPorts,
  type ControlledKernelInput
} from '../packages/platform/src/controlled-kernel-execution.ts'
import { InvocationEvidenceState } from '../packages/platform/src/controlled-kernel-adapters.ts'
import {
  guardedPorts,
  controlledPolicy,
  controlledApprovals,
  controlledRegistration
} from '../packages/platform/src/controlled-kernel-adapters.ts'
import {
  CapabilityGateway,
  PluginRegistry,
  type CapabilityGatewayOptions
} from '../packages/platform/src/plugin-gateway.ts'
import {
  attestReviewedPlugin,
  gatewayCore,
  reviewedDescriptor,
  prepareCapabilityCommand
} from '../packages/platform/src/plugin-execution-core.ts'
import {
  projectControlledTools,
  type ControlledAttempt
} from '../packages/platform/src/controlled-execution-plan.ts'
import { createOperationalHarness, composeCapabilities } from '@cvg/harness'
import type {
  RuntimeInput,
  ApprovalRequest,
  ApprovalExecutionRequest
} from '@cvg/harness-contracts'

const toolName = 'find_available_slots'
const handoff = {
  mode: 'handoff',
  text: 'Vou encaminhar sua solicitação para a equipe responsável.'
}

// Reviewed synthetic fixture: only returns constants. Attestation never grants real tools.
function observedGateway(options: CapabilityGatewayOptions, name = toolName) {
  const plugin = createControlledSchedulingPlugin()
  const descriptor = reviewedDescriptor(
    gatewayCore(createControlledCapabilityGateway())!.resolve(
      AgentConfigSchema.parse(configValue()),
      toolName
    )!
  )!
  const body = vi.fn(() => ({
    status: 'succeeded' as const,
    data: { slots: [], controlled: true as const, dryRun: true }
  }))
  plugin.handlers[toolName] = body
  if (name !== toolName) {
    plugin.manifest.tools[0]!.name = name
    plugin.handlers = { [name]: body }
    plugin.inputValidators = { [name]: plugin.inputValidators![toolName]! }
    plugin.outputValidators = { [name]: plugin.outputValidators![toolName]! }
  }
  attestReviewedPlugin(plugin, { ...descriptor, id: name })
  return {
    gateway: new CapabilityGateway(new PluginRegistry([plugin]), options),
    body
  }
}

// A minimal config is kept in the fixture below; no client-supplied descriptor.
function configValue() {
  return {
    persona: { name: 'Synthetic', role: 'assistant', tone: 'calm' },
    greeting: 'Resposta controlada.',
    promptBlocks: [],
    responseTemplates: {},
    model: {
      provider: 'fake',
      model: 'deterministic-v1',
      temperature: 0,
      maxTokens: 128,
      timeoutMs: 1000,
      retries: 0,
      secretRef: 'secret://controlled/synthetic'
    },
    policies: {
      version: 'synthetic-v1',
      minConfidence: 0.7,
      lowConfidence: 'clarify',
      maxClarifications: 2,
      enabledActions: ['respond', 'scheduling'],
      approvalActions: [],
      blockedActions: []
    },
    plugins: [
      {
        plugin: 'scheduling.controlled',
        version: '1.0.0',
        enabled: true,
        allowedTools: [toolName],
        config: {}
      }
    ],
    knowledge: [],
    handoff: {
      lowConfidenceDestination: 'synthetic',
      destinations: ['synthetic'],
      maxClarifications: 2
    }
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function admission(
  result: Awaited<ReturnType<typeof executeControlledKernel>>
) {
  return JSON.stringify({
    stop: result.stop,
    rawStop: result.rawStop,
    tools: result.tools,
    response: result.response,
    runtimeResult: result.result,
    attempts: result.attempts,
    closed: result.evidence.closed,
    fault: result.evidence.fault
  })
}

describe('SPEC0214 supplemental A06 trusted server authorization', () => {
  it.each(['missing', 'throwing'] as const)(
    '%s authorizer denies forged permissions before consumption/body',
    async (kind) => {
      const f = await approvedFixture()
      const consume = vi.spyOn(f.authority, 'verifyAndConsume')
      const authorize = vi.fn(() => {
        throw new Error('private synthetic detail')
      })
      const { gateway, body } = observedGateway({
        approvalAuthority: f.authority,
        ...(kind === 'throwing' ? { actorAuthorizer: authorize } : {})
      })
      f.prepared.input.capabilityGateway = gateway
      f.prepared.input.actor!.permissions = [
        'scheduling:read',
        'scheduling:write'
      ]
      const result = await executeControlledKernel(f.prepared, f.ports)
      expect(result.stop).toBe('POLICY_DENIED')
      expect(result.rawStop).toBe('POLICY_DENIED')
      expect(result.tools).toEqual([{ name: toolName, status: 'blocked' }])
      expect(result.response).toEqual(handoff)
      expect(result.evidence.fault).toBeNull()
      expect(result.attempts[0]).toMatchObject({
        phase: 'CLOSED_WITHOUT_ENTRY',
        closed: true,
        denied: true,
        policyAllowed: false,
        approvalConsumed: false
      })
      expect(body).toHaveBeenCalledTimes(0)
      expect(consume).toHaveBeenCalledTimes(0)
      expect(authorize).toHaveBeenCalledTimes(kind === 'throwing' ? 1 : 0)
      expect(
        (await f.authority.get(f.approval.id, f.input.tenantId))?.status
      ).toBe('issued')
    }
  )

  it.each([
    'valid',
    'actor',
    'role',
    'tenant',
    'agent',
    'version',
    'tool'
  ] as const)('uses trusted identity binding: %s', async (change) => {
    const f = await approvedFixture()
    const trusted = {
      tenantId: f.input.tenantId,
      agentId: f.input.agentId,
      versionId: f.input.versionId,
      toolName,
      actor: { id: f.input.actor.id, role: f.input.actor.role }
    }
    const authorize = vi.fn(
      (
        r: Parameters<
          NonNullable<CapabilityGatewayOptions['actorAuthorizer']>
        >[0]
      ) =>
        r.tenantId === trusted.tenantId &&
        r.agentId === trusted.agentId &&
        r.versionId === trusted.versionId &&
        r.toolName === trusted.toolName &&
        r.actor.id === trusted.actor.id &&
        r.actor.role === trusted.actor.role
          ? [r.requiredPermission]
          : []
    )
    const actualTool = change === 'tool' ? 'substituted_tool' : toolName
    const { gateway, body } = observedGateway(
      { actorAuthorizer: authorize, approvalAuthority: f.authority },
      actualTool
    )
    f.prepared.input.capabilityGateway = gateway
    f.prepared.input.actor!.permissions = [
      'scheduling:read',
      'scheduling:write'
    ]
    if (change === 'actor') f.prepared.input.actor!.id = 'system.substituted'
    if (change === 'role') f.prepared.input.actor!.role = 'Admin'
    if (change === 'tenant')
      f.prepared.input.tenantId = 'tenant_00000000-0000-4000-8000-000000000215'
    if (change === 'agent')
      f.prepared.input.agentId = 'agent_00000000-0000-4000-8000-000000000215'
    if (change === 'version')
      f.prepared.input.versionId =
        'agent_version_00000000-0000-4000-8000-000000000215'
    // Tool substitution is a trusted catalog fixture, not an invented public field.
    if (change === 'tool') f.config.plugins[0]!.allowedTools = [actualTool]
    const consume = vi.spyOn(f.authority, 'verifyAndConsume')
    const result = await executeControlledKernel(f.prepared, f.ports)
    const valid = change === 'valid'
    expect(result.stop).toBe(valid ? 'COMPLETED' : 'POLICY_DENIED')
    expect(result.rawStop).toBe(valid ? 'COMPLETED' : 'POLICY_DENIED')
    expect(authorize).toHaveBeenCalledTimes(1)
    expect(authorize.mock.calls[0]![0]).toEqual({
      tenantId: f.prepared.input.tenantId,
      agentId: f.prepared.input.agentId,
      versionId: f.prepared.input.versionId,
      toolName: actualTool,
      requiredPermission: 'scheduling:read',
      actor: {
        id: f.prepared.input.actor!.id,
        role: f.prepared.input.actor!.role
      }
    })
    expect(body).toHaveBeenCalledTimes(valid ? 1 : 0)
    expect(consume).toHaveBeenCalledTimes(valid ? 1 : 0)
    expect(result.attempts[0]).toMatchObject({
      closed: true,
      phase: valid ? 'ENTERED' : 'CLOSED_WITHOUT_ENTRY',
      approvalConsumed: valid
    })
    expect(result.tools).toEqual([
      { name: actualTool, status: valid ? 'succeeded' : 'blocked' }
    ])
    if (!valid) expect(result.response).toEqual(handoff)
    expect(
      (await f.authority.get(f.approval.id, trusted.tenantId))?.status
    ).toBe(valid ? 'consumed' : 'issued')
  })
})

describe('SPEC0214 supplemental A11 held EffectLedger.started ACK', () => {
  it.each([
    'cancel-before-deadline',
    'cancel-ACK-after-deadline',
    'deadline'
  ] as const)('closes without entry and never reopens: %s', async (window) => {
    vi.useFakeTimers()
    const f = await approvedFixture()
    const { gateway, body } = observedGateway({
      approvalAuthority: f.authority,
      actorAuthorizer: ({ requiredPermission }) => [requiredPermission]
    })
    f.prepared.input.capabilityGateway = gateway
    const consume = vi.spyOn(f.authority, 'verifyAndConsume')
    const held = deferred()
    const reached = deferred()
    const started = f.ports.effects.started
    const finished = vi.spyOn(f.ports.effects, 'finished')
    let ledgerStarts = 0
    f.ports.effects.started = async (ref) => {
      await started(ref)
      ledgerStarts++
      reached.resolve()
      await held.promise
    }
    const states = new Set<InvocationEvidenceState>()
    const settlements: string[] = []
    const settlementACKs: string[] = []
    const io = InvocationEvidenceState.prototype.io
    vi.spyOn(InvocationEvidenceState.prototype, 'io').mockImplementation(
      function <T>(
        this: InvocationEvidenceState,
        phase: string,
        operation: () => T | PromiseLike<T>,
        terminal?: boolean
      ) {
        states.add(this)
        if (phase === 'approval.settlement') settlements.push(phase)
        const pending = io.call(this, phase, operation, terminal) as Promise<T>
        return pending.then(
          (value) => {
            if (phase === 'approval.settlement') settlementACKs.push('ack')
            return value
          },
          (error: unknown) => {
            if (phase === 'approval.settlement') settlementACKs.push('rejected')
            throw error
          }
        )
      }
    )
    const running = executeControlledKernel(f.prepared, f.ports)
    await vi.advanceTimersByTimeAsync(0)
    await reached.promise
    expect(states.size).toBe(1)
    const state = [...states][0]!
    expect(consume).toHaveBeenCalledTimes(1)
    expect(body).toHaveBeenCalledTimes(0)
    expect(ledgerStarts).toBe(1)
    if (window !== 'deadline') state.controller.abort()
    // Ledger admission is awaited outside the tool-body cancellation race.
    // A finite successful ACK allows the final veto; withholding past its
    // deadline fixes evidence_unavailable, which has specified precedence.
    if (window === 'cancel-before-deadline') held.resolve()
    await vi.advanceTimersByTimeAsync(
      window === 'cancel-before-deadline' ? 0 : 1600
    )
    const result = await running
    const expectedStop =
      window === 'cancel-before-deadline'
        ? 'CANCELLED'
        : 'INSUFFICIENT_EVIDENCE'
    expect(result.stop).toBe(expectedStop)
    expect(result.rawStop).toBe(
      window === 'cancel-before-deadline'
        ? 'TOOL_FAILURE'
        : 'INSUFFICIENT_EVIDENCE'
    )
    expect(result.evidence.closed).toBe(true)
    expect(result.evidence.fault).toEqual(
      window === 'cancel-before-deadline'
        ? null
        : {
            phase: 'effects.started',
            code: 'evidence_unavailable',
            bodyStarted: false
          }
    )
    expect(result.attempts[0]).toMatchObject({
      closed: true,
      phase: 'CLOSED_WITHOUT_ENTRY',
      cause: expectedStop,
      approvalConsumed: true,
      resultAcknowledged: false
    })
    expect(result.tools).toEqual([{ name: toolName, status: 'failed' }])
    expect(result.response).toEqual(handoff)
    expect(result.attempts[0]!.command.output).toBeUndefined()
    expect(body).toHaveBeenCalledTimes(0)
    expect(
      (await f.authority.get(f.approval.id, f.approval.tenantId))?.status
    ).toBe('consumed')
    const first = admission(result)
    const settlementsAtReturn = [...settlements]
    const finishedAtReturn = finished.mock.calls.length
    expect(settlementsAtReturn).toEqual(['approval.settlement'])
    expect(settlementACKs).toEqual([
      window === 'cancel-before-deadline' ? 'ack' : 'rejected'
    ])
    expect(finishedAtReturn).toBe(window === 'cancel-before-deadline' ? 1 : 0)
    if (window === 'cancel-before-deadline')
      expect(finished.mock.calls[0]![1]).toBe('cancelled')
    if (window === 'cancel-before-deadline')
      expect(Date.now()).toBeLessThan(state.expiresAt)
    else await vi.advanceTimersByTimeAsync(1600)
    held.resolve()
    await vi.advanceTimersByTimeAsync(20)
    expect(admission(result)).toBe(first)
    expect(body).toHaveBeenCalledTimes(0)
    expect(consume).toHaveBeenCalledTimes(1)
    expect(ledgerStarts).toBe(1)
    expect(settlements).toEqual(settlementsAtReturn)
    expect(settlementACKs).toEqual([
      window === 'cancel-before-deadline' ? 'ack' : 'rejected'
    ])
    expect(finished).toHaveBeenCalledTimes(finishedAtReturn)
    const record = await f.ports.effectJournal.get(
      f.input.tenantId,
      result.attempts[0]!.operationKey!
    )
    console.info(
      'A11_FACTS',
      JSON.stringify({
        window,
        stop: result.stop,
        rawStop: result.rawStop,
        fault: result.evidence.fault,
        settlements,
        finished: finished.mock.calls,
        settlementACKs,
        journalState: record?.state ?? null,
        handler: body.mock.calls.length,
        consume: consume.mock.calls.length
      })
    )
    if (window === 'cancel-before-deadline')
      expect(record?.state).toBe('FAILED')
    else expect(record).toBeNull()
    expect(record?.result).toBeUndefined()
    const replay = await executeControlledKernel(f.prepared)
    expect(replay.stop).toBe('POLICY_DENIED')
    expect(replay.attempts[0]).toMatchObject({
      phase: 'CLOSED_WITHOUT_ENTRY',
      approvalConsumed: false
    })
    expect(body).toHaveBeenCalledTimes(0)
    expect(consume).toHaveBeenCalledTimes(1)
    expect(
      (await f.authority.get(f.approval.id, f.approval.tenantId))?.status
    ).toBe('consumed')
  })
})

function attempt(command: ControlledAttempt['command']): ControlledAttempt {
  return {
    command,
    phase: 'PENDING',
    closed: false,
    cause: null,
    policyAllowed: false,
    approvalRequired: false,
    approvalConsumed: false,
    resultAcknowledged: false,
    logAcknowledged: false,
    callbackAcknowledged: false,
    attempted: false,
    denied: false
  }
}

describe('SPEC0214 supplemental A09 real private approval execution port', () => {
  it.each(['valid', 'operationKey', 'fingerprint', 'executionRef'] as const)(
    'revalidates %s between request and begin',
    async (tamper) => {
      const f = await approvedFixture()
      const core = gatewayCore(f.prepared.input.capabilityGateway)!
      const command = prepareCapabilityCommand(
        {
          tenantId: f.input.tenantId,
          agentId: f.input.agentId,
          versionId: f.input.versionId,
          traceId: f.input.traceId,
          config: f.config,
          toolName,
          input: { message: f.input.message },
          actor: f.input.actor,
          policy: f.prepared.policy,
          dryRun: true
        },
        core.resolve(f.config, toolName)!,
        true
      )!
      const a = attempt(command)
      a.policyAllowed = true
      a.approvalRequired = true
      a.operationKey = 'synthetic.operation.214'
      const state = new InvocationEvidenceState(
        [a],
        f.ports.pause,
        f.input.tenantId
      )
      state.expiresAt = Date.now() + 1000
      const fingerprint = 'synthetic.exact.fingerprint'
      const agentVersion =
        `${f.version.id}:v${f.version.version}` as ApprovalExecutionRequest['agentVersion']
      const request: ApprovalRequest = {
        tenantId: f.input.tenantId as unknown as ApprovalRequest['tenantId'],
        agentId: f.input.agentId as unknown as ApprovalRequest['agentId'],
        toolId: toolName,
        operationKey: a.operationKey,
        summary: 'Synthetic constant tool',
        correlationId:
          'synthetic.correlation' as ApprovalRequest['correlationId'],
        executionRef: 'synthetic.execution.214',
        operatorId: f.input.agentId,
        agentVersion,
        action: 'tool.execute',
        resource: { type: 'tool', id: toolName },
        payload: {
          capabilityFingerprint: fingerprint,
          input: command.execution.input
        },
        policyVersion: f.config.policies.version
      }
      const engine = controlledApprovals(
        state,
        core,
        () => fingerprint,
        agentVersion,
        request.correlationId,
        async () => f.prepared.input.capabilityApproval
      )
      expect(engine.execution?.release).toBeUndefined()
      const consume = vi.spyOn(f.authority, 'verifyAndConsume')
      const grant = await engine.request(request)
      expect(grant.status).toBe('APPROVED')
      expect(consume).toHaveBeenCalledTimes(0)
      const execution: ApprovalExecutionRequest = {
        tenantId: request.tenantId,
        agentId: request.agentId,
        approvalId: grant.approvalId!,
        agentVersion,
        action: 'tool.execute',
        resource: request.resource!,
        payload: request.payload,
        policyVersion: request.policyVersion!,
        operationKey: request.operationKey,
        executionRef: request.executionRef!
      }
      const changed = {
        ...execution,
        ...(tamper === 'operationKey'
          ? { operationKey: 'synthetic.other.operation' }
          : {}),
        ...(tamper === 'fingerprint'
          ? {
              payload: {
                capabilityFingerprint: 'substituted',
                input: command.execution.input
              }
            }
          : {}),
        ...(tamper === 'executionRef'
          ? { executionRef: 'synthetic.other.execution' }
          : {})
      }
      if (tamper !== 'valid') {
        await expect(engine.execution!.begin(changed)).rejects.toThrow(
          'approval_binding_invalid'
        )
        expect(consume).toHaveBeenCalledTimes(0)
        expect(a.approvalConsumed).toBe(false)
        expect(a.phase).toBe('PENDING')
        expect(
          (await f.authority.get(f.approval.id, f.input.tenantId))?.status
        ).toBe('issued')
      } else {
        const reservation = await engine.execution!.begin(execution)
        expect(consume).toHaveBeenCalledTimes(1)
        expect(a.approvalConsumed).toBe(true)
        await engine.execution!.fail({
          request: execution,
          reservationId: reservation.reservationId,
          evidenceRef: 'synthetic.no-body'
        })
        await expect(engine.execution!.begin(execution)).rejects.toThrow(
          'approval_binding_invalid'
        )
        expect(consume).toHaveBeenCalledTimes(1)
        expect(
          (await f.authority.get(f.approval.id, f.input.tenantId))?.status
        ).toBe('consumed')
      }
      state.close()
      expect(a.phase).toBe('CLOSED_WITHOUT_ENTRY')
    }
  )
})

describe('SPEC0214 supplemental A15 real guarded capture beyond last50', () => {
  it.each([false, true])(
    'captures 61 real kernel dispatches; terminal audit fault=%s',
    async (terminalFault) => {
      const f = await fixture()
      const names = Array.from({ length: 61 }, (_, n) => `synthetic_slots_${n}`)
      const plugins = names.map((name) => {
        const p = createControlledSchedulingPlugin()
        const descriptor = reviewedDescriptor(
          gatewayCore(f.input.capabilityGateway)!.resolve(f.config, toolName)!
        )!
        const handler = p.handlers[toolName]!
        p.manifest.name = `synthetic.plugin.${name}`
        p.manifest.tools[0]!.name = name
        p.handlers = { [name]: handler }
        p.inputValidators = { [name]: p.inputValidators![toolName]! }
        p.outputValidators = { [name]: p.outputValidators![toolName]! }
        attestReviewedPlugin(p, {
          ...descriptor,
          id: name,
          providerId: p.manifest.name
        })
        return p
      })
      const bodies = plugins.map((p) => {
        const name = p.manifest.tools[0]!.name
        const descriptor = {
          ...reviewedDescriptor(
            gatewayCore(f.input.capabilityGateway)!.resolve(f.config, toolName)!
          )!,
          id: name,
          providerId: p.manifest.name
        }
        const body = vi.fn(p.handlers[name]!)
        p.handlers[name] = body
        attestReviewedPlugin(p, descriptor)
        return body
      })
      f.config.plugins = plugins.map((p) => ({
        plugin: p.manifest.name,
        version: '1.0.0',
        enabled: true,
        allowedTools: [p.manifest.tools[0]!.name],
        config: {}
      }))
      f.prepared.input.capabilityGateway = new CapabilityGateway(
        new PluginRegistry(plugins),
        {
          actorAuthorizer: ({ requiredPermission }) => [requiredPermission]
        }
      )
      const core = gatewayCore(f.prepared.input.capabilityGateway)!
      const attempts = names.map((name) =>
        attempt(
          prepareCapabilityCommand(
            {
              tenantId: f.input.tenantId,
              agentId: f.input.agentId,
              versionId: f.input.versionId,
              traceId: f.input.traceId,
              config: f.config,
              toolName: name,
              input: { message: f.input.message },
              actor: f.input.actor,
              policy: f.prepared.policy,
              dryRun: true
            },
            core.resolve(f.config, name)!,
            true
          )!
        )
      )
      const state = new InvocationEvidenceState(
        attempts,
        f.ports.pause,
        f.input.tenantId
      )
      state.expiresAt = Date.now() + 10_000
      state.outputAllowsTools = true
      const calls: string[] = []
      const results: string[] = []
      const callbacks: string[] = []
      const append = f.ports.log.append
      f.ports.log.append = async (event) => {
        await append(event)
        if (event.type === 'tool/call') calls.push(event.toolId)
        if (event.type === 'tool/result') results.push(event.toolId)
      }
      const audit = f.ports.audit.append
      f.ports.audit.append = async (event) => {
        if (terminalFault && event.action === 'runtime.completed')
          throw new Error('synthetic terminal fault')
        await audit(event)
      }
      const guarded = guardedPorts(f.ports, state, (event) => {
        callbacks.push(event.toolName)
      })
      let fingerprint = ''
      const composed = composeCapabilities(
        attempts.map((a) =>
          controlledRegistration(
            () => a,
            reviewedDescriptor(a.command.resolved)!,
            state,
            () => fingerprint,
            async (operation) => operation()
          )
        )
      )
      fingerprint = composed.fingerprint
      const agentVersion = `${f.version.id}:v${f.version.version}`
      const correlationId = 'synthetic.capture.correlation'
      const harness = createOperationalHarness({
        ...guarded,
        capabilities: composed.registry,
        defaultRuntimeProfile: 'iterative',
        policy: controlledPolicy(state, core),
        approvals: controlledApprovals(
          state,
          core,
          () => fingerprint,
          agentVersion,
          correlationId,
          async () => undefined
        ),
        modelGateway: {
          complete: async () => {
            throw new Error('literal response must not call model')
          }
        },
        iterativeOrchestrator: {
          decide: async ({ context }) => ({
            decision:
              context.stepNumber <= names.length
                ? {
                    decisionType: 'CALL_TOOL',
                    reasonCode: 'TOOL_REQUIRED',
                    toolId: names[context.stepNumber - 1]!,
                    toolVersion: '1.0.0',
                    toolInput: { message: f.input.message }
                  }
                : {
                    decisionType: 'RESPOND',
                    reasonCode: 'GOAL_SATISFIED',
                    responseText: 'Synthetic completed.'
                  }
          })
        },
        completionEvaluator: {
          evaluate: async ({ lastDecision }) => ({
            outcome:
              lastDecision?.decisionType === 'RESPOND'
                ? 'COMPLETE'
                : 'INCOMPLETE',
            reasonCode:
              lastDecision?.decisionType === 'RESPOND'
                ? 'COMPLETION_CONFIRMED'
                : 'POLICY_REQUIRED',
            deterministic: true
          })
        }
      })
      // Component-only composition: no public multi-tool execution is enabled.
      const runtimeInput: RuntimeInput = {
        tenantId: f.input.tenantId as unknown as RuntimeInput['tenantId'],
        agent: {
          id: f.input.agentId as unknown as RuntimeInput['agent']['id'],
          version: agentVersion as RuntimeInput['agent']['version'],
          objective: 'Synthetic capture',
          instructions: [],
          skills: [],
          tools: names,
          policies: [f.config.policies.version]
        },
        traceId: f.input.traceId as unknown as RuntimeInput['traceId'],
        correlationId: correlationId as RuntimeInput['correlationId'],
        conversationId:
          'synthetic.capture.conversation' as RuntimeInput['conversationId'],
        sessionId: 'synthetic.capture.session' as RuntimeInput['sessionId'],
        executionId: 'synthetic.capture.execution',
        capabilityFingerprint: fingerprint,
        userMessage: f.input.message,
        runtimeProfile: 'iterative',
        signal: state.controller.signal,
        context: {
          values: {},
          sourceIds: [],
          capturedAt: new Date().toISOString()
        },
        state: { version: 1, values: {}, updatedAt: new Date().toISOString() },
        budget: {
          maxSteps: 62,
          maxModelCalls: 0,
          maxToolCalls: 61,
          maxDurationMs: 10_000,
          maxCostUsd: 0,
          maxTokens: 1000,
          maxKnowledgeCalls: 0,
          maxReplans: 0,
          maxDecisionRepairs: 0,
          maxVerificationCalls: 0
        }
      }
      const result = await harness.execute(runtimeInput)
      state.close()
      expect(
        {
          stop: result.stopReason,
          response: result.response,
          toolCalls: result.toolCalls,
          fault: state.fault,
          calls: calls.length
        },
        JSON.stringify(result)
      ).toMatchObject({
        stop: terminalFault ? 'INSUFFICIENT_EVIDENCE' : 'COMPLETED'
      })
      expect(state.fault?.phase ?? null).toBe(
        terminalFault ? 'audit.runtime.completed' : null
      )
      expect(result.toolCalls).toBe(61)
      expect(calls).toEqual(names)
      expect(results).toEqual(names)
      expect(callbacks).toEqual(names)
      expect(bodies.map((b) => b.mock.calls.length)).toEqual(names.map(() => 1))
      expect(
        attempts.every(
          (a) => a.phase === 'ENTERED' && a.closed && a.resultAcknowledged
        )
      ).toBe(true)
      const checkpoint = await f.ports.stepStore.loadCheckpoint(
        runtimeInput.tenantId,
        runtimeInput.executionId!
      )
      expect(checkpoint!.state.observations).toHaveLength(50)
      expect(
        checkpoint!.state.observations.some(
          (o) => o.provenance.sourceId === names[0]
        )
      ).toBe(false)
      const records = await Promise.all(
        attempts.map((a) =>
          f.ports.effectJournal.get(f.input.tenantId, a.operationKey!)
        )
      )
      expect(records.map((r) => r?.state)).toEqual(names.map(() => 'CONFIRMED'))
      expect(records.every((r) => r?.result !== undefined)).toBe(true)
      console.info(
        'A15_FACTS',
        JSON.stringify({
          terminalFault,
          rawStop: result.stopReason,
          fault: state.fault,
          calls: calls.length,
          results: results.length,
          callbacks: callbacks.length,
          handlers: bodies.reduce((sum, b) => sum + b.mock.calls.length, 0),
          checkpointObservations: checkpoint!.state.observations.length,
          earliestCaptured: calls[0],
          earliestNotInCheckpoint: names[0],
          confirmed: records.filter((r) => r?.state === 'CONFIRMED').length
        })
      )
      expect(
        projectControlledTools(names, attempts, result.stopReason)
      ).toEqual(
        names.map((name) => ({
          name,
          status: terminalFault ? 'failed' : 'succeeded'
        }))
      )
      // Same 61 reviewed tools remain disallowed at the configured public composition.
      const publicResult = await executeControlledKernel(f.prepared)
      expect(publicResult.stop).toBe('UNSAFE_REQUEST')
      expect(publicResult.attempts).toEqual([])
      expect(publicResult.tools).toEqual(
        [...names].sort().map((name) => ({ name, status: 'not_run' }))
      )
      expect(bodies.map((b) => b.mock.calls.length)).toEqual(names.map(() => 1))
    }
  )
})

async function fixture() {
  const tenantId = 'tenant_00000000-0000-4000-8000-000000000214'
  const config = AgentConfigSchema.parse(configValue())
  const store = new InMemoryControlPlaneStore()
  const agent = await store.createAgent(
    { tenantId },
    { slug: 'synthetic-214', name: 'Synthetic', description: 'Synthetic only' }
  )
  const version = await store.createVersion(
    { tenantId },
    agent.id,
    config,
    'synthetic'
  )
  const input = {
    store,
    tenantId,
    agentId: agent.id,
    versionId: version.id,
    traceId: createTraceId(),
    message: 'Quero uma consulta',
    history: [],
    executionMode: 'TEST_LAB' as const,
    actor: {
      id: 'system.synthetic',
      role: 'System',
      permissions: ['untrusted']
    },
    capabilityGateway: createControlledCapabilityGateway()
  }
  const provider = new DeterministicModelProvider()
  const prepared: ControlledKernelInput = {
    input,
    version,
    config,
    intent: 'scheduling',
    policy: {
      decision: 'allowed',
      reason: 'synthetic',
      layer: 'agent_behavior',
      policyVersion: 'synthetic-v1'
    },
    risk: { level: 'low', reason: 'synthetic' },
    response: { mode: 'answer', text: 'Resposta controlada.' },
    promptWithHistory: 'Synthetic prompt',
    sourceIds: [],
    provider,
    timing: createControlledTraceTiming(),
    emit: async () => undefined
  }
  return {
    input,
    config,
    version,
    provider,
    prepared,
    ports: createLocalControlledPorts()
  }
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function approvedFixture() {
  const f = await fixture()
  const authority = new InMemoryCapabilityApprovalAuthority()
  const approval = await authority.issue({
    tenantId: f.input.tenantId,
    agentId: f.input.agentId,
    versionId: f.input.versionId,
    toolName: 'find_available_slots',
    input: { message: f.input.message },
    actorId: f.input.actor.id,
    issuer: 'human.synthetic',
    expiresAt: new Date(Date.now() + 60_000)
  })
  f.prepared.input.capabilityApproval = {
    id: approval.id,
    tenantId: approval.tenantId,
    agentId: approval.agentId,
    versionId: approval.versionId,
    toolName: approval.toolName,
    actorId: approval.actorId,
    expiresAt: approval.expiresAt
  }
  f.prepared.input.requireCapabilityApproval = true
  f.prepared.input.capabilityGateway = createControlledCapabilityGateway({
    approvalAuthority: authority
  })
  return { ...f, authority, approval }
}
