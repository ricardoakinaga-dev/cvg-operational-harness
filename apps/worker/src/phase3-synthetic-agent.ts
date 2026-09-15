import type {
  AgenticKnowledgeProvider,
  ApprovalEngine,
  ExecutionStepStore,
  LoopDecision,
  ModelRequest,
  ModelResult,
  SufficiencyEvaluator,
  ToolDefinition,
  ToolExecutionContext,
  ToolRegistry
} from '@cvg/harness-contracts'
import type { OperationalHarnessOptions } from '@cvg/harness'
import { ScriptedOrchestrator } from '@cvg/harness-orchestrator'

export const PHASE3_SCENARIOS = [
  'operational',
  'knowledge',
  'waiting_user',
  'approval'
] as const
export type Phase3Scenario = (typeof PHASE3_SCENARIOS)[number]

export const PHASE3_TOOL_AVAILABILITY = 'synthetic.phase3.availability'
export const PHASE3_TOOL_RESERVE = 'synthetic.phase3.reserve'

export interface Phase3Observer {
  (context: ToolExecutionContext): void
}

/**
 * Controlled Phase 3 fixture. It is rejected in production by the worker
 * factory before this module is used; every executor is deterministic and
 * performs no network, channel or product side effect.
 */
export function createPhase3ToolRegistry(
  observer?: Phase3Observer
): ToolRegistry {
  const availability: ToolDefinition = {
    id: PHASE3_TOOL_AVAILABILITY,
    version: 'v1',
    description: 'Checks synthetic resource availability (no I/O).',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    risk: 'LOW',
    sideEffect: 'READ',
    idempotent: true,
    requiresApproval: false,
    execute: async (_input, context) => {
      observer?.(context)
      return {
        status: 'SUCCEEDED',
        output: { available: false, reason: 'occupied' }
      }
    }
  }
  const reserve: ToolDefinition = {
    id: PHASE3_TOOL_RESERVE,
    version: 'v1',
    description: 'Creates a synthetic reservation (no I/O).',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    risk: 'MEDIUM',
    sideEffect: 'WRITE',
    idempotent: false,
    requiresApproval: false,
    execute: async (input, context) => {
      void input
      observer?.(context)
      return {
        status: 'SUCCEEDED',
        output: { reservationRef: 'reservation-synthetic-1', applied: true }
      }
    }
  }
  const tools = [availability, reserve]
  return {
    list: () => tools,
    resolve: (toolId, version) =>
      tools.find(
        (tool) =>
          tool.id === toolId &&
          (version === undefined || tool.version === version)
      )
  }
}

const CATEGORIES = ['infectious', 'nutritional', 'metabolic'] as const

const KNOWLEDGE_ITEMS = [
  {
    itemId: 'evidence-infectious-1',
    text: 'condition-X infectious causes include pathogen-alpha.',
    category: 'infectious'
  },
  {
    itemId: 'evidence-nutritional-1',
    text: 'condition-X nutritional causes include diet-deficiency-beta.',
    category: 'nutritional'
  },
  {
    itemId: 'evidence-metabolic-1',
    text: 'condition-X metabolic causes include enzyme-gamma.',
    category: 'metabolic'
  }
]

export function createPhase3KnowledgeProvider(): AgenticKnowledgeProvider {
  return {
    search: async (request) => {
      const tokens = request.query.toLowerCase().split(/\s+/)
      const items = KNOWLEDGE_ITEMS.filter((item) =>
        tokens.some(
          (token) =>
            token.length > 2 &&
            `${item.text} ${item.category}`.toLowerCase().includes(token)
        )
      )
      return {
        query: request.query,
        items: items.map((item) => ({
          itemId: item.itemId,
          text: item.text,
          sourceId: `source-${item.category}`,
          sourceVersion: 'v1',
          category: item.category
        })),
        provenance: items.map((item) => ({
          sourceId: `source-${item.category}`,
          sourceVersion: 'v1',
          category: item.category
        }))
      }
    }
  }
}

export function createPhase3SufficiencyEvaluator(): SufficiencyEvaluator {
  return {
    evaluate: async (input) => {
      const found = new Map<string, number>()
      for (const observation of input.observations) {
        const payload = observation.payload as {
          items?: readonly { category?: string }[]
        } | null
        for (const item of payload?.items ?? []) {
          const category = item.category ?? 'unknown'
          found.set(category, (found.get(category) ?? 0) + 1)
        }
      }
      const requested = input.requestedCategories.length
        ? input.requestedCategories
        : [...CATEGORIES]
      const missing = requested.filter((category) => !found.has(category))
      const conflicting = requested.filter(
        (category) => (found.get(category) ?? 0) > 1
      )
      const covered = requested.filter((category) => found.has(category))
      if (missing.length === 0 && conflicting.length === 0) {
        return {
          level: 'SUFFICIENT',
          reasonCode: 'ALL_CATEGORIES_COVERED',
          missingCategories: [],
          conflictingSources: [],
          coveredCategories: covered
        }
      }
      return {
        level: covered.length > 0 ? 'PARTIAL' : 'INSUFFICIENT',
        reasonCode: 'MISSING_CATEGORIES',
        missingCategories: missing,
        conflictingSources: conflicting,
        coveredCategories: covered
      }
    }
  }
}

export function createPhase3ClaimExtractor(): (
  response: string
) => readonly { text: string; evidenceRefs: readonly string[] }[] {
  return (response: string) => {
    const refs = [...response.matchAll(/\[evidence-([a-z0-9-]+)\]/g)].map(
      (match) => `evidence-${match[1]}`
    )
    return [{ text: response.slice(0, 200), evidenceRefs: refs }]
  }
}

function decision(
  value: Omit<LoopDecision, 'reasonCode'> &
    Partial<Pick<LoopDecision, 'reasonCode'>>
): LoopDecision {
  return { reasonCode: 'TOOL_REQUIRED', ...value }
}

const RESPOND_OPERATIONAL = decision({
  decisionType: 'RESPOND',
  reasonCode: 'GOAL_SATISFIED',
  responseText: 'Reservation reservation-synthetic-1 confirmed.'
})

const RESPOND_KNOWLEDGE = decision({
  decisionType: 'RESPOND',
  reasonCode: 'GOAL_SATISFIED',
  responseText:
    'condition-X causes include infectious [evidence-infectious-1], nutritional [evidence-nutritional-1] and metabolic [evidence-metabolic-1] factors.'
})

const ASK_DATE = decision({
  decisionType: 'ASK_USER',
  reasonCode: 'MISSING_INFORMATION',
  requestedInput: {
    questionType: 'MISSING_FIELD',
    missingFields: ['date'],
    promptIntent: 'Which date should the reservation use?'
  }
})

const RESERVE = decision({
  decisionType: 'CALL_TOOL',
  toolId: PHASE3_TOOL_RESERVE,
  toolInput: { resource: 'resource-x', date: '2026-10-01' }
})

export function phase3ScenarioScript(
  scenario: Phase3Scenario,
  resumeKind: 'approval' | 'user_input' | undefined
): readonly LoopDecision[] {
  switch (scenario) {
    case 'operational':
      return [
        decision({
          decisionType: 'CALL_TOOL',
          toolId: PHASE3_TOOL_AVAILABILITY,
          toolInput: { resource: 'resource-x' }
        }),
        decision({ decisionType: 'REPLAN', reasonCode: 'STRATEGY_CHANGED' }),
        RESERVE,
        decision({
          decisionType: 'VERIFY',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          verificationTarget: 'tool-result'
        }),
        RESPOND_OPERATIONAL
      ]
    case 'knowledge':
      return [
        decision({
          decisionType: 'SEARCH_KNOWLEDGE',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          query: 'infectious',
          knowledgeCategories: [...CATEGORIES]
        }),
        decision({
          decisionType: 'SEARCH_KNOWLEDGE',
          reasonCode: 'STRATEGY_CHANGED',
          query: 'condition-X causes',
          knowledgeCategories: [...CATEGORIES]
        }),
        RESPOND_KNOWLEDGE
      ]
    case 'waiting_user':
      return resumeKind === 'user_input'
        ? [RESERVE, RESPOND_OPERATIONAL]
        : [ASK_DATE]
    case 'approval':
      return resumeKind === 'approval'
        ? [RESPOND_OPERATIONAL]
        : [RESERVE, RESPOND_OPERATIONAL]
  }
}

export interface Phase3HarnessOptionsInput {
  readonly scenario: Phase3Scenario
  readonly stepStore: ExecutionStepStore
  readonly approvals: ApprovalEngine
  readonly resumeKind?: 'approval' | 'user_input'
  readonly observer?: Phase3Observer
}

/** Builds the controlled iterative harness options for a scenario attempt. */
export function createPhase3IterativeHarnessOptions(
  input: Phase3HarnessOptionsInput
): OperationalHarnessOptions {
  const script = phase3ScenarioScript(input.scenario, input.resumeKind)
  const isKnowledgeScenario = input.scenario === 'knowledge'
  const tools = isKnowledgeScenario
    ? ({ list: () => [], resolve: () => undefined } as ToolRegistry)
    : createPhase3ToolRegistry(input.observer)
  return {
    iterativeOrchestrator: new ScriptedOrchestrator({ script: [...script] }),
    stepStore: input.stepStore,
    defaultRuntimeProfile: 'iterative',
    modelGateway: {
      complete: async (request: ModelRequest): Promise<ModelResult> => {
        void request
        return {
          text: 'Acknowledged.',
          provider: 'deterministic-v2',
          model: 'synthetic-fixture',
          inputTokens: 1,
          outputTokens: 1,
          costUsd: 0
        }
      }
    },
    policy: {
      evaluate: async (request) => {
        if (
          input.scenario === 'approval' &&
          request.tool.id === PHASE3_TOOL_RESERVE
        ) {
          return {
            outcome: 'REQUIRE_APPROVAL',
            reason:
              'Controlled approval requirement for the synthetic reserve tool.',
            policyVersion: 'synthetic-v2'
          }
        }
        return {
          outcome: 'ALLOW',
          reason: 'synthetic controlled policy',
          policyVersion: 'synthetic-v2'
        }
      }
    },
    approvals: input.approvals,
    tools,
    audit: {
      append: async () => undefined
    },
    telemetry: {
      record: () => undefined
    },
    ...(isKnowledgeScenario
      ? {
          knowledge: createPhase3KnowledgeProvider(),
          sufficiencyEvaluator: createPhase3SufficiencyEvaluator(),
          claimExtractor: createPhase3ClaimExtractor()
        }
      : {})
  }
}

export function parsePhase3RuntimeProfile(
  value: string | undefined
): 'single_pass' | 'iterative' {
  const normalized = value?.trim().toLowerCase()
  if (!normalized || normalized === 'single_pass') return 'single_pass'
  if (normalized === 'iterative') return 'iterative'
  throw new Error('CVG_WORKER_RUNTIME_PROFILE must be single_pass or iterative')
}

export function parsePhase3Scenario(
  value: string | undefined
): Phase3Scenario | undefined {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return undefined
  if ((PHASE3_SCENARIOS as readonly string[]).includes(normalized)) {
    return normalized as Phase3Scenario
  }
  throw new Error(
    'CVG_WORKER_ITERATIVE_SCENARIO must be one of operational, knowledge, waiting_user, approval'
  )
}
