import type { AuditEvent, TelemetryEvent } from '@cvg/harness-contracts'

export type Json =
  | null
  | boolean
  | number
  | string
  | readonly Json[]
  | { readonly [key: string]: Json }
export type NormalizationRule =
  | {
      readonly field: 'eventId' | 'correlationId' | 'traceId'
      readonly mode: 'id'
      readonly namespace: string
    }
  | {
      readonly field: 'occurredAt'
      readonly mode: 'timestamp'
      readonly value: string
    }
export interface NormalizedLog {
  readonly raw: readonly Json[]
  readonly policy: readonly NormalizationRule[]
  readonly projection: readonly Json[]
  readonly policyDigest: string
  readonly projectionDigest: string
}
export interface SuiteManifest {
  readonly formatVersion: 1
  readonly id: string
  readonly version: string
  readonly synthetic: true
  readonly cases: readonly { readonly id: string; readonly family: string }[]
}
/** Historical lossy clone, intentionally NOT a validation boundary. */
export function replayJsonClone<T>(value: T): T
export function canonicalJson(value: unknown): string
export function jsonDigest(value: unknown): string
export function normalizeLog(
  events: unknown,
  policy?: readonly NormalizationRule[]
): NormalizedLog
export function createSuiteManifest(input: unknown): {
  readonly manifest: SuiteManifest
  readonly digest: string
}
export class RecordingAudit<T = AuditEvent> {
  readonly events: T[]
  constructor(options?: {
    copy?: (event: T) => T
    onAppend?: (event: T) => void
  })
  append(event: T): Promise<void>
}
export class RecordingTelemetry<T = TelemetryEvent> {
  readonly events: T[]
  constructor(options?: {
    copy?: (event: T) => T
    onRecord?: (event: T) => void
  })
  record(event: T): void
}
export function fixedClock(instant: string): () => Date
export function sequenceIds(prefix: string, start?: number): () => string
