/**
 * PDSH-023 neutral SDK consumer example (HISO-009 / SPEC 0204): drives the
 * integrator SDK through its supported public package roots only. Everything
 * is synthetic and deterministic: no network, provider, database or channel.
 */
import { createSdk, createSdkMinimal, type SdkFacade } from '@cvg/sdk'
import type {
  ApprovalEngine,
  ModelGateway,
  PolicyEngine,
  SessionEvent
} from '@cvg/harness-contracts'

export const SDK_EXAMPLE_TENANT = 'sdk_tenant_synthetic'
export const SDK_EXAMPLE_SESSION = 'session_sdk_synthetic'
export const SDK_EXAMPLE_REPLY = 'Resposta sintética do SDK.'

export const sdkExampleModelGateway: ModelGateway = {
  complete: async () => ({
    text: SDK_EXAMPLE_REPLY,
    provider: 'sdk-example-deterministic',
    model: 'deterministic-v1',
    inputTokens: 3,
    outputTokens: 4,
    costUsd: 0
  })
}

export const sdkExamplePolicy: PolicyEngine = {
  evaluate: async () => ({
    outcome: 'ALLOW',
    reason: 'sdk example synthetic policy',
    policyVersion: 'sdk-example-1'
  })
}

export const sdkExampleApprovals: ApprovalEngine = {
  request: async () => ({
    status: 'DENIED',
    reason: 'the synthetic SDK example never executes effects'
  })
}

export interface SdkExampleFixture {
  readonly sdk: SdkFacade
  readonly events: readonly SessionEvent[]
  readonly turn: {
    readonly stopReason: string
    readonly response: string
    readonly modelCalls: number
    readonly toolCalls: number
  }
  readonly minimalTurn: {
    readonly stopReason: string
    readonly response: string
  }
}

/** Opens a session, sends a turn through the SDK and reads the events back. */
export async function runSdkExampleJourney(): Promise<SdkExampleFixture> {
  let eventCounter = 0
  let turnCounter = 0
  const sdk = createSdk({
    tenantId: SDK_EXAMPLE_TENANT,
    modelGateway: sdkExampleModelGateway,
    policy: sdkExamplePolicy,
    approvals: sdkExampleApprovals,
    clock: () => new Date('2026-10-07T12:00:00.000Z'),
    newEventId: () => `example_event_${(eventCounter += 1)}`,
    newCorrelationId: () => `example_correlation_${(turnCounter += 1)}`,
    newTraceId: () => `example_trace_${turnCounter}`
  })
  await sdk.openSession(SDK_EXAMPLE_SESSION)
  const turn = await sdk.sendTurn(SDK_EXAMPLE_SESSION, 'Olá, SDK sintético!')
  const events = await sdk.readEvents(SDK_EXAMPLE_SESSION)
  const minimal = createSdkMinimal({
    tenantId: SDK_EXAMPLE_TENANT,
    modelGateway: sdkExampleModelGateway,
    policy: sdkExamplePolicy,
    approvals: sdkExampleApprovals
  })
  const minimalTurn = await minimal.sendTurn('Turno mínimo sintético')
  return {
    sdk,
    events,
    turn: {
      stopReason: turn.stopReason,
      response: turn.response,
      modelCalls: turn.modelCalls,
      toolCalls: turn.toolCalls
    },
    minimalTurn: {
      stopReason: minimalTurn.stopReason,
      response: minimalTurn.response
    }
  }
}
