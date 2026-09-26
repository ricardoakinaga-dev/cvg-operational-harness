import { z } from 'zod'
import { DataClassificationSchema, IntentSchema } from '@cvg/shared'
import { CapabilityNameSchema } from '@cvg/policy-engine'

export const EvalCategorySchema = z.enum([
  'agendamento',
  'cancelamento',
  'remarcacao',
  'horarios',
  'valores',
  'convenio',
  'retorno',
  'exames',
  'resultado_exame',
  'internacao',
  'alta',
  'emergencia',
  'handoff',
  'cliente_agressivo',
  'mensagem_ambigua',
  'multi_turn',
  'informacao_incompleta',
  'adversarial'
])

export type EvalCategory = z.infer<typeof EvalCategorySchema>

export const EvalEscalationSchema = z.enum(['none', 'handoff', 'approval'])
export type EvalEscalation = z.infer<typeof EvalEscalationSchema>

export const EvalExpectationSchema = z
  .object({
    intent: IntentSchema.optional(),
    escalation: EvalEscalationSchema.default('none'),
    requiredCapabilities: z.array(CapabilityNameSchema).default([]),
    forbiddenCapabilities: z.array(CapabilityNameSchema).default([]),
    mustRefuse: z.boolean().default(false)
  })
  .strict()

export type EvalExpectation = z.output<typeof EvalExpectationSchema>

export const EvalScenarioSchema = z
  .object({
    id: z.string().min(3).max(80),
    category: EvalCategorySchema,
    message: z.string().min(1).max(2_000),
    language: z.enum(['pt-BR', 'en']).default('pt-BR'),
    turns: z.array(z.string().min(1).max(2_000)).max(8).default([]),
    adversarial: z.boolean().default(false),
    classification: DataClassificationSchema.default('INTERNAL'),
    expected: EvalExpectationSchema,
    notes: z.string().max(500).optional()
  })
  .strict()

export type EvalScenario = z.output<typeof EvalScenarioSchema>
export type EvalScenarioInput = z.input<typeof EvalScenarioSchema>

export interface EvalAgentOutcome {
  intent: string
  proposedCapabilities: string[]
  escalation: EvalEscalation
  refused: boolean
  structuredValid: boolean
  latencyMs: number
  costUsd: number
}

export interface EvalAgentUnderTest {
  readonly id: string
  run(scenario: EvalScenario): Promise<EvalAgentOutcome>
}

export interface EvalScenarioResult {
  scenarioId: string
  category: EvalCategory
  adversarial: boolean
  outcome: EvalAgentOutcome
  success: boolean
  failures: string[]
}

export interface EvalMetrics {
  scenarios: number
  taskSuccessRate: number
  policyViolationRate: number
  unsafeActionRate: number
  hallucinationRate: number
  toolSelectionAccuracy: number
  humanEscalationAccuracy: number
  schemaFailureRate: number
  refusalAccuracy: number
  adversarialPassRate: number
  avgLatencyMs: number
  p95LatencyMs: number
  totalCostUsd: number
}
