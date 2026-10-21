import { describe, expect, it } from 'vitest'
import type { ExecutionRecord } from '@cvg/harness'
import {
  EXECUTION_ERROR_MESSAGES,
  HANDOFF_PRESENTATION,
  UNKNOWN_EFFECT_MESSAGE,
  acknowledgeExecution,
  classifyExecutionPresentation,
  projectAuditFull,
  projectAuditLimited,
  projectConversationPage,
  projectExecution,
  projectTimeline
} from './case-projections.ts'

/**
 * SPEC0176 AUTH08 — closed execution classification and allowlist DTOs.
 * Every record carries canaries in response, toolResult, failure.message
 * and resume; no projected value may contain one, except the user-facing
 * COMPLETED answer that is explicitly allowed.
 */
const CANARY = 'CANARY_DIAGNOSTIC_SECRET'

type Failure = NonNullable<ExecutionRecord['failure']>
type Result = NonNullable<ExecutionRecord['result']>

function result(stopReason: Result['stopReason'], extra: Partial<Result> = {}) {
  return {
    response: `${CANARY} response for ${stopReason}`,
    stopReason,
    steps: 1,
    modelCalls: 1,
    toolCalls: 0,
    usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
    ...extra
  } as Result
}

function record(
  state: ExecutionRecord['state'],
  overrides: Partial<ExecutionRecord> = {}
): ExecutionRecord {
  return {
    id: 'exec_projection',
    tenantId: 'tenant_00000000-0000-4000-8000-000000000001',
    idempotencyKey: `${CANARY}-key`,
    requestHash: `${CANARY}-hash`,
    request: { canary: CANARY } as never,
    state,
    attempt: 1,
    leaseOwner: `${CANARY}-worker`,
    leaseUntil: null,
    result: null,
    failure: null,
    approvalId: null,
    resume: {
      kind: 'user_input',
      input: CANARY,
      boundAt: '2026-10-20T00:00:00.000Z'
    },
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
    completedAt: null,
    ...overrides
  }
}

function failure(kind: Failure['kind'], code: string): Failure {
  return { kind, code, message: `${CANARY} ${code}` }
}

type FailureCase = [
  Failure['kind'],
  string,
  ExecutionRecord['state'],
  keyof typeof EXECUTION_ERROR_MESSAGES
]

const summary = (code: keyof typeof EXECUTION_ERROR_MESSAGES) => ({
  response: null,
  errorSummary: { code, message: EXECUTION_ERROR_MESSAGES[code] }
})

describe('SPEC0176 execution presentation classification', () => {
  const budget = [
    'max_steps',
    'max_cost',
    'max_duration',
    'max_tokens',
    'max_model_calls',
    'max_tool_calls',
    'max_replans',
    'max_knowledge_calls',
    'max_verification_calls'
  ]
  const failureCases: Array<
    [
      Failure['kind'],
      string,
      ExecutionRecord['state'],
      keyof typeof EXECUTION_ERROR_MESSAGES
    ]
  > = [
    ['CANCELLED', 'cancelled', 'CANCELLED', 'execution_cancelled'],
    ['CANCELLED', 'cancelled_by_operator', 'CANCELLED', 'execution_cancelled'],
    ['POLICY_DENIED', 'policy_denied', 'FAILED_TERMINAL', 'execution_denied'],
    [
      'POLICY_DENIED',
      'approval_rejected',
      'FAILED_TERMINAL',
      'execution_denied'
    ],
    [
      'SEMANTIC_TERMINAL',
      'unsafe_request',
      'FAILED_TERMINAL',
      'execution_denied'
    ],
    [
      'SEMANTIC_TERMINAL',
      'insufficient_evidence',
      'FAILED_TERMINAL',
      'execution_needs_review'
    ],
    [
      'SEMANTIC_TERMINAL',
      'verification_failed',
      'FAILED_TERMINAL',
      'execution_needs_review'
    ],
    [
      'SEMANTIC_TERMINAL',
      'loop_detected',
      'FAILED_TERMINAL',
      'execution_needs_review'
    ],
    [
      'SEMANTIC_TERMINAL',
      'approval_missing',
      'FAILED_TERMINAL',
      'execution_needs_review'
    ],
    ...budget.map(
      (code): FailureCase => [
        'SEMANTIC_TERMINAL',
        code,
        'FAILED_TERMINAL',
        'execution_budget_exhausted'
      ]
    ),
    [
      'SEMANTIC_TERMINAL',
      'state_conflict',
      'FAILED_TERMINAL',
      'execution_conflict'
    ],
    [
      'TECHNICAL_RETRYABLE',
      'model_failure',
      'FAILED_RETRYABLE',
      'execution_failed'
    ],
    [
      'TECHNICAL_RETRYABLE',
      'internal_failure',
      'FAILED_RETRYABLE',
      'execution_failed'
    ],
    [
      'TECHNICAL_RETRYABLE',
      'tool_failure',
      'FAILED_RETRYABLE',
      'execution_failed'
    ],
    [
      'TECHNICAL_RETRYABLE',
      'worker_exception',
      'FAILED_RETRYABLE',
      'execution_failed'
    ],
    [
      'SEMANTIC_TERMINAL',
      'retry_exhausted',
      'FAILED_TERMINAL',
      'execution_failed'
    ],
    ['SEMANTIC_TERMINAL', 'future_code', 'FAILED_TERMINAL', 'execution_failed'],
    ['CANCELLED', 'cancelled', 'FAILED_TERMINAL', 'execution_failed'],
    ['POLICY_DENIED', 'policy_denied', 'CANCELLED', 'execution_failed']
  ]

  it.each(failureCases)(
    'maps persisted failure %s/%s in %s to %s with a static message',
    (kind, code, state, expected) => {
      const presentation = classifyExecutionPresentation(
        record(state, {
          failure: failure(kind, code),
          result: result('APPROVAL_REQUIRED')
        })
      )
      expect(presentation).toEqual(summary(expected))
      expect(JSON.stringify(presentation)).not.toContain(CANARY)
    }
  )

  it('gives UNKNOWN_EFFECT absolute precedence', () => {
    for (const code of ['unknown_effect', 'other']) {
      expect(
        classifyExecutionPresentation(
          record('FAILED_TERMINAL', {
            failure: failure('UNKNOWN_EFFECT', code),
            result: result('HUMAN_TAKEOVER')
          })
        )
      ).toEqual({
        response: null,
        errorSummary: {
          code: 'execution_needs_review',
          message: UNKNOWN_EFFECT_MESSAGE
        }
      })
    }
  })

  it('presents the exact human takeover pair as a static handoff only', () => {
    expect(
      classifyExecutionPresentation(
        record('FAILED_TERMINAL', {
          failure: failure('SEMANTIC_TERMINAL', 'human_takeover'),
          result: result('HUMAN_TAKEOVER', {
            toolResult: { status: 'SUCCEEDED', output: CANARY } as never
          })
        })
      )
    ).toEqual({ response: HANDOFF_PRESENTATION, errorSummary: null })
    // Any divergent combination loses the exception.
    for (const divergent of [
      record('FAILED_TERMINAL', {
        failure: failure('SEMANTIC_TERMINAL', 'human_takeover'),
        result: result('COMPLETED')
      }),
      record('CANCELLED', {
        failure: failure('SEMANTIC_TERMINAL', 'human_takeover'),
        result: result('HUMAN_TAKEOVER')
      }),
      record('FAILED_TERMINAL', { result: result('HUMAN_TAKEOVER') })
    ]) {
      expect(classifyExecutionPresentation(divergent)).toEqual(
        summary('execution_failed')
      )
    }
  })

  it('maps stop reasons persisted without failure', () => {
    const cases: Array<
      [Result['stopReason'], keyof typeof EXECUTION_ERROR_MESSAGES]
    > = [
      ['POLICY_DENIED', 'execution_denied'],
      ['UNSAFE_REQUEST', 'execution_denied'],
      ['INSUFFICIENT_EVIDENCE', 'execution_needs_review'],
      ['VERIFICATION_FAILED', 'execution_needs_review'],
      ['LOOP_DETECTED', 'execution_needs_review'],
      ['MAX_STEPS', 'execution_budget_exhausted'],
      ['MAX_VERIFICATION_CALLS', 'execution_budget_exhausted'],
      ['STATE_CONFLICT', 'execution_conflict'],
      ['MODEL_FAILURE', 'execution_failed'],
      ['TOOL_FAILURE', 'execution_failed'],
      ['INTERNAL_FAILURE', 'execution_failed'],
      ['FUTURE_REASON' as Result['stopReason'], 'execution_failed']
    ]
    for (const [stopReason, expected] of cases) {
      expect(
        classifyExecutionPresentation(
          record('FAILED_TERMINAL', { result: result(stopReason) })
        )
      ).toEqual(summary(expected))
    }
    expect(classifyExecutionPresentation(record('CANCELLED'))).toEqual(
      summary('execution_cancelled')
    )
    expect(classifyExecutionPresentation(record('SUCCEEDED'))).toEqual(
      summary('execution_failed')
    )
  })

  it('releases presentation text only for proven user-facing producers', () => {
    expect(
      classifyExecutionPresentation(
        record('SUCCEEDED', {
          result: { ...result('COMPLETED'), response: 'Resposta ao tutor' }
        })
      )
    ).toEqual({ response: 'Resposta ao tutor', errorSummary: null })
    // The single-pass tool path writes raw tool output into `response`.
    expect(
      classifyExecutionPresentation(
        record('SUCCEEDED', {
          result: result('COMPLETED', {
            toolResult: { status: 'SUCCEEDED', output: CANARY } as never
          })
        })
      )
    ).toEqual({ response: null, errorSummary: null })
    expect(
      classifyExecutionPresentation(
        record('WAITING_USER', { result: result('NEEDS_USER_INPUT') })
      )
    ).toEqual({ response: null, errorSummary: null })
    expect(
      classifyExecutionPresentation(
        record('WAITING_APPROVAL', {
          approvalId: 'approval_1',
          result: result('APPROVAL_REQUIRED')
        })
      )
    ).toEqual({ response: null, errorSummary: null })
    expect(
      classifyExecutionPresentation(
        record('WAITING_APPROVAL', { result: result('APPROVAL_REQUIRED') })
      )
    ).toEqual(summary('execution_needs_review'))
    expect(
      classifyExecutionPresentation(
        record('WAITING_USER', { result: result('COMPLETED') })
      )
    ).toEqual(summary('execution_failed'))
    // Sensitive text in a user-facing answer is still redacted.
    expect(
      classifyExecutionPresentation(
        record('SUCCEEDED', {
          result: {
            ...result('COMPLETED'),
            response: 'Contato +55 11 99999-0000'
          }
        })
      ).response
    ).not.toContain('99999-0000')
  })

  it('never invents an error for pending work', () => {
    for (const state of ['RECEIVED', 'QUEUED', 'CLAIMED', 'RUNNING'] as const) {
      expect(
        classifyExecutionPresentation(
          record(state, {
            result: result('NEEDS_USER_INPUT'),
            failure: failure('TECHNICAL_RETRYABLE', 'model_failure')
          })
        )
      ).toEqual({ response: null, errorSummary: null })
    }
    expect(classifyExecutionPresentation(record('WAITING_USER'))).toEqual({
      response: null,
      errorSummary: null
    })
  })

  it('projects the execution DTO v2 and the ack by allowlist', () => {
    const projected = projectExecution(
      record('SUCCEEDED', {
        result: result('COMPLETED', {
          toolResult: { status: 'SUCCEEDED', output: CANARY } as never
        }),
        approvalId: 'approval_canary',
        futureField: CANARY
      } as Partial<ExecutionRecord>)
    )
    expect(Object.keys(projected).sort()).toEqual(
      [
        'attempt',
        'completedAt',
        'createdAt',
        'errorSummary',
        'id',
        'response',
        'state',
        'updatedAt',
        'viewVersion'
      ].sort()
    )
    expect(JSON.stringify(projected)).not.toContain(CANARY)
    expect(JSON.stringify(projected)).not.toContain('approval_canary')
    expect(acknowledgeExecution(record('QUEUED'))).toEqual({
      id: 'exec_projection',
      state: 'QUEUED'
    })
  })
})

describe('SPEC0176 conversation, timeline and audit allowlists', () => {
  const at = new Date('2026-10-20T00:00:00.000Z')

  it('drops correlation, fingerprints, external ids and future fields', () => {
    const page = projectConversationPage({
      items: [
        {
          id: 'conv_1',
          channel: 'whatsapp',
          senderRef: '+55 11 98888-7777',
          status: 'active',
          correlationId: `corr_${CANARY}`,
          openSessionId: 'sess_1',
          lastMessageBody: null,
          lastMessageAt: null,
          createdAt: at,
          updatedAt: at,
          senderRefHash: CANARY
        } as never
      ],
      pageInfo: { limit: 1, offset: 0, total: 1, hasNextPage: false }
    })
    expect(JSON.stringify(page)).not.toContain(CANARY)
    expect(page.items[0]?.senderRef).not.toContain('98888')
    const timeline = projectTimeline({
      messages: [
        {
          id: 'msg_1',
          conversationId: 'conv_1',
          externalMessageId: CANARY,
          direction: 'inbound',
          body: 'Mensagem',
          createdAt: at
        }
      ],
      sessions: [
        {
          id: 'sess_1',
          conversationId: 'conv_1',
          status: 'open',
          takeoverState: 'BOT_ACTIVE',
          agentId: 'agent_1' as never,
          agentVersionId: 'version_1' as never,
          createdAt: at,
          updatedAt: at,
          future: CANARY
        } as never
      ]
    })
    expect(JSON.stringify(timeline)).not.toContain(CANARY)
    expect(timeline.messages[0]).not.toHaveProperty('runtimeStatus')
    expect(timeline.sessions[0]).toMatchObject({
      agentId: 'agent_1',
      agentVersionId: 'version_1'
    })
  })

  it('keeps limited audit to five fields and sanitizes the full view', () => {
    const event = {
      id: 'audit_1',
      tenantId: 'tenant_00000000-0000-4000-8000-000000000001' as never,
      type: 'integration_event' as const,
      actorType: 'System' as const,
      actorId: `actor_${CANARY}`,
      correlationId: `corr_${CANARY}`,
      policyVersion: 'v1',
      payload: { token: `${CANARY}-token`, sessionId: 'sess_1' },
      createdAt: at,
      future: CANARY
    }
    const limited = projectAuditLimited([event as never])
    expect(limited).toEqual([
      {
        id: 'audit_1',
        type: 'integration_event',
        actorType: 'System',
        policyVersion: 'v1',
        createdAt: at
      }
    ])
    const full = projectAuditFull([
      event as never,
      { ...event, tenantId: undefined } as never
    ])
    expect(full[0]).toMatchObject({ actorId: `actor_${CANARY}` })
    expect(full[0]).not.toHaveProperty('future')
    expect(JSON.stringify(full[0]?.payload)).not.toContain(`${CANARY}-token`)
    expect(full[1]).not.toHaveProperty('tenantId')
  })
})
