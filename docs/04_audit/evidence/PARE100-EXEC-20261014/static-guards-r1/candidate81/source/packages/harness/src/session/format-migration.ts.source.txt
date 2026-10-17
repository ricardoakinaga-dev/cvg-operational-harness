import type { SessionEventType, SessionJson } from '@cvg/harness-contracts'
import { sessionEventFingerprint, validateSessionEvent } from './events.ts'

/**
 * PDSH-022 / SPEC 0202 §6 / 0203: adjacent, deterministic format generations.
 * A migration never rewrites stored events: every step produces a new view of
 * the same fact under the next format version, and the source generation
 * stays byte-identical in the store.
 */

export interface SessionFormatEvent {
  readonly formatVersion: number
  readonly eventId: string
  readonly tenantId: string
  readonly sessionId: string
  readonly sequence: number
  readonly type: string
  readonly schemaFingerprint: string
  readonly timestamp: string
  readonly correlationId: string
  readonly traceId: string
  readonly payload: SessionJson
}

/** One frozen generation: how to validate it and how to fingerprint a type. */
export interface SessionFormatDefinition {
  readonly version: number
  readonly validate: (event: unknown) => SessionFormatEvent
  readonly fingerprint: (type: string) => string
}

/** One adjacent migration vN → vN+1. Pure: returns the next payload only. */
export interface SessionFormatStep {
  readonly from: number
  readonly to: number
  readonly transform: (event: SessionFormatEvent) => SessionJson
}

export type SessionFormatMigrationErrorCode =
  | 'format_registry_invalid'
  | 'unknown_format_version'
  | 'missing_format_step'
  | 'downgrade_not_supported'
  | 'invalid_step_output'

export class SessionFormatMigrationError extends Error {
  readonly code: SessionFormatMigrationErrorCode

  constructor(code: SessionFormatMigrationErrorCode, message: string) {
    super(message)
    this.name = 'SessionFormatMigrationError'
    this.code = code
  }
}

export interface SessionFormatMigrationInput {
  readonly definitions: readonly SessionFormatDefinition[]
  readonly steps: readonly SessionFormatStep[]
}

export interface SessionFormatRegistry {
  readonly versions: readonly number[]
  /** Materializes the target generation; never mutates the source event. */
  migrate(event: unknown, targetVersion: number): SessionFormatEvent
}

function invalidRegistry(message: string): never {
  throw new SessionFormatMigrationError('format_registry_invalid', message)
}

function versionOf(
  value: unknown,
  code: SessionFormatMigrationErrorCode,
  what: string
): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new SessionFormatMigrationError(
      code,
      `${what} must be a positive safe integer`
    )
  }
  return value
}

function freezeDeep(value: unknown, seen: Set<object> = new Set()): unknown {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) freezeDeep(child, seen)
  return Object.freeze(value)
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createSessionFormatRegistry(
  input: SessionFormatMigrationInput
): SessionFormatRegistry {
  if (
    !input ||
    typeof input !== 'object' ||
    !Array.isArray(input.definitions) ||
    !Array.isArray(input.steps)
  ) {
    invalidRegistry('Format registry requires definitions and steps arrays')
  }
  const definitions = new Map<number, SessionFormatDefinition>()
  for (const definition of input.definitions) {
    if (
      !definition ||
      typeof definition !== 'object' ||
      typeof definition.validate !== 'function' ||
      typeof definition.fingerprint !== 'function'
    ) {
      invalidRegistry(
        'Every format definition requires validate and fingerprint functions'
      )
    }
    const version = versionOf(
      definition.version,
      'format_registry_invalid',
      'Format version'
    )
    if (definitions.has(version)) {
      invalidRegistry(`Duplicate format definition for version ${version}`)
    }
    definitions.set(version, definition)
  }
  if (definitions.size === 0) {
    invalidRegistry('At least one format definition is required')
  }
  const steps = new Map<number, SessionFormatStep>()
  for (const step of input.steps) {
    if (
      !step ||
      typeof step !== 'object' ||
      typeof step.transform !== 'function'
    ) {
      invalidRegistry('Every format step requires a transform function')
    }
    const from = versionOf(step.from, 'format_registry_invalid', 'Step origin')
    const to = versionOf(step.to, 'format_registry_invalid', 'Step target')
    if (to !== from + 1) {
      invalidRegistry(`Format steps must be adjacent: ${from} -> ${to}`)
    }
    if (!definitions.has(from) || !definitions.has(to)) {
      invalidRegistry(
        `Format step ${from} -> ${to} references an undefined version`
      )
    }
    if (steps.has(from)) {
      invalidRegistry(`Duplicate format step from ${from}`)
    }
    steps.set(from, step)
  }
  const versions = [...definitions.keys()].sort((left, right) => left - right)
  return {
    versions,
    migrate(event: unknown, targetVersion: number): SessionFormatEvent {
      const eventVersion = (event as { formatVersion?: unknown } | null)
        ?.formatVersion
      const sourceVersion = versionOf(
        eventVersion,
        'unknown_format_version',
        'Event format version'
      )
      const source = definitions.get(sourceVersion)
      if (!source) {
        throw new SessionFormatMigrationError(
          'unknown_format_version',
          `Unsupported format version ${sourceVersion}`
        )
      }
      const target = versionOf(
        targetVersion,
        'unknown_format_version',
        'Target format version'
      )
      const targetDefinition = definitions.get(target)
      if (!targetDefinition) {
        throw new SessionFormatMigrationError(
          'unknown_format_version',
          `Unsupported format version ${target}`
        )
      }
      if (target < sourceVersion) {
        throw new SessionFormatMigrationError(
          'downgrade_not_supported',
          `Cannot migrate ${sourceVersion} -> ${target}: downgrade is not supported`
        )
      }
      let current = source.validate(event)
      while (current.formatVersion < target) {
        const step = steps.get(current.formatVersion)
        if (!step) {
          throw new SessionFormatMigrationError(
            'missing_format_step',
            `No adjacent format step from ${current.formatVersion}`
          )
        }
        const frozen = freezeDeep({ ...current }) as SessionFormatEvent
        let payload: SessionJson
        try {
          payload = step.transform(frozen)
        } catch (error) {
          throw new SessionFormatMigrationError(
            'invalid_step_output',
            `Format step ${step.from} -> ${step.to} failed: ${describe(error)}`
          )
        }
        const nextDefinition = definitions.get(
          step.to
        ) as SessionFormatDefinition
        let next: SessionFormatEvent
        try {
          next = nextDefinition.validate({
            ...frozen,
            formatVersion: step.to,
            schemaFingerprint: nextDefinition.fingerprint(frozen.type),
            payload
          })
        } catch (error) {
          throw new SessionFormatMigrationError(
            'invalid_step_output',
            `Format step ${step.from} -> ${step.to} produced an invalid event: ${describe(error)}`
          )
        }
        current = next
      }
      return current
    }
  }
}

/** Ready v1 definition: real schema validation and catalog fingerprints. */
export function sessionFormatDefinitionV1(): SessionFormatDefinition {
  return {
    version: 1,
    validate: (event) => validateSessionEvent(event),
    fingerprint: (type) => sessionEventFingerprint(type as SessionEventType)
  }
}
