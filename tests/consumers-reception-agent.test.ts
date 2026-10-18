import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOOKUP_OPENING_HOURS,
  RECEPTION_TENANT_ID,
  REQUEST_APPOINTMENT_SLOT,
  SYNTHETIC_GREETING,
  SYNTHETIC_OPENING_HOURS_SOURCE,
  createReceptionAgentFixture,
  createReceptionAgentInput,
  receptionBudget,
  receptionOperationKey,
  runReceptionJourney
} from '../examples/consumers/reception-agent/index.ts'

const exampleSource = readFileSync(
  resolve(process.cwd(), 'examples/consumers/reception-agent/index.ts'),
  'utf8'
)

describe('HISO-009 neutral reception consumer', () => {
  const network = vi.fn(() => {
    throw new Error('network is disabled for the synthetic consumer')
  })

  beforeEach(() => {
    network.mockClear()
    vi.stubGlobal('fetch', network)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('runs the synthetic journey through the public composition root', async () => {
    const journey = await runReceptionJourney()
    const { fixture } = journey

    expect(journey.greeting.stopReason).toBe('COMPLETED')
    expect(journey.greeting.response).toBe(SYNTHETIC_GREETING)
    expect(journey.greeting.modelCalls).toBe(1)
    expect(journey.greeting.toolCalls).toBe(0)
    expect(journey.greeting.usage.costUsd).toBeGreaterThan(0)
    expect(journey.greeting.usage.costUsd).toBeLessThanOrEqual(
      receptionBudget.maxCostUsd
    )

    expect(journey.openingHours.stopReason).toBe('COMPLETED')
    expect(journey.openingHours.modelCalls).toBe(0)
    expect(journey.openingHours.toolCalls).toBe(1)
    expect(journey.openingHours.toolResult?.output).toEqual({
      answer: SYNTHETIC_OPENING_HOURS_SOURCE.text,
      sourceId: SYNTHETIC_OPENING_HOURS_SOURCE.sourceId,
      sourceVersion: SYNTHETIC_OPENING_HOURS_SOURCE.sourceVersion,
      synthetic: true
    })
    expect(fixture.capabilityCalls.lookup).toBe(1)
    await expect(
      fixture.effectJournal.get(
        RECEPTION_TENANT_ID,
        receptionOperationKey(
          'correlation_reception_opening-hours',
          LOOKUP_OPENING_HOURS
        )
      )
    ).resolves.toMatchObject({ state: 'CONFIRMED' })

    expect(journey.clinicalQuestion.stopReason).toBe('HUMAN_TAKEOVER')
    expect(journey.clinicalQuestion.modelCalls).toBe(0)
    expect(journey.clinicalQuestion.toolCalls).toBe(0)
  })

  it('ends an appointment request in approval without executing the effect', async () => {
    const { appointment, fixture } = await runReceptionJourney()

    expect(appointment.stopReason).toBe('APPROVAL_REQUIRED')
    expect(appointment.approvalId).toBe('approval_reception_1')
    expect(appointment.toolCalls).toBe(0)
    expect(fixture.capabilityCalls.appointment).toBe(0)
    expect(fixture.approvalRequests).toHaveLength(1)
    expect(fixture.approvalRequests[0]).toMatchObject({
      tenantId: RECEPTION_TENANT_ID,
      toolId: REQUEST_APPOINTMENT_SLOT,
      operationKey: receptionOperationKey(
        'correlation_reception_appointment',
        REQUEST_APPOINTMENT_SLOT
      )
    })
    expect(fixture.policyDecisions.map((decision) => decision.outcome)).toEqual(
      ['ALLOW', 'REQUIRE_APPROVAL']
    )
    await expect(
      fixture.effectJournal.get(
        RECEPTION_TENANT_ID,
        receptionOperationKey(
          'correlation_reception_appointment',
          REQUEST_APPOINTMENT_SLOT
        )
      )
    ).resolves.toBeNull()
  })

  it('records audit, harness telemetry and model gateway events for every turn', async () => {
    const { fixture } = await runReceptionJourney()

    expect(fixture.auditEvents.map((event) => event.result)).toEqual([
      'COMPLETED',
      'COMPLETED',
      'APPROVAL_REQUIRED',
      'HUMAN_TAKEOVER'
    ])
    expect(fixture.auditEvents.map((event) => event.tool)).toEqual([
      null,
      LOOKUP_OPENING_HOURS,
      REQUEST_APPOINTMENT_SLOT,
      null
    ])
    expect(fixture.auditEvents[2]?.policy).toBe('REQUIRE_APPROVAL')
    expect(fixture.auditEvents.every((event) => event.tenant)).toBe(true)

    expect(fixture.telemetryEvents).toHaveLength(4)
    expect(fixture.telemetryEvents[0]).toMatchObject({
      provider: 'reception-deterministic',
      errors: 0,
      steps: 1
    })
    expect(fixture.telemetryEvents[0]?.inputTokens).toBeGreaterThan(0)
    expect(fixture.telemetryEvents[2]?.errors).toBe(1)

    expect(fixture.modelEvents.map((event) => event.type)).toEqual([
      'model.call.started',
      'model.call.completed'
    ])
    expect(fixture.modelEvents[1]).toMatchObject({
      tenantId: RECEPTION_TENANT_ID,
      providerId: 'reception-deterministic',
      profile: 'fast'
    })
  })

  it('performs no real network call and uses only the deterministic provider', async () => {
    const { fixture } = await runReceptionJourney()

    expect(network).not.toHaveBeenCalled()
    expect(fixture.providerCalls).toEqual([{ externalCall: false }])
    expect(exampleSource).not.toMatch(
      /OpenAICompatibleProvider|OllamaProvider|fetch\(|node:(http|https|net)/
    )
  })

  it('stops with a denial and no effect when the synthetic team declines', async () => {
    const fixture = createReceptionAgentFixture({ approvalDecision: 'DENIED' })

    const result = await fixture.harness.run(
      createReceptionAgentInput('Preciso agendar uma consulta.', 'denied')
    )

    expect(result.stopReason).toBe('POLICY_DENIED')
    expect(fixture.capabilityCalls.appointment).toBe(0)
    expect(fixture.approvalRequests).toHaveLength(1)
  })

  it('fails closed when the audit sink cannot record the turn', async () => {
    const fixture = createReceptionAgentFixture({ auditFailure: true })

    const result = await fixture.harness.run(
      createReceptionAgentInput(
        'Qual é o horário de funcionamento?',
        'audit-failure'
      )
    )

    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(fixture.telemetryEvents).toHaveLength(1)
  })

  it('imports nothing from products or private package paths', () => {
    const specifiers = [
      ...exampleSource.matchAll(/\bfrom\s+'([^']+)'|\bimport\(\s*'([^']+)'/g)
    ].map((match) => match[1] ?? match[2])

    expect(specifiers.length).toBeGreaterThan(0)
    expect(new Set(specifiers)).toEqual(
      new Set(['@cvg/harness', '@cvg/harness-contracts', '@cvg/model-gateway'])
    )
    expect(exampleSource).not.toMatch(/products\/|shift-assistant|\/src\//)
  })
})
