import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSdk } from '@cvg/sdk'
import {
  SDK_EXAMPLE_REPLY,
  SDK_EXAMPLE_SESSION,
  runSdkExampleJourney,
  sdkExampleModelGateway,
  sdkExamplePolicy,
  sdkExampleApprovals
} from '../examples/consumers/sdk-session/index.ts'
import {
  RecordingAudit,
  RecordingTelemetry,
  createSuiteManifest,
  fixedClock,
  normalizeLog,
  sequenceIds
} from './support/governed-test-kit/index.js'

const exampleSource = readFileSync(
  resolve(process.cwd(), 'examples/consumers/sdk-session/index.ts'),
  'utf8'
)

describe('PDSH-023 neutral SDK consumer', () => {
  const network = vi.fn(() => {
    throw new Error('network is disabled for the synthetic SDK consumer')
  })

  beforeEach(() => {
    network.mockClear()
    vi.stubGlobal('fetch', network)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens a session, sends a turn and observes the events', async () => {
    const { turn, events } = await runSdkExampleJourney()

    expect(turn.stopReason).toBe('COMPLETED')
    expect(turn.response).toBe(SDK_EXAMPLE_REPLY)
    expect(turn.modelCalls).toBe(1)
    expect(turn.toolCalls).toBe(0)
    expect(events.map((event) => event.type)).toEqual([
      'message/user',
      'turn/start',
      'model/request',
      'model/result',
      'turn/end',
      'message/assistant'
    ])
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6])
    expect(
      events.every((event) => event.sessionId === SDK_EXAMPLE_SESSION)
    ).toBe(true)
    expect(network).not.toHaveBeenCalled()
  })

  it('runs the minimal composition without a session', async () => {
    const { minimalTurn } = await runSdkExampleJourney()

    expect(minimalTurn.stopReason).toBe('COMPLETED')
    expect(minimalTurn.response).toBe(SDK_EXAMPLE_REPLY)
    expect(network).not.toHaveBeenCalled()
  })

  it('uses shared recording and injected identities through the public SDK', async () => {
    const inventory = createSuiteManifest({
      formatVersion: 1,
      id: 'sdk-governed-kit',
      version: '1.0.0',
      synthetic: true,
      cases: [{ id: 'recorded-turn', family: 'sdk' }]
    })
    const audit = new RecordingAudit()
    const telemetry = new RecordingTelemetry()
    const sdk = createSdk({
      tenantId: 'sdk_kit_synthetic',
      modelGateway: sdkExampleModelGateway,
      policy: sdkExamplePolicy,
      approvals: sdkExampleApprovals,
      audit,
      telemetry,
      clock: fixedClock('2026-10-17T12:00:00.000Z'),
      newEventId: sequenceIds('sdk_kit_event_'),
      newTraceId: () => 'sdk_kit_trace',
      newCorrelationId: () => 'sdk_kit_correlation'
    })
    await sdk.openSession('sdk_kit_session')
    const turn = await sdk.sendTurn('sdk_kit_session', 'synthetic kit request')
    const events = await sdk.readEvents('sdk_kit_session')

    expect(turn.stopReason).toBe('COMPLETED')
    expect(turn.response).toBe(SDK_EXAMPLE_REPLY)
    expect(turn.modelCalls).toBe(1)
    expect(turn.toolCalls).toBe(0)
    expect(events.map((event) => event.type)).toEqual([
      'message/user',
      'turn/start',
      'model/request',
      'model/result',
      'turn/end',
      'message/assistant'
    ])
    expect(events.map((event) => event.eventId)).toEqual(
      Array.from({ length: 6 }, (_, i) => `sdk_kit_event_${i + 1}`)
    )
    expect(
      events.every((event) => event.timestamp === '2026-10-17T12:00:00.000Z')
    ).toBe(true)
    expect(
      events.every(
        (event) =>
          event.traceId === 'sdk_kit_trace' &&
          event.correlationId === 'sdk_kit_correlation'
      )
    ).toBe(true)
    expect(normalizeLog(events).projection).toEqual(events)
    expect(audit.events.length).toBeGreaterThan(0)
    expect(telemetry.events.length).toBeGreaterThan(0)
    expect(
      audit.events.every((event) => event.tenant === 'sdk_kit_synthetic')
    ).toBe(true)
    expect(inventory.manifest.cases).toEqual([
      { id: 'recorded-turn', family: 'sdk' }
    ])
    expect(network).not.toHaveBeenCalled()
  })

  it('imports only supported public package roots', () => {
    const specifiers = [
      ...exampleSource.matchAll(/\bfrom\s+'([^']+)'|\bimport\(\s*'([^']+)'/g)
    ].map((match) => match[1] ?? match[2])

    expect(specifiers.length).toBeGreaterThan(0)
    expect(new Set(specifiers)).toEqual(
      new Set(['@cvg/sdk', '@cvg/harness-contracts'])
    )
    expect(exampleSource).not.toMatch(
      /products\/|\/src\/|node:(http|https|net)|fetch\(/
    )
  })
})
