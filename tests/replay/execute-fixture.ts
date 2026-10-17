import { vi } from 'vitest'
import {
  InMemoryEffectJournal,
  InMemorySessionEventStore,
  InMemoryPauseSwitch,
  InMemoryEffectLedger,
  createOperationalHarness,
  createSessionKernelLog
} from '@cvg/harness'
import { createSdk } from '@cvg/sdk'
import {
  PolicyEngine as DomainPolicy,
  REFERENCE_POLICY_PROFILE
} from '@cvg/policy-engine'
import {
  ApprovalEngine as DomainApprovals,
  InMemoryApprovalStore
} from '@cvg/approval-engine'
import type {
  ApprovalEngine,
  ModelGateway,
  ToolDefinition
} from '@cvg/harness-contracts'
import type { ReplayFixture, ReplayTranscript } from './fixture-schema.mjs'

export const FROZEN_TIME = '2026-10-14T12:00:00.000Z'
// No output normalizer: injected IDs and the fake clock remove only UUID/time
// nondeterminism at their source. Payloads, errors, accounting and order stay exact.
function json<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export async function executeFixture(
  f: ReplayFixture,
  probeControls?: 'pause' | 'effects'
): Promise<ReplayTranscript> {
  vi.useFakeTimers({ now: new Date(FROZEN_TIME) })
  try {
    const input = json(f.input)
    const controller = new AbortController()
    if (f.cancelBefore) controller.abort()
    const sessions = new InMemorySessionEventStore()
    const journal = new InMemoryEffectJournal()
    const approvalStore = new InMemoryApprovalStore()
    const timeline: string[] = []
    const modelRequests: unknown[] = [],
      toolBodies: unknown[] = []
    const policyDecisions: unknown[] = [],
      approvalRequests: unknown[] = []
    const approvalEvents: unknown[] = [],
      audit: unknown[] = [],
      telemetry: unknown[] = []
    const domainPolicy = new DomainPolicy({
      profile: REFERENCE_POLICY_PROFILE,
      clock: () => new Date(FROZEN_TIME)
    })
    const domainApprovals = new DomainApprovals({
      store: approvalStore,
      clock: () => new Date(FROZEN_TIME),
      idFactory: () => 'approval_replay_synthetic',
      onEvent: (event) => {
        approvalEvents.push(json(event))
        timeline.push(event.type)
      }
    })
    const policy = {
      evaluate: async (
        request: Parameters<
          import('@cvg/harness-contracts').PolicyEngine['evaluate']
        >[0]
      ) => {
        timeline.push('policy/evaluate')
        const decision = domainPolicy.evaluate({
          tenantId: request.tenantId,
          agentId: request.agentId,
          operatorId: 'operator_replay_synthetic',
          operatorRole: 'Operator',
          agentProfile: f.policyProfile,
          capability: 'resource.read',
          action: 'resource.read',
          correlationId: request.correlationId,
          context: { dataClassification: 'PUBLIC' }
        })
        policyDecisions.push(json(decision))
        return {
          outcome: decision.decision,
          reason: decision.reason,
          policyVersion: decision.policyVersion
        }
      }
    }
    // Test host adapter around the real approval engine/store, not a scripted
    // governance decision. The synthetic human rejection is explicit input.
    const approvals: ApprovalEngine = {
      request: async (request) => {
        approvalRequests.push(json(request))
        timeline.push('approval/request')
        const record = domainApprovals.request({
          tenantId: request.tenantId,
          operatorId: request.operatorId!,
          agentId: request.agentId,
          agentVersion: request.agentVersion!,
          action: request.action!,
          resource: request.resource!,
          payload: request.payload,
          policyVersion: request.policyVersion!,
          correlationId: request.correlationId,
          operationKey: request.operationKey,
          executionRef: request.executionRef!,
          reason: 'synthetic approval pending'
        })
        domainApprovals.submit(
          record.tenantId,
          record.approvalId,
          record.operatorId
        )
        if (f.approval === 'refused') {
          domainApprovals.reject(record.tenantId, record.approvalId, {
            approverId: 'approver_replay_synthetic',
            reason: 'synthetic operator refusal'
          })
          return {
            status: 'DENIED',
            approvalId: record.approvalId as never,
            reason: 'synthetic operator refusal'
          }
        }
        return {
          status: 'PENDING',
          approvalId: record.approvalId as never,
          reason: 'synthetic approval pending'
        }
      }
    }
    let modelEntered!: () => void
    const entered = new Promise<void>((resolve) => {
      modelEntered = resolve
    })
    const modelGateway: ModelGateway = {
      complete: async (request) => {
        const { signal, ...body } = request
        modelRequests.push(
          json({
            request: body,
            signalProvided: signal !== undefined,
            signalAborted: signal?.aborted ?? false
          })
        )
        timeline.push('model/body')
        modelEntered()
        if (f.model.behavior === 'fail') throw new Error(f.model.error)
        if (f.model.behavior === 'cancel') controller.abort()
        if (f.model.behavior === 'cancel' || f.model.behavior === 'deadline') {
          // Cooperative external port: settle on abort and open no real handle.
          return new Promise((_, reject) => {
            if (signal?.aborted) reject(new Error('synthetic aborted'))
            else
              signal?.addEventListener(
                'abort',
                () => reject(new Error('synthetic aborted')),
                { once: true }
              )
          })
        }
        return json(f.model.result)
      }
    }
    const tool: ToolDefinition = {
      id: 'synthetic.replay',
      version: 'v1',
      description: 'synthetic recorded effect',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      sideEffect: 'WRITE',
      risk: 'LOW',
      requiresApproval: f.tool.requiresApproval,
      idempotent: true,
      execute: async (body, context) => {
        timeline.push('tool/body')
        const { signal, ...identity } = context
        toolBodies.push(
          json({
            input: body,
            context: identity,
            signalProvided: signal !== undefined,
            signalAborted: signal?.aborted ?? false
          })
        )
        if (f.tool.behavior === 'throw') throw new Error(f.tool.error)
        if (f.tool.behavior === 'fail')
          return { status: 'FAILED', error: f.tool.error }
        return { status: 'SUCCEEDED', output: json(f.tool.output) }
      }
    }
    for (const method of [
      'reserve',
      'markStarted',
      'confirm',
      'fail',
      'markUncertain'
    ] as const) {
      const original = journal[method].bind(journal)
      // Preserve all real store transitions; inject only the selected I/O failure.
      vi.spyOn(journal, method).mockImplementation((async (arg: never) => {
        timeline.push(`journal/${method}`)
        if (f.journalFailure === method)
          throw new Error(`synthetic journal ${method} failure`)
        return original(arg)
      }) as (typeof journal)[typeof method])
    }
    const append = sessions.append.bind(sessions)
    vi.spyOn(sessions, 'append').mockImplementation(async (event) => {
      timeline.push(`log/${event.type}`)
      if (event.type === f.logFailure) throw new Error('synthetic log failure')
      return append(event)
    })
    const auditSink = {
      append: async (event: unknown) => {
        audit.push(json(event))
        timeline.push('audit/append')
      }
    }
    const telemetrySink = {
      record: (event: unknown) => {
        telemetry.push(json(event))
        timeline.push('telemetry/record')
      }
    }
    let nextEvent = 0
    const newEventId = () => `event_replay_${++nextEvent}`
    let result: ReplayTranscript['result']
    if (f.entry === 'sdk') {
      const sdk = createSdk({
        tenantId: input.tenantId,
        agent: input.agent,
        modelGateway,
        policy,
        approvals,
        sessions,
        budget: input.budget,
        audit: auditSink,
        telemetry: telemetrySink,
        clock: () => new Date(),
        newEventId,
        newTraceId: () => input.traceId,
        newCorrelationId: () => input.correlationId
      })
      await sdk.openSession(input.sessionId)
      result = await sdk.sendTurn(input.sessionId, input.userMessage)
    } else {
      await sessions.openSession({
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        formatVersion: 1
      })
      const pause = new InMemoryPauseSwitch()
      if (probeControls === 'pause') pause.pause(input.tenantId)
      const effects = new InMemoryEffectLedger()
      const harness = createOperationalHarness({
        modelGateway,
        policy,
        approvals,
        audit: auditSink,
        telemetry: telemetrySink,
        tools: {
          list: () => [tool],
          resolve: (id, version) =>
            id === tool.id &&
            (version === undefined || version === tool.version)
              ? tool
              : undefined
        },
        effectJournal: journal,
        effectJournalOptions: { attemptIdFactory: () => 'replay_synthetic' },
        pause,
        effects,
        log: createSessionKernelLog({
          tenantId: input.tenantId,
          sessionId: input.sessionId,
          formatVersion: 1,
          traceId: input.traceId,
          correlationId: input.correlationId,
          store: sessions,
          eventId: newEventId,
          clock: () => new Date()
        })
      })
      const running = harness.run({ ...input, signal: controller.signal })
      if (f.model.behavior === 'deadline') {
        await entered
        await vi.advanceTimersByTimeAsync(input.budget.maxDurationMs)
      }
      result = await running
      if (probeControls)
        timeline.push(`probe/effect-ledger-entries:${effects.entries.length}`)
    }
    const events = await sessions.read({
      tenantId: input.tenantId,
      sessionId: input.sessionId
    })
    return json({
      result,
      events: [...events],
      modelRequests,
      toolBodies,
      journal: await journal.get(input.tenantId, 'replay-operation-synthetic'),
      policyDecisions,
      approvalRequests,
      approvalEvents,
      approvalRecords: approvalStore.list({ tenantId: input.tenantId }),
      audit,
      telemetry,
      timeline
    })
  } finally {
    vi.restoreAllMocks()
    vi.useRealTimers()
  }
}
