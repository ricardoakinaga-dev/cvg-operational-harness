import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'

export const TraceContextSchema = z
  .object({
    traceId: z.string().regex(/^[0-9a-f]{32}$/),
    spanId: z.string().regex(/^[0-9a-f]{16}$/),
    correlationId: z.string().min(8).max(120),
    tenantId: z.string().min(1).max(120).optional(),
    conversationId: z.string().min(1).max(200).optional(),
    sessionId: z.string().min(1).max(200).optional(),
    agentId: z.string().min(1).max(120).optional(),
    agentVersion: z.string().min(1).max(120).optional()
  })
  .strict()

export type TraceContext = z.infer<typeof TraceContextSchema>

export interface TraceContextInput {
  correlationId: string
  tenantId?: string
  conversationId?: string
  sessionId?: string
  agentId?: string
  agentVersion?: string
}

export interface TraceIdGenerator {
  traceId(): string
  spanId(): string
}

export const cryptoIdGenerator: TraceIdGenerator = {
  traceId: () => randomBytes(16).toString('hex'),
  spanId: () => randomBytes(8).toString('hex')
}

export function createTraceContext(
  input: TraceContextInput,
  generator: TraceIdGenerator = cryptoIdGenerator
): TraceContext {
  return TraceContextSchema.parse({
    traceId: generator.traceId(),
    spanId: generator.spanId(),
    correlationId: input.correlationId,
    ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
    ...(input.conversationId !== undefined
      ? { conversationId: input.conversationId }
      : {}),
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
    ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
    ...(input.agentVersion !== undefined
      ? { agentVersion: input.agentVersion }
      : {})
  })
}

export function toTraceparent(context: TraceContext): string {
  return `00-${context.traceId}-${context.spanId}-01`
}

const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/

export function fromTraceparent(
  traceparent: string,
  correlationId: string
): TraceContext | undefined {
  const match = TRACEPARENT_PATTERN.exec(traceparent.trim().toLowerCase())
  if (!match) return undefined
  const traceId = match[1] ?? ''
  const spanId = match[2] ?? ''
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return undefined
  return { traceId, spanId, correlationId }
}

export function createCorrelationId(): string {
  return `corr_${randomUUID()}`
}
