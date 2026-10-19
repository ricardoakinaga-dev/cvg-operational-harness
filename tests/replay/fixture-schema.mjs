import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'

// This closed list is part of the frozen bar: removing a case fails preflight.
export const CASE_IDS = Object.freeze([
  'simple-response',
  'sdk-response',
  'authorized-tool',
  'policy-denied',
  'approval-pending',
  'approval-refused',
  'model-budget-zero',
  'token-budget',
  'cost-budget',
  'cancel-before',
  'cancel-model',
  'deadline-model',
  'model-failure',
  'tool-failure',
  'tool-throw',
  'log-call-failure',
  'log-result-failure',
  'journal-start-failure',
  'journal-confirm-failure',
  'sdk-model-failure'
])
export const safeCaseId = z.enum(CASE_IDS)
const count = z.number().int().nonnegative()
const budget = z
  .object({
    maxSteps: count,
    maxModelCalls: count,
    maxToolCalls: count,
    maxDurationMs: count,
    maxCostUsd: z.number().nonnegative(),
    maxTokens: count
  })
  .strict()
const snapshot = z
  .object({
    values: z.record(z.string(), z.unknown()),
    sourceIds: z.array(z.string()),
    capturedAt: z.string().datetime()
  })
  .strict()
export const fixtureSchema = z
  .object({
    formatVersion: z.literal(1),
    id: safeCaseId,
    entry: z.enum(['harness', 'sdk']),
    input: z
      .object({
        agent: z
          .object({
            id: z.string(),
            version: z.string(),
            objective: z.string(),
            instructions: z.array(z.string()),
            skills: z.array(z.never()),
            tools: z.array(z.literal('synthetic.replay')),
            policies: z.array(z.string())
          })
          .strict(),
        tenantId: z.literal('tenant_replay_synthetic'),
        conversationId: z.literal('conversation_replay_synthetic'),
        sessionId: z.literal('session_replay_synthetic'),
        correlationId: z.literal('correlation_replay_synthetic'),
        traceId: z.literal('trace_replay_synthetic'),
        userMessage: z.string().regex(/^synthetic /),
        context: snapshot,
        state: z
          .object({
            version: count,
            values: z.record(z.string(), z.unknown()),
            updatedAt: z.string().datetime()
          })
          .strict(),
        budget,
        runtimeProfile: z.literal('single_pass'),
        requestedTool: z
          .object({
            toolId: z.literal('synthetic.replay'),
            toolVersion: z.literal('v1'),
            input: z.object({ value: z.literal('synthetic-value') }).strict(),
            operationKey: z.literal('replay-operation-synthetic')
          })
          .strict()
          .optional()
      })
      .strict(),
    model: z
      .object({
        behavior: z.enum(['succeed', 'fail', 'cancel', 'deadline']),
        result: z
          .object({
            text: z.string(),
            provider: z.literal('scripted-keyless'),
            model: z.literal('synthetic-v1'),
            inputTokens: count,
            outputTokens: count,
            costUsd: z.number().nonnegative()
          })
          .strict(),
        error: z.literal('synthetic model outage')
      })
      .strict(),
    tool: z
      .object({
        behavior: z.enum(['succeed', 'fail', 'throw']),
        requiresApproval: z.boolean(),
        output: z
          .object({
            value: z.literal('synthetic-result'),
            applied: z.literal(true)
          })
          .strict(),
        error: z.literal('synthetic tool failure')
      })
      .strict(),
    policyProfile: z.enum(['assistant', 'admin']),
    approval: z.enum(['pending', 'refused']),
    cancelBefore: z.boolean(),
    logFailure: z.enum(['none', 'tool/call', 'tool/result']),
    journalFailure: z.enum(['none', 'markStarted', 'confirm'])
  })
  .strict()
const runtimeResult = z
  .object({
    response: z.string(),
    stopReason: z.string(),
    approvalId: z.string().optional(),
    steps: count,
    modelCalls: count,
    toolCalls: count,
    usage: z
      .object({
        inputTokens: count,
        outputTokens: count,
        costUsd: z.number().nonnegative()
      })
      .strict(),
    toolResult: z
      .object({
        status: z.enum(['SUCCEEDED', 'FAILED', 'REJECTED']),
        output: z.unknown().optional(),
        error: z.string().optional()
      })
      .strict()
      .optional()
  })
  .strict()
export const transcriptSchema = z
  .object({
    result: z.union([
      runtimeResult,
      runtimeResult
        .omit({ steps: true, toolResult: true })
        .extend({ sessionId: z.string().optional() })
        .strict()
    ]),
    events: z.array(z.unknown()),
    modelRequests: z.array(z.unknown()),
    toolBodies: z.array(z.unknown()),
    journal: z.unknown(),
    policyDecisions: z.array(z.unknown()),
    approvalRequests: z.array(z.unknown()),
    approvalEvents: z.array(z.unknown()),
    approvalRecords: z.array(z.unknown()),
    audit: z.array(z.unknown()),
    telemetry: z.array(z.unknown()),
    timeline: z.array(z.string())
  })
  .strict()
export const expectedSchema = z
  .object({
    formatVersion: z.literal(1),
    id: safeCaseId,
    transcript: transcriptSchema
  })
  .strict()

export function validateJson(value, depth = 0) {
  if (depth > 40) throw new Error('fixture nesting limit exceeded')
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (Array.isArray(value)) {
    for (const item of value) validateJson(item, depth + 1)
    return
  }
  if (
    typeof value !== 'object' ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    throw new Error('fixture must contain plain JSON')
  for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key))
      throw new Error(`hostile fixture key: ${key}`)
    validateJson(item, depth + 1)
  }
}
function readJson(path) {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256_000)
    throw new Error(`invalid fixture file: ${path}`)
  const value = JSON.parse(readFileSync(path, 'utf8'))
  validateJson(value)
  return value
}
export function loadFixtures(directory, { requireExpected = true } = {}) {
  const stat = lstatSync(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('invalid fixture directory')
  const allowed = new Set(
    CASE_IDS.flatMap((id) => [`${id}.input.json`, `${id}.expected.json`])
  )
  for (const name of readdirSync(directory)) {
    if (name === 'README.md') {
      const meta = lstatSync(join(directory, name))
      if (!meta.isFile() || meta.isSymbolicLink())
        throw new Error('invalid fixture README')
      continue
    }
    if (name === 'recordings') {
      const recordings = join(directory, name)
      const meta = lstatSync(recordings)
      if (!meta.isDirectory() || meta.isSymbolicLink())
        throw new Error('invalid recordings directory')
      for (const candidate of readdirSync(recordings)) {
        if (!CASE_IDS.some((id) => candidate === `${id}.candidate.json`))
          throw new Error(`hostile recording filename: ${candidate}`)
        expectedSchema.parse(readJson(join(recordings, candidate)))
      }
      continue
    }
    if (!allowed.has(name))
      throw new Error(`unexpected/hostile fixture filename: ${name}`)
  }
  return CASE_IDS.map((id) => {
    const input = fixtureSchema.parse(
      readJson(join(directory, `${id}.input.json`))
    )
    if (input.id !== id) throw new Error(`fixture id/path mismatch: ${id}`)
    const expected = requireExpected
      ? expectedSchema.parse(readJson(join(directory, `${id}.expected.json`)))
      : undefined
    if (expected && expected.id !== id)
      throw new Error(`expected id/path mismatch: ${id}`)
    return { input, expected }
  })
}
export function assertReplay(actual, expected, id) {
  validateJson(actual)
  transcriptSchema.parse(actual)
  if (!isDeepStrictEqual(actual, expected))
    throw new Error(
      `replay mismatch: ${id}; frozen output/events/effects differ`
    )
}
