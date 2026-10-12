import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SDK_EXAMPLE_REPLY,
  SDK_EXAMPLE_SESSION,
  runSdkExampleJourney
} from '../examples/consumers/sdk-session/index.ts'

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
