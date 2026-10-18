import { expect } from 'vitest'
import type { ReplayTranscript } from './fixture-schema.mjs'
// Independent acceptance, anchored in ADR-011 I4/I5/I6/I8 and SPEC 0181.
// These checks precede any candidate recording. Golden files then preserve the
// whole transcript including every response/payload/error/counter/event.
const rows: Record<
  string,
  readonly [string, number, number, number, string | null]
> = {
  'simple-response': ['COMPLETED', 1, 0, 0, null],
  'sdk-response': ['COMPLETED', 1, 0, 0, null],
  'authorized-tool': ['COMPLETED', 0, 1, 1, 'CONFIRMED'],
  'policy-denied': ['POLICY_DENIED', 0, 0, 0, null],
  'approval-pending': ['APPROVAL_REQUIRED', 0, 0, 0, null],
  'approval-refused': ['POLICY_DENIED', 0, 0, 0, null],
  'model-budget-zero': ['MAX_MODEL_CALLS', 0, 0, 0, null],
  'token-budget': ['MAX_TOKENS', 1, 0, 0, null],
  'cost-budget': ['MAX_COST', 1, 0, 0, null],
  'cancel-before': ['CANCELLED', 0, 0, 0, null],
  'cancel-model': ['CANCELLED', 1, 0, 0, null],
  'deadline-model': ['MAX_DURATION', 1, 0, 0, null],
  'model-failure': ['MODEL_FAILURE', 1, 0, 0, null],
  'tool-failure': ['TOOL_FAILURE', 0, 1, 1, 'FAILED'],
  'tool-throw': ['TOOL_FAILURE', 0, 1, 1, 'UNCERTAIN'],
  'log-call-failure': ['INSUFFICIENT_EVIDENCE', 0, 0, 0, null],
  'log-result-failure': ['INSUFFICIENT_EVIDENCE', 0, 1, 1, 'CONFIRMED'],
  'journal-start-failure': ['TOOL_FAILURE', 0, 1, 0, 'RESERVED'],
  'journal-confirm-failure': ['TOOL_FAILURE', 0, 1, 1, 'UNCERTAIN'],
  'sdk-model-failure': ['MODEL_FAILURE', 1, 0, 0, null]
}
export function assertBehavior(id: string, t: ReplayTranscript) {
  const row = rows[id]
  if (!row) throw new Error(`missing independent contract: ${id}`)
  expect(
    [
      t.result.stopReason,
      t.result.modelCalls,
      t.result.toolCalls,
      t.toolBodies.length,
      (t.journal as { state: string } | null)?.state ?? null
    ],
    id
  ).toEqual(row)
  let eventTypes = ['turn/start', 'tool/call', 'tool/result', 'turn/end']
  if (['simple-response', 'token-budget', 'cost-budget'].includes(id))
    eventTypes = ['turn/start', 'model/request', 'model/result', 'turn/end']
  if (['cancel-model', 'deadline-model', 'model-failure'].includes(id))
    eventTypes = ['turn/start', 'model/request', 'turn/end']
  if (['model-budget-zero', 'cancel-before', 'log-call-failure'].includes(id))
    eventTypes = ['turn/start', 'turn/end']
  if (id === 'log-result-failure')
    eventTypes = ['turn/start', 'tool/call', 'turn/end']
  if (id === 'sdk-response')
    eventTypes = [
      'message/user',
      'turn/start',
      'model/request',
      'model/result',
      'turn/end',
      'message/assistant'
    ]
  if (id === 'sdk-model-failure')
    eventTypes = ['message/user', 'turn/start', 'model/request', 'turn/end']
  expect(t.events.map((event) => (event as { type: string }).type)).toEqual(
    eventTypes
  )
  expect(
    t.events.map((event) => (event as { sequence: number }).sequence)
  ).toEqual(eventTypes.map((_, index) => index + 1))
  if ('steps' in t.result) expect(t.result.steps).toBe(1)
  if (id === 'simple-response' || id === 'sdk-response')
    expect(t.result.response).toBe('synthetic recorded answer')
  if (id === 'authorized-tool')
    expect(t.result.response).toBe(
      '{"value":"synthetic-result","applied":true}'
    )
  const timeline = t.timeline
  if (t.toolBodies.length) {
    expect(timeline.indexOf('log/tool/call')).toBeGreaterThanOrEqual(0)
    expect(
      timeline.indexOf('log/tool/call'),
      'call persisted before body'
    ).toBeLessThan(timeline.indexOf('tool/body'))
    expect(
      timeline.indexOf('log/tool/result'),
      'result attempted after body'
    ).toBeGreaterThan(timeline.indexOf('tool/body'))
  }
  if (t.modelRequests.length) {
    expect(timeline.indexOf('log/model/request')).toBeGreaterThanOrEqual(0)
    expect(timeline.indexOf('log/model/request')).toBeLessThan(
      timeline.indexOf('model/body')
    )
  }
  if (
    ['simple-response', 'sdk-response', 'token-budget', 'cost-budget'].includes(
      id
    )
  ) {
    expect(t.result.usage).toEqual({
      inputTokens: 3,
      outputTokens: 4,
      costUsd: 0.002
    })
    expect(timeline.indexOf('log/model/result')).toBeGreaterThan(
      timeline.indexOf('model/body')
    )
  } else
    expect(t.result.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0
    })
  if (id === 'approval-pending' || id === 'approval-refused') {
    expect(t.approvalRequests).toHaveLength(1)
    expect(t.approvalRecords).toMatchObject([
      {
        status: id === 'approval-pending' ? 'PENDING' : 'REJECTED',
        executionCount: 0
      }
    ])
    expect('approvalId' in t.result ? t.result.approvalId : undefined).toBe(
      'approval_replay_synthetic'
    )
  }
  if (id === 'policy-denied')
    expect(t.policyDecisions).toMatchObject([{ decision: 'DENY' }])
}
