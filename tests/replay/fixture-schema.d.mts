import type { ZodType } from 'zod'
import type { TurnSendResult } from '@cvg/sdk'
import type {
  ModelResult,
  RuntimeInput,
  RuntimeResult
} from '@cvg/harness-contracts'
export interface ReplayFixture {
  formatVersion: 1
  id: string
  entry: 'harness' | 'sdk'
  input: RuntimeInput
  model: {
    behavior: 'succeed' | 'fail' | 'cancel' | 'deadline'
    result: ModelResult
    error: string
  }
  tool: {
    behavior: 'succeed' | 'fail' | 'throw'
    requiresApproval: boolean
    output: { value: string; applied: true }
    error: string
  }
  policyProfile: 'assistant' | 'admin'
  approval: 'pending' | 'refused'
  cancelBefore: boolean
  logFailure: 'none' | 'tool/call' | 'tool/result'
  journalFailure: 'none' | 'markStarted' | 'confirm'
}
export interface ReplayTranscript {
  result: RuntimeResult | TurnSendResult
  events: unknown[]
  modelRequests: unknown[]
  toolBodies: unknown[]
  journal: unknown
  policyDecisions: unknown[]
  approvalRequests: unknown[]
  approvalEvents: unknown[]
  approvalRecords: unknown[]
  audit: unknown[]
  telemetry: unknown[]
  timeline: string[]
}
export interface ReplayExpected {
  formatVersion: 1
  id: string
  transcript: ReplayTranscript
}
export const CASE_IDS: readonly string[]
export const safeCaseId: ZodType<string>
export const fixtureSchema: ZodType<ReplayFixture>
export const transcriptSchema: ZodType<ReplayTranscript>
export const expectedSchema: ZodType<ReplayExpected>
export function validateJson(value: unknown, depth?: number): void
export function loadFixtures(
  directory: string,
  options?: { requireExpected?: boolean }
): { input: ReplayFixture; expected: ReplayExpected | undefined }[]
export function assertReplay(
  actual: ReplayTranscript,
  expected: ReplayTranscript,
  id: string
): void
